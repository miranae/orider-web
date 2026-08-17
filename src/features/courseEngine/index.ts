/**
 * 코스엔진 — 코스와 이벤트가 공유하는 경로 도메인 로직.
 *
 * 코스 생성 화면, 코스 상세, 이벤트 상세가 각자 복제하던 로직(하버사인 거리, GPX 파싱, 트랙
 * 통계, 고도 프로필 축약, 경유지 투영, 웨이포인트 분류)을 여기 한 곳에 모은다. 순수 함수만
 * 두고 표현 계층은 담지 않는다 — 이벤트 상세는 읽기 전용이고 코스 생성은 편집 가능해서 상호작용
 * 계약이 다르므로, 화면 컴포넌트는 각자 유지하되 같은 로직 위에서 동작하게 한다.
 */

export {
  haversineMeters,
  cumulativeDistances,
  cumulativeDistancesFromLatLng,
  nearestPointIndex,
  type LatLonPoint,
  type NearestPointResult,
} from "./geo";

export {
  computeTrackStats,
  computeStatsFromStreams,
  computeStatsFromTrack,
  classifyElevationQuality,
  EMPTY_TRACK_STATS,
  FLAT_ELEVATION_THRESHOLD_M,
  type TrackPoint,
  type TrackStats,
  type ElevationQuality,
} from "./stats";

export {
  buildElevationProfile,
  profileIndexForSourceIndex,
  toElevationChartData,
  PROFILE_TARGET_POINTS,
  type ProfileSample,
} from "./profile";

export {
  parseGpx,
  parseGpxName,
  fillMissingElevations,
  type ParsedGpx,
  type GpxWaypoint,
} from "./gpx";

export {
  resolveWaypointsOnTrack,
  describeWaypoints,
  activeLanes,
  buildRouteLegs,
  routePointRole,
  snapOffsetMeters,
  MAX_ROUTE_POINTS,
  MAX_COURSE_WAYPOINTS,
  SNAP_HINT_THRESHOLD_M,
  type RoutePoint,
  type RoutePointRole,
  type CourseWaypoint,
  type ResolvedWaypoint,
  type DescribedWaypoint,
  type RouteLeg,
} from "./waypoints";

export {
  classifyLane,
  isProfileMarkerLane,
  isLaneVisibleIn,
  lanesForContext,
  laneLabelKey,
  readLaneColor,
  LANE_DEFS,
  LANE_ORDER,
  type WpLane,
  type LaneContext,
  type ClassifiableWaypoint,
} from "./waypointLanes";
