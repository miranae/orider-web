/** 저장된 두 시도의 현재 경로 비교. 역사적 경로/실제 시계 정확성을 인증하지 않는다. */
export const SEGMENT_GAP_POLICY = "stored-window-forward-v1" as const;
export const SEGMENT_GAP_LIMITS = { inputBytes: 2 * 1024 * 1024, samples: 100_000, windowSamples: 20_000,
  geometryPoints: 4096, projectionChecks: 2_000_000, plotPoints: 512, events: 512, combinedPoints: 1024,
  responseBytes: 256 * 1024, documents: 40, metadata: 4, payloads: 2 } as const;
export interface SegmentGapRef { activityId: string; effortId: string }
export interface SegmentGapRequest { mode: "segment_distance_time_gap"; version: 1; segmentId: string;
  efforts: [SegmentGapRef, SegmentGapRef]; expectedPairRevision?: string }
export type SegmentGapReason = "missing_cache" | "missing_geometry" | "unknown_clock" | "ambiguous_index_axis"
  | "invalid_input" | "input_limit" | "geometry_not_forward" | "no_common_observation" | "changed_input";
export interface SegmentGapSource extends SegmentGapRef { source: "orider" | "strava"; activityStartMs: number;
  storedElapsedSec: number; observedElapsedSec: number; clockBasis: "stored_epoch_milliseconds" | "provider_explicit_activity_elapsed" }
export interface SegmentGapPoint { distanceM: number; gapSec: number | null; elapsedSec: [number | null, number | null];
  departureSec: [number | null, number | null]; marker: [number, number]; }
export interface SegmentGapComparison { policy: typeof SEGMENT_GAP_POLICY; direction: "current_stored_geometry_revalidated";
  historicalGeometryAttested: false; originalClockVerified: false; quality: "unknown";
  basis: "common_observed_first_arrival"; presentation: "sample_bracket_interpolation";
  geometryRevision: string; sources: [SegmentGapSource, SegmentGapSource];
  fromDistanceM: number; toDistanceM: number; geometryLengthM: number; fullCurrentGeometry: boolean;
  points: SegmentGapPoint[]; events: { distanceM: number; source: 0 | 1; kind: "plateau" | "unobserved_gap" }[] }
export interface SegmentGapResponse { mode: SegmentGapRequest["mode"]; version: 1; segmentId: string;
  efforts: [SegmentGapRef, SegmentGapRef]; pairRevision: string | null;
  state: "available" | "unavailable" | "changed_input"; reason: SegmentGapReason | null;
  comparison: SegmentGapComparison | null;
  readTime: { seconds: number; nanoseconds: number }; verifiedTime: { seconds: number; nanoseconds: number };
  io: { documents: number; metadata: number; payloads: number } }
