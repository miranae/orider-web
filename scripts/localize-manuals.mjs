import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTreeAdapter, parse, parseFragment, serialize } from "parse5";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = join(root, "public");
const manuals = ["manual", "web-manual"];
const languages = { ko: "한국어", en: "English", ja: "日本語", "zh-TW": "繁體中文", "pt-BR": "Português (Brasil)", es: "Español" };
const languageLabel = { en: "Manual language", ja: "マニュアルの言語", "zh-TW": "手冊語言", "pt-BR": "Idioma do manual", es: "Idioma del manual" };
const emptySearchLabel = { en: "No results", ja: "検索結果がありません", "zh-TW": "沒有搜尋結果", "pt-BR": "Nenhum resultado", es: "No se encontraron resultados" };
const hasKorean = /[가-힣]/u;
const textAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const files = manuals.flatMap((manual) =>
  readdirSync(join(publicDir, manual)).filter((file) => file.endsWith(".html")).map((file) => ({
    manual,
    file,
    html: readFileSync(join(publicDir, manual, file), "utf8"),
  })),
);
const searchIndex = JSON.parse(readFileSync(join(publicDir, "web-manual/search-index.json"), "utf8"));

function walk(node, visit) {
  if (node.attrs?.some(({ name, value }) => name === "class" && value === "doc-language-nav")) return;
  visit(node);
  if (["script", "style"].includes(node.tagName)) return;
  for (const child of node.childNodes ?? []) walk(child, visit);
}

function mapText(node, translate) {
  if (node.nodeName === "#text") node.value = translate(node.value);
  for (const attr of node.attrs ?? []) {
    if (textAttributes.has(attr.name) || (
      attr.name === "content" && node.tagName === "meta" &&
      node.attrs.some(({ name, value }) => ["name", "property"].includes(name) && /(?:description|title)$/.test(value))
    )) attr.value = translate(attr.value);
  }
}

function localizedUrl(value, lang) {
  return value.replace(/^\/(manual|web-manual)(?=\/|$)\/?/, (_, manual) => '/' + manual + '/' + lang + '/');
}

if (process.argv.includes("--extract")) {
  const strings = new Set();
  for (const { html } of files) {
    walk(parse(html), (node) => mapText(node, (value) => {
      if (hasKorean.test(value)) strings.add(value.trim());
      return value;
    }));
  }
  for (const { title, group, headings } of searchIndex) {
    for (const value of [title, group, ...headings]) {
      if (hasKorean.test(value)) strings.add(value.trim());
    }
  }
  process.stdout.write(JSON.stringify([...strings].sort()));
} else {
  const requested = process.argv.find((argument) => argument.startsWith("--locale="))?.slice("--locale=".length);
  if (requested && !Object.hasOwn(languageLabel, requested)) throw new Error("Invalid manual locale: " + requested);
  for (const lang of requested ? [requested] : Object.keys(languageLabel)) {
    const catalog = JSON.parse(readFileSync(join(root, "manual-src/translations", lang + ".json"), "utf8"));
    const missing = new Set();
    const translate = (value) => {
      if (!hasKorean.test(value)) return value;
      const key = value.trim();
      if (typeof catalog[key] !== "string" || !catalog[key].trim() || hasKorean.test(catalog[key])) {
        missing.add(key);
        return value;
      }
      return value.replace(key, () => catalog[key]);
    };
    const pages = new Map();
    const outputs = new Map();
    for (const { manual, file, html } of files) {
      const doc = parse(html);
      const text = [];
      walk(doc, (node) => {
        mapText(node, translate);
        if (node.nodeName === "#text" && node.value.trim()) text.push(node.value.trim());
        if (node.attrs?.some(({ name, value }) => name === "id" && value === "results")) {
          node.attrs.push({ name: "data-empty-label", value: emptySearchLabel[lang] });
        }
        for (const attr of node.attrs ?? []) {
          if (node.tagName === "html" && attr.name === "lang") attr.value = lang;
          if (["href", "src", "srcset"].includes(attr.name)) {
            const value = attr.value;
            attr.value = localizedUrl(value, lang);
            if (node.tagName === "img" && attr.name === "src" && value.startsWith("screenshots/")) {
              const screenshot = value.slice("screenshots/".length);
              const localizedImage = join(publicDir, manual, "screenshots", lang, screenshot);
              if (existsSync(localizedImage)) {
                attr.value = "../screenshots/" + lang + "/" + screenshot;
                if (screenshot.endsWith(".png")) {
                  const png = readFileSync(localizedImage);
                  for (const dimension of node.attrs) {
                    if (dimension.name === "width") dimension.value = String(png.readUInt32BE(16));
                    if (dimension.name === "height") dimension.value = String(png.readUInt32BE(20));
                  }
                }
                continue;
              }
            }
            if (/^(?:screenshots\/|.*\.(?:css|js)$)/.test(value) && !/^(?:\/|https?:)/.test(value)) {
              attr.value = "../" + value + (value === "manual.js" ? "?v=localized" : "");
            }
          }
          if (attr.name === "content" && node.tagName === "meta" && /^\d+;\s*url=/i.test(attr.value)) {
            attr.value = attr.value.replace(/url=(.*)$/i, (_, url) => "url=" + localizedUrl(url, lang));
          }
        }
      });
      const htmlElement = doc.childNodes.find((node) => node.tagName === "html");
      const body = htmlElement.childNodes.find((node) => node.tagName === "body");
      const existingMenu = body.childNodes.find((node) => node.attrs?.some(({ name, value }) => name === "class" && value === "doc-language-nav"));
      if (existingMenu) defaultTreeAdapter.detachNode(existingMenu);
      const links = Object.entries(languages).map(([code, name]) => {
        const href = `/${manual}/${code === "ko" ? "" : code + "/"}${file === "index.html" ? "" : file}`;
        return `<a lang="${code}" hreflang="${code}" href="${href}"${code === lang ? ' aria-current="page"' : ""}>${name}</a>`;
      }).join(" · ");
      const [languageMenu] = parseFragment(`<nav class="doc-language-nav" aria-label="${languageLabel[lang]}">${links}</nav>`).childNodes;
      defaultTreeAdapter.detachNode(languageMenu);
      defaultTreeAdapter.appendChild(body, languageMenu);
      outputs.set(join(publicDir, manual, lang, file), serialize(doc));
      if (manual === "web-manual") pages.set(file, text.join(" "));
    }
    const index = searchIndex.map(({ title, group, headings, url }) => ({
      title: translate(title),
      group: translate(group),
      headings: headings.map(translate),
      text: pages.get(url) ?? "",
      url,
    }));
    if (missing.size) throw new Error(lang + " manual translations missing: " + [...missing].slice(0, 10).join(" | "));
    outputs.set(join(publicDir, "web-manual", lang, "search-index.json"), JSON.stringify(index));
    for (const manual of manuals) mkdirSync(join(publicDir, manual, lang), { recursive: true });
    for (const [path, data] of outputs) writeFileSync(path, data);
  }
}
