import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("app install and deep link surfaces", () => {
  it("serves Android Digital Asset Links for the release app", () => {
    const assetLinks = JSON.parse(read("public/.well-known/assetlinks.json"));

    expect(assetLinks).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.miranae.orider",
          sha256_cert_fingerprints: [
            "F3:52:C1:FB:D9:89:F8:53:BD:41:C6:F8:D0:87:56:6C:F9:CE:3B:43:83:AE:AB:76:91:28:94:C4:B1:E8:B4:07",
          ],
        },
      },
    ]);
  });

  it("declares the iOS smart app banner", () => {
    expect(read("index.html")).toContain(
      '<meta name="apple-itunes-app" content="app-id=6775696052, app-argument=https://orider.co.kr" />',
    );
  });

  it("keeps the mobile feed free of the sticky app install banner", () => {
    const mobileFeed = read("src/components/mobile/MobileFeedPage.tsx");

    expect(mobileFeed).not.toContain("MobileAppInstallBanner");
    expect(mobileFeed).not.toContain("AppInstallLinks");
    expect(mobileFeed).not.toContain("mobileFeed.appInstall");
  });

  it("keeps static about and manual entry points linked to both stores", () => {
    for (const path of [
      "public/ko/about/index.html",
      "public/en/about/index.html",
      "public/manual/index.html",
      "scripts/gen-manual.mjs",
    ]) {
      const source = read(path);
      expect(source).toContain("https://apps.apple.com/kr/app/o-rider/id6775696052");
      expect(source).toContain("https://play.google.com/store/apps/details?id=com.miranae.orider");
    }
  });
});
