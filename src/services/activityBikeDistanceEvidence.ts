import { httpsCallable } from "firebase/functions";
import { BIKE_DISTANCE_TARGETS, BIKE_DISTANCE_M } from "@shared/activity-bike-distance-evidence";
import type { ActivityBikeDistanceEvidenceResponse } from "@shared/activity-bike-distance-evidence";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
const near = (a: number, b: number) => finite(a) && finite(b) && Math.abs(a - b) <= Number.EPSILON * Math.max(1, a, b) * 32;
const exact = (value: unknown, keys: string[]) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
export function manualBikeDistanceAvailable() {
  const config = getRuntimeConfig();
  return config.appEnvironment === "stage" && config.firebaseFunctionsBase === "https://asia-northeast3-orider-dev.cloudfunctions.net";
}
/** 원본 배열을 받지 않고 정본 앵커의 출처·경계·표시 값만 검사한다. */
export function validateActivityBikeDistanceEvidence(value: unknown, activityId: string, expectedRevision?: string, activityStartMs?: number): ActivityBikeDistanceEvidenceResponse {
  const invalid = (): never => { throw new Error("invalid_bike_distance_evidence"); };
  if (!exact(value, ["mode", "activityId", "distanceInputRevision", "state", "reason", "sourceLayer", "evidence"])) invalid();
  const r = value as ActivityBikeDistanceEvidenceResponse;
  if (r.mode !== "bike_distance_evidence" || r.activityId !== activityId || r.distanceInputRevision !== null && !digest(r.distanceInputRevision) || ![null, "raw_parts", "api_streams"].includes(r.sourceLayer)) invalid();
  if (r.state !== "available") {
    if (r.evidence !== null || !["pending", "changed_input", "unavailable"].includes(r.state)
      || (r.state === "pending" ? r.reason !== "incomplete_input" : r.state === "changed_input" ? r.reason !== "changed_input" : !["missing_distance", "unknown_axis", "invalid_input", "input_limit", "incomplete_input"].includes(r.reason))) invalid();
  } else {
    const e = r.evidence;
    if (!exact(e, ["activityId", "distanceInputRevision", "sourceLayer", "sourceSchemaVersion", "sourceTimingBasis", "originEpochMs", "durationSec", "coverage", "quality", "scope", "targetsVersion", "inputPointCount", "observedStartOffsetSec", "observedEndOffsetSec", "facts"])
      || r.reason !== null || !digest(r.distanceInputRevision) || e.activityId !== activityId || e.distanceInputRevision !== r.distanceInputRevision || expectedRevision !== undefined && e.distanceInputRevision !== expectedRevision
      || e.sourceLayer !== r.sourceLayer || !["raw_parts", "api_streams"].includes(e.sourceLayer) || typeof e.sourceSchemaVersion !== "string" || !e.sourceSchemaVersion.trim() || e.sourceSchemaVersion.length > 256
      || e.sourceTimingBasis !== "original_activity_elapsed" || !finite(e.originEpochMs) || !Number.isFinite(new Date(e.originEpochMs).getTime()) || activityStartMs !== undefined && e.originEpochMs !== activityStartMs
      || !finite(e.durationSec) || e.durationSec <= 0 || e.coverage !== "unknown" || e.quality !== "unknown" || e.scope !== "single_observed_activity" || e.targetsVersion !== 1
      || !integer(e.inputPointCount) || e.inputPointCount < 2 || e.inputPointCount > 100000 || !finite(e.observedStartOffsetSec) || !finite(e.observedEndOffsetSec) || e.observedEndOffsetSec <= e.observedStartOffsetSec || e.observedEndOffsetSec > e.durationSec || !Array.isArray(e.facts) || e.facts.length > 13) invalid();
    let previous = -1;
    for (let index = 0; index < e.facts.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(e.facts, index)) invalid();
      const f = e.facts[index]!;
      if (!exact(f, ["distance", "distanceM", "elapsedSec", "exactElapsedSec", "startIndex", "endBeforeIndex", "endIndex", "endFraction", "startTimeSec", "endTimeSec", "startOffsetSec", "endOffsetSec"])) invalid();
      const order = BIKE_DISTANCE_TARGETS.indexOf(f.distance);
      if (order <= previous || f.distanceM !== BIKE_DISTANCE_M[f.distance] || !integer(f.elapsedSec) || f.elapsedSec <= 0 || !finite(f.exactElapsedSec) || f.exactElapsedSec <= 0 || f.elapsedSec !== Math.round(f.exactElapsedSec)
        || ![f.startIndex, f.endBeforeIndex, f.endIndex].every(integer) || f.startIndex > f.endBeforeIndex || f.endIndex !== f.endBeforeIndex + 1 || f.endIndex >= e.inputPointCount
        || !finite(f.endFraction) || f.endFraction > 1 || f.endBeforeIndex === f.startIndex && f.endFraction === 0 || ![f.startTimeSec, f.endTimeSec, f.startOffsetSec, f.endOffsetSec].every(finite)
        || f.startOffsetSec !== f.startTimeSec || f.endOffsetSec !== f.endTimeSec || f.startTimeSec < e.observedStartOffsetSec || f.endTimeSec > e.observedEndOffsetSec && !near(f.endTimeSec, e.observedEndOffsetSec) || f.endTimeSec <= f.startTimeSec
        || !near(f.exactElapsedSec, f.endTimeSec - f.startTimeSec) || (f.startIndex === 0 ? f.startTimeSec !== e.observedStartOffsetSec : f.startTimeSec <= e.observedStartOffsetSec)
        || f.endIndex < e.inputPointCount - 1 && f.endTimeSec >= e.observedEndOffsetSec || f.endIndex === e.inputPointCount - 1 && f.endFraction === 1 && !near(f.endTimeSec, e.observedEndOffsetSec)) invalid();
      previous = order;
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024) invalid();
  return r;
}
export async function loadActivityBikeDistanceEvidence(services: FirebaseServices, uid: string, activityId: string, expectedDistanceInputRevision?: string, activityStartMs?: number) {
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (!manualBikeDistanceAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("bike_distance_not_supported");
  if (!activityId || activityId.includes("/") || new TextEncoder().encode(activityId).length > 1500 || expectedDistanceInputRevision !== undefined && !digest(expectedDistanceInputRevision)) throw new Error("invalid_bike_distance_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const response = await httpsCallable(services.functions, "getActivityStreams")({ activityId, mode: "bike_distance_evidence", ...(expectedDistanceInputRevision ? { expectedDistanceInputRevision } : {}) });
  if (!matches()) throw new Error("account_changed");
  return validateActivityBikeDistanceEvidence(response.data, activityId, expectedDistanceInputRevision, activityStartMs);
}
