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

  clone.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (urlMap.has(src)) {
      const safeUploadedUrl = normalizeUserContentUrl(urlMap.get(src));
      if (safeUploadedUrl) {
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

  let content = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      content += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === "img") {
        content += `\n![image](${el.getAttribute("src") || ""})\n`;
      } else if (tag === "br") {
        content += "\n";
      } else if (tag === "h2") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        content += "## ";
        el.childNodes.forEach(walk);
        content += "\n";
      } else if (tag === "h3") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        content += "### ";
        el.childNodes.forEach(walk);
        content += "\n";
      } else if (tag === "blockquote") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        let inner = "";
        const innerWalk = (n: Node) => {
          if (n.nodeType === Node.TEXT_NODE) {
            inner += n.textContent || "";
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            const t = (n as HTMLElement).tagName.toLowerCase();
            if (t === "br") {
              inner += "\n";
            } else if (t === "div" || t === "p") {
              if (inner.length > 0 && !inner.endsWith("\n")) inner += "\n";
              n.childNodes.forEach(innerWalk);
              if (!inner.endsWith("\n")) inner += "\n";
            } else {
              n.childNodes.forEach(innerWalk);
            }
          }
        };
        el.childNodes.forEach(innerWalk);
        const lines = inner.split("\n");
        lines.forEach((line, index) => {
          if (line || index < lines.length - 1) {
            content += `> ${line}\n`;
          }
        });
      } else if (tag === "pre") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        content += "```\n";
        content += el.textContent || "";
        if (!content.endsWith("\n")) content += "\n";
        content += "```\n";
      } else if (tag === "ul") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        el.querySelectorAll(":scope > li").forEach((li) => {
          content += "- ";
          li.childNodes.forEach(walk);
          if (!content.endsWith("\n")) content += "\n";
        });
      } else if (tag === "ol") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        let idx = 1;
        el.querySelectorAll(":scope > li").forEach((li) => {
          content += `${idx++}. `;
          li.childNodes.forEach(walk);
          if (!content.endsWith("\n")) content += "\n";
        });
      } else if (tag === "li") {
        el.childNodes.forEach(walk);
      } else if (tag === "table") {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        const rows = el.querySelectorAll("tr");
        rows.forEach((tr, ri) => {
          const cells = tr.querySelectorAll("th, td");
          const cellTexts = Array.from(cells).map((c) => (c.textContent || "").trim());
          content += `| ${cellTexts.join(" | ")} |\n`;
          if (ri === 0) {
            content += `| ${cellTexts.map(() => "---").join(" | ")} |\n`;
          }
        });
        content += "\n";
      } else if (tag === "b" || tag === "strong") {
        content += "**";
        el.childNodes.forEach(walk);
        content += "**";
      } else if (tag === "i" || tag === "em") {
        content += "*";
        el.childNodes.forEach(walk);
        content += "*";
      } else if (tag === "s" || tag === "strike" || tag === "del") {
        content += "~~";
        el.childNodes.forEach(walk);
        content += "~~";
      } else if (tag === "u") {
        el.childNodes.forEach(walk);
      } else if (tag === "a") {
        const href = normalizeUserContentUrl(el.getAttribute("href"));
        if (href) {
          content += "[";
          el.childNodes.forEach(walk);
          content += `](${href})`;
        } else {
          el.childNodes.forEach(walk);
        }
      } else if (tag === "hr") {
        content += "\n---\n";
      } else if (["div", "p"].includes(tag)) {
        if (content.length > 0 && !content.endsWith("\n")) content += "\n";
        el.childNodes.forEach(walk);
        if (!content.endsWith("\n")) content += "\n";
      } else {
        el.childNodes.forEach(walk);
      }
    }
  };
  clone.childNodes.forEach(walk);

  return { content: content.trim(), imageUrls };
}
