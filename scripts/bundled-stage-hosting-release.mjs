#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL = "sites/orider-dev/channels/live";
const API = "https://firebasehosting.googleapis.com/v1beta1/";
const VERSION = /^sites\/orider-dev\/versions\/[A-Za-z0-9_-]+$/u;
const MARKER = /^bundled-stage:[a-f0-9]{40}:[1-9][0-9]*:[1-9][0-9]*$/u;
async function request(fetcher, token, method, url, body) {
  if (!token || /[\r\n]/u.test(token)) throw new Error("development Hosting access token required");
  let response;
  try { response = await fetcher(url, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error(`development Hosting ${method} transport failed at ${url}`); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`development Hosting ${method} failed at ${url}: HTTP${response.status}`); }
  try { return await response.json(); } catch { throw new Error(`development Hosting ${method} invalid JSON at ${url}`); }
}
function currentVersion(channel) {
  const version = channel?.release?.version?.name;
  if (channel?.name !== CHANNEL || typeof version !== "string" || !VERSION.test(version)) throw new Error(`development Hosting GET ${API}${CHANNEL}: live channel/version identity mismatch`);
  return version;
}
export async function snapshotStageHosting({ token, marker, fetcher = fetch }) {
  if (typeof marker !== "string" || !MARKER.test(marker)) throw new Error("development Hosting deployment marker invalid");
  const channel = await request(fetcher, token, "GET", API + CHANNEL);
  const previousVersion = currentVersion(channel);
  const version = await request(fetcher, token, "GET", API + previousVersion);
  if (version?.name !== previousVersion || version.status !== "FINALIZED") throw new Error(`development Hosting GET ${API}${previousVersion}: previous version is not finalized`);
  return { schemaVersion: 1, site: "orider-dev", channel: "live", previousVersion, marker };
}
export async function rollbackStageHosting(snapshot, { token, fetcher = fetch }) {
  if (snapshot?.schemaVersion !== 1 || snapshot.site !== "orider-dev" || snapshot.channel !== "live"
    || typeof snapshot.previousVersion !== "string" || !VERSION.test(snapshot.previousVersion) || typeof snapshot.marker !== "string" || !MARKER.test(snapshot.marker)) throw new Error("development Hosting rollback snapshot invalid");
  const channel = await request(fetcher, token, "GET", API + CHANNEL);
  const current = currentVersion(channel);
  if (current === snapshot.previousVersion) return { restored: true, unchanged: true, version: current };
  // 다른 운영자의 후속 배포는 이 작업이 되돌리지 않는다.
  if (channel.release.message !== snapshot.marker) throw new Error(`development Hosting rollback refused: active version ${current} is not this deployment`);
  const previous = await request(fetcher, token, "GET", API + snapshot.previousVersion);
  if (previous?.name !== snapshot.previousVersion || previous.status !== "FINALIZED") throw new Error(`development Hosting GET ${API}${snapshot.previousVersion}: rollback version unavailable`);
  let requestFailure;
  try { await request(fetcher, token, "POST", `${API}${CHANNEL}/releases?versionName=${encodeURIComponent(snapshot.previousVersion)}`,
    { message: `Automatic development rollback after ${snapshot.marker}` }); }
  catch (error) { requestFailure = error.message; } // 응답 유실도 live 포인터를 다시 읽어 실제 복구 여부로 판정한다.
  const actual = currentVersion(await request(fetcher, token, "GET", API + CHANNEL));
  if (actual !== snapshot.previousVersion) throw new Error(`development Hosting GET ${API}${CHANNEL}: rollback readback mismatch: expected=${snapshot.previousVersion} actual=${actual}`);
  return { restored: true, unchanged: false, version: actual, ...(requestFailure ? { requestOutcome: "readback-confirmed-after-error", requestDiagnostic: requestFailure } : {}) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--phase" || !["snapshot", "rollback"].includes(args[1]) || args[2] !== "--file" || !args[3]) throw new Error("development Hosting phase and snapshot file required");
  const file = resolve(args[3]), token = process.env.HOSTING_ACCESS_TOKEN;
  if (args[1] === "snapshot") {
    const snapshot = await snapshotStageHosting({ token, marker: process.env.HOSTING_DEPLOYMENT_MARKER });
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ phase: "snapshot", version: snapshot.previousVersion }));
  } else {
    let snapshot;
    try { snapshot = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error(`development Hosting rollback snapshot unreadable at ${file}`); }
    console.log(JSON.stringify({ phase: "rollback", ...await rollbackStageHosting(snapshot, { token }) }));
  }
}
