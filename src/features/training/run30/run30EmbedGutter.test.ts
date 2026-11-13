import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 앱 계획 탭(임베드)에서 러닝 카드만 좌우로 한 번 더 들어가 계획 대비 기록보다 좁아 보였다(2026-11-13 iOS 제보).
// 좌우 거터는 앱 셸 한 곳이 소유한다 — 러닝 카드 규칙은 위아래 간격만 둔다.
describe("임베드 계획의 러닝 카드 좌우 폭", () => {
  const run30Css = readFileSync(resolve(import.meta.dirname, "run30.css"), "utf8");
  const embeddedCss = readFileSync(resolve(import.meta.dirname, "../../../embedded/embedded.css"), "utf8");

  it("앱 셸이 좌우 거터를 주고 표면은 좌우 여백을 0 으로 둔다", () => {
    expect(embeddedCss).toMatch(/\.site-shell--padded > \.orider-embedded-surface \{[^}]*padding-inline: 0;/);
  });

  it("러닝 카드는 좌우 여백을 더하지 않는다", () => {
    const rule = run30Css.match(/\.orider-embedded-surface--plan \.run30,\s*\.orider-embedded-surface--plan > \.run30-enroll \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const body = rule![1]!;
    expect(body).toMatch(/margin: var\(--space-2\) 0;/);
    expect(body).not.toMatch(/margin-inline|padding-inline|margin: [^;]*--space-4/);
  });
});
