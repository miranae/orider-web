import { describe, expect, it, vi } from "vitest";
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
});
