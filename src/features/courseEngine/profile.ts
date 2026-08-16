/**
 * 코스엔진 — 고도 프로필 표본 축약.
 *
 * 기존 이벤트 상세는 `step = floor(포인트수 / 300)` 등간격 추출을 썼는데, 이 방식은 봉우리와
 * 골짜기가 표본 사이에 끼면 그대로 잘려 나간다. 고도 프로필에서 정상이 사라지는 것은 코스를
 * 오독하게 만드는 치명적 왜곡이라, 여기서는 구간별 최대/최소를 보존하는 축약을 쓴다.
 */

import { cumulativeDistances } from "./geo";
import type { TrackPoint } from "./stats";

/** 차트에 넣을 기본 목표 표본 수. 이보다 적은 트랙은 그대로 쓴다. */
export const PROFILE_TARGET_POINTS = 600;

export interface ProfileSample {
  /** 시작점 기준 누적 거리(m). */
  distanceM: number;
  /** 고도(m). */
  elevationM: number;
  /** 축약 전 원본 트랙에서의 인덱스. 지도 마커 동기화에 쓴다. */
  sourceIndex: number;
}

/**
 * 트랙을 목표 표본 수 이하로 축약한다.
 *
 * 각 버킷에서 최고점과 최저점을 모두 남기고 원래 순서대로 배치하므로, 표본 수가 줄어도
 * 획득고도의 형상(봉우리·골짜기)이 보존된다. 첫 점과 끝 점은 항상 포함된다.
 */
export function buildElevationProfile(
  points: readonly TrackPoint[],
  targetPoints: number = PROFILE_TARGET_POINTS,
): ProfileSample[] {
  if (points.length === 0) return [];

  const distances = cumulativeDistances(points);
  const toSample = (index: number): ProfileSample => ({
    distanceM: distances[index] ?? 0,
    elevationM: points[index]!.ele,
    sourceIndex: index,
  });

  if (points.length <= targetPoints || targetPoints < 4) {
    return points.map((_, index) => toSample(index));
  }

  // 첫 점과 끝 점을 따로 확보하고 나머지를 버킷으로 나눈다. 버킷마다 최대 2개(최고·최저)를
  // 남기므로 버킷 수는 목표치의 절반으로 잡는다.
  const bucketCount = Math.max(1, Math.floor((targetPoints - 2) / 2));
  const innerStart = 1;
  const innerEnd = points.length - 2;
  const innerCount = innerEnd - innerStart + 1;

  const kept = new Set<number>([0, points.length - 1]);
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = innerStart + Math.floor((bucket * innerCount) / bucketCount);
    const to = innerStart + Math.floor(((bucket + 1) * innerCount) / bucketCount) - 1;
    if (to < from) continue;

    let maxIndex = from;
    let minIndex = from;
    for (let index = from; index <= to; index += 1) {
      if (points[index]!.ele > points[maxIndex]!.ele) maxIndex = index;
      if (points[index]!.ele < points[minIndex]!.ele) minIndex = index;
    }
    kept.add(maxIndex);
    kept.add(minIndex);
  }

  return [...kept].sort((a, b) => a - b).map(toSample);
}

/**
 * 축약된 프로필에서 원본 인덱스에 해당하는 표본 위치를 찾는다.
 * 지도·목록에서 고른 지점을 차트 위에 표시할 때 쓴다. 프로필이 비면 -1.
 */
export function profileIndexForSourceIndex(profile: readonly ProfileSample[], sourceIndex: number): number {
  if (profile.length === 0) return -1;
  let bestIndex = 0;
  let bestGap = Infinity;
  for (let index = 0; index < profile.length; index += 1) {
    const gap = Math.abs(profile[index]!.sourceIndex - sourceIndex);
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/** `ElevationChart` 가 받는 `{ distance, elevation }` 형식으로 변환한다. */
export function toElevationChartData(profile: readonly ProfileSample[]): { distance: number; elevation: number }[] {
  return profile.map(({ distanceM, elevationM }) => ({ distance: distanceM, elevation: elevationM }));
}
