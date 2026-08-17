/**
 * 코스 상세의 경유지 표·레인 데이터 파생.
 *
 * 서버가 저장 시 트랙에 재투영해 `distanceFromStartMeters` 를 넣어두므로 거리를 다시
 * 계산하지 않는다. 분류만 코스엔진에 맡기고, 코스 문맥에 노출되지 않는 레인(컷오프)은 거른다.
 */

import { classifyLane, lanesForContext, type WpLane } from "../courseEngine";

export interface StoredCourseWaypoint {
  name: string | null;
  type: string | null;
  note: string | null;
  latitude: number;
  longitude: number;
  distanceFromStartMeters: number;
}

export interface CourseWaypointRow {
  /** 원본 이름. 비어 있으면 null — 표시 문구는 화면이 정한다. */
  name: string | null;
  note: string;
  km: number;
  location: [number, number];
  lane: WpLane;
}

/**
 * 레인 위 핍의 가로 위치.
 *
 * 위치(`left`)는 실제 거리 비율 그대로 둔다. 가장자리 근처를 끝점으로 몰아버리면 200km
 * 코스에서 4km 지점 경유지가 출발점에 겹쳐 표시되어 위치가 거짓이 된다. 정확히 양 끝
 * (0·1)일 때만 앵커를 안쪽으로 돌려 절반이 잘리는 것을 막는다.
 */
export function waypointPipAnchorStyle(ratio: number): { left: string; transform?: string } {
  if (ratio <= 0) return { left: "0%", transform: "translate(0, -50%)" };
  if (ratio >= 1) return { left: "100%", transform: "translate(-100%, -50%)" };
  return { left: `${ratio * 100}%` };
}

export interface CourseWaypointLaneGroup {
  lane: WpLane;
  items: Array<CourseWaypointRow & { index: number; ratio: number }>;
}

// 손상된 저장 데이터가 지도 마커와 flyTo 경로로 그대로 흘러가면 렌더링이 깨지거나
// 유효 영역 밖으로 지도가 날아간다. 좌표 범위까지 확인한다.
function isRenderableWaypoint(waypoint: StoredCourseWaypoint): boolean {
  return Number.isFinite(waypoint.latitude)
    && Number.isFinite(waypoint.longitude)
    && Math.abs(waypoint.latitude) <= 90
    && Math.abs(waypoint.longitude) <= 180
    && Number.isFinite(waypoint.distanceFromStartMeters)
    && waypoint.distanceFromStartMeters >= 0;
}

/** 코스 문맥에서 보여줄 경유지를 거리순으로 정리한다. */
export function buildCourseWaypointRows(
  stored: readonly StoredCourseWaypoint[] | undefined,
): CourseWaypointRow[] {
  if (!stored || stored.length === 0) return [];
  const visibleLanes = lanesForContext("course");
  return stored
    .filter(isRenderableWaypoint)
    .map((waypoint) => ({
      name: waypoint.name?.trim() || null,
      note: waypoint.note?.trim() ?? "",
      km: waypoint.distanceFromStartMeters / 1000,
      location: [waypoint.latitude, waypoint.longitude] as [number, number],
      lane: classifyLane({ name: waypoint.name ?? "", type: waypoint.type ?? "" }),
    }))
    .filter((row) => visibleLanes.includes(row.lane))
    .sort((a, b) => a.km - b.km);
}

/**
 * 레인별로 묶어 고도 프로필 아래 띠에 놓을 위치(0~1)를 계산한다.
 * 내용이 있는 레인만 돌려주므로, 편의점만 있는 개인 코스는 레인 하나만 그려진다.
 */
export function buildCourseWaypointLaneGroups(
  rows: readonly CourseWaypointRow[],
  totalDistanceM: number,
): CourseWaypointLaneGroup[] {
  const totalKm = totalDistanceM / 1000;
  return lanesForContext("course")
    .map((lane) => ({
      lane,
      items: rows
        .map((row, index) => ({ ...row, index }))
        .filter((row) => row.lane === lane)
        .map((row) => ({
          ...row,
          ratio: totalKm > 0 ? Math.min(1, Math.max(0, row.km / totalKm)) : 0,
        })),
    }))
    .filter((group) => group.items.length > 0);
}
