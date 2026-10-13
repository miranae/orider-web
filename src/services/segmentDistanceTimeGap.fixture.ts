import { compareStoredSegmentWindows, type StoredSegmentWindow } from "@shared/segment-distance-time-gap-kernel";
import type { SegmentGapRequest, SegmentGapResponse } from "@shared/segment-distance-time-gap";
export const syntheticRequest: SegmentGapRequest = { mode: "segment_distance_time_gap", version: 1, segmentId: "s", efforts: [{ activityId: "a", effortId: "ea" }, { activityId: "b", effortId: "eb" }] };
/** DERIVED_SYNTHETIC: exact pure kernel output, not owner/cache availability proof. */
export function syntheticResponse(): SegmentGapResponse {
  const inputs = syntheticRequest.efforts.map((ref, k): StoredSegmentWindow => ({ coordinates: Array.from({ length: 11 }, (_, i) => [0, i * .0005]),
    distanceM: Array.from({ length: 11 }, (_, i) => i * 55.6), elapsedSec: Array.from({ length: 11 }, (_, i) => i * (k ? 5 : 6)),
    source: { ...ref, source: "orider", activityStartMs: 1700000000000, storedElapsedSec: k ? 50 : 60, observedElapsedSec: k ? 50 : 60, clockBasis: "stored_epoch_milliseconds" } }));
  return { ...syntheticRequest, state: "available", reason: null, pairRevision: "a".repeat(64), comparison: compareStoredSegmentWindows([[0, 0], [0, .005]], inputs as [StoredSegmentWindow, StoredSegmentWindow], "b".repeat(64)),
    readTime: { seconds: 1700100100, nanoseconds: 123 }, verifiedTime: { seconds: 1700100101, nanoseconds: 0 }, io: { documents: 32, metadata: 0, payloads: 2 } };
}
