import { describe, expect, it } from "vitest";
import { serializePostEditorContent } from "./serializePostEditorContent";

function editorFrom(html: string): HTMLElement {
  const editor = document.createElement("div");
  editor.innerHTML = html;
  return editor;
}

describe("serializePostEditorContent", () => {
  it("serializes headings, formatting, lists, and links to markdown", () => {
    const editor = editorFrom(
      '<h2>Ride Notes</h2><p><strong>Hard</strong> climb with <a href="https://example.com/route">route</a></p><ul><li>Warmup</li><li>Intervals</li></ul>',
    );

    expect(serializePostEditorContent(editor, new Map()).content).toBe([
      "## Ride Notes",
      "**Hard** climb with [route](https://example.com/route)",
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

  it("drops unsafe links and images while preserving text", () => {
    const editor = editorFrom(
      '<p><a href="javascript:alert(1)">click me</a></p><img src="data:text/html,<svg onload=alert(1)>">',
    );

    const result = serializePostEditorContent(editor, new Map());

    expect(result.imageUrls).toEqual([]);
    expect(result.content).toBe("click me");
  });
});
