import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 서버가 내보내는 근거·신호 코드는 반드시 사용자 문구를 가져야 한다.
 *
 * 미매핑 코드는 화면에서 폴백 문구나 raw 코드로 대체된다. 실제로 rules v2 가 내보내는
 * `load_supports_plan` 등이 번역에 없어 "현재 부하와 회복 신호 반영"(회복 신호는 더 이상 읽지도
 * 않는다)로 표시됐고, 사용자에게는 근거가 사실과 다르게 보였다(2026-08-21).
 *
 * 목록의 정본은 서버(`orider-g1-web/functions/src/coach/prescription/engine.ts` 의 reasonCodes,
 * `load-analysis` 의 reasonCodes, 그리고 낮은 신뢰도 공시 신호)다. 서버에서 코드를 추가하면
 * 이 목록과 두 언어 리소스를 함께 갱신해야 이 테스트가 통과한다.
 */
const SERVER_REASON_CODES = [
  // prescription rules v2 — 일자별 처방 근거
  "load_supports_plan", "no_planned_workout", "follow_planned_rest", "availability_day_cap",
  "high_load_initial_recovery", "high_load_recovery_session", "high_load_plan_reduction",
  "form_gate_before_intensity", "threshold_stale",
  // 부하 판정 근거
  "classification_high_load", "high_load",
] as const;

/** 낮은 신뢰도 공시 신호 — 서버 `lowConfidenceMissingSignals()` 가 내보내는 전수. */
const SERVER_LOW_CONFIDENCE_SIGNALS = [
  "load_history_short", "load_history_gaps", "load_data_stale", "load_data_unavailable",
  "current_week_activities_missing",
] as const;

const LANGUAGES = ["ko", "en"] as const;

function decisionCopy(language: string) {
  const path = join(process.cwd(), `src/i18n/resources/${language}/training.json`);
  return JSON.parse(readFileSync(path, "utf8")).decision as {
    reason: Record<string, string>;
    reasonFallback: string;
    confidence: { signal: Record<string, string> };
  };
}

describe("training decision copy contract", () => {
  for (const language of LANGUAGES) {
    it(`${language}: 서버가 내보내는 근거 코드 전수에 문구가 있다`, () => {
      const copy = decisionCopy(language);
      const missing = SERVER_REASON_CODES.filter((code) => !copy.reason[code]);
      expect(missing).toEqual([]);
    });

    it(`${language}: 낮은 신뢰도 신호 전수에 문구가 있다`, () => {
      const copy = decisionCopy(language);
      const missing = SERVER_LOW_CONFIDENCE_SIGNALS.filter((code) => !copy.confidence.signal[code]);
      expect(missing).toEqual([]);
    });

    it(`${language}: 폴백 문구가 읽지 않는 신호를 근거로 내세우지 않는다`, () => {
      // rules v2 는 회복(readiness)·주관 신호를 입력에서 제외했다. 폴백 문구가 그것을 반영한다고
      // 말하면 표시되는 근거가 사실과 달라진다.
      const fallback = decisionCopy(language).reasonFallback;
      expect(fallback).not.toMatch(/회복|recovery|readiness/iu);
    });
  }
});
