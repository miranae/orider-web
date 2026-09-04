/**
 * 심박 존 경계 — **정본** (#2437, 에픽 app#2237 G).
 *
 * 서버 계산(`functions/src/analysis/hr-zone-boundaries.ts`)과 웹 설정 미리보기
 * (`orider-web src/utils/hrZones.ts`)가 이 파일을 import 한다. 이전엔 서버가 %maxHR 표를,
 * 웹이 Friel %LTHR 표를 따로 갖고 있어 같은 화면에서 분포 차트와 범례가 다른 규칙을 썼다.
 *
 * `shared/` 는 g1-web 과 orider-web 에 같은 내용으로 존재한다(손 동기화 관례). 표를 바꾸면
 * 양쪽을 함께 바꾼다 — 그래서 표와 파생 함수를 한 파일에 둔다.
 */

/** 경계를 무엇으로 파생했나. 값만 보고는 알 수 없어 함께 싣는다. */
export type HrZoneReference = "lthr" | "max_hr";

/** 존 경계에 쓰는 종목 구분. LTHR 경계가 종목별로 다르다. */
export type HrZoneSport = "bike" | "run" | "other";

export interface HrZoneBoundary {
  /** 1-based. */
  zone: number;
  minPct: number;
  /** null = 상한 없음. */
  maxPct: number | null;
  minBpm: number;
  /** **상한 배타적.** 정수 표시 최대는 이 값 - 1. null = 상한 없음. */
  maxBpmExclusive: number | null;
}

export interface HrZoneBoundaries {
  reference: HrZoneReference;
  referenceBpm: number;
  sport: HrZoneSport;
  zones: HrZoneBoundary[];
}

/** %maxHR 경계 — LTHR 이 없을 때. */
export const MAX_HR_BOUNDS: Array<[number, number | null]> =
  [[0, 60], [60, 70], [70, 80], [80, 90], [90, 100]];

/** Friel 러닝 %LTHR. Z5a~c 는 Z5 하나로 접는다. */
export const RUN_LTHR_BOUNDS: Array<[number, number | null]> =
  [[0, 85], [85, 90], [90, 95], [95, 100], [100, null]];

/**
 * Friel 사이클 %LTHR (The Cyclist's Training Bible).
 *
 * 러닝과 경계가 다르다 — 자전거의 LT/HR 지연 특성이 달라서다. 하나로 합치면 한쪽이 틀린다.
 */
export const BIKE_LTHR_BOUNDS: Array<[number, number | null]> =
  [[0, 81], [81, 90], [90, 94], [94, 100], [100, null]];

/** 생리적으로 가능한 심박 범위. 밖이면 미입력으로 본다. */
export function isValidBpm(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 50 && value <= 250;
}

/** 기본 maxHR — 나이 정보가 없을 때. 값이 없다고 존을 안 그리는 것보다 낫다. */
export const DEFAULT_MAX_HR = 184;

/**
 * 존 경계를 파생한다.
 *
 * LTHR 은 **maxHR 보다 작을 때만** 쓴다 — 크면 둘 중 하나가 잘못 입력된 것이고, 그대로
 * 쓰면 Z5 가 사라지거나 전 구간이 Z5 가 된다.
 *
 * `other`(수영 등)는 Friel 기준이 없어 %maxHR 을 쓴다.
 */
export function deriveHrZoneBoundaries(input: {
  maxHr?: unknown;
  lthr?: unknown;
  sport?: HrZoneSport;
}): HrZoneBoundaries {
  const sport: HrZoneSport = input.sport ?? "bike";
  const maxHr = isValidBpm(input.maxHr) ? input.maxHr : DEFAULT_MAX_HR;
  const useLthr = sport !== "other" && isValidBpm(input.lthr) &&
    (!isValidBpm(input.maxHr) || input.lthr < input.maxHr);
  const referenceBpm = useLthr ? input.lthr as number : maxHr;
  const bounds = useLthr
    ? (sport === "bike" ? BIKE_LTHR_BOUNDS : RUN_LTHR_BOUNDS)
    : MAX_HR_BOUNDS;

  return {
    reference: useLthr ? "lthr" : "max_hr",
    referenceBpm,
    sport,
    zones: bounds.map(([minPct, maxPct], index) => ({
      zone: index + 1,
      minPct,
      maxPct,
      // 퍼센트 경계는 위쪽 존에 속한다. ceil 로 계산과 표시가 같은 정수 경계를 쓰게 해
      // 틈이나 겹침이 생기지 않게 한다.
      minBpm: Math.ceil(referenceBpm * minPct / 100),
      maxBpmExclusive: maxPct === null
        ? null
        // %maxHR 의 마지막 존은 기준값에서 끝난다 — 상한을 열어두면 기준값 초과 심박이
        // 전부 마지막 존에 들어가 "최대 심박 초과" 가 보이지 않는다.
        : !useLthr && index === bounds.length - 1
          ? referenceBpm + 1
          : Math.ceil(referenceBpm * maxPct / 100),
    })),
  };
}

