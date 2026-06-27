/**
 * 활동 데이터 plausibility 가드.
 *
 * orider 앱이 잠시 켰다 꺼진 짧은 GPS noise 라이딩이나, 자동차 이동을 라이딩으로 캡쳐한
 * 케이스에서 `averageSpeed` 가 100~200 km/h 같은 비현실적 값으로 노출되는 사례가 있다.
 * 데이터 자체는 (distance / time) 으로 계산상 일치하지만, 사용자 화면에는 명백한 오류로 보인다.
 *
 * 광고 유입 사용자의 첫인상에서 즉시 신뢰가 깨지지 않도록, 표시 단계에서 비현실 값을 가린다.
 * 본 모듈은 원본 데이터를 변형하지 않고 "표시 가능 여부" 판단만 제공한다.
 */

/** disciplineFilter.Discipline 와 호환 ("tri" 는 bike 로 처리). */
export type Discipline = "bike" | "run" | "swim" | "tri";

/** "tri" 는 bike 기준으로 묶어서 평가. */
function normalize(d: Discipline | undefined): "bike" | "run" | "swim" {
  if (d === "run") return "run";
  if (d === "swim") return "swim";
  return "bike"; // bike, tri, undefined → bike 기준
}

/** 종목별 평균속도 상한 (km/h). 이보다 크면 GPS noise/오등록으로 간주. */
const AVG_SPEED_CEILING_KPH: Record<"bike" | "run" | "swim", number> = {
  // 프로 스프린트 평균 60~65, TT 50 전후. 80 은 충분히 보수적.
  bike: 80,
  // 100m 세계기록도 36 km/h 정도. 30 이상이면 GPS 점프.
  run: 30,
  // 수영 세계기록 ~8 km/h. 10 이면 GPS/시계 오차.
  swim: 10,
};

/** 종목별 최고속도 상한 (km/h). 평균보다 관대. */
const MAX_SPEED_CEILING_KPH: Record<"bike" | "run" | "swim", number> = {
  // 다운힐 최고치 ~130 km/h. 140 이상은 GPS 튐.
  bike: 140,
  run: 45,
  swim: 12,
};

/** 평균속도가 비현실적인가. 0 이하/null/NaN 은 미입력으로 간주(가드 미적용). */
export function isImplausibleAvgSpeed(
  avgKph: number | null | undefined,
  discipline: Discipline = "bike",
): boolean {
  if (avgKph == null || !Number.isFinite(avgKph)) return false; // 미입력은 invalid 가 아님
  if (avgKph <= 0) return false;
  return avgKph > AVG_SPEED_CEILING_KPH[normalize(discipline)];
}

/** 최고속도가 비현실적인가. */
export function isImplausibleMaxSpeed(
  maxKph: number | null | undefined,
  discipline: Discipline = "bike",
): boolean {
  if (maxKph == null || !Number.isFinite(maxKph)) return false;
  if (maxKph <= 0) return false;
  return maxKph > MAX_SPEED_CEILING_KPH[normalize(discipline)];
}

/** 마이크로 활동 판정 임계 — 이보다 짧으면 비정상으로 간주. */
const MICRO_MIN_DISTANCE_M = 100;
const MICRO_MIN_DURATION_MS = 60_000;

/** 활동 자체가 비정상으로 짧은가 (1분 미만 또는 100m 미만). */
export function isMicroActivity(
  distanceM: number | null | undefined,
  durationMs: number | null | undefined,
): boolean {
  const d = typeof distanceM === "number" ? distanceM : 0;
  const t = typeof durationMs === "number" ? durationMs : 0;
  return d < MICRO_MIN_DISTANCE_M || t < MICRO_MIN_DURATION_MS;
}

/**
 * 세그먼트 획득고도(elevHigh - elevLow)가 비현실적인가.
 *
 * orider 세그먼트 중 평지(avgGrade≈0)에 2478m, 완만(avg=-0.1%) 23km 구간에 8623m 같은
 * 명백히 corrupt 한 elevationHigh/Low 가 들어온 케이스가 있다. 평균경사 × 거리 로 예상되는
 * gain 대비 실측이 과도하면 표시 단계에서 가린다. 원본 데이터는 변형하지 않는다.
 *
 * 판정 (현재 ExplorePage 인라인 임계값 보존):
 *  gain = max(0, elevHigh - elevLow), expectedGain = distanceM × (avgGrade/100)
 *  implausible = gain >= 200 AND (gain > expectedGain×3 OR gain/distanceM > 0.3)
 *  - gain >= 200m: 짧은 구간의 GPS noise 흡수 → false positive 방지
 *  - gain > expectedGain×3: 평균경사 대비 실측이 3배+ → corrupt
 *  - gain/distanceM > 0.3: gain 이 거리의 30% 초과 (실 도로 최대 ~25%, GPS noise)
 *
 * 입력이 null/NaN 이면 false(가드 미적용).
 */
export function isImplausibleSegmentElevation(args: {
  elevHigh?: number | null;
  elevLow?: number | null;
  distanceM?: number | null;
  avgGrade?: number | null;
}): boolean {
  const { elevHigh, elevLow, distanceM, avgGrade } = args;
  if (
    elevHigh == null || !Number.isFinite(elevHigh) ||
    elevLow == null || !Number.isFinite(elevLow) ||
    distanceM == null || !Number.isFinite(distanceM) ||
    avgGrade == null || !Number.isFinite(avgGrade)
  ) {
    return false;
  }
  const gain = Math.max(0, elevHigh - elevLow);
  if (gain < 200) return false;
  const expectedGain = (distanceM * Math.abs(avgGrade)) / 100;
  return gain > expectedGain * 3 || (distanceM > 0 && gain / distanceM > 0.3);
}

/** 종합 판정: 평균속도/최고속도/마이크로 중 하나라도 해당하면 true. */
export function isImplausibleActivity(args: {
  distanceM?: number | null;
  durationMs?: number | null;
  avgKph?: number | null;
  maxKph?: number | null;
  discipline?: Discipline;
}): boolean {
  const disc = args.discipline ?? "bike";
  return (
    isImplausibleAvgSpeed(args.avgKph, disc) ||
    isImplausibleMaxSpeed(args.maxKph, disc) ||
    isMicroActivity(args.distanceM, args.durationMs)
  );
}
