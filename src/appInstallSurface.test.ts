import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("app install and deep link surfaces", () => {
  // Play 로 배포되는 빌드는 Play 앱 서명 키로 재서명되므로, 검증 대상 지문은
  // 업로드 키가 아니라 Play 앱 서명 키다. 디버그 키스토어 지문이 들어가면
  // 실사용자 App Links 검증이 전부 실패한다(딥링크 6개 "잘못 구성됨").
  const PLAY_APP_SIGNING_SHA256 =
    "FC:2F:D3:C3:3E:D7:0E:60:33:FC:53:92:7F:70:68:CD:23:84:66:DF:90:55:BB:8E:D9:52:8B:C9:FB:09:39:6F";
  // 업로드 키·디버그 키는 올리지 않는다 — 그 키로 서명한 사이드로드 앱까지 이 도메인의
  // App Links 를 검증받아 링크를 가로챌 수 있다. Play 배포 빌드는 Play 서명 키만 쓴다.
  const UPLOAD_KEY_SHA256 =
    "31:E1:EF:35:54:BC:15:02:36:7F:B1:0C:AD:3C:AF:97:96:0A:4C:BB:A2:8D:1B:3E:50:42:64:13:91:32:09:A1";
  const DEBUG_KEYSTORE_SHA256 =
    "F3:52:C1:FB:D9:89:F8:53:BD:41:C6:F8:D0:87:56:6C:F9:CE:3B:43:83:AE:AB:76:91:28:94:C4:B1:E8:B4:07";

  it("serves Android Digital Asset Links for the release app", () => {
    const assetLinks = JSON.parse(read("public/.well-known/assetlinks.json"));

    expect(assetLinks).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.miranae.orider",
          sha256_cert_fingerprints: [PLAY_APP_SIGNING_SHA256],
        },
      },
    ]);
  });

  it("never publishes the debug or upload keystore fingerprint", () => {
    const assetLinks = read("public/.well-known/assetlinks.json");
    expect(assetLinks).not.toContain(DEBUG_KEYSTORE_SHA256);
    expect(assetLinks).not.toContain(UPLOAD_KEY_SHA256);
  });

  it("keeps the iOS smart app banner disabled", () => {
    expect(read("index.html")).not.toContain('name="apple-itunes-app"');
  });

  it("keeps iOS universal links enabled", () => {
    const association = JSON.parse(read("public/.well-known/apple-app-site-association"));

    // 접두사 없는 경로는 앱이 공유하는 링크, /{lang} 경로는 웹에서 복사한 링크다.
    // LocaleRedirect 가 전자를 후자로 리다이렉트하므로 양쪽 모두 등록해야 앱이 열린다.
    //
    // 새로 추가하는 언어 경로의 group 은 /group/join/* 로 좁힌다 — iOS 유니버설 링크 핸들러는
    // /group/{값} 의 값을 초대 코드로 간주해 joinGroupByCode 를 호출하므로, /ko/group/* 로 열면
    // 그룹 대시보드 링크(/ko/group/{groupId}, 웹이 실제로 만드는 형태)까지 앱이 가로채 엉뚱한
    // 참여를 시도한다. 접두사 없는 /group/* 는 기존 항목이라 그대로 둔다 — 웹은 항상 /{lang}
    // 경로를 만들어서 사실상 초대 링크(/group/join/CODE)만 여기에 걸린다.
    expect(association.applinks.details).toContainEqual({
      appID: "44UCACQVM5.com.miranae.orider",
      paths: [
        "/course/*",
        "/friend/*",
        "/group/*",
        "/ko/course/*",
        "/ko/friend/*",
        "/ko/group/join/*",
        "/en/course/*",
        "/en/friend/*",
        "/en/group/join/*",
      ],
    });
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
