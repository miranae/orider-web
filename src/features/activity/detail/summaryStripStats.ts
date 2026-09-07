/**
 * 활동 상세 요약 스트립의 값 출처 결정 (#885 §2, epic #2237).
 *
 * 예전에는 스트립이 기기/스트림 파생값만 썼고 AnalysisTab 만 서버 정본을 썼다 — 같은 화면
 * 위아래에서 거리·평균속도·칼로리가 서로 다르게 보일 수 있었다. 이제 스트립도 서버 우선이다.
 *
 * 규칙 (epic 공통):
 *  - 서버 문서를 읽었으면(ready/stale) 그 값이 정본. 필드가 null 이면 **대시로 비운다** —
 *    기기 요약으로 조용히 메우지 않는다(서버가 "없다"고 말한 걸 다른 값으로 덮는 셈).
 *  - 아직 못 읽었으면(loading/missing) 기기 요약값을 보여주되 `provisional` 로 표식한다.
 *  - 비소유자(disabled)는 서버 문서를 읽을 권한 자체가 없다 — 표식을 붙일 근거가 없으므로
 *    기기 요약을 그대로 보여준다.
 */
import type { ActivitySummary } from "@shared/types";
import type { UseActivityMetricsState } from "../../../hooks/useActivityMetrics";

/** 한 지표의 표시값 + 출처 표식. value=null 이면 화면은 대시/생략. */
export interface StripStat {
  value: number | null;
  /** true 면 "기기 요약" 잠정 표식을 붙인다. */
  provisional: boolean;
}

export interface SummaryStripStats {
  distanceM: StripStat;
  avgSpeedKph: StripStat;
  maxSpeedKph: StripStat;
  elevationGainM: StripStat;
  elevationLossM: StripStat;
  caloriesKcal: StripStat;
  avgHr: StripStat;
  maxHr: StripStat;
  avgCadence: StripStat;
  avgPower: StripStat;
  maxPower: StripStat;
  np: StripStat;
  movingTimeSec: StripStat;
  pauseTimeSec: StripStat;
}

export interface SummaryStripInputs {
  summary: ActivitySummary;
  /** 센서 선택을 반영한 평균 파워 (기존 폴백 경로). */
  avgPowerValue: number | null;
  /** 이동시간 보정까지 끝낸 화면 평균속도 (기존 폴백 경로). */
  avgSpeedFallbackKph: number | null;
  /** 센서 선택을 반영한 NP (기존 폴백 경로). */
  normalizedPowerValue: number | null;
  /**
   * streams·activity_metrics 가 리비전 지문을 공유하기 전까지, 원시 파워 후보가 하나라도
   * 있으면 서버 파워값의 출처를 증명할 수 없다 (가상 파워 미리보기가 스트림을 갈아끼우는
   * 경로 포함). 기존 ActivityPage 가드와 동일하게 NP 는 억제하고, 평균/최대 파워는 지금
   * 화면이 그리는 그 스트림에서 나온 값을 그대로 쓴다 — 서버 값으로 덮으면 미리보기와
   * 스트립이 서로 다른 파워를 말하게 된다.
   */
  hasStreamPowerCandidate: boolean;
}

const EMPTY: StripStat = { value: null, provisional: false };

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveSummaryStripStats(
  state: UseActivityMetricsState,
  { summary, avgPowerValue, avgSpeedFallbackKph, normalizedPowerValue, hasStreamPowerCandidate }: SummaryStripInputs,
): SummaryStripStats {
  const m = state.status === "ready" || state.status === "stale" ? state.metrics : null;
  /** 서버 문서를 기다리는 중 — 폴백에 "기기 요약" 표식이 필요한 상태. */
  const labelFallback = state.status === "loading" || state.status === "missing";

  const pick = (server: number | null | undefined, fallback: number | null | undefined): StripStat => {
    if (m) return { value: num(server), provisional: false };
    const value = num(fallback);
    return { value, provisional: labelFallback && value != null };
  };
  /**
   * summary.movingTimeSec/pauseTimeSec 는 activity_metrics 를 활동 문서에 비정규화한 미러다
   * (shared/types.ts 참조) — 폴백이어도 기기 파생값이 아니므로 잠정 표식을 붙이지 않는다.
   */
  /** 지금 화면이 그리는 스트림에서 나온 값 — 서버가 아니지만 기기 요약도 아니다(표식 없음). */
  const streamValue = (value: number | null | undefined): StripStat => ({ value: num(value), provisional: false });
  const pickServerMirror = (server: number | null | undefined, mirror: number | null | undefined): StripStat => ({
    value: m ? num(server) : num(mirror),
    provisional: false,
  });

  return {
    distanceM: pick(m ? m.distanceKm * 1000 : null, summary.distance),
    avgSpeedKph: pick(m?.avgSpeedKph, avgSpeedFallbackKph ?? summary.averageSpeed),
    maxSpeedKph: pick(m?.maxSpeedKph, summary.maxSpeed),
    elevationGainM: pick(m?.elevationGainM, summary.elevationGain),
    // 기기 요약에는 누적 하강이 없다 — 서버 문서가 유일한 출처.
    elevationLossM: pick(m?.elevationLossM, null),
    caloriesKcal: pick(m?.caloriesKcal, summary.calories),
    avgHr: pick(m?.avgHr, summary.averageHeartRate),
    maxHr: pick(m?.maxHr, summary.maxHeartRate),
    avgCadence: pick(m?.avgCadence, summary.averageCadence),
    avgPower: hasStreamPowerCandidate ? streamValue(avgPowerValue) : pick(m?.avgPower, avgPowerValue),
    maxPower: hasStreamPowerCandidate ? streamValue(summary.maxPower) : pick(m?.maxPower, summary.maxPower),
    np: hasStreamPowerCandidate ? EMPTY : pick(m?.np, normalizedPowerValue),
    movingTimeSec: pickServerMirror(m?.movingTimeSec, summary.movingTimeSec),
    pauseTimeSec: pickServerMirror(m?.pauseTimeSec, summary.pauseTimeSec),
  };
}
