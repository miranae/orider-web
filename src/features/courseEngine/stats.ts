/**
 * 코스엔진 — 트랙 통계와 고도 표본 유효성 판정.
 */

import { cumulativeDistances, haversineMeters, type LatLonPoint } from "./geo";

export interface TrackPoint extends LatLonPoint {
  /** 고도(m). GPX 에 `<ele>` 가 없으면 0 으로 채워지므로 값 자체를 신뢰하지 말 것 — `elevationQuality` 로 판정한다. */
  ele: number;
}

export interface TrackStats {
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  maxElevationM: number;
  minElevationM: number;
  /** 획득고도 / 거리 × 100. 코스는 순환·왕복이 많아 net grade 대신 이 값을 쓴다. */
  avgGradePct: number;
  /** 구간 경사의 최댓값(%). 100% 이상은 고도 노이즈로 보고 버린다. */
  maxGradePct: number;
}

export const EMPTY_TRACK_STATS: TrackStats = {
  distanceM: 0,
  elevationGainM: 0,
  elevationLossM: 0,
  maxElevationM: 0,
  minElevationM: 0,
  avgGradePct: 0,
  maxGradePct: 0,
};

/** 경사 계산에서 버릴 비현실적 값(%). 고도 표본 노이즈가 만드는 스파이크를 막는다. */
const MAX_PLAUSIBLE_GRADE_PCT = 100;

/**
 * 고도 표본의 신뢰도.
 *
 * - `none` — 표본이 없거나 전부 같은 값. `<ele>` 없는 GPX 를 그리면 완벽한 평지가 나와서
 *   사용자가 "이 코스는 평지"로 오독한다. 정보를 안 보여주는 것보다 나쁘므로 별도 상태로 판정한다.
 * - `measured` — 기록된 실측값(활동 스트림, 고도 있는 GPX).
 * - `estimated` — 라우팅 제공자의 지형 모델 추정치. 실측 대비 수십 m 오차가 날 수 있다.
 */
export type ElevationQuality = "none" | "measured" | "estimated";

/** 고도 변화가 이 값 미만이면 표본이 없는 것으로 본다(m). 이벤트 상세의 기존 판정 기준과 동일. */
export const FLAT_ELEVATION_THRESHOLD_M = 1;

/**
 * 고도 표본이 실제로 쓸 만한지 판정한다.
 * `source` 는 표본이 유효할 때 붙일 출처이며, 표본이 없으면 항상 `none` 을 돌려준다.
 */
export function classifyElevationQuality(
  elevations: readonly number[],
  source: Exclude<ElevationQuality, "none">,
): ElevationQuality {
  const finite = elevations.filter((value) => Number.isFinite(value));
  if (finite.length < 2) return "none";
  let min = Infinity;
  let max = -Infinity;
  for (const value of finite) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min < FLAT_ELEVATION_THRESHOLD_M ? "none" : source;
}

/**
 * 트랙 전체 통계. 거리는 좌표에서 직접 계산하므로 별도 거리 배열이 필요 없다.
 */
export function computeTrackStats(points: readonly TrackPoint[]): TrackStats {
  if (points.length < 2) return EMPTY_TRACK_STATS;

  let distanceM = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let maxElevationM = -Infinity;
  let minElevationM = Infinity;
  let maxGradePct = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    if (current.ele > maxElevationM) maxElevationM = current.ele;
    if (current.ele < minElevationM) minElevationM = current.ele;
    if (index === 0) continue;

    const previous = points[index - 1]!;
    const segmentM = haversineMeters(previous.lat, previous.lon, current.lat, current.lon);
    distanceM += segmentM;

    const deltaEle = current.ele - previous.ele;
    if (deltaEle > 0) elevationGainM += deltaEle;
    else elevationLossM += Math.abs(deltaEle);

    if (segmentM > 0) {
      const gradePct = Math.abs((deltaEle / segmentM) * 100);
      if (gradePct > maxGradePct && gradePct < MAX_PLAUSIBLE_GRADE_PCT) maxGradePct = gradePct;
    }
  }

  return {
    distanceM: Math.round(distanceM),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    maxElevationM: maxElevationM === -Infinity ? 0 : Math.round(maxElevationM),
    minElevationM: minElevationM === Infinity ? 0 : Math.round(minElevationM),
    avgGradePct: distanceM > 0 ? Math.round((elevationGainM / distanceM) * 1000) / 10 : 0,
    maxGradePct: Math.round(maxGradePct * 10) / 10,
  };
}

/**
 * 이미 거리·고도 배열을 갖고 있는 호출자(활동 스트림)를 위한 변형.
 * 거리 배열은 시작점 기준 누적 거리(m).
 */
export function computeStatsFromStreams(
  elevations: readonly number[],
  cumulativeDistanceM: readonly number[],
): TrackStats {
  if (elevations.length < 2) return EMPTY_TRACK_STATS;

  const totalDistanceM = (cumulativeDistanceM[cumulativeDistanceM.length - 1] ?? 0) - (cumulativeDistanceM[0] ?? 0);
  let elevationGainM = 0;
  let elevationLossM = 0;
  let maxElevationM = -Infinity;
  let minElevationM = Infinity;
  let maxGradePct = 0;

  for (let index = 0; index < elevations.length; index += 1) {
    const current = elevations[index] ?? 0;
    if (current > maxElevationM) maxElevationM = current;
    if (current < minElevationM) minElevationM = current;
    if (index === 0) continue;

    const deltaEle = current - (elevations[index - 1] ?? 0);
    const deltaDist = (cumulativeDistanceM[index] ?? 0) - (cumulativeDistanceM[index - 1] ?? 0);
    if (deltaEle > 0) elevationGainM += deltaEle;
    else elevationLossM += Math.abs(deltaEle);

    if (deltaDist > 0) {
      const gradePct = Math.abs((deltaEle / deltaDist) * 100);
      if (gradePct > maxGradePct && gradePct < MAX_PLAUSIBLE_GRADE_PCT) maxGradePct = gradePct;
    }
  }

  return {
    distanceM: Math.round(totalDistanceM),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    maxElevationM: maxElevationM === -Infinity ? 0 : Math.round(maxElevationM),
    minElevationM: minElevationM === Infinity ? 0 : Math.round(minElevationM),
    avgGradePct: totalDistanceM > 0 ? Math.round((elevationGainM / totalDistanceM) * 1000) / 10 : 0,
    maxGradePct: Math.round(maxGradePct * 10) / 10,
  };
}

/** 좌표 배열에서 누적 거리를 만들어 통계를 계산하는 편의 함수. */
export function computeStatsFromTrack(points: readonly TrackPoint[]): {
  stats: TrackStats;
  cumulativeDistanceM: number[];
} {
  return { stats: computeTrackStats(points), cumulativeDistanceM: cumulativeDistances(points) };
}
