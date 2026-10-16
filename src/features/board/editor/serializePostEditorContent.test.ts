import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { serializePostEditorContent } from "./serializePostEditorContent";

function editorFrom(html: string): HTMLElement {
  const editor = document.createElement("div");
  editor.innerHTML = html;
  return editor;
}

function renderedContent(editor: HTMLElement): HTMLElement {
  const content = serializePostEditorContent(editor, new Map()).content;
  return editorFrom(renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm], children: content,
  })));
}

describe("serializePostEditorContent", () => {
  it("serializes headings, formatting, lists, and links to markdown", () => {
    const editor = editorFrom(
      '<h2>Ride Notes</h2><p><strong>Hard</strong> climb with <a href="https://example.com/route">route</a></p><ul><li>Warmup</li><li>Intervals</li></ul>',
    );

    expect(serializePostEditorContent(editor, new Map()).content).toBe([
      "## Ride Notes",
      "**Hard** climb with [route](https://example.com/route)",
      "",
      "- Warmup",
      "- Intervals",
    ].join("\n"));
  });

  it("replaces local blob image URLs with uploaded storage URLs", () => {
    const editor = editorFrom('<p>photo</p><img src="blob:local">');
    const uploaded = "https://firebasestorage.googleapis.com/demo.jpg";
    const result = serializePostEditorContent(editor, new Map([["blob:local", uploaded]]));

    expect(result.imageUrls).toEqual([uploaded]);
    expect(result.content).toContain(`![image](${uploaded})`);
  });

  it("drops unsafe upload URL mappings", () => {
    const editor = editorFrom('<p>photo</p><img src="blob:local">');
    const result = serializePostEditorContent(editor, new Map([["blob:local", "javascript:evil(1)"]]));

    expect(result.imageUrls).toEqual([]);
    expect(result.content).toBe("photo");
  });

  it("drops unsafe links and images while preserving text", () => {
    const editor = editorFrom(
      '<p><a href="javascript:alert(1)">click me</a></p><img src="data:text/html,<svg onload=alert(1)>">',
    );

    const result = serializePostEditorContent(editor, new Map());

    expect(result.imageUrls).toEqual([]);
    expect(result.content).toBe("click me");
  });
});


describe("block elements inserted inside formatting wrappers", () => {
  it("renders the actual bold table-and-body DOM without literal emphasis markers", () => {
    const editor = editorFrom('<b><table><tbody><tr><th>제목1</th><th>제목2</th></tr><tr><td>값1</td><td>값2</td></tr></tbody></table><br>공개 문의와 편집 서식을 검수합니다.</b>');
    const rendered = renderedContent(editor);
    expect(rendered.querySelectorAll("table")).toHaveLength(1);
    expect(rendered.querySelector("th strong")?.textContent).toBe("제목1");
    expect(rendered.querySelector("td strong")?.textContent).toBe("값1");
    expect(rendered.querySelector("p strong")?.textContent).toBe("공개 문의와 편집 서식을 검수합니다.");
    expect(rendered.textContent).not.toContain("**");
  });

  it("keeps emphasis in paragraphs, lists, and blockquotes without spanning blocks", () => {
    const rendered = renderedContent(editorFrom('<em><p>첫 문단</p><p>다음 문단</p><ul><li>목록 <s>취소</s></li></ul><blockquote><p>인용</p></blockquote></em>'));
    expect(rendered.querySelectorAll(":scope > p")).toHaveLength(2);
    expect(rendered.querySelectorAll(":scope > p em")).toHaveLength(2);
    expect(rendered.querySelector("li em")?.textContent).toBe("목록 취소");
    expect(rendered.querySelector("li del")?.textContent).toBe("취소");
    expect(rendered.querySelector("blockquote em")?.textContent).toBe("인용");
  });

  it("closes and reopens emphasis around blank lines inserted with br", () => {
    const rendered = renderedContent(editorFrom('<b>첫 문단<br><br>다음 문단</b>'));
    expect(rendered.querySelectorAll("p strong")).toHaveLength(2);
    expect(rendered.textContent).not.toContain("**");
  });

  it("escapes cell pipes and keeps inline formatting without adding raw HTML", () => {
    const rendered = renderedContent(editorFrom('<u><table><tr><th><b>A | B</b></th></tr><tr><td><em>C</em><br>D</td></tr></table><p>밑줄 텍스트</p></u><script>document.body.remove()</script>'));
    expect(rendered.querySelectorAll("th")).toHaveLength(1);
    expect(rendered.querySelector("th strong")?.textContent).toBe("A | B");
    expect(rendered.querySelector("td em")?.textContent).toBe("C");
    expect(rendered.textContent).toContain("밑줄 텍스트");
    expect(rendered.textContent).not.toContain("document.body.remove()");
    expect(rendered.querySelector("script")).toBeNull();
  });

  it.each([1, 2, 3])("preserves %i backslashes before pipes without creating extra table columns", (count) => {
    const value = `left${"\\".repeat(count)}|right`;
    const editor = editorFrom('<table><tr><th>Header</th><th>Other</th></tr><tr><td></td><td>unchanged</td></tr></table>');
    editor.querySelector("td")!.textContent = value;
    const rendered = renderedContent(editor);
    expect(rendered.querySelectorAll("th")).toHaveLength(2);
    expect(rendered.querySelectorAll("td")).toHaveLength(2);
    expect(rendered.querySelector("td")?.textContent).toBe(value);
    expect(rendered.querySelectorAll("script")).toHaveLength(0);
  });

  it("keeps generated bold and links while escaping backslashes and pipes in their text", () => {
    const editor = editorFrom('<table><tr><th>Header</th></tr><tr><td><b></b> <a href="https://example.com/route?q=a|b"></a></td></tr></table>');
    const value = String.raw`route\|name`;
    editor.querySelector("b")!.textContent = value;
    editor.querySelector("a")!.textContent = value;
    const rendered = renderedContent(editor);
    expect(rendered.querySelectorAll("td")).toHaveLength(1);
    expect(rendered.querySelector("td strong")?.textContent).toBe(value);
    expect(rendered.querySelector("td a")?.textContent).toBe(value);
    expect(rendered.querySelector("td a")?.getAttribute("href")).toBe("https://example.com/route?q=a%7Cb");
  });

  it("does not turn a pipe/backslash payload into additional cells or executable HTML", () => {
    const editor = editorFrom('<table><tr><th>Header</th></tr><tr><td></td></tr></table>');
    editor.querySelector("td")!.textContent = String.raw`safe\|<script>document.body.remove()</script>`;
    const rendered = renderedContent(editor);
    expect(rendered.querySelectorAll("td")).toHaveLength(1);
    expect(rendered.querySelectorAll("script")).toHaveLength(0);
    expect(rendered.querySelector("td")?.textContent).toContain(String.raw`safe\|`);
  });

  it("does not duplicate inherited bold markers inside blocks", () => {
    const rendered = renderedContent(editorFrom('<b><p><strong>강조</strong> 본문</p></b>'));
    expect(rendered.querySelector("p strong")?.textContent).toBe("강조 본문");
    expect(rendered.textContent).not.toContain("**");
  });

  it("keeps approved mapped private Storage references but rejects arbitrary gs sources", () => {
    const storageUrl = "gs://example.appspot.com/board_images/user/post/photo.png";
    const result = serializePostEditorContent(editorFrom('<img src="blob:local">'), new Map([["blob:local", storageUrl]]));
    expect(result.imageUrls).toEqual([storageUrl]);
    expect(result.content).toBe(`![image](${storageUrl})`);
    expect(serializePostEditorContent(editorFrom(`<img src="${storageUrl}">`), new Map()).content).toBe("");
    expect(serializePostEditorContent(editorFrom('<img src="blob:local">'), new Map([["blob:local", "gs://example.appspot.com/other/photo.png"]])).content).toBe("");
  });
});
