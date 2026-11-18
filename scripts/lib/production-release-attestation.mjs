import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { get } from "node:https";

const origin = "https://orider.co.kr";
export async function readCompressedProductionFile(path) {
  const target = `${origin}${path}`;
  try {
    const raw = await new Promise((resolve, reject) => {
      const request = get(target, { headers: { "Accept-Encoding": "gzip", "Cache-Control": "no-cache" }, timeout: 20_000 }, response => {
        if (response.statusCode !== 200 || response.headers["content-encoding"] !== "gzip") {
          response.resume(); reject(Object.assign(new Error("compressed Hosting response rejected"), { code: `HTTP_${response.statusCode}` })); return;
        }
        const chunks = []; let size = 0;
        response.on("data", chunk => {
          size += chunk.length;
          if (size > 32 * 1024 * 1024) request.destroy(Object.assign(new Error("Hosting file too large"), { code: "FILE_TOO_LARGE" }));
          else chunks.push(chunk);
        });
        response.on("error", reject); response.on("end", () => resolve(Buffer.concat(chunks)));
      });
      request.on("timeout", () => request.destroy(Object.assign(new Error("Hosting read timed out"), { code: "ETIMEDOUT" })));
      request.on("error", reject);
    });
    return { raw, body: gunzipSync(raw, { maxOutputLength: 32 * 1024 * 1024 }) };
  } catch (error) {
    console.error(JSON.stringify({ operation: "read-production-hosting-file", method: "GET", target, errorClass: error?.name ?? "Error", errorCode: error?.code ?? "unknown" }));
    throw new Error(`[stage-parity] production Hosting file read failed: ${target}`, { cause: error });
  }
}
export async function checkedJsonFetch(operation, target, init = {}, fetcher = fetch, parse = response => response.json()) {
  try {
    const response = await fetcher(target, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Object.assign(new Error("HTTP response rejected"), { code: `HTTP_${response.status}` });
    return await parse(response);
  } catch (error) {
    console.error(JSON.stringify({ operation, method: init.method || "GET", target, errorClass: error?.name ?? "Error", errorCode: error?.code ?? error?.cause?.code ?? "unknown" }));
    throw new Error(`[stage-parity] ${operation} failed: ${target}`, { cause: error });
  }
}

export async function readProductionHostingRelease() {
  let token;
  try {
    token = execFileSync("gcloud", ["auth", "print-access-token", "--account=ansrudska@gmail.com"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    console.error(JSON.stringify({ operation: "read-production-hosting-credential", target: "gcloud auth print-access-token", errorClass: error?.name ?? "Error", errorCode: error?.status ?? "unknown" }));
    throw new Error("production Hosting credential acquisition failed");
  }
  const result = await checkedJsonFetch("read-production-hosting-release", "https://firebasehosting.googleapis.com/v1beta1/sites/miranae-orider-g1/releases?pageSize=1", {
    headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": "miranae-orider-g1" },
  });
  const release = result.releases?.[0];
  if (!release?.version?.name || release.version.status !== "FINALIZED") throw new Error("production finalized Hosting release missing");
  const fileHashes = {};
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: "1000", ...(pageToken ? { pageToken } : {}) });
    const files = await checkedJsonFetch("read-production-hosting-file-hashes", `https://firebasehosting.googleapis.com/v1beta1/${release.version.name}/files?${query}`, {
      headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": "miranae-orider-g1" },
    });
    for (const file of files.files ?? []) if (["/runtime-config.json", "/index.html"].includes(file.path) || /^\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(file.path)) fileHashes[file.path] = file.hash;
    pageToken = files.nextPageToken;
  } while (pageToken && !(fileHashes["/runtime-config.json"] && fileHashes["/index.html"] && Object.keys(fileHashes).some(path => path.endsWith(".js"))));
  return { version: release.version.name, releaseTime: release.releaseTime, fileHashes };
}

export function readSuccessfulProductionDeployment() {
  const gh = path => {
    try { return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
    catch (error) {
      console.error(JSON.stringify({ operation: "read-production-github-deployment", target: `https://api.github.com/${path}`, errorClass: error?.name ?? "Error", errorCode: error?.status ?? "unknown" }));
      throw new Error(`production GitHub Deployment read failed: ${path}`);
    }
  };
  const deployments = gh("repos/miranae/orider-web/deployments?environment=production&per_page=10");
  for (const deployment of deployments) {
    const statuses = gh(`repos/miranae/orider-web/deployments/${deployment.id}/statuses`);
    const success = statuses.find(status => status.state === "success");
    if (success) return { id: deployment.id, sourceSha: deployment.sha, startedAt: deployment.created_at, succeededAt: success.created_at };
  }
  throw new Error("successful production GitHub Deployment missing");
}

export async function readPinnedProductionRuntime(sourceSha, {
  readRelease = readProductionHostingRelease, readDeployment = readSuccessfulProductionDeployment, readFile = readCompressedProductionFile,
} = {}) {
  const before = await readRelease();
  const deployment = await readDeployment();
  const released = Date.parse(before.releaseTime);
  if (deployment.sourceSha !== sourceSha || released < Date.parse(deployment.startedAt) || released > Date.parse(deployment.succeededAt)) {
    throw new Error("production source SHA does not bind to the current Hosting release window");
  }
  const runtimeFile = await readFile("/runtime-config.json");
  const htmlFile = await readFile("/index.html"), html = htmlFile.body.toString("utf8");
  const entry = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!entry) throw new Error("production entry missing");
  const asset = await readFile(`/${entry}`);
  // 저장된 gzip 바이트를 직접 대조한다. 로컬 zlib 버전별 재압축 차이를 피한다.
  for (const [path, file] of [["/runtime-config.json", runtimeFile], ["/index.html", htmlFile], [`/${entry}`, asset]]) {
    const hash = createHash("sha256").update(file.raw).digest("hex");
    if (before.fileHashes[path] !== hash) throw new Error(`live production file differs from the pinned Hosting version: ${path}`);
  }
  const after = await readRelease();
  if (before.version !== after.version || before.releaseTime !== after.releaseTime) throw new Error("production Hosting changed while reading runtime snapshot");
  let source;
  try { source = JSON.parse(runtimeFile.body.toString("utf8")); }
  catch (error) {
    console.error(JSON.stringify({ operation: "parse-production-runtime-config", method: "GET", target: `${origin}/runtime-config.json`, errorClass: error?.name ?? "Error", errorCode: "INVALID_JSON" }));
    throw new Error("production runtime config parse failed", { cause: error });
  }
  return { source, release: { ...before, deployment, entry,
    entrySha256: createHash("sha256").update(asset.body).digest("hex"),
    runtimeSha256: createHash("sha256").update(runtimeFile.body).digest("hex") } };
}
