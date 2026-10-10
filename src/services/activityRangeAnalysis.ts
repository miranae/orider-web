import { httpsCallable } from "firebase/functions";
import type { ActivityRangeAnalysisRequest, ActivityRangeAnalysisResponse } from "@shared/types/activity-range-analysis";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

export function validRangeRequest(request: ActivityRangeAnalysisRequest): boolean {
  return typeof request.activityId === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(request.activityId)
    && Number.isFinite(request.startOffsetSec) && request.startOffsetSec >= 0
    && Number.isFinite(request.endOffsetSec) && request.endOffsetSec > request.startOffsetSec && request.endOffsetSec <= 604800
    && (request.expectedInputRevision === undefined || /^[a-f0-9]{64}$/.test(request.expectedInputRevision));
}

/** 요청과 응답의 창·정본 revision이 다르면 과거 구간을 현재 결과로 표시하지 않는다. */
export function validateRangeResponse(response: ActivityRangeAnalysisResponse, request: ActivityRangeAnalysisRequest): ActivityRangeAnalysisResponse {
  if (!response || response.activityId !== request.activityId || response.algorithmVersion !== "activity-range-v1"
    || response.selection?.startOffsetSec !== request.startOffsetSec || response.selection?.endOffsetSec !== request.endOffsetSec
    || !["available", "pending", "unavailable", "changed_input"].includes(response.state)
    || (!Number.isFinite(response.computedAt) || response.computedAt < 0)
    || (response.inputRevision !== null && !/^[a-f0-9]{64}$/.test(response.inputRevision))) throw new Error("invalid_range_response");
  if (response.state !== "available") return { ...response, metrics: null };
  if (!response.inputRevision || request.expectedInputRevision && response.inputRevision !== request.expectedInputRevision) {
    throw new Error("input_changed");
  }
  const metrics = response.metrics;
  if (!metrics || metrics.averageBasis !== "measured_elapsed" || !Number.isFinite(metrics.elapsedSec)
    || Math.abs(metrics.elapsedSec - (request.endOffsetSec - request.startOffsetSec)) > 1e-6) throw new Error("invalid_range_response");
  if (!["complete", "partial", "unknown"].includes(response.inputCoverage)
    || !["raw_parts", "api_streams"].includes(response.sourceLayer ?? "")
    || !["measured", "virtual", null].includes(metrics.powerSource)
    || typeof metrics.isVirtualPower !== "boolean"
    || metrics.powerSource === "virtual" && !metrics.isVirtualPower
    || metrics.powerSource === "measured" && metrics.isVirtualPower
    || metrics.movingSec != null && metrics.movingSec > metrics.elapsedSec
    || metrics.pauseSec != null && metrics.pauseSec > metrics.elapsedSec) throw new Error("invalid_range_response");
  const values = [metrics.movingSec, metrics.pauseSec, metrics.distanceM, metrics.avgSpeedKph, metrics.paceSecPerKm,
    metrics.averagePowerW, metrics.normalizedPowerW, metrics.averageHr, metrics.maxHr, metrics.averageCadence];
  if (values.some(value => value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0))) throw new Error("invalid_range_response");
  for (const key of ["power", "heartrate", "cadence", "speed"] as const) {
    const channel = metrics.channels?.[key];
    if (!channel || !Number.isFinite(channel.measuredSec) || channel.measuredSec < 0 || channel.measuredSec > metrics.elapsedSec + 1e-6
      || !Number.isFinite(channel.fraction) || channel.fraction < 0 || channel.fraction > 1) throw new Error("invalid_range_response");
  }
  for (const zones of [metrics.hrZoneSec, metrics.powerZoneSec]) {
    if (zones !== null && (!Array.isArray(zones) || Array.from(zones).some(value => !Number.isFinite(value) || value < 0))) throw new Error("invalid_range_response");
  }
  const context = metrics.context;
  if (context?.lthr != null && (!Number.isFinite(context.lthr) || context.lthr < 50 || context.lthr > 250)) throw new Error("invalid_range_response");
  const boundaries = context?.hrZoneBoundaries;
  if (boundaries != null) {
    const reference = boundaries.reference === "lthr" ? context.lthr : context.maxHr;
    if (context.mode !== "recorded" || !["lthr", "max_hr"].includes(boundaries.reference)
      || !["bike", "run", "other"].includes(boundaries.sport)
      || !Number.isFinite(boundaries.referenceBpm) || boundaries.referenceBpm < 50 || boundaries.referenceBpm > 250
      || reference !== boundaries.referenceBpm || !Array.isArray(boundaries.zones) || boundaries.zones.length !== 5
      || boundaries.zones.some((zone, index) => !zone || zone.zone !== index + 1
        || !Number.isFinite(zone.minPct) || zone.minPct < 0
        || zone.maxPct !== null && (!Number.isFinite(zone.maxPct) || zone.maxPct <= zone.minPct)
        || !Number.isFinite(zone.minBpm) || zone.minBpm < 0
        || zone.maxBpmExclusive !== null && (!Number.isFinite(zone.maxBpmExclusive) || zone.maxBpmExclusive <= zone.minBpm))) throw new Error("invalid_range_response");
  }
  return response;
}

/** 소유자용 read-only callable. 결과 캐시와 클라이언트 지표 계산은 만들지 않는다. */
export async function loadActivityRangeAnalysis(services: FirebaseServices, uid: string, request: ActivityRangeAnalysisRequest): Promise<ActivityRangeAnalysisResponse> {
  const ownerMatches = () => !!uid && services.auth.currentUser?.uid === uid;
  if (!ownerMatches()) throw new Error("account_changed");
  if (!validRangeRequest(request)) throw new Error("invalid_range_selection");
  await services.ensureAppCheckReady();
  if (!ownerMatches()) throw new Error("account_changed");
  const result = await httpsCallable<ActivityRangeAnalysisRequest, ActivityRangeAnalysisResponse>(services.functions, "getActivityRangeAnalysis")(request);
  if (!ownerMatches()) throw new Error("account_changed");
  return validateRangeResponse(result.data, request);
}
