#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertStageEntryArtifact, stageHtmlEntry } from "./lib/stage-artifact-manifest.mjs";
import { verifyBundledHttpAliases } from "./lib/bundled-callable-probe.mjs";
const ORIGINS = { development: "https://orider-dev.web.app", production: "https://orider.co.kr" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function readPublishedText(url, fetcher, status = 200) {
  let response;
  try { response = await fetcher(url, { credentials: "omit", redirect: "error", cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 ORiderHostingAcceptance" }, signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`bundled Hosting GET transport failed at ${url}`); }
  if (response.status !== status) { await response.body?.cancel(); throw new Error(`bundled Hosting GET HTTP${response.status} at ${url}`); }
  try { return await response.text(); }
  catch { throw new Error(`bundled Hosting GET body failed at ${url}`); }
}
export async function verifyBundledHosting({ environment, directory = "dist", fetcher = fetch }) {
  if (!Object.hasOwn(ORIGINS, environment)) throw new Error("approved Hosting environment required");
  const base = ORIGINS[environment], entry = assertStageEntryArtifact(directory, base), expected = readFileSync(resolve(directory, entry));
  if (environment === "production") {
    for (const path of ["/", "/ko/course/nonexistent"]) {
      const liveHtml = `${base}${path}`;
      const markup = await readPublishedText(liveHtml, fetcher);
      if (stageHtmlEntry(markup, liveHtml, base) !== entry) throw new Error(`bundled Hosting entry differs at ${liveHtml}`);
    }
    const runtimeUrl = `${base}/runtime-config.json`;
    if (await readPublishedText(runtimeUrl, fetcher) !== readFileSync(resolve(directory, "runtime-config.json"), "utf8"))
      throw new Error(`bundled Hosting runtime differs at ${runtimeUrl}`);
    const sitemapUrl = `${base}/sitemap.xml`;
    const sitemap = await readPublishedText(sitemapUrl, fetcher);
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<(?:urlset|sitemapindex)[\s>]/u.test(sitemap))
      throw new Error(`bundled Hosting sitemap is not XML at ${sitemapUrl}`);
    const thumbnailUrl = `${base}/og-thumbnail/.webp`;
    if ((await readPublishedText(thumbnailUrl, fetcher, 400)).trim() !== "activityId required")
      throw new Error(`bundled Hosting thumbnail alias differs at ${thumbnailUrl}`);
  }
  const url = `${base}/${entry}`; let response;
  try { response = await fetcher(url, { credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`bundled Hosting entry GET transport failed at ${url}`); }
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (response.status !== 200 || !["application/javascript", "text/javascript"].includes(mime)) throw new Error(`bundled Hosting entry GET rejected at ${url}: HTTP${response.status} MIME=${mime || "missing"}`);
  let actual;
  try { actual = Buffer.from(await response.arrayBuffer()); } catch { throw new Error(`bundled Hosting entry GET body failed at ${url}`); }
  if (hash(actual) !== hash(expected)) throw new Error(`bundled Hosting entry bytes differ at ${url}`);
  await verifyBundledHttpAliases({ base, fetcher });
  return { verified: true, environment, entry };
}
export async function verifyPublishedBundledHosting(options, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; ; attempt++) {
    try { return await verifyBundledHosting(options); }
    catch (error) {
      if (options.environment !== "production" || attempt >= 3) throw error;
      console.warn(`Production Hosting verification attempt ${attempt}: ${error.message}`);
      await pause(5000);
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--environment") throw new Error("Hosting environment required");
  console.log(JSON.stringify(await verifyPublishedBundledHosting({ environment: process.argv[3] })));
}
