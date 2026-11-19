#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertStageEntryArtifact } from "./lib/stage-artifact-manifest.mjs";
import { verifyBundledHttpAliases } from "./lib/bundled-callable-probe.mjs";
const ORIGINS = { development: "https://orider-dev.web.app", production: "https://orider.co.kr" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function verifyPublishedFile(url, expected, mimeTypes, fetcher) {
  let response;
  try { response = await fetcher(url, { credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`bundled Hosting GET transport failed at ${url}`); }
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (response.status !== 200 || !mimeTypes.includes(mime)) throw new Error(`bundled Hosting GET rejected at ${url}: HTTP${response.status} MIME=${mime || "missing"}`);
  let actual;
  try { actual = Buffer.from(await response.arrayBuffer()); } catch { throw new Error(`bundled Hosting GET body failed at ${url}`); }
  if (hash(actual) !== hash(expected)) throw new Error(`bundled Hosting bytes differ at ${url}`);
}
export async function verifyBundledHosting({ environment, directory = "dist", fetcher = fetch }) {
  if (!Object.hasOwn(ORIGINS, environment)) throw new Error("approved Hosting environment required");
  const base = ORIGINS[environment], entry = assertStageEntryArtifact(directory);
  if (environment === "production") {
    await verifyPublishedFile(`${base}/runtime-config.json`, readFileSync(resolve(directory, "runtime-config.json")), ["application/json"], fetcher);
  }
  await verifyPublishedFile(`${base}/${entry}`, readFileSync(resolve(directory, entry)), ["application/javascript", "text/javascript"], fetcher);
  await verifyBundledHttpAliases({ base, fetcher });
  return { verified: true, environment, entry };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--environment") throw new Error("Hosting environment required");
  console.log(JSON.stringify(await verifyBundledHosting({ environment: process.argv[3] })));
}
