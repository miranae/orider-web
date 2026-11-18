import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ko from "../../i18n/resources/ko/group.json";
import en from "../../i18n/resources/en/group.json";

// 클럽 찾기의 "활동 지역" 칸이 180px 로 고정돼 예시 문구가 "(예: 서울 · " 에서 잘렸다(2026-11-18 운영 화면 실측).
describe("클럽 찾기 지역 칸 폭", () => {
  const css = readFileSync(resolve(import.meta.dirname, "ClubSurface.css"), "utf8");
  const rem = 16;
  const basisRem = () => Number(css.match(/\.club-find-city \{ flex: 0 1 ([\d.]+)rem;/)?.[1]);

  it("기본 폭이 예시 문구 실측 폭(ko 198px, en 210px)보다 넓다", () => {
    expect(basisRem() * rem).toBeGreaterThanOrEqual(210);
    expect(ko["search.city"]).toContain("예:");
    expect(en["search.city"]).toContain("e.g.");
  });

  it("좁은 화면에서는 한 줄을 다 쓴다", () => {
    expect(css).toMatch(/@media \(max-width: 36rem\) \{ \.club-find-city \{ flex-basis: 100%; \} \}/);
  });
});
