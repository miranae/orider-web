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

// 원격 확인을 기다리는 동안 산출물이 바뀌어도 배포를 중단한다.
export async function verifyStageArtifacts(directory, expected, verifyRemote) {
  const verify = () => {
    if (!Array.isArray(expected) || !isDeepStrictEqual(stageArtifactManifest(directory), expected)) {
      throw new Error("stage parity prepared artifact differs from the build receipt");
    }
  };
  verify();
  const result = await verifyRemote();
  verify();
  return result;
}

export function stageHtmlEntry(html, label = "stage HTML", origin = "https://orider-dev.web.app") {
  // DOM으로 읽어 주석·preload·template·JSON script의 파일명을 실행 entry로 오인하지 않는다.
  // prepare는 npm ci 전에 실행된다. 빌드 이후 HTML 검사에서만 설치된 parser를 읽는다.
  const { JSDOM } = requireDependency("jsdom");
  const dom = new JSDOM(html, { url: `${origin}/` });
  try {
    for (const script of dom.window.document.querySelectorAll("script[src]")) {
      if (script.namespaceURI !== "http://www.w3.org/1999/xhtml" || script.hasAttribute("nomodule") || script.closest("noscript") || !["", "module", "text/javascript", "application/javascript"].includes((script.getAttribute("type") || "").toLowerCase())) continue;
      const entry = script.getAttribute("src").match(/^\/(assets\/index-[A-Za-z0-9_-]+\.js)$/u)?.[1];
      if (entry && script.src === `${origin}/${entry}`) return entry;
    }
    throw new Error(`stage entry script missing in ${label}`);
  } finally { dom.window.close(); }
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
