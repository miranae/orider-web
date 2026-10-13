import { httpsCallable } from "firebase/functions";
import type { MySegmentHistoryRequest, MySegmentHistoryResponse, SegmentHistoryAttempt } from "@shared/types/segment-history";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(v);
const numeric = (v: unknown) => v === null || typeof v === "number" && Number.isFinite(v) && v >= 0;
export function validSegmentHistoryRequest(r: MySegmentHistoryRequest): boolean {
  return id(r.segmentId) && id(r.currentActivityId) && id(r.currentEffortId) &&
    (r.pageSize === undefined || Number.isInteger(r.pageSize) && r.pageSize >= 1 && r.pageSize <= 50) &&
    (r.cursor === undefined || typeof r.cursor === "string" && r.cursor.length <= 1600) &&
    (r.expectedInputRevision === undefined || /^[a-f0-9]{64}$/u.test(r.expectedInputRevision));
}
function validAttempt(row: SegmentHistoryAttempt, segmentId: string): boolean {
  return !!row && id(row.effortId) && id(row.activityId) && row.segmentId === segmentId && typeof row.elapsedMs === "number" && Number.isFinite(row.elapsedMs) && row.elapsedMs > 0 &&
    [row.startDateMs, row.averageSpeedKph, row.averageHeartrate, row.averageWatts, row.averageCadence].every(numeric) && row.direction === "unknown" && row.geometryRevision === null && [true, false, null].includes(row.isVirtualPower) &&
    (row.source === null || typeof row.source === "string" && row.source.length <= 40) && (row.matchAlgorithmVersion === null || typeof row.matchAlgorithmVersion === "string" && row.matchAlgorithmVersion.length <= 100);
}
export function validateSegmentHistoryResponse(r: MySegmentHistoryResponse, request: MySegmentHistoryRequest): MySegmentHistoryResponse {
  if (!r || r.segmentId !== request.segmentId || r.currentActivityId !== request.currentActivityId || r.currentEffortId !== request.currentEffortId ||
      !["available", "changed_input"].includes(r.state) || !/^[a-f0-9]{64}$/u.test(r.inputRevision) || r.alignment !== "geometry_and_direction_unknown" ||
      !Array.isArray(r.attempts) || r.attempts.length > (request.pageSize ?? 50) || !r.coverage ||
      !Number.isInteger(r.coverage.scannedCount) || r.coverage.scannedCount < 0 || r.coverage.scannedCount > (request.pageSize ?? 50) ||
      typeof r.coverage.complete !== "boolean" || typeof r.coverage.hasMore !== "boolean" || r.coverage.scannedCount < r.attempts.length ||
      r.coverage.complete && (r.coverage.hasMore || r.coverage.scannedCount !== r.attempts.length) ||
      !["complete", "bounded_page", "continuation_page", "invalid_source", "changed_input"].includes(r.coverage.reason) || r.coverage.verifiedCount !== r.attempts.length || r.attempts.some(row => !validAttempt(row, request.segmentId)) ||
      new Set(r.attempts.map(row => row.effortId)).size !== r.attempts.length ||
      (r.nextCursor !== null && (typeof r.nextCursor !== "string" || !r.nextCursor || r.nextCursor.length > 1600)) ||
      r.coverage.hasMore !== (r.nextCursor !== null) || !r.records || !Array.isArray(r.records.topThree) || r.records.topThree.length > 3 ||
      !["authoritative_snapshot", "unavailable"].includes(r.records.state) || r.records.totalBasis !== "persisted_snapshot" || !numeric(r.records.authorityUpdatedAtMs) ||
      (r.records.rawTotalEfforts !== null && (!Number.isSafeInteger(r.records.rawTotalEfforts) || r.records.rawTotalEfforts < 0)) ||
      r.records.state === "unavailable" && r.records.topThree.length > 0 ||
      r.records.state === "authoritative_snapshot" && (r.records.topThree.length < 1 || new Set(r.records.topThree.map(row => row.effortId)).size !== r.records.topThree.length ||
        r.records.topThree.some((row, index) => index > 0 && r.records.topThree[index - 1]!.elapsedMs > row.elapsedMs)) || r.records.topThree.some(row => !validAttempt(row, request.segmentId))) throw new Error("invalid_segment_history_response");
  if (r.state === "changed_input") {
    if (r.currentAttempt !== null || r.attempts.length || r.records.topThree.length || r.comparison !== null) throw new Error("invalid_segment_history_response");
    return r;
  }
  if (request.expectedInputRevision && r.inputRevision !== request.expectedInputRevision || !r.currentAttempt ||
      !validAttempt(r.currentAttempt, request.segmentId) || r.currentAttempt.effortId !== request.currentEffortId || r.currentAttempt.activityId !== request.currentActivityId ||
      request.cursor && r.coverage.complete || r.comparison && (!r.coverage.complete || r.comparison.referenceEffortId !== request.currentEffortId ||
        r.comparison.basis !== "activity_deduplicated_current_vs_prior_best" || !Number.isInteger(r.comparison.analyzedAttempts) || r.comparison.analyzedAttempts < 1 ||
        r.comparison.analyzedAttempts > r.coverage.scannedCount || !Number.isInteger(r.comparison.attemptNo) || r.comparison.attemptNo < 1 || r.comparison.attemptNo > r.comparison.analyzedAttempts ||
        typeof r.comparison.isPR !== "boolean" || !["improving", "stable", "declining", null].includes(r.comparison.currentVsPriorBest) || !numeric(r.comparison.previousBestSec) || (r.comparison.deltaVsPreviousBestSec !== null && !Number.isFinite(r.comparison.deltaVsPreviousBestSec)))) throw new Error("invalid_segment_history_response");
  return r;
}
export async function loadMySegmentHistory(services: FirebaseServices, uid: string, request: MySegmentHistoryRequest): Promise<MySegmentHistoryResponse> {
  const owner = () => !!uid && services.auth.currentUser?.uid === uid;
  if (!owner()) throw new Error("account_changed");
  if (!validSegmentHistoryRequest(request)) throw new Error("invalid_segment_history_request");
  await services.ensureAppCheckReady();
  if (!owner()) throw new Error("account_changed");
  const result = await httpsCallable<MySegmentHistoryRequest, MySegmentHistoryResponse>(services.functions, "getMySegmentHistory")(request);
  if (!owner()) throw new Error("account_changed");
  return validateSegmentHistoryResponse(result.data, request);
}
