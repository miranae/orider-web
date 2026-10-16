import { normalizeUserContentUrl } from "../../../utils/userContentUrl";

export interface SerializedPostEditorContent {
  content: string;
  imageUrls: string[];
}

export function serializePostEditorContent(
  editor: HTMLElement | null,
  urlMap: Map<string, string>,
): SerializedPostEditorContent {
  if (!editor) return { content: "", imageUrls: [] };

  const imageUrls: string[] = [];
  const clone = editor.cloneNode(true) as HTMLElement;

  const uploadedStorageUrls = new Set<string>();
  clone.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (urlMap.has(src)) {
      const mappedUrl = urlMap.get(src) || "";
      const storageUrl = /^gs:\/\/[^/]+\/board_images\/[^/]+\/[^/]+\/[^/]+$/.test(mappedUrl)
        ? mappedUrl : null;
      const safeUploadedUrl = storageUrl || normalizeUserContentUrl(mappedUrl);
      if (safeUploadedUrl) {
        if (storageUrl) uploadedStorageUrls.add(storageUrl);
        imageUrls.push(safeUploadedUrl);
        img.setAttribute("src", safeUploadedUrl);
      } else {
        img.remove();
      }
    } else if (src && !src.startsWith("blob:")) {
      const safeSrc = normalizeUserContentUrl(src);
      if (safeSrc) {
        imageUrls.push(safeSrc);
        img.setAttribute("src", safeSrc);
      } else {
        img.remove();
      }
    }
  });

  // Browsers may insert block elements inside an active formatting wrapper
  // (for example <b><table>…</table>text</b>). Markdown emphasis cannot span
  // block boundaries, so carry that formatting into each block's inline runs.
  const blockSelector = "h2,h3,blockquote,pre,ul,ol,li,table,hr,div,p";
  const markerFor = (tag: string) => {
    if (tag === "b" || tag === "strong") return "**";
    if (tag === "i" || tag === "em") return "*";
    if (tag === "s" || tag === "strike" || tag === "del") return "~~";
    return "";
  };
  const emphasize = (text: string, markers: string[]) => text.split(/(\n[ \t]*\n)/).map((part) => {
    if (!part.trim()) return part;
    const leading = part.match(/^\s*/)?.[0] || "";
    const trailing = part.match(/\s*$/)?.[0] || "";
    return leading + markers.join("") + part.trim()
      + [...markers].reverse().join("") + trailing;
  }).join("");

  const serialize = (nodes: NodeListOf<ChildNode>, markers: string[] = []): string => {
    let result = "";
    let inline = "";
    const flush = () => {
      result += emphasize(inline, markers);
      inline = "";
    };
    const block = (value: string) => {
      flush();
      if (result && !result.endsWith("\n")) result += "\n";
      result += value;
    };
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        inline += node.textContent || "";
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const marker = markerFor(tag);
      if (tag === "script" || tag === "style") return;
      if (tag === "img") {
        const rawSrc = el.getAttribute("src") || "";
        const src = uploadedStorageUrls.has(rawSrc) ? rawSrc : normalizeUserContentUrl(rawSrc);
        if (src) block(`\n![image](${src})\n`);
      } else if (tag === "br") {
        inline += "\n";
      } else if (tag === "h2" || tag === "h3") {
        block(`${tag === "h2" ? "##" : "###"} ${serialize(el.childNodes, markers).trim()}\n`);
      } else if (tag === "blockquote") {
        const inner = serialize(el.childNodes, markers).trim();
        block(inner.split("\n").map((line) => `> ${line}`).join("\n") + "\n");
      } else if (tag === "pre") {
        block(`\`\`\`\n${el.textContent || ""}\n\`\`\`\n`);
      } else if (tag === "ul" || tag === "ol") {
        const items = Array.from(el.children).filter((child) => child.tagName === "LI");
        block(items.map((li, index) => {
          const prefix = tag === "ol" ? `${index + 1}. ` : "- ";
          const lines = serialize(li.childNodes, markers).trim().split("\n");
          return prefix + lines.join(`\n${" ".repeat(prefix.length)}`);
        }).join("\n") + "\n");
      } else if (tag === "table") {
        const rows = Array.from(el.querySelectorAll("tr")).filter((row) => row.closest("table") === el);
        const lines: string[] = [];
        rows.forEach((row, index) => {
          const cells = Array.from(row.children).filter((cell) => ["TH", "TD"].includes(cell.tagName));
          const values = cells.map((cell) => serialize(cell.childNodes, markers).trim()
            .replace(/\|/g, "\\|").replace(/\n+/g, " "));
          lines.push(`| ${values.join(" | ")} |`);
          if (index === 0) lines.push(`| ${values.map(() => "---").join(" | ")} |`);
        });
        block(`\n${lines.join("\n")}\n\n`);
      } else if (tag === "hr") {
        block("\n---\n");
      } else if (tag === "div" || tag === "p" || tag === "li") {
        block(serialize(el.childNodes, markers) + (tag === "p" ? "\n\n" : "\n"));
      } else if (el.querySelector(blockSelector)) {
        // Underline has no Markdown equivalent; preserve its text, as before.
        const nestedMarkers = marker && !markers.includes(marker) ? [...markers, marker] : markers;
        block(serialize(el.childNodes, nestedMarkers));
      } else if (marker) {
        inline += emphasize(serialize(el.childNodes), markers.includes(marker) ? [] : [marker]);
      } else if (tag === "a") {
        const href = normalizeUserContentUrl(el.getAttribute("href"));
        const label = serialize(el.childNodes);
        inline += href ? `[${label}](${href})` : label;
      } else {
        inline += serialize(el.childNodes);
      }
    });
    flush();
    return result;
  };
  const content = serialize(clone.childNodes);

  return { content: content.trim(), imageUrls };
}
