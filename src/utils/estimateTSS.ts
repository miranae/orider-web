import type { Activity } from "@shared/types";
import { estimateLoad, TIME_FACTORS, type LoadDiscipline } from "@shared/training/activityLoad";

/**
 * 종목별 TSS 추정 유틸.
 *
 * 시간 기반 fallback·디스패처는 **정본(shared/training/activityLoad.ts)** 의
 * `TIME_FACTORS`(bike 42 / run 60 / swim 40) 와 `estimateLoad` 폴백 체인을 그대로 쓴다.
 * 과거 이 파일은 65/80/50 의 자체 상수를 써서 같은 활동의 주간 TSS 가 PMC(`fitnessMetrics.ts`)
 * 및 서버 projection 보다 ~1.5배 부풀려졌다(2026-06 P0 감사). 본 수정으로 단일 진실원에 수렴.
 *
 * `estimateRunTSS`/`estimateSwimTSS` 는 thresholdPace/CSS 가 있으면 IF² 기반 rTSS/sTSS 를
 * 우선 계산하고(시간factor 보다 정밀), 없을 때만 정본 시간factor 로 폴백한다.
 */

/** 활동 type 문자열 → discipline 추론. 정본 inferDiscipline(functions) 과 동일 규칙. */
function inferDiscipline(type: string | undefined): LoadDiscipline {
  const t = (type ?? "").toLowerCase();
  if (t.includes("swim")) return "swim";
  if (t.includes("run") || t.includes("walk") || t.includes("hike")) return "run";
  return "bike";
}

/**
 * 러닝 TSS (rTSS) 추정.
 *
 * 공식: rTSS = (duration_sec × IF²) / 3600 × 100
 * - IF = thresholdPace(sec/km) / avgPace(sec/km) (임계 페이스 / 평균 페이스)
 * - thresholdPace 또는 averageSpeed 가 없으면 정본 시간factor(run) 폴백.
 */
export function estimateRunTSS(
  a: Activity,
  thresholdPaceSecPerKm?: number,
): number {
  const durationSec = a.summary.ridingTimeMillis / 1000;
  const hours = durationSec / 3600;
  const speedKmh = a.summary.averageSpeed;
  if (!thresholdPaceSecPerKm || !speedKmh || speedKmh <= 0) return hours * TIME_FACTORS.run;
  const avgPaceSecPerKm = 3600 / speedKmh;
  const intensity = thresholdPaceSecPerKm / avgPaceSecPerKm; // >1 이면 임계 이상
  return (durationSec * intensity * intensity) / 3600 * 100;
}

/**
 * 수영 TSS (sTSS) 추정.
 *
 * 공식: sTSS = (duration_sec × IF²) / 3600 × 100
 * - IF = CSS(sec/100m) / avgPace(sec/100m)
 * - CSS 또는 averageSpeed 가 없으면 정본 시간factor(swim) 폴백.
 */
export function estimateSwimTSS(
  a: Activity,
  cssSecPer100m?: number,
): number {
  const durationSec = a.summary.ridingTimeMillis / 1000;
  const hours = durationSec / 3600;
  const speedKmh = a.summary.averageSpeed;
  if (!cssSecPer100m || !speedKmh || speedKmh <= 0) return hours * TIME_FACTORS.swim;
  const avgPaceSecPer100m = (100 / 1000) * (3600 / speedKmh); // km/h → sec/100m
  const intensity = cssSecPer100m / avgPaceSecPer100m;
  return (durationSec * intensity * intensity) / 3600 * 100;
}

/**
 * 사이클 TSS — Strava relativeEffort 우선, 없으면 정본 시간factor(bike) 폴백.
 */
export function estimateBikeTSS(a: Activity): number {
  if (a.summary.relativeEffort) return a.summary.relativeEffort;
  const hours = a.summary.ridingTimeMillis / 3600000;
  return hours * TIME_FACTORS.bike;
}

/**
 * 종목 무관 TSS 추정 — 정본 폴백 체인(`estimateLoad`)에 위임.
 *   사전계산 TSS(summary.tss) > relativeEffort(TRIMP) > 종목 시간factor.
 * 더 정밀한 추정이 필요하면 estimateRunTSS / estimateSwimTSS (IF² 기반) 를 직접 호출.
 */
export function estimateTSS(a: Activity): number {
  return estimateLoad({
    precomputedTss: a.summary.tss,
    relativeEffort: a.summary.relativeEffort,
    avgPower: a.summary.averagePower,
    durationMillis: a.summary.ridingTimeMillis,
    discipline: inferDiscipline(a.type),
  }).value;
}
