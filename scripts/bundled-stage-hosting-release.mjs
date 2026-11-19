#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://firebasehosting.googleapis.com/v1beta1/";
function hostingTarget(environment, serializedWrites) {
  if (environment === "development") assertSerializedStageHostingWrites(serializedWrites);
  else if (environment !== "production" || serializedWrites !== "true") throw new Error("serialized production Hosting writes required");
  const site = environment === "production" ? "miranae-orider-g1" : "orider-dev";
  const prefix = environment === "production" ? "(?:client-promotion|bundled-production)" : "bundled-stage";
  return { site, label: environment, channel: `sites/${site}/channels/live`,
    versionPattern: new RegExp(`^sites/${site}/versions/[A-Za-z0-9_-]+$`, "u"),
    releasePattern: new RegExp(`^sites/${site}/(?:channels/live/)?releases/[A-Za-z0-9_-]+$`, "u"),
    markerPattern: new RegExp(`^${prefix}:[a-f0-9]{40}:[1-9][0-9]*:[1-9][0-9]*$`, "u") };
}
export function assertSerializedStageHostingWrites(value = process.env.ORIDER_STAGE_HOSTING_SERIALIZED_WRITES) {
  if (value !== "true") throw new Error("development Hosting requires ORIDER_STAGE_HOSTING_SERIALIZED_WRITES=true: all live writes must use serialized CI; concurrent manual/Console publication is unsupported");
}
function releaseName(channel, target) {
  const name = channel?.release?.name;
  if (typeof name !== "string" || !target.releasePattern.test(name)) throw new Error(`${target.label} Hosting GET ${API}${target.channel}: release identity missing`);
  return name;
}
function validateSnapshot(snapshot, target) {
  if (snapshot?.schemaVersion !== 1 || snapshot.site !== target.site || snapshot.channel !== "live"
    || typeof snapshot.previousVersion !== "string" || !target.versionPattern.test(snapshot.previousVersion)
    || typeof snapshot.previousRelease !== "string" || !target.releasePattern.test(snapshot.previousRelease)
    || typeof snapshot.marker !== "string" || !target.markerPattern.test(snapshot.marker)) throw new Error(`${target.label} Hosting rollback snapshot invalid`);
}
async function request(target, fetcher, token, method, url, body) {
  if (!token || /[\r\n]/u.test(token)) throw new Error(`${target.label} Hosting access token required`);
  let response;
  try { response = await fetcher(url, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error(`${target.label} Hosting ${method} transport failed at ${url}`); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`${target.label} Hosting ${method} failed at ${url}: HTTP${response.status}`); }
  try {
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new TypeError("expected a response object");
    return data;
  } catch { throw new Error(`${target.label} Hosting ${method} invalid JSON object at ${url}`); }
}
function currentVersion(channel, target) {
  const version = channel?.release?.version?.name;
  if (channel?.name !== target.channel || typeof version !== "string" || !target.versionPattern.test(version)) throw new Error(`${target.label} Hosting GET ${API}${target.channel}: live channel/version identity mismatch`);
  return version;
}
export async function snapshotStageHosting({ token, marker, fetcher = fetch, serializedWrites, environment = "development" }) {
  const target = hostingTarget(environment, serializedWrites);
  if (typeof marker !== "string" || !target.markerPattern.test(marker)) throw new Error(`${target.label} Hosting deployment marker invalid`);
  const channel = await request(target, fetcher, token, "GET", API + target.channel);
  const previousVersion = currentVersion(channel, target), previousRelease = releaseName(channel, target);
  const version = await request(target, fetcher, token, "GET", API + previousVersion);
  if (version?.name !== previousVersion || version.status !== "FINALIZED") throw new Error(`${target.label} Hosting GET ${API}${previousVersion}: previous version is not finalized`);
  return { schemaVersion: 1, site: target.site, channel: "live", previousVersion, previousRelease, marker };
}
export async function verifyStagePublishPointer(snapshot, { token, fetcher = fetch, serializedWrites, environment = "development" }) {
  const target = hostingTarget(environment, serializedWrites); validateSnapshot(snapshot, target);
  for (let read = 0; read < 2; read++) {
    const channel = await request(target, fetcher, token, "GET", API + target.channel);
    if (currentVersion(channel, target) !== snapshot.previousVersion || releaseName(channel, target) !== snapshot.previousRelease) throw new Error(`${target.label} Hosting publish refused: live release changed at ${API}${target.channel}`);
  }
  return { verified: true, version: snapshot.previousVersion };
}
export async function rollbackStageHosting(snapshot, { token, fetcher = fetch, serializedWrites, environment = "development", pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const target = hostingTarget(environment, serializedWrites); validateSnapshot(snapshot, target);
  let channel = await request(target, fetcher, token, "GET", API + target.channel);
  for (let observation = 0; observation < 3 && currentVersion(channel, target) === snapshot.previousVersion && releaseName(channel, target) === snapshot.previousRelease; observation++) {
    await pause(2000);
    channel = await request(target, fetcher, token, "GET", API + target.channel);
  }
  const current = currentVersion(channel, target);
  if (current === snapshot.previousVersion && releaseName(channel, target) === snapshot.previousRelease) throw new Error(`${target.label} Hosting publication outcome unverified at ${API}${target.channel}: previous release still visible after bounded observations; this run may still complete; retain the snapshot/marker and confirm the live release before manually retrying`);
  // 직렬화된 CI 계약 아래 관측한 다른 릴리스는 거부한다. Hosting API에는 CAS가 없다.
  if (channel.release.message !== snapshot.marker) throw new Error(`${target.label} Hosting rollback refused: active version ${current} is not this deployment`);
  const previous = await request(target, fetcher, token, "GET", API + snapshot.previousVersion);
  if (previous?.name !== snapshot.previousVersion || previous.status !== "FINALIZED") throw new Error(`${target.label} Hosting GET ${API}${snapshot.previousVersion}: rollback version unavailable`);
  const latest = await request(target, fetcher, token, "GET", API + target.channel);
  if (currentVersion(latest, target) !== current || releaseName(latest, target) !== releaseName(channel, target) || latest.release.message !== snapshot.marker) throw new Error(`${target.label} Hosting rollback refused: live release changed at ${API}${target.channel}`);
  let requestFailure;
  try { await request(target, fetcher, token, "POST", `${API}${target.channel}/releases?versionName=${encodeURIComponent(snapshot.previousVersion)}`,
    { message: `Automatic ${target.label} rollback after ${snapshot.marker}` }); }
  catch (error) { requestFailure = error.message; } // 응답 유실도 live 포인터를 다시 읽어 실제 복구 여부로 판정한다.
  let actual;
  try { actual = currentVersion(await request(target, fetcher, token, "GET", API + target.channel), target); }
  catch (error) { throw new Error(`${requestFailure ? `${requestFailure}; ` : ""}${error.message}`); }
  if (actual !== snapshot.previousVersion) throw new Error(`${requestFailure ? `${requestFailure}; ` : ""}${target.label} Hosting GET ${API}${target.channel}: rollback readback mismatch: expected=${snapshot.previousVersion} actual=${actual}`);
  return { restored: true, unchanged: false, version: actual, ...(requestFailure ? { requestOutcome: "readback-confirmed-after-error", requestDiagnostic: requestFailure } : {}) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--phase" || !["snapshot", "check-publish", "rollback"].includes(args[1]) || args[2] !== "--file" || !args[3]) throw new Error("development Hosting phase and snapshot file required");
  const file = resolve(args[3]), token = process.env.HOSTING_ACCESS_TOKEN;
  const environment = process.env.ORIDER_HOSTING_RELEASE_ENVIRONMENT ?? "development";
  const serializedWrites = environment === "production" ? process.env.ORIDER_HOSTING_SERIALIZED_WRITES : undefined;
  if (args[1] === "snapshot") {
    const snapshot = await snapshotStageHosting({ token, marker: process.env.HOSTING_DEPLOYMENT_MARKER, environment, serializedWrites });
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ phase: "snapshot", version: snapshot.previousVersion }));
  } else {
    let snapshot;
    try { snapshot = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error(`${environment} Hosting rollback snapshot unreadable at ${file}`); }
    console.log(JSON.stringify({ phase: args[1], ...await (args[1] === "check-publish" ? verifyStagePublishPointer : rollbackStageHosting)(snapshot, { token, environment, serializedWrites }) }));
  }
}
