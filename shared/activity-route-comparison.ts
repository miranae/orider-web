/** GPS 좌표와 시간은 동일 원본에서 짝지어야 한다. 활동 시작과 첫 GPS 시각을 혼동하지 않는다. */
export interface ActivityRouteEvidence {
  activityId: string;
  routeInputRevision: string;
  routeFingerprint: string;
  sourceLayer: "raw_parts" | "api_streams";
  sourceSchemaVersion: string;
  accuracy: "unknown";
  timingBasis: "elapsed";
  timeOrigin: "activity_start" | "relative_to_first_gps_observation";
  originEpochMs: number | null;
  coverage: "complete" | "partial" | "unknown";
  points: readonly ObservedRoutePoint[];
}
export interface ObservedRoutePoint { lat: number; lon: number; elapsedSec: number }

/** reader의 실패와 순수 경로 비교의 실패는 별개이며, 기존 streams revision을 대체하지 않는다. */
export type ActivityRouteEvidenceResponse = {
  mode: "route_evidence";
  activityId: string;
  routeInputRevision: string | null;
} & ({
  state: "available";
  reason: null;
  sourceLayer: "raw_parts" | "api_streams";
  route: ActivityRouteEvidence;
} | {
  state: "unavailable" | "pending" | "changed_input";
  reason: "missing_gps" | "unknown_axis" | "invalid_input" | "input_limit" | "incomplete_input" | "changed_input";
  sourceLayer: "raw_parts" | "api_streams" | null;
  route: null;
});
export type RouteComparisonAttribution = Omit<ActivityRouteEvidence, "points">;
export interface ObservedRouteDiagnostics {
  inputPointCount: number;
  observedLengthM: number;
  observedElapsedSec: number;
  elapsedSpanSec: number;
  observedStartElapsedSec: number;
  observedEndElapsedSec: number;
  gapCount: number;
  omittedGapElapsedSec: number;
  coverage: ActivityRouteEvidence["coverage"];
}
export interface ObservedRouteDirectionComparison {
  meanSeparationM: number;
  p95SeparationM: number;
  startSeparationM: number;
  endSeparationM: number;
}
/** 표본 기반 형태 안내다. 평행 도로와 짧은 우회는 구별하지 못할 수 있으며, 순환 경로 시작점은 회전 정렬하지 않는다. */
export type ObservedRouteComparison = {
  algorithmVersion: "observed-route-comparison-v1";
  scope: "observed_gps";
} & ({
  state: "available" | "insufficient";
  reason: "insufficient_observed_length" | null;
  sources: [RouteComparisonAttribution, RouteComparisonAttribution];
  diagnostics: [ObservedRouteDiagnostics, ObservedRouteDiagnostics];
  lengthRatio: number;
  sampleCount: number;
  forward: ObservedRouteDirectionComparison | null;
  reverse: ObservedRouteDirectionComparison | null;
  direction: "forward" | "reverse" | "undetermined";
  shapeGuidance: "observed_shapes_close" | "observed_shapes_differ" | "insufficient";
  /** 공백 또는 부분/알 수 없는 수집 범위가 있으면 전체 경로 해석을 할 수 없다. */
  limitations: ("sample_based" | "gaps" | "coverage_not_complete" | "no_loop_rotation")[];
} | {
  state: "unavailable";
  reason: "invalid_input" | "input_limit";
});
