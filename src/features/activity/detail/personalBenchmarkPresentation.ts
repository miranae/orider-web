import type { PdcDoc } from "@shared/types/pdc";
import type { PowerDurationKey } from "@shared/types/personal-records";
import type { MetricsLike } from "./metricsPresentation";

const DURATIONS: Array<[PowerDurationKey, number]> = [["1s", 1], ["5s", 5], ["10s", 10], ["30s", 30], ["1m", 60], ["2m", 120], ["5m", 300], ["10m", 600], ["20m", 1200], ["30m", 1800], ["1h", 3600]];
export interface PersonalBenchmarkPoint {
  key: PowerDurationKey;
  seconds: number;
  watts: number;
  referenceWatts: number;
  activityId: string;
  date: string;
}
export type PersonalBenchmark = { reason: "ready"; points: PersonalBenchmarkPoint[]; asOf: number } | { reason: "currentUnavailable" | "referenceUnproven" | "noCommonDurations"; points: []; asOf?: never };

/** 서버가 계산한 동일 duration만 나란히 표시한다. 보간·추정 모델은 기준 기록이 아니다. */
export function personalBenchmark(metrics: MetricsLike | null, pdc: PdcDoc): PersonalBenchmark {
  if (!metrics || metrics.discipline !== "bike" || metrics.isVirtualPower !== false
      || metrics.inputPending === true || metrics.inputCoverage !== "complete") {
    return { reason: "currentUnavailable", points: [] };
  }
  if (pdc.discipline !== "bike" || pdc.version !== 6 || pdc.status !== "final"
      || pdc.coverage?.state !== "complete" || pdc.provenance.power !== "measured"
      || pdc.provenance.excludesVirtualPower !== true || !Number.isFinite(pdc.asOf) || pdc.asOf! <= 0) {
    return { reason: "referenceUnproven", points: [] };
  }
  const points = DURATIONS.flatMap(([key, seconds]) => {
    const watts = metrics.mmp?.[key];
    const entry = pdc.mmpAll[key];
    const provenance = pdc.provenance.byDuration[key];
    return typeof watts === "number" && Number.isFinite(watts) && watts > 0
      && entry && Number.isFinite(entry.value) && entry.value > 0 && entry.source !== "unknown"
      && provenance?.source === entry.source && provenance.cohortEligible === entry.cohortEligible
      && entry.activityId && Number.isFinite(entry.startTime) && /^\d{4}-\d{2}-\d{2}$/u.test(entry.date)
      ? [{ key, seconds, watts, referenceWatts: entry.value, activityId: entry.activityId, date: entry.date }]
      : [];
  });
  return points.length ? { reason: "ready", points, asOf: pdc.asOf! } : { reason: "noCommonDurations", points: [] };
}
