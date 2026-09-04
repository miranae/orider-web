/**
 * 활동 1개의 트레이닝 부하(TSS 척도) 추정 — 정본(canonical, pure).
 *
 * 클라(web/src/utils/fitnessMetrics.ts)와 서버(functions/src/training/activity-load.ts)가
 * **동일한 폴백 체인·상수**를 쓰도록 하는 단일 진실원. 과거 두 구현의 시간 factor 가
 * 65/80/50(클라) vs 42/60/40(서버)로 갈라져 같은 활동의 부하가 화면과 저장 PMC 에서
 * 달랐다(2026-06 감사). 본 모듈로 수렴.
 *
 * functions 는 tsconfig `include:["src"]` 제약으로 이 파일을 프로덕션 빌드에서 직접
 * import 할 수 없어 미러(functions/src/training/activity-load.ts 의 estimateLoad)를 두고,
 * parity 테스트(functions/src/training/activity-load.test.ts)가 동기화를 강제한다.
 * (shared/training/staleness.ts ↔ revalidate-rules.ts 와 동일한 mirror+sync 패턴.)
 *
 * 서버 SDK import 없음 → 양쪽 sub-project 에서 단위 테스트 가능.
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

/** 활동 부하에서 제외하는 짧은 테스트 기록의 거리 경계. */
export const NEGLIGIBLE_DISTANCE_M = 500;
/** 활동 부하에서 제외하는 짧은 테스트 기록의 지속시간 경계. */
export const NEGLIGIBLE_DURATION_MILLIS = 10 * 60 * 1000;

/** 거리 500m 미만이면서 지속시간도 10분 미만인 활동만 무시한다. */
export function isNegligibleActivity(
  distanceMeters: number | null | undefined,
  durationMillis: number | null | undefined,
): boolean {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return false;
  if (distanceMeters >= NEGLIGIBLE_DISTANCE_M) return false;
  const duration = durationMillis != null && Number.isFinite(durationMillis) ? durationMillis : 0;
  return duration < NEGLIGIBLE_DURATION_MILLIS;
}

/** 서버 부하 추출과 같은 시간 필드 우선순위로 negligible 활동을 판정한다. */
export function isNegligibleActivitySummary(summary: {
  distance?: number | null;
  ridingTimeMillis?: number | null;
  movingTimeMillis?: number | null;
  elapsedTimeMillis?: number | null;
} | null | undefined): boolean {
  if (!summary) return false;
  const durationMillis =
    typeof summary.ridingTimeMillis === "number" ? summary.ridingTimeMillis
    : typeof summary.movingTimeMillis === "number" ? summary.movingTimeMillis
    : typeof summary.elapsedTimeMillis === "number" ? summary.elapsedTimeMillis
    : 0;
  return isNegligibleActivity(
    typeof summary.distance === "number" ? summary.distance : null,
    durationMillis,
  );
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
  /**
   * HR 스트림에서 계산한 실측 TRIMP 를 TSS 등가로 정규화한 값(hrTSS 방식). 클라 전용
   * (heartrate 스트림 보유 시, fitnessMetrics.ts:estimateActivityLoad 에서 계산해 전달);
   * 서버는 null. relativeEffort(Strava 블랙박스)보다 우선 — 실측 HR 기반이라 더 정밀.
   */
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
 *   4) streamTrimpTss(HR 스트림 실측 TRIMP → TSS 등가)
 *   5) relativeEffort(TRIMP)   6) 시간 기반(종목 factor)   7) 0
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

  // 4: HR 스트림 실측 TRIMP(TSS 등가 정규화 완료 — 계산은 클라에서 trimpToTssEquivalent 로 수행)
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
