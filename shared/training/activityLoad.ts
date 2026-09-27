/**
 * 활동 1개의 트레이닝 부하(TSS 척도) 추정 — 정본(canonical, pure).
 *
 * 클라(web/src/utils/fitnessMetrics.ts)와 서버(functions/src/training/activity-load.ts)가
 * **동일한 폴백 체인·상수**를 쓰도록 하는 단일 진실원. 과거 두 구현의 시간 factor 가
 * 65/80/50(클라) vs 42/60/40(서버)로 갈라져 같은 활동의 부하가 화면과 저장 PMC 에서
 * 달랐다(2026-06 감사). 본 모듈로 수렴.
 *
 * 서버 acceptedActivityLoad adapter는 이 순수 계산기를 직접 import한다.
 * 기존 서버 estimateLoad export는 호환을 유지하며 parity fixture로 동일 결과를 검증한다.
 *
 * Firebase admin import 없음 → 양쪽 sub-project 에서 단위 테스트 가능.
 */

export type LoadDiscipline = "bike" | "run" | "swim";
export type LoadSource = "tss" | "trimp" | "time";

/** 일일 TSS 현실 상한. 프로 6시간 all-out 도 ~500. 초과값은 단위버그 의심 → 폴백/무시. */
export const TSS_SANITY_MAX = 600;

/**
 * 시간 기반 추정 factor (TSS/h). 보수화 근거(관찰 2026-05-25):
 * 옛 bike=65 는 IF=0.81 가정이라 Z1-Z2(IF≈0.55) 라이딩을 ~2배 과대평가 →
 * IF≈0.65 가정한 42 로 보수화. run easy IF~0.78, swim 보수.
 */
export const TIME_FACTORS: Record<LoadDiscipline, number> = { bike: 42, run: 60, swim: 40 };

/**
 * discipline 미상(클라의 멀티스포츠/혼합 집계 등) 시 사용하는 중립 factor.
 * 서버는 항상 discipline 을 resolve(inferDiscipline, 미상→bike)하므로 이 경로를 타지 않는다.
 * 클라도 가능하면 getDiscipline 으로 종목을 넘겨 이 기본값 의존을 피할 것.
 */
export const DEFAULT_TIME_FACTOR = 50;

/** #1391: 0km 대 테스트·쓰레기 기록 판정 상수 — 부하/집계 산입 차단 기준. */
export const NEGLIGIBLE_DISTANCE_M = 500;
export const NEGLIGIBLE_DURATION_MILLIS = 10 * 60 * 1000;

/** #1391: 무시해도 되는 쓰레기 기록인가 — 거리 500m 미만 **그리고** 지속 10분 미만.
 *  거리 필드 자체가 없는 활동(수동 입력 등)은 게이트하지 않고, 거리 0 이라도 지속시간이
 *  충분하면(실내 트레이너) 정상 산입한다. 실사례: 0~0.2km × 수 분짜리 테스트 기록 쌍. */
export function isNegligibleActivity(
  distanceMeters: number | null | undefined,
  durationMillis: number | null | undefined,
): boolean {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return false;
  if (distanceMeters >= NEGLIGIBLE_DISTANCE_M) return false;
  const dur = durationMillis != null && Number.isFinite(durationMillis) ? durationMillis : 0;
  return dur < NEGLIGIBLE_DURATION_MILLIS;
}

/** #1391: activity.summary 어댑터 — 서버 extractActivityTss 와 동일한 시간 폴백 체인
 *  (ridingTimeMillis → movingTimeMillis → elapsedTimeMillis)으로 negligible 판정.
 *  클라 집계도 이 헬퍼를 써야 서버와 게이트가 일치한다. */
export function isNegligibleActivitySummary(summary: {
  distance?: number | null;
  ridingTimeMillis?: number | null;
  movingTimeMillis?: number | null;
  elapsedTimeMillis?: number | null;
} | null | undefined): boolean {
  if (!summary) return false;
  const millis =
    typeof summary.ridingTimeMillis === "number" ? summary.ridingTimeMillis
    : typeof summary.movingTimeMillis === "number" ? summary.movingTimeMillis
    : typeof summary.elapsedTimeMillis === "number" ? summary.elapsedTimeMillis
    : 0;
  return isNegligibleActivity(typeof summary.distance === "number" ? summary.distance : null, millis);
}

export interface LoadInputs {
  /** 사전계산 TSS (activity.tss / summary.tss). 있으면 최우선. */
  precomputedTss?: number | null;
  /** 파워 스트림에서 계산한 실측 TSS. 클라 전용(watts 보유 시); 서버는 null. */
  streamTss?: number | null;
  /** 평균 파워(W) — bike 근사(IF²)용. */
  avgPower?: number | null;
  /** 사용자 FTP(W). */
  ftp?: number | null;
  /** HR 스트림 TRIMP를 임계HR 1시간=100으로 정규화한 hrTSS. */
  streamTrimpTss?: number | null;
  /** Strava relativeEffort(TRIMP) — 보통 TSS 와 같은 척도. */
  relativeEffort?: number | null;
  /** 운동 시간(millis). */
  durationMillis?: number | null;
  /** 종목. 미지정 시 DEFAULT_TIME_FACTOR. */
  discipline?: LoadDiscipline | null;
}

export interface LoadResult {
  value: number;
  source: LoadSource;
}

/** 0 < x ≤ TSS_SANITY_MAX 이고 유한한가. */
export function isSaneTss(x: number | null | undefined): x is number {
  return x != null && Number.isFinite(x) && x > 0 && x <= TSS_SANITY_MAX;
}

/**
 * 통합 폴백 체인 (정확도 높은 순):
 *   1) precomputedTss   2) streamTss(파워 스트림 실측)
 *   3) avgPower → IF²·h·100 (bike + ftp + avgPower, VI=1 근사)
 *   4) streamTrimpTss(HR 스트림)   5) relativeEffort(TRIMP)
 *   6) 시간 기반(종목 factor)   7) 0
 */
export function estimateLoad(i: LoadInputs): LoadResult {
  if (isSaneTss(i.precomputedTss)) return { value: Math.round(i.precomputedTss), source: "tss" };
  if (isSaneTss(i.streamTss)) return { value: Math.round(i.streamTss), source: "tss" };

  const hours = i.durationMillis && i.durationMillis > 0 ? i.durationMillis / 3600000 : 0;

  // 3: power 기반 근사 (bike + ftp + avgPower). NP 없이 avgPower → VI=1(꾸준한 페달링) 가정.
  if (i.discipline === "bike" && i.ftp && i.ftp > 0 && i.avgPower && i.avgPower > 0 && hours > 0) {
    const ifac = i.avgPower / i.ftp;
    const tss = hours * ifac * ifac * 100;
    if (isSaneTss(tss)) return { value: Math.round(tss), source: "tss" };
  }

  // 4: HR 스트림 실측 TRIMP(hrTSS 정규화)
  if (isSaneTss(i.streamTrimpTss)) return { value: Math.round(i.streamTrimpTss), source: "trimp" };

  // 5: Strava relativeEffort(TRIMP)
  if (isSaneTss(i.relativeEffort)) return { value: Math.round(i.relativeEffort), source: "trimp" };

  // 6: 시간 기반 (보수적 — Z2 normal 가정)
  if (hours > 0) {
    const factor = i.discipline ? TIME_FACTORS[i.discipline] : DEFAULT_TIME_FACTOR;
    const est = Math.round(hours * factor);
    if (est > 0 && est <= TSS_SANITY_MAX) return { value: est, source: "time" };
  }

  return { value: 0, source: "time" };
}
