import { httpsCallable } from "firebase/functions";
import { SEGMENT_GAP_LIMITS as L, SEGMENT_GAP_POLICY, type SegmentGapRequest, type SegmentGapResponse } from "@shared/segment-distance-time-gap";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(v);
const exact = (v: unknown, keys: string[]): boolean => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const dense = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max && Array.from({ length: v.length }, (_, i) => Object.prototype.hasOwnProperty.call(v, i)).every(Boolean);
const time = (v: SegmentGapResponse["readTime"]) => exact(v, ["seconds", "nanoseconds"]) && Number.isSafeInteger(v.seconds) && v.seconds >= 0 && Number.isInteger(v.nanoseconds) && v.nanoseconds >= 0 && v.nanoseconds < 1e9;
export function segmentGapAvailable(): boolean {
  const c = getRuntimeConfig(); return c.appEnvironment === "stage" && c.firebaseFunctionsBase === "https://asia-northeast3-orider-dev.cloudfunctions.net";
}
export function validSegmentGapRequest(r: SegmentGapRequest): boolean {
  return !!r && r.mode === "segment_distance_time_gap" && r.version === 1 && id(r.segmentId)
    && Object.keys(r).every(k => ["mode", "version", "segmentId", "efforts", "expectedPairRevision"].includes(k))
    && dense(r.efforts, 2) && r.efforts.length === 2 && r.efforts.every(e => exact(e, ["activityId", "effortId"]) && id(e.activityId) && id(e.effortId))
    && r.efforts[0].activityId !== r.efforts[1].activityId && r.efforts[0].effortId !== r.efforts[1].effortId
    && (r.expectedPairRevision === undefined || digest(r.expectedPairRevision));
}
export function validateSegmentGapResponse(value: unknown, request: SegmentGapRequest): SegmentGapResponse {
  const bad = (): never => { throw new Error("invalid_segment_gap_response"); };
  if (!validSegmentGapRequest(request) || !exact(value, ["mode", "version", "segmentId", "efforts", "pairRevision", "state", "reason", "comparison", "readTime", "verifiedTime", "io"])) bad();
  const r = value as SegmentGapResponse;
  if (r.mode !== request.mode || r.version !== 1 || r.segmentId !== request.segmentId || JSON.stringify(r.efforts) !== JSON.stringify(request.efforts)
    || !["available", "unavailable", "changed_input"].includes(r.state) || r.pairRevision !== null && !digest(r.pairRevision)
    || !time(r.readTime) || !time(r.verifiedTime) || r.verifiedTime.seconds < r.readTime.seconds || r.verifiedTime.seconds === r.readTime.seconds && r.verifiedTime.nanoseconds < r.readTime.nanoseconds
    || !exact(r.io, ["documents", "metadata", "payloads"]) || !Number.isSafeInteger(r.io.documents) || r.io.documents < 1 || r.io.documents > L.documents
    || !Number.isSafeInteger(r.io.metadata) || r.io.metadata < 0 || r.io.metadata > L.metadata || !Number.isSafeInteger(r.io.payloads) || r.io.payloads < 0 || r.io.payloads > L.payloads) bad();
  if (r.state !== "available") {
    if (r.comparison !== null || !["missing_cache", "missing_geometry", "unknown_clock", "ambiguous_index_axis", "invalid_input", "input_limit", "geometry_not_forward", "no_common_observation", "changed_input"].includes(r.reason as string)
      || (r.state === "changed_input") !== (r.reason === "changed_input")) bad();
  } else {
    const c = r.comparison;
    if (!c) return bad();
    if (!exact(c, ["policy", "direction", "historicalGeometryAttested", "originalClockVerified", "quality", "basis", "presentation", "geometryRevision", "sources", "fromDistanceM", "toDistanceM", "geometryLengthM", "fullCurrentGeometry", "points", "events"])
      || !digest(r.pairRevision) || request.expectedPairRevision !== undefined && request.expectedPairRevision !== r.pairRevision || r.reason !== null
      || c.policy !== SEGMENT_GAP_POLICY || c.direction !== "current_stored_geometry_revalidated" || c.historicalGeometryAttested !== false || c.originalClockVerified !== false || c.quality !== "unknown"
      || c.basis !== "common_observed_first_arrival" || c.presentation !== "sample_bracket_interpolation" || !digest(c.geometryRevision)
      || !nonnegative(c.fromDistanceM) || !finite(c.toDistanceM) || c.toDistanceM <= c.fromDistanceM || !finite(c.geometryLengthM) || c.geometryLengthM < c.toDistanceM
      || typeof c.fullCurrentGeometry !== "boolean" || c.fullCurrentGeometry && (c.fromDistanceM > 1e-6 || c.geometryLengthM - c.toDistanceM > 1e-6)
      || !dense(c.sources, 2) || c.sources.length !== 2 || !dense(c.points, L.combinedPoints) || c.points.length < 2 || !dense(c.events, L.events)) bad();
    for (let i = 0; i < 2; i++) {
      const s = c.sources[i]!;
      if (!exact(s, ["activityId", "effortId", "source", "activityStartMs", "storedElapsedSec", "observedElapsedSec", "clockBasis"])
        || s.activityId !== request.efforts[i]!.activityId || s.effortId !== request.efforts[i]!.effortId || !["orider", "strava"].includes(s.source)
        || !Number.isSafeInteger(s.activityStartMs) || s.activityStartMs < 0 || !Number.isFinite(new Date(s.activityStartMs).getTime())
        || !finite(s.storedElapsedSec) || s.storedElapsedSec <= 0 || s.observedElapsedSec !== s.storedElapsedSec
        || s.clockBasis !== (s.source === "orider" ? "stored_epoch_milliseconds" : "provider_explicit_activity_elapsed")) bad();
    }
    for (let i = 0; i < c.points.length; i++) {
      const p = c.points[i]!;
      if (!exact(p, ["distanceM", "gapSec", "elapsedSec", "departureSec", "marker"]) || !finite(p.distanceM) || p.distanceM < c.fromDistanceM || p.distanceM > c.toDistanceM
        || i > 0 && p.distanceM <= c.points[i - 1]!.distanceM || !dense(p.marker, 2) || p.marker.length !== 2 || !finite(p.marker[0]) || Math.abs(p.marker[0]) > 90 || !finite(p.marker[1]) || Math.abs(p.marker[1]) > 180
        || !dense(p.elapsedSec, 2) || p.elapsedSec.length !== 2 || !dense(p.departureSec, 2) || p.departureSec.length !== 2) bad();
      for (let k = 0; k < 2; k++) {
        const a = p.elapsedSec[k]!, d = p.departureSec[k]!;
        if (a !== null && (!nonnegative(a) || a > c.sources[k]!.observedElapsedSec) || d !== null && (!nonnegative(d) || a === null || d < a || d > c.sources[k]!.observedElapsedSec)) bad();
      }
      const [a, b] = p.elapsedSec;
      if (a === null || b === null ? p.gapSec !== null : !finite(p.gapSec) || Math.abs(p.gapSec - (a - b)) > Number.EPSILON * Math.max(1, a, b) * 16) bad();
    }
    if (c.points[0]!.distanceM !== c.fromDistanceM || c.points[c.points.length - 1]!.distanceM !== c.toDistanceM || c.points[0]!.elapsedSec.some(s => s !== 0)) bad();
    for (const e of c.events) if (!exact(e, ["distanceM", "source", "kind"]) || !finite(e.distanceM) || e.distanceM < c.fromDistanceM || e.distanceM > c.toDistanceM || ![0, 1].includes(e.source)
      || !["plateau", "unobserved_gap"].includes(e.kind) || !c.points.some(p => p.distanceM === e.distanceM)) bad();
  }
  if (new TextEncoder().encode(JSON.stringify(r)).byteLength > L.responseBytes) bad();
  return r;
}
export async function loadSegmentDistanceTimeGap(services: FirebaseServices, uid: string, request: SegmentGapRequest,
  activeScope: () => boolean = () => true): Promise<SegmentGapResponse> {
  const owner = () => activeScope() && !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!owner()) throw new Error("account_changed");
  if (!segmentGapAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("segment_gap_not_supported");
  if (!validSegmentGapRequest(request)) throw new Error("invalid_segment_gap_request");
  await services.ensureAppCheckReady(); if (!owner()) throw new Error("account_changed");
  const r = await httpsCallable<SegmentGapRequest, SegmentGapResponse>(services.functions, "getActivityStreams")(request);
  if (!owner()) throw new Error("account_changed");
  return validateSegmentGapResponse(r.data, request);
}
