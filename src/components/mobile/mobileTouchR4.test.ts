import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile touch r4", () => {
  it("defines global touch feedback and overscroll containment policy", () => {
    const css = read("src/index.css");

    expect(css).toContain("-webkit-tap-highlight-color: transparent");
    expect(css).toContain("touch-action: manipulation");
    expect(css).toContain("overscroll-behavior-y: contain");
    expect(css).toContain("[role=\"tablist\"]");
  });

  it("uses visualViewport to avoid keyboard overlap with the mobile tab bar", () => {
    const tabBar = read("src/components/mobile/MobileTabBar.tsx");

    expect(tabBar).toContain("window.visualViewport");
    expect(tabBar).toContain("keyboardOpen");
    expect(tabBar).toContain("translateY(110%)");
  });

  it("caps mobile feed card mounting before remote pagination", () => {
    const feed = read("src/components/mobile/MobileFeedPage.tsx");

    expect(feed).toContain("MOBILE_FEED_RENDER_INITIAL");
    expect(feed).toContain("renderedActivities");
    expect(feed).toContain("hasHiddenLocalItems");
  });

  it("adds lazy image loading to repeated image surfaces", () => {
    expect(read("src/components/Avatar.tsx")).toContain('loading="lazy"');
    expect(read("src/pages/BoardPage.tsx")).toContain('loading="lazy"');
    expect(read("src/pages/PostDetailPage.tsx")).toContain('loading="lazy"');
    expect(read("src/pages/AthletePage.tsx")).toContain('loading="lazy"');
  });

  it("shows mobile file-select copy for activity upload", () => {
    const upload = read("src/pages/activity/ActivityUploadPage.tsx");

    expect(upload).toContain("useMobile");
    expect(upload).toContain("mobileFileSelectHint");
  });
});
