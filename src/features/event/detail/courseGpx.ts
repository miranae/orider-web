/**
 * 이벤트 상세용 GPX 어댑터.
 *
 * 파싱·거리·통계 구현은 전부 코스엔진(`features/courseEngine`)으로 옮겼다. 이 파일은 이벤트
 * 상세 화면이 쓰던 `CourseData` 형태를 그대로 유지하기 위한 얇은 변환 계층만 남긴다.
 * 새 코드는 이 파일 대신 `features/courseEngine` 를 직접 쓸 것.
 */

import { haversineMeters, parseGpx } from "../../courseEngine";

export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

export type { GpxWaypoint } from "../../courseEngine";

export interface CourseData {
  points: GpxPoint[];
  waypoints: import("../../courseEngine").GpxWaypoint[];
  latlng: [number, number][];
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
  /** 트랙에 `<ele>` 가 실제로 있었는가. false 면 고도 표시를 감춰야 한다. */
  hasElevation: boolean;
}

/** @deprecated `features/courseEngine` 의 `haversineMeters` 를 쓸 것. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineMeters(lat1, lon1, lat2, lon2);
}

export function parseGpxFull(gpxXml: string): CourseData {
  const parsed = parseGpx(gpxXml);
  return {
    points: parsed.points,
    waypoints: parsed.waypoints,
    latlng: parsed.latlng,
    distance: parsed.stats.distanceM,
    elevationGain: parsed.stats.elevationGainM,
    elevationLoss: parsed.stats.elevationLossM,
    maxElevation: parsed.stats.maxElevationM,
    minElevation: parsed.stats.minElevationM,
    hasElevation: parsed.hasElevation,
  };
}
