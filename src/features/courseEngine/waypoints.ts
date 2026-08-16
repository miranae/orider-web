/**
 * 코스엔진 — 경유지 도메인.
 *
 * "경유지" 라는 한 단어가 서로 다른 두 엔티티를 가리키고 있어 여기서 분리한다.
 *
 * - `RoutePoint` (경로점) — 지도에서 찍는 라우팅 제어점. 경로 형상을 정하는 입력이고 저장되지
 *   않는다. 상한이 낮다(`MAX_ROUTE_POINTS`).
 * - `CourseWaypoint` (코스 웨이포인트) — 코스에 저장되는 관심 지점(보급소·정상·컷오프). 이름과
 *   유형, 시작점 기준 거리를 갖는다. 서버 `StoredCourseWaypoint` 와 대응하며 상한이 높다.
 *
 * 둘을 같은 목록에 섞으면 저장 시 무엇이 코스 웨이포인트로 들어가야 하는지가 무너진다.
 */

import { nearestPointIndex, type LatLonPoint } from "./geo";
import {
  classifyLane,
  lanesForContext,
  type ClassifiableWaypoint,
  type LaneContext,
  type WpLane,
} from "./waypointLanes";
import type { TrackPoint } from "./stats";

/** 라우팅 제어점 상한. 라우팅 제공자 계약과 동일하게 유지할 것. */
export const MAX_ROUTE_POINTS = 25;

/** 코스에 저장되는 웨이포인트 상한. 서버 `MAX_COURSE_WAYPOINTS` 와 동일하게 유지할 것. */
export const MAX_COURSE_WAYPOINTS = 100;

/** 경로점이 경로에서 갖는 역할. 목록에서 배지로 표시한다. */
export type RoutePointRole = "start" | "via" | "finish";

export interface RoutePoint extends LatLonPoint {
  /** 도로망에 스냅된 실제 위치. 라우팅 결과가 돌아오기 전에는 없다. */
  snapped?: LatLonPoint;
}

export interface CourseWaypoint extends LatLonPoint {
  name: string;
  /** GPX `<type>` 등 원본 유형 문자열. 비어 있을 수 있다. */
  type: string;
  ele: number;
}

/** 찍은 곳에서 이 거리 이상 스냅되면 사용자에게 알린다(m). */
export const SNAP_HINT_THRESHOLD_M = 50;

export function routePointRole(index: number, total: number): RoutePointRole {
  if (index === 0) return "start";
  if (index === total - 1 && total > 1) return "finish";
  return "via";
}

/** 스냅으로 이동한 거리(m). 스냅 정보가 없으면 null. */
export function snapOffsetMeters(point: RoutePoint): number | null {
  if (!point.snapped) return null;
  const { index, distanceM } = nearestPointIndex([point.snapped], point);
  return index < 0 ? null : distanceM;
}

export interface ResolvedWaypoint<T> {
  waypoint: T;
  /** 트랙 상 최근접 점의 인덱스. */
  trackIndex: number;
  /** 시작점 기준 누적 거리(m). */
  distanceFromStartM: number;
  /** 트랙에서 얼마나 떨어져 있는지(m). 크면 이 경유지가 코스에서 벗어나 있다는 뜻. */
  offTrackM: number;
}

/**
 * 경유지들을 트랙에 투영해 시작점 기준 거리를 구한다.
 *
 * `ordered` 가 true 면 경유지가 경로 순서를 따른다고 보고 탐색 시작 인덱스를 전진시킨다.
 * 왕복·순환 코스에서 되돌아오는 구간의 좌표가 거의 같아 전역 최근접 탐색이 인덱스를 역전시키는
 * 문제를 막는다. 순서를 신뢰할 수 없는 입력(GPX 파일의 `<wpt>` 는 파일 내 순서가 코스 순서와
 * 무관할 수 있다)에서는 false 로 두고 결과를 거리순으로 정렬한다.
 */
export function resolveWaypointsOnTrack<T extends LatLonPoint>(
  waypoints: readonly T[],
  track: readonly TrackPoint[],
  cumulativeDistanceM: readonly number[],
  { ordered = false }: { ordered?: boolean } = {},
): ResolvedWaypoint<T>[] {
  if (track.length === 0) return [];

  let searchFrom = 0;
  const resolved = waypoints.map((waypoint) => {
    const { index, distanceM } = nearestPointIndex(track, waypoint, ordered ? searchFrom : 0);
    const trackIndex = index < 0 ? 0 : index;
    if (ordered) searchFrom = trackIndex;
    return {
      waypoint,
      trackIndex,
      distanceFromStartM: cumulativeDistanceM[trackIndex] ?? 0,
      offTrackM: Number.isFinite(distanceM) ? distanceM : 0,
    };
  });

  return ordered ? resolved : [...resolved].sort((a, b) => a.distanceFromStartM - b.distanceFromStartM);
}

/**
 * 표시용으로 정리된 경유지 — 역할과 분류를 **함께** 갖는다.
 *
 * 이 둘을 화면마다 따로 다루면 안 된다. 개인 코스에도 편의점·카페 같은 보급지가 있어서,
 * 한 코스 안에 "출발점(역할)"과 "보급지(분류)"가 동시에 존재한다. 역할만 가진 목록과 분류만
 * 가진 목록으로 나누면 그 둘을 한 타임라인에 그릴 수 없다.
 *
 * - `role` 은 항상 있다. 경로 상 위치로 결정된다.
 * - `lane` 은 이름·유형으로 판정할 수 있을 때만 붙는다. 라우팅 제어점처럼 분류할 근거가 없으면 null.
 */
export interface DescribedWaypoint<T> extends ResolvedWaypoint<T> {
  role: RoutePointRole;
  lane: WpLane | null;
}

/**
 * 투영된 경유지에 역할과 분류를 붙인다.
 * 이름·유형을 가진 경유지(GPX `<wpt>`, 코스 웨이포인트)에는 레인이 붙고, 좌표뿐인 라우팅
 * 제어점에는 붙지 않는다.
 */
export function describeWaypoints<T extends LatLonPoint>(
  resolved: readonly ResolvedWaypoint<T>[],
): DescribedWaypoint<T>[] {
  return resolved.map((item, index) => {
    const candidate = item.waypoint as Partial<ClassifiableWaypoint>;
    const classifiable = typeof candidate.name === "string" || typeof candidate.type === "string";
    return {
      ...item,
      role: routePointRole(index, resolved.length),
      lane: classifiable
        ? classifyLane({ name: candidate.name ?? "", type: candidate.type ?? "" })
        : null,
    };
  });
}

/**
 * 레인 타임라인에 그릴 레인 목록. 이 문맥에서 노출 대상이고 실제로 내용이 있는 레인만 돌려준다.
 * 보급지만 있는 개인 코스는 레인 하나만 나오고, 빈 레인은 그리지 않는다.
 */
export function activeLanes(
  described: readonly DescribedWaypoint<unknown>[],
  context: LaneContext = "course",
): WpLane[] {
  const present = new Set(described.map((item) => item.lane).filter((lane): lane is WpLane => lane !== null));
  return lanesForContext(context).filter((lane) => present.has(lane));
}

export interface RouteLeg {
  /** 구간의 시작 경유지 인덱스(0-based). 구간 i 는 경유지 i → i+1. */
  fromIndex: number;
  toIndex: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
}

/**
 * 경유지 사이 구간의 거리·획득고도. 경유지가 트랙 순서대로 정렬되어 있다고 가정한다
 * (`resolveWaypointsOnTrack` 의 결과를 그대로 넘기면 된다).
 */
export function buildRouteLegs(
  resolved: readonly ResolvedWaypoint<unknown>[],
  track: readonly TrackPoint[],
  cumulativeDistanceM: readonly number[],
): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let index = 1; index < resolved.length; index += 1) {
    const from = resolved[index - 1]!;
    const to = resolved[index]!;
    let elevationGainM = 0;
    let elevationLossM = 0;
    for (let point = from.trackIndex + 1; point <= to.trackIndex; point += 1) {
      const delta = (track[point]?.ele ?? 0) - (track[point - 1]?.ele ?? 0);
      if (delta > 0) elevationGainM += delta;
      else elevationLossM += Math.abs(delta);
    }
    legs.push({
      fromIndex: index - 1,
      toIndex: index,
      distanceM: Math.max(0, (cumulativeDistanceM[to.trackIndex] ?? 0) - (cumulativeDistanceM[from.trackIndex] ?? 0)),
      elevationGainM: Math.round(elevationGainM),
      elevationLossM: Math.round(elevationLossM),
    });
  }
  return legs;
}
