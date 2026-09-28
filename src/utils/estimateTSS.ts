import type { Activity } from "@shared/types";
import { TIME_FACTORS, type LoadDiscipline } from "@shared/training/activityLoad";
import { acceptedActivityLoad } from "@shared/training/acceptedActivityLoad";
import { dedupeSamePhysicalRides, type PhysicalRideActivity } from "./samePhysicalRide";
import { disciplineOfType } from "@shared/sport/discipline";

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

/** TSS 값 + 출처 표식. value=null 이면 **모른다** — 화면은 0 대신 대시/생략. */
export interface ActivityTssEstimate {
  value: number | null;
  /** true 면 서버 사전계산값이 아니라 클라 추정치 — "추정" 으로 밝혀야 한다. */
  estimated: boolean;
}

/** 원본 summary와 별도로 accepted-load 정본 adapter를 사용한다. */
export function estimateActivityTss(a: Activity, ftp?: number): ActivityTssEstimate {
  const discipline = disciplineOfType(a.type);
  if (!discipline) return { value: null, estimated: false };
  const load = acceptedActivityLoad(a as unknown as Record<string, unknown>, discipline, ftp);
  return { value: load.known ? load.value : null, estimated: load.known && !load.reliable && load.value > 0 };
}

/** 서버와 같은 종목·삭제·실주행 대표 규칙. 원본 활동을 수정하지 않는다. */
export function acceptedTrainingActivities(activities: readonly Activity[], ftp?: number): Activity[] {
  const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const rows: (PhysicalRideActivity & { activity: Activity; sportFamily: LoadDiscipline })[] = activities.flatMap((activity) => {
    const discipline = disciplineOfType(activity.type);
    const record = activity as Activity & { deletedAt?: unknown };
    if (!discipline || record.deletedAt || !Number.isFinite(activity.startTime) || !activity.startTime
      || !Number.isFinite(new Date(activity.startTime).getTime())) return [];
    const summary = activity.summary as unknown as Record<string, unknown>;
    const load = estimateActivityTss(activity, ftp);
    const millis = positive(summary?.movingTimeMillis) ?? positive(summary?.ridingTimeMillis) ?? positive(summary?.elapsedTimeMillis);
    return [{ activity, id: activity.id, source: activity.source, discipline, sportFamily: discipline, type: activity.type,
      localSessionId: activity.localSessionId, stravaActivityId: positive(activity.stravaActivityId), stravaTwinActivityId: positive(activity.stravaTwinActivityId),
      startTime: activity.startTime, endTime: positive(activity.endTime),
      movingSec: positive(summary?.movingTimeSec) ?? (millis !== null ? millis / 1000 : null), hasLoad: (load.value ?? 0) > 0 }];
  });
  return dedupeSamePhysicalRides(rows).map((row) => row.activity);
}

/** 값만 필요한 호출자용. 모르면 null — 0 으로 메우지 않는다. */
export function estimateTSS(a: Activity): number | null {
  return estimateActivityTss(a).value;
}

/** 활동 묶음의 TSS 합계. 아는 값만 더하고, 추정치가 하나라도 섞이면 `estimated` 로 알린다. */
export function sumActivityTss(activities: readonly Activity[], ftp?: number): ActivityTssEstimate & { unknownCount: number } {
  let total = 0;
  let known = false;
  let estimated = false;
  let unknownCount = 0;
  for (const a of acceptedTrainingActivities(activities, ftp)) {
    const { value, estimated: isEstimate } = estimateActivityTss(a, ftp);
    if (value == null) { unknownCount += 1; continue; }
    total += value;
    known = true;
    if (isEstimate) estimated = true;
  }
  return { value: known ? Math.round(total) : null, estimated, unknownCount };
}
