import { createHash, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { accessSync, constants, copyFileSync, mkdirSync, readFileSync, realpathSync, readdirSync, statSync, writeFileSync, openSync, readSync, closeSync, chmodSync, lstatSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class IsolationError extends Error {}
const children = new Set();
const killGroup = child => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* 이미 종료됨 */ } } };

/** 제공자 자식과 그 하위 프로세스를 함께 종료한다. 출력은 메모리에만 보관한다. */
export function runChild(command, args, { cwd, env, input = "", timeoutMs = 900_000 } = {}) {
  return new Promise(resolveResult => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    children.add(child);
    let stdout = "", reason = "exit", settled = false;
    const timer = setTimeout(() => { reason = "timeout"; killGroup(child); }, timeoutMs);
    const finish = code => {
      if (settled) return;
      settled = true; clearTimeout(timer); children.delete(child);
      resolveResult({ code, stdout, reason });
    };
    child.stdout.on("data", chunk => {
      if (stdout.length + chunk.length > 2_000_000) { reason = "output_limit"; killGroup(child); }
      else stdout += chunk;
    });
    child.stderr.resume(); // CLI 오류에 포함될 수 있는 인증정보를 로그로 내보내지 않는다.
    child.on("error", () => { reason = "unavailable"; finish(null); });
    child.on("close", finish);
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export function parseReview(text, provider = "codex") {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  const failed = provider === "claude" && value?.is_error === true;
  if (provider === "claude" && value?.structured_output) value = value.structured_output;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "findings,verdict"
    || typeof value.findings !== "string" || !value.findings.trim()
    || !["PASS", "BLOCK"].includes(value.verdict)) return null;
  return failed && value.verdict !== "BLOCK" ? null : value;
}

export function reviewBinding(request, diff) {
  return { version: 1, pr: request.pr, head: request.head, base: request.base,
    baseRef: request.baseRef, reviewFrom: request.reviewFrom, scope: request.scope,
    diffSha256: createHash("sha256").update(diff).digest("hex") };
}

function writeEvidence(path, value) {
  try { if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new IsolationError("리뷰 증거 파일이 일반 파일이 아닙니다."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { flag: "wx", mode: 0o600 });
  renameSync(temporary, path);
}
function writeJson(path, value) { writeEvidence(path, `${JSON.stringify(value, null, 2)}\n`); }
function ensureEvidenceDir(path) {
  let current = "/";
  for (const component of resolve(path).split("/").filter(Boolean)) {
    current = join(current, component);
    try {
      const entry = lstatSync(current);
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new IsolationError("리뷰 증거 디렉터리에 symlink 또는 일반 파일이 있습니다.");
    } catch (error) { if (error.code === "ENOENT") mkdirSync(current, { mode: 0o700 }); else throw error; }
  }
}
function sameBinding(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function saveReport(path, report) {
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, "wx", 0o600); }
  catch { throw new IsolationError("다른 게이트가 리뷰 판정을 기록 중입니다. 머지를 중단합니다."); }
  try {
    let previous;
    try { previous = JSON.parse(readFileSync(path, "utf8")); } catch { /* 첫 판정 */ }
    if (previous?.state === "BLOCK" && sameBinding(previous.binding, report.binding)) return previous;
    writeJson(path, report);
    return report;
  } finally { closeSync(fd); unlinkSync(lock); }
}

export function validateSelfReview(value, binding) {
  const keys = ["binding", "findings", "reviewedAt", "reviewer", "verdict"];
  if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== keys.sort().join(",")
    || !sameBinding(value.binding, binding) || !["PASS", "BLOCK"].includes(value.verdict)
    || typeof value.findings !== "string" || !value.findings.trim()
    || typeof value.reviewer !== "string" || !value.reviewer.trim()
    || typeof value.reviewedAt !== "string" || !Number.isFinite(Date.parse(value.reviewedAt))) {
    throw new Error("자체 리뷰의 PR/head/base/diff/범위 또는 실제 검토 기록이 일치하지 않습니다.");
  }
  return { findings: value.findings, verdict: value.verdict };
}

/** 유효한 BLOCK은 exit code와 무관하게 최종 판정이며 다음 제공자로 넘어가지 않는다. */
export async function reviewWithFallback({ binding, diff, input, evidenceDir, selfReviewFile, providers }) {
  ensureEvidenceDir(evidenceDir);
  const reportPath = join(evidenceDir, "report.json");
  let previous;
  try {
    if (!lstatSync(reportPath).isFile() || lstatSync(reportPath).isSymbolicLink()) throw new IsolationError("리뷰 증거 report가 일반 파일이 아닙니다.");
    previous = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) { if (error instanceof IsolationError) throw error; /* 첫 실행 또는 불완전한 기록은 재검토 */ }
  if (previous?.state === "BLOCK" && sameBinding(previous.binding, binding)) return previous;
  const resume = selfReviewFile && previous?.state === "needs-self-review" && sameBinding(previous.binding, binding)
    && previous.attempts?.length === 2 && previous.attempts.every((attempt, index) => attempt.state === "unavailable" && attempt.provider === ["codex", "claude"][index]);
  const attempts = resume ? previous.attempts : [];
  if (!resume) for (const provider of providers) {
    let result;
    try { result = await provider.run(); } catch (error) {
      if (error instanceof IsolationError) throw error;
      result = { code: null, reason: "unavailable", stdout: "" };
    }
    const review = parseReview(result.stdout, provider.name);
    if (review?.verdict === "BLOCK" || (result.code === 0 && !["timeout", "output_limit", "unavailable"].includes(result.reason) && review)) {
      attempts.push({ provider: provider.name, state: review.verdict });
      const report = { binding, state: review.verdict, provider: provider.name, attempts, ...review };
      return saveReport(reportPath, report);
    }
    attempts.push({ provider: provider.name, state: "unavailable", reason: result.code === 0 ? "invalid_response" : result.reason ?? "execution_failure" });
  }
  // 실패 증거와 정확한 입력을 보존한다. 자체 리뷰를 자동 PASS로 만들지 않는다.
  const pending = { binding, state: "needs-self-review", attempts };
  const saved = saveReport(reportPath, pending);
  if (saved.state === "BLOCK") return saved;
  writeEvidence(join(evidenceDir, "diff.patch"), diff);
  writeEvidence(join(evidenceDir, "input.txt"), input);
  const template = join(evidenceDir, "self-review.json");
  if (!selfReviewFile) {
    writeJson(template, { binding, reviewer: "", reviewedAt: "", findings: "", verdict: "PENDING" });
    return { ...pending, template, reportPath };
  }
  const actual = resolve(selfReviewFile);
  if (!statSync(actual).isFile() || realpathSync(actual) !== actual) throw new Error("자체 리뷰는 일반 JSON 파일이어야 합니다.");
  const value = JSON.parse(readFileSync(actual, "utf8"));
  const review = validateSelfReview(value, binding);
  const report = { binding, state: review.verdict, provider: "self", attempts, reviewer: value.reviewer, reviewedAt: value.reviewedAt, ...review };
  return saveReport(reportPath, report);
}

const readable = path => { try { accessSync(path, constants.R_OK); return true; } catch { return false; } };
const executable = path => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } };
function native(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const header = Buffer.alloc(4); readSync(fd, header, 0, 4, 0);
    const magic = header.toString("hex");
    return ["cffaedfe", "feedfacf", "cafebabe", "bebafeca"].includes(magic);
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}
function findNative(name) {
  const command = (process.env.PATH ?? "").split(":").map(dir => join(dir, name)).find(executable);
  if (!command) return null;
  const path = realpathSync(command);
  if (native(path)) return path;
  if (name !== "codex") return null;
  let packageDir = dirname(path);
  while (packageDir !== "/" && packageDir.split("/").at(-1) !== "@openai") packageDir = dirname(packageDir);
  if (packageDir === "/") return null;
  const candidates = readdirSync(packageDir, { recursive: true, withFileTypes: true });
  const file = candidates.find(entry => entry.isFile() && entry.name === "codex" && native(join(entry.parentPath, entry.name)));
  return file ? join(file.parentPath, file.name) : null;
}

function claudeCredential() {
  if (process.env.ANTHROPIC_API_KEY) return { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  let credential;
  try {
    const path = join(process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME, ".claude"), ".credentials.json");
    credential = readable(path) ? readFileSync(path, "utf8")
      : execFileSync("/usr/bin/security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    const token = JSON.parse(credential)?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token ? { CLAUDE_CODE_OAUTH_TOKEN: token } : null;
  } catch { return null; }
}

function sandboxArgs(request, bin, authFile, output) {
  return ["-D", `REVIEW_DIR=${request.workspace}`, "-D", `REVIEW_TMP=${request.runtime}`,
    "-D", `REVIEW_INPUT_DIR=${request.inputDir}`, "-D", `REVIEW_OUT=${output}`,
    "-D", `REVIEW_LOG=${request.log}`, "-D", `CODEX_RUNTIME_DIR=${dirname(bin)}`,
    "-D", `CODEX_BIN=${bin}`, "-D", `CODEX_AUTH_FILE=${authFile}`, "-f", request.profile];
}

function probeIsolation(request, bin, authFile, output, env, cwd) {
  const run = (target, args) => {
    try { return execFileSync("/usr/bin/sandbox-exec", [...sandboxArgs(request, target, authFile, output), target, ...args], { cwd, env, timeout: 5000, stdio: "ignore" }), true; }
    catch { return false; }
  };
  if (!run("/bin/cat", [request.diff])) throw new IsolationError("리뷰 격리 프로필이 trusted diff 읽기를 허용하지 않습니다.");
  for (const path of [join(request.workspace, "scripts/codex-review-external-link.fixture"), join(dirname(request.workspace), "external-sentinel"), join(request.repo, ".env")]) {
    if (readable(path) && run("/bin/cat", [path])) throw new IsolationError("리뷰 격리의 외부 파일 읽기 차단이 실패했습니다.");
  }
  for (const shell of ["/bin/sh", "/bin/zsh", "/usr/bin/env"]) {
    try {
      execFileSync("/usr/bin/sandbox-exec", [...sandboxArgs(request, bin, authFile, output), shell, "-c", "true"], { cwd, env, timeout: 5000, stdio: "ignore" });
      throw new IsolationError("리뷰 격리의 외부 명령 실행 차단이 실패했습니다.");
    } catch (error) { if (error instanceof IsolationError) throw error; }
  }
}

/** Claude CLI 는 draft 2020-12 `$schema` 선언을 몰라 시작 전에 종료한다. 선언만 빼고 넘긴다(Codex 입력은 그대로). */
export function claudeJsonSchema(text) {
  const { $schema, ...schema } = JSON.parse(text);
  return JSON.stringify(schema);
}

export async function providerReview(name, request) {
  if (!executable("/usr/bin/sandbox-exec")) return { code: null, reason: "sandbox_unavailable", stdout: "" };
  const bin = findNative(name);
  if (!bin) return { code: null, reason: "cli_unavailable", stdout: "" };
  const home = join(request.runtime, name);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const cwd = join(home, "cwd"); mkdirSync(cwd, { mode: 0o700 });
  const authFile = join(home, "auth.json"), output = join(home, "result.json");
  const env = { HOME: home, TMPDIR: request.runtime, PATH: "/usr/bin:/bin" };
  let args;
  if (name === "codex") {
    const authSource = join(process.env.CODEX_HOME || join(process.env.HOME, ".codex"), "auth.json");
    if (!readable(authSource)) return { code: null, reason: "auth_unavailable", stdout: "" };
    copyFileSync(authSource, authFile); chmodSync(authFile, 0o600); env.CODEX_HOME = home;
    args = ["exec", "--ignore-user-config", "--ephemeral", "--sandbox", "danger-full-access", "--skip-git-repo-check", "-C", cwd];
    for (const feature of ["shell_tool", "unified_exec", "code_mode_host", "multi_agent", "browser_use", "in_app_browser", "computer_use", "image_generation", "apps", "plugins", "skill_search", "skill_mcp_dependency_install", "auth_elicitation", "goals"]) args.push("--disable", feature);
    args.push("-c", 'shell_environment_policy.inherit="none"', "-c", `model_reasoning_effort="${request.effort}"`, "--output-schema", request.schema, "-o", output, "-");
  } else {
    const credential = claudeCredential();
    if (!credential) return { code: null, reason: "auth_unavailable", stdout: "" };
    Object.assign(env, credential, { CLAUDE_CONFIG_DIR: home, CLAUDE_CODE_TMPDIR: join(home, "tmp"), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
    writeFileSync(authFile, "{}", { mode: 0o600 });
    args = ["--print", "--restricted", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "", "--settings", '{"disableAllHooks":true,"enableAllProjectMcpServers":false}', "--disable-slash-commands", "--no-session-persistence", "--output-format", "json", "--json-schema", claudeJsonSchema(readFileSync(request.schema, "utf8"))];
  }
  probeIsolation(request, bin, authFile, output, env, cwd);
  const rawTimeout = Number(process.env[`${name.toUpperCase()}_REVIEW_TIMEOUT_SEC`] ?? 900);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.min(rawTimeout, 3600) * 1000 : 900_000;
  const result = await runChild("/usr/bin/sandbox-exec", [...sandboxArgs(request, bin, authFile, output), bin, ...args], { cwd, env, input: readFileSync(request.input, "utf8"), timeoutMs });
  if (name === "codex" && readable(output)) result.stdout = readFileSync(output, "utf8");
  return result;
}

async function main() {
  const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const diff = readFileSync(request.diff, "utf8"), input = readFileSync(request.input, "utf8");
  const result = await reviewWithFallback({ binding: reviewBinding(request, diff), diff, input,
    evidenceDir: request.evidenceDir, selfReviewFile: request.selfReviewFile,
    providers: ["codex", "claude"].map(name => ({ name, run: () => providerReview(name, request) })) });
  writeJson(request.output, result);
  if (result.state === "needs-self-review") {
    console.log(`Codex·Claude 리뷰 실행 불가 — 자체 리뷰 필요: ${result.template}\n동일 입력: ${join(request.evidenceDir, "input.txt")}\n검토 후 --self-review-file <JSON> 으로 재실행하세요.`);
  } else console.log(`${result.provider} 리뷰 ${result.verdict}\n${result.findings}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { for (const child of children) killGroup(child); process.exit(signal === "SIGINT" ? 130 : 143); });
  main().catch(error => { console.error(error instanceof IsolationError ? error.message : "리뷰 또는 자체 리뷰 검증 실패 — 머지 중단"); process.exitCode = 1; });
}
