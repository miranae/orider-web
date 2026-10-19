// 명시적 테스트 선택은 기존 JSX 자식 요소를 삭제하는 feature 변경에만 허용한다.
import { execFileSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testPattern = /\.test\.tsx?$/u;
const sourcePattern = /\.tsx?$/u;
const children = (node) => { const result = []; ts.forEachChild(node, (child) => { result.push(child); }); return result; };
const isElement = (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);

// JSX children에서만 기존 element를 생략할 수 있다. 속성/표현식/handler 등은 AST가 같아야 한다.
function compare(before, after) {
  if (before.kind !== after.kind || before.flags !== after.flags) return null;
  const left = children(before), right = children(after);
  if (!left.length && !right.length) {
    const text = (node) => ts.isJsxText(node) && !node.text.trim() ? "" : node.getText();
    return text(before) === text(after) ? [] : null;
  }
  const removable = ts.isJsxElement(before) || ts.isJsxFragment(before);
  let i = 0, j = 0;
  const removed = [];
  while (i < left.length) {
    const equal = j < right.length ? compare(left[i], right[j]) : null;
    if (equal !== null) { removed.push(...equal); i++; j++; continue; }
    if (ts.isJsxText(left[i]) && !left[i].text.trim()) { i++; continue; }
    if (j < right.length && ts.isJsxText(right[j]) && !right[j].text.trim()) { j++; continue; }
    if (removable && before.children.includes(left[i]) && isElement(left[i])) { removed.push(left[i]); i++; continue; }
    return null;
  }
  while (j < right.length && ts.isJsxText(right[j]) && !right[j].text.trim()) j++;
  return j === right.length ? removed : null;
}

export function isJsxDeletionOnly(before, after, file = "Component.tsx") {
  // JSX 런타임을 바꾸는 파일 pragma는 printer의 주석 정규화로 숨기지 않는다.
  const pragmas = (source) => source.match(/@jsx(?:ImportSource|Runtime|Frag)?[^\r\n]*/gu) ?? [];
  if (JSON.stringify(pragmas(before)) !== JSON.stringify(pragmas(after))) return false;
  const parse = (text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const oldAst = parse(before), newAst = parse(after);
  if (oldAst.parseDiagnostics.length || newAst.parseDiagnostics.length) return false;
  const removed = compare(oldAst, newAst);
  if (removed === null || !removed.length) return false;
  // operator/isTypeOnly 등 forEachChild가 열거하지 않는 문법 속성도 출력 AST로 재확인한다.
  const removedNodes = new Set(removed);
  const print = (ast, stripRemoved) => {
    const transformed = ts.transform(ast, [(context) => {
      const visit = (node) => {
        if ((stripRemoved && removedNodes.has(node)) || (ts.isJsxText(node) && !node.text.trim())) return undefined;
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    }]);
    try { return ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]); }
    finally { transformed.dispose(); }
  };
  return print(oldAst, true) === print(newAst, false);
}

export function validateScope({ cwd = process.cwd(), base, head = "HEAD", tier, tests }) {
  const fail = (message) => { throw new Error(message); };
  if (tier !== "feature") fail("--test-file는 feature→dev 게이트에서만 허용됩니다.");
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
  const baseSha = git("merge-base", base, head), headSha = git("rev-parse", `${head}^{commit}`);
  const entries = git("diff", "--name-status", "--no-renames", `${baseSha}...${headSha}`).split("\n").filter(Boolean).map((line) => line.split("\t"));
  if (!entries.length) fail("변경 파일이 없습니다.");
  const files = new Set(git("ls-tree", "-r", "--name-only", headSha).split("\n"));
  const components = [];
  for (const [status, file] of entries) {
    if (testPattern.test(file) && file.startsWith("src/") && ["M", "A"].includes(status)) continue;
    if (status !== "M" || !/^src\/components\/.+\.tsx$/u.test(file) || testPattern.test(file)) fail(`JSX 삭제 외 변경은 기존 --changed 게이트를 사용하세요: ${file}`);
    if (!isJsxDeletionOnly(git("show", `${baseSha}:${file}`), git("show", `${headSha}:${file}`), file)) fail(`JSX 자식 요소의 순수 삭제가 아닙니다: ${file}`);
    components.push(file);
  }
  if (!components.length) fail("삭제한 JSX 컴포넌트가 없습니다.");
  const required = new Set(entries.filter(([, file]) => testPattern.test(file)).map(([, file]) => file));
  const addTest = (file) => {
    const candidates = [file.replace(/\.tsx?$/u, ".test.tsx"), file.replace(/\.tsx?$/u, ".test.ts")].filter((candidate) => files.has(candidate));
    if (!candidates.length) fail(`직접 영향 모듈의 colocated test가 없습니다: ${file}`);
    candidates.forEach((candidate) => required.add(candidate));
  };
  components.forEach(addTest);
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : { config: {} };
  if (config.error) fail("tsconfig 읽기 실패");
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, cwd).options;
  const sources = [...files].filter((file) => file.startsWith("src/") && sourcePattern.test(file) && !testPattern.test(file) && !components.includes(file));
  const blobs = execFileSync("git", ["cat-file", "--batch"], {
    cwd, input: sources.map((file) => `${headSha}:${file}\n`).join(""), maxBuffer: 80 * 1024 * 1024,
  });
  let offset = 0;
  for (const file of sources) {
    const newline = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, newline).toString("utf8");
    const size = Number(header.split(" ")[2]);
    if (newline < 0 || !Number.isSafeInteger(size) || size < 0) fail(`git blob 읽기 실패: ${file}`);
    const text = blobs.subarray(newline + 1, newline + 1 + size).toString("utf8");
    offset = newline + 2 + size;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let consumer = false;
    const visit = (node) => {
      // 정적 import/re-export와 문자열 dynamic import/require 모두 직접 소비자로 취급한다.
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require") ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier)) {
        const target = ts.resolveModuleName(specifier.text, resolve(cwd, file), options, ts.sys).resolvedModule?.resolvedFileName;
        if (target && components.includes(relative(cwd, target).replaceAll("\\", "/"))) consumer = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (consumer) addTest(file);
  }
  for (const file of tests) {
    if (!testPattern.test(file) || !files.has(file) || file.startsWith("-") || relative(cwd, resolve(cwd, file)) !== file) fail(`유효하지 않은 repo-relative 테스트 경로: ${file}`);
  }
  const selected = [...new Set(tests)].sort();
  const missing = [...required].filter((file) => !selected.includes(file));
  if (missing.length) fail(`필수 테스트 누락: ${missing.sort().join(", ")}`);
  return { base: baseSha, head: headSha, components: components.sort(), tests: selected };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), tests = [];
    let base, head, tier;
    while (args.length) {
      const key = args.shift(), value = args.shift();
      if (!value || value.startsWith("--")) throw new Error(`옵션 값이 없습니다: ${key}`);
      if (key === "--base") base = value;
      else if (key === "--head") head = value;
      else if (key === "--tier") tier = value;
      else if (key === "--test-file") tests.push(value);
      else throw new Error(`알 수 없는 옵션: ${key}`);
    }
    if (!base || !head) throw new Error("--base와 --head가 필요합니다.");
    process.stdout.write(`${JSON.stringify(validateScope({ base, head, tier, tests }))}\n`);
  } catch (error) { console.error(`테스트 범위 거부: ${error.message}`); process.exitCode = 1; }
}
