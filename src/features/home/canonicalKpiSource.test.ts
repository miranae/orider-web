import { describe, expect, it } from "vitest";

import ko from "../../i18n/resources/ko/dashboard.json";
import { canonicalKpiPresentation, canonicalKpiSource } from "./canonicalKpiSource";

/**
 * 이 표가 곧 홈 KPI 의 계약이다: **미계산·실패는 숫자가 아니다.** 0 도, 클라 집계도 아니다.
 * 전환이 꺼져 있을 때만 클라 집계로 돌아간다.
 */
describe("canonicalKpiSource", () => {
  const values = { a: 1 };

  it("전환이 꺼져 있으면 화면은 오늘과 똑같이 클라 집계를 그린다", () => {
    expect(canonicalKpiSource(false, null, null)).toEqual({ kind: "client" });
    // 꺼져 있으면 서버가 무엇을 내려도 클라다.
    expect(canonicalKpiSource(false, "value", values)).toEqual({ kind: "client" });
    expect(canonicalKpiSource(false, "error", null)).toEqual({ kind: "client" });
  });

  it("정본 값이면 서버 값을 그린다", () => {
    expect(canonicalKpiSource(true, "value", values)).toEqual({ kind: "server", values, stale: false });
  });

  it("stale 이면 값 + 칩이다 — 낡은 값을 최신인 척 그리지 않는다", () => {
    expect(canonicalKpiSource(true, "value_with_stale_hint", values))
      .toEqual({ kind: "server", values, stale: true });
  });

  it("켜졌는데 아직 응답 전이면 숫자를 그리지 않는다", () => {
    expect(canonicalKpiSource(true, null, null)).toEqual({ kind: "state", noteKey: "pending" });
  });

  it.each([
    ["loading", "pending"],
    ["error", "failed"],
    ["empty", "empty"],
  ] as const)("%s 는 %s 상태 문구다 — 숫자가 아니다", (display, noteKey) => {
    expect(canonicalKpiSource(true, display, null)).toEqual({ kind: "state", noteKey });
    // 값이 딸려 와도 마찬가지다: 이 상태들은 값을 그리는 상태가 아니다.
    expect(canonicalKpiSource(true, display, values)).toEqual({ kind: "state", noteKey });
  });

  it("값이 보이는 상태인데 값이 없으면(계약 위반) 0 을 만들지 않고 상태로 떨어진다", () => {
    expect(canonicalKpiSource(true, "value", null)).toEqual({ kind: "state", noteKey: "pending" });
    expect(canonicalKpiSource(true, "value_with_stale_hint", null))
      .toEqual({ kind: "state", noteKey: "pending" });
  });

  it("상태 문구 키는 실제 번역에 존재한다", () => {
    for (const key of ["pending", "failed", "empty", "stale", "staleChip"] as const) {
      expect(ko.canonical[key]).toBeTruthy();
    }
  });
});

/**
 * 상태 → KPI 한 칸의 표시 속성. 두 면(홈 요약·피트니스 요약) 모두 이 표를 쓴다.
 */
describe("canonicalKpiPresentation", () => {
  const notes = {
    value: "최근 7일",
    pending: "아직 확인할 수 없습니다",
    failed: "불러오지 못했습니다",
    empty: "집계할 활동이 없습니다",
    staleChip: "이전 집계",
  };
  const values = { a: 1 };

  it("전환이 꺼져 있으면 숫자 + 기본 문구, 칩 없음 — 오늘의 화면 그대로", () => {
    expect(canonicalKpiPresentation(canonicalKpiSource(false, null, null), notes))
      .toEqual({ showNumbers: true, sub: "최근 7일", chip: null });
  });

  it("정본 값은 숫자 + 기본 문구, 칩 없음", () => {
    expect(canonicalKpiPresentation(canonicalKpiSource(true, "value", values), notes))
      .toEqual({ showNumbers: true, sub: "최근 7일", chip: null });
  });

  it("stale 은 숫자 + 칩", () => {
    expect(canonicalKpiPresentation(canonicalKpiSource(true, "value_with_stale_hint", values), notes))
      .toEqual({ showNumbers: true, sub: "최근 7일", chip: "이전 집계" });
  });

  it.each([
    ["loading", "아직 확인할 수 없습니다"],
    ["error", "불러오지 못했습니다"],
    ["empty", "집계할 활동이 없습니다"],
  ] as const)("%s 는 숫자를 그리지 않고 상태 문구만 남긴다", (display, sub) => {
    expect(canonicalKpiPresentation(canonicalKpiSource(true, display, null), notes))
      .toEqual({ showNumbers: false, sub, chip: null });
  });

  it("켜졌는데 응답 전이면 숫자를 그리지 않는다", () => {
    expect(canonicalKpiPresentation(canonicalKpiSource(true, null, null), notes).showNumbers).toBe(false);
  });
});
