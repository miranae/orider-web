import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { getAboutDocumentPath, redirectToAboutDocument } from "./AboutPage";

describe("AboutPage document navigation", () => {
  it.each([
    ["ko", "/ko/about/index.html"],
    ["ko-KR", "/ko/about/index.html"],
    ["en", "/en/about/index.html"],
    ["en-US", "/en/about/index.html"],
  ])("maps %s to the canonical long-form document", (language, expectedPath) => {
    expect(getAboutDocumentPath(language)).toBe(expectedPath);
  });

  it("uses full-document replacement so SPA navigation cannot render the summary page", () => {
    const replace = vi.fn();

    redirectToAboutDocument("ko", replace);

    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/ko/about/index.html");
  });

  it("keeps both canonical targets backed by the long-form introduction", async () => {
    const [koDocument, enDocument] = await Promise.all([
      readFile(`${process.cwd()}/public/ko/about/index.html`, "utf8"),
      readFile(`${process.cwd()}/public/en/about/index.html`, "utf8"),
    ]);

    expect(koDocument).toContain('<html lang="ko">');
    expect(koDocument).toContain('<main id="main">');
    expect(koDocument).toMatch(/<section[^>]+id="club"/);
    expect(koDocument).toMatch(/<section[^>]+id="experience"/);
    expect(koDocument).toContain('href="/ko/groups"');
    expect(enDocument).toContain("From my ride records to our shared riding platform.");
    expect(enDocument).toContain("From a tool built by one person to a platform improved together");
  });
});
