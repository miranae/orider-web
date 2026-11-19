import { createRequire } from "node:module";
const requireDependency = createRequire(import.meta.url);
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

export function stageArtifactManifest(directory) {
  const files = [];
  function visit(path, relativePath) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("stage parity prepared artifact contains a symlink");
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
    } else if (stat.isFile()) {
      files.push([relativePath, createHash("sha256").update(readFileSync(path)).digest("hex")]);
    } else throw new Error("stage parity prepared artifact contains an unsupported file");
  }
  visit(directory, "");
  return files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
}

export function assertStageArtifactManifest(directory, expected) {
  if (!Array.isArray(expected) || !isDeepStrictEqual(stageArtifactManifest(directory), expected)) {
    throw new Error("stage parity prepared artifact differs from the build receipt");
  }
}

// 원격 확인을 기다리는 동안 산출물이 바뀌어도 배포를 중단한다.
export async function verifyStageArtifacts(directory, expected, verifyRemote) {
  assertStageArtifactManifest(directory, expected);
  const result = await verifyRemote();
  assertStageArtifactManifest(directory, expected);
  return result;
}

export function stageHtmlEntry(html, label = "stage HTML", origin = "https://orider-dev.web.app") {
  // Match browser HTML parsing with scripting enabled, without running any script.
  // Preparation precedes npm ci, so load the parser only when verifying built HTML.
  const { parse } = requireDependency("parse5");
  function* elements(node) {
    if (node.namespaceURI === "http://www.w3.org/1999/xhtml") yield node;
    for (const child of node.childNodes ?? []) yield* elements(child);
  }
  const tags = [...elements(parse(html, { scriptingEnabled: true }))];
  const attribute = (node, name) => node.attrs.find(attr => attr.name === name)?.value;
  const base = tags.find(node => node.tagName === "base" && attribute(node, "href") !== undefined);
  const baseUrl = base ? URL.parse(attribute(base, "href"), origin) ?? origin : origin;
  for (const script of tags) {
    if (script.tagName !== "script" || attribute(script, "nomodule") !== undefined || attribute(script, "type")?.toLowerCase() !== "module") continue;
    const src = attribute(script, "src");
    const entry = src?.match(/^\/(assets\/index-[A-Za-z0-9_-]+\.js)$/u)?.[1];
    if (entry && URL.parse(src, baseUrl)?.href === `${origin}/${entry}`) return entry;
  }
  throw new Error(`stage entry script missing in ${label}`);
}

/** 앱을 시작할 HTML과 실제 entry 청크가 없는 산출물은 게시 전에 거부한다. */
export function assertStageEntryArtifact(directory, origin) {
  const htmlPath = join(directory, "index.html");
  let html;
  try { html = readFileSync(htmlPath, "utf8"); } catch { throw new Error(`stage entry HTML missing at ${htmlPath}`); }
  const entry = stageHtmlEntry(html, htmlPath, origin);
  const entryPath = join(directory, entry);
  try {
    if (!lstatSync(entryPath).isFile() || readFileSync(entryPath).length === 0) throw new Error("not a nonempty file");
  } catch { throw new Error(`stage entry asset missing or invalid at ${entryPath}`); }
  return entry;
}
