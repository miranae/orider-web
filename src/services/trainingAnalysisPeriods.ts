import type { StageDerivedRunDistancePeriod } from "@shared/types/stage-run-distance-snapshot";
import { validRunEffortStageOverlay } from "./runEffortStagePreferences";
import { normalizeCyclingDistanceAnalysis } from "../utils/cyclingDistancePeriods";
import { validCyclingClimbObservations } from "./cyclingClimbObservations";
import { validExpandedDistanceAnalysis } from "../utils/expandedRunDistances";
import { RUN_DISTANCE_M, RUN_DISTANCES, RUN_DISTANCE_TARGETS_V2 } from "@shared/types/personal-records";
import { httpsCallable } from "firebase/functions";
import type { RunningPaceZoneAnalysis, PeriodRunningPaceZones, PeriodRunSource, TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
import { validPowerCurvePeriodsRequest } from "./powerCurvePeriods";

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-9;
const id = (value: unknown): value is string => typeof value === "string" && !!value && value.length <= 512 && !value.includes("/");
/** 새 API는 검증된 stage compute에만 명시적으로 켠다. */
export function trainingAnalysisPeriodsAvailable() {
  const config = getRuntimeConfig();
  return config.trainingAnalysisPeriodsEnabled === true && config.appEnvironment === "stage"
    && config.firebaseFunctionsBase === "https://asia-northeast3-orider-dev.cloudfunctions.net";
}
export function validTrainingAnalysisPeriodsRequest(request: TrainingAnalysisPeriodsRequest, now = Date.now()) {
  return !!request && ["bike", "run", "swim"].includes(request.discipline)
    && (request.stageRunDistanceSnapshotActivityIds === undefined || request.includeStageRunEffortPreferences === true && request.discipline === "run"
      && Array.isArray(request.stageRunDistanceSnapshotActivityIds) && request.stageRunDistanceSnapshotActivityIds.length === 1
      && typeof request.stageRunDistanceSnapshotActivityIds[0] === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(request.stageRunDistanceSnapshotActivityIds[0]))
    && (request.includeStageRunEffortPreferences === undefined || request.includeStageRunEffortPreferences === true && request.discipline === "run")
    && (request.includeRunningPaceZones === undefined || request.includeRunningPaceZones === true && request.discipline === "run")
    && (request.includeExpandedRunDistances === undefined || request.includeExpandedRunDistances === true && request.discipline === "run")
    && (request.includeCyclingClimbObservations === undefined || request.includeCyclingClimbObservations === true && request.discipline === "bike")
    && (request.includeCyclingDistanceObservations === undefined || request.includeCyclingDistanceObservations === true && request.discipline === "bike")
    && validPowerCurvePeriodsRequest({ unit: "W", periods: request.periods }, now);
}
export function validateTrainingAnalysisPeriodsResponse(response: TrainingAnalysisPeriodsResponse, request: TrainingAnalysisPeriodsRequest) {
  const invalid = () => { throw new Error("invalid_training_analysis_periods_response"); };
  if (!response || response.version !== 1 || response.discipline !== request.discipline || !count(response.asOf)
    || !Number.isFinite(new Date(response.asOf).getTime()) || request.periods.some(period => period.toExclusive > response.asOf)
    || !/^[a-f0-9]{64}$/u.test(response.inputDigest) || !Array.isArray(response.periods) || response.periods.length !== request.periods.length) invalid();
  // 새 선택 채널만 격리하고 기존 응답의 엄격한 검증은 유지한다.
  const sanitizedPeriods = response.periods.map(period => {
    if (period?.cyclingDistanceObservations === undefined) return period;
    const channel = request.discipline === "bike" && request.includeCyclingDistanceObservations === true ? normalizeCyclingDistanceAnalysis(period.cyclingDistanceObservations, period) : undefined;
    if (channel) return channel === period.cyclingDistanceObservations ? period : { ...period, cyclingDistanceObservations: channel };
    const { cyclingDistanceObservations: _invalidChannel, ...rest } = period;
    return rest;
  });
  if (sanitizedPeriods.some((period, index) => period !== response.periods[index])) response = { ...response, periods: sanitizedPeriods };
  response.periods.forEach((period, index) => {
    const expected = request.periods[index]!, coverage = period?.coverage;
    if (!period || period.fromInclusive !== expected.fromInclusive || period.toExclusive !== expected.toExclusive
      || !["complete", "partial"].includes(period.status) || !coverage || !period.totals || !period.zones || !Array.isArray(period.activities)) invalid();
    const counts = [coverage.scannedActivityCount, coverage.candidateActivityCount, coverage.representativeActivityCount,
      coverage.deduplicatedActivityCount, coverage.includedActivityCount, coverage.pendingActivityCount, coverage.missingActivityCount,
      coverage.incompleteActivityCount, coverage.skippedActivityCount];
    if (!counts.every(count) || coverage.scanLimit !== 200 || coverage.scannedActivityCount > 200
      || typeof coverage.truncated !== "boolean" || coverage.candidateCountKnown !== !coverage.truncated
      || coverage.deduplicationBasis !== "explicit_identity_within_period"
      || coverage.scannedActivityCount !== coverage.candidateActivityCount + coverage.skippedActivityCount
      || coverage.candidateActivityCount !== coverage.representativeActivityCount + coverage.deduplicatedActivityCount
      || coverage.representativeActivityCount !== coverage.includedActivityCount + coverage.pendingActivityCount + coverage.missingActivityCount + coverage.incompleteActivityCount
      || period.activities.length !== coverage.representativeActivityCount) invalid();
    const activityIds = new Set<string>();
    for (const activity of period.activities) {
      if (!activity || !id(activity.activityId) || activityIds.has(activity.activityId) || !count(activity.startTime)
        || activity.startTime < expected.fromInclusive || activity.startTime >= expected.toExclusive
        || [activity.distanceM, activity.movingTimeSec, activity.elevationGainM].some(value => value !== null && !nonnegative(value))) invalid();
      activityIds.add(activity.activityId);
    }
    for (const field of ["distanceM", "movingTimeSec", "elevationGainM"] as const) {
      const total = period.totals[field];
      if (!total || !count(total.knownActivityCount) || !count(total.missingActivityCount)
        || total.knownActivityCount + total.missingActivityCount !== coverage.representativeActivityCount
        || !Array.isArray(total.sourceActivityIds) || new Set(total.sourceActivityIds).size !== total.knownActivityCount
        || total.sourceActivityIds.length !== total.knownActivityCount || total.sourceActivityIds.some(value => !activityIds.has(value))) invalid();
      const known = period.activities.filter(activity => activity[field] !== null);
      if (known.length !== total.knownActivityCount || known.some(activity => !total.sourceActivityIds.includes(activity.activityId))) invalid();
      if (period.activities.some(activity => !activity.sourceBasis || !["canonical_metrics", "activity_summary", "unavailable"].includes(activity.sourceBasis[field])
        || (activity[field] === null) !== (activity.sourceBasis[field] === "unavailable"))) invalid();
      const fallback = known.filter(activity => activity.sourceBasis[field] === "activity_summary").length;
      const basis = known.length === 0 ? "unavailable" : fallback === 0 ? "canonical_metrics" : fallback === known.length ? "activity_summary" : "mixed";
      if (total.summaryFallbackCount !== fallback || total.sourceBasis !== basis) invalid();
      const sum = known.reduce((value, activity) => value + activity[field]!, 0);
      if (total.knownActivityCount === 0 ? total.observedValue !== null : !nonnegative(total.observedValue) || !near(total.observedValue, sum)) invalid();
      if (coverage.truncated || total.missingActivityCount > 0 ? total.totalValue !== null : !nonnegative(total.totalValue) || !near(total.totalValue, sum)) invalid();
    }
    for (const channel of ["heartRate", "power"] as const) {
      const zones = period.zones[channel], size = channel === "heartRate" ? 5 : 7;
      const candidates = channel === "power" && request.discipline !== "bike" ? 0 : coverage.representativeActivityCount;
      if (!zones || ![zones.candidateActivityCount, zones.eligibleActivityCount, zones.missingSensorActivityCount, zones.contextUnknownActivityCount].every(count)
        || zones.candidateActivityCount !== candidates || zones.eligibleActivityCount + zones.missingSensorActivityCount + zones.contextUnknownActivityCount !== candidates
        || !nonnegative(zones.observedSeconds) || !Array.isArray(zones.groups) || zones.groups.length > candidates) invalid();
      const seen = new Set<string>();
      for (const group of zones.groups) {
        if (!group || !Array.isArray(group.seconds) || group.seconds.length !== size || !Array.from(group.seconds).every(nonnegative)
          || !nonnegative(group.observedSeconds) || !near(group.observedSeconds, group.seconds.reduce((a, b) => a + b, 0))
          || !Array.isArray(group.activityIds) || group.activityIds.length === 0 || new Set(group.activityIds).size !== group.activityIds.length || group.activityIds.some(value => !activityIds.has(value) || seen.has(value))) invalid();
        group.activityIds.forEach(value => seen.add(value));
        if (channel === "heartRate" && !("boundaries" in group) || channel === "power" && "boundaries" in group) invalid();
        if ("boundaries" in group) {
          const bounds = group.boundaries;
          if (!bounds || !["lthr", "max_hr"].includes(bounds.reference) || !nonnegative(bounds.referenceBpm) || bounds.referenceBpm < 50 || bounds.referenceBpm > 250
            || bounds.sport !== (request.discipline === "swim" ? "other" : request.discipline) || !Array.isArray(bounds.zones) || bounds.zones.length !== 5
            || Array.from(bounds.zones).some((zone, zoneIndex) => !zone || zone.zone !== zoneIndex + 1 || !nonnegative(zone.minPct) || !nonnegative(zone.minBpm)
              || zone.maxPct !== null && (!nonnegative(zone.maxPct) || zone.maxPct <= zone.minPct)
              || zone.maxBpmExclusive !== null && (!nonnegative(zone.maxBpmExclusive) || zone.maxBpmExclusive <= zone.minBpm))) invalid();
        } else if (!nonnegative(group.ftp) || group.ftp <= 0 || !["measured", "virtual"].includes(group.powerSource)) invalid();
      }
      if (seen.size !== zones.eligibleActivityCount || !near(zones.observedSeconds, zones.groups.reduce((sum, group) => sum + group.observedSeconds, 0))) invalid();
    }
    if (period.cyclingClimbObservations !== undefined && (request.includeCyclingClimbObservations !== true || request.discipline !== "bike" || !validCyclingClimbObservations(period.cyclingClimbObservations, period))) invalid();
    if (period.running != null) {
      const running = period.running;
      if (running.expandedDistanceAnalysis !== undefined && (request.includeExpandedRunDistances !== true || !validExpandedDistanceAnalysis(running.expandedDistanceAnalysis, period, request.includeStageRunEffortPreferences === true))) invalid();
      if (request.discipline !== "run" || !running.bestDistances || !Array.isArray(running.paceCurves) || running.paceCurves.length > 2) invalid();
      const validRunningCoverage = (value: typeof running.bestDistances.coverage, status: string, stageEffortOptIn = false) => {
        const excludedOnly = stageEffortOptIn && value?.excludedOnlyActivityCount !== undefined ? value.excludedOnlyActivityCount : 0;
        if (!count(excludedOnly) || !value || ![value.candidateActivityCount, value.eligibleActivityCount, value.missingActivityCount, value.noObservedEffortActivityCount].every(count)
          || value.candidateActivityCount !== coverage.representativeActivityCount || value.truncated !== coverage.truncated
          || value.eligibleActivityCount + value.missingActivityCount + value.noObservedEffortActivityCount + excludedOnly !== value.candidateActivityCount
          || status !== (value.truncated || value.missingActivityCount > 0 ? "partial" : "complete")) invalid();
      };
      const validRunSource = (point: PeriodRunSource, eligible: number) => {
        const activity = period.activities.find(activity => activity.activityId === point?.sourceActivityId);
        if (!point || !id(point.sourceActivityId) || !activity || point.startTime !== activity.startTime
          || !/^\d+:\d+$/u.test(point.metricsRevision) || !count(point.contributingActivityCount)
          || point.contributingActivityCount < 1 || point.contributingActivityCount > eligible) invalid();
      };
      const best = running.bestDistances;
      validRunningCoverage(best.coverage, best.status, request.includeStageRunEffortPreferences === true);
      if (best.timingBasis !== "elapsed_including_stops" || !Array.isArray(best.points) || best.points.length > 5
        || best.coverage.eligibleActivityCount === 0 && best.points.length > 0) invalid();
      const distances = new Set<string>();
      for (const point of best.points) {
        validRunSource(point, best.coverage.eligibleActivityCount);
        if (!RUN_DISTANCES.includes(point.distance) || point.distanceM !== RUN_DISTANCE_M[point.distance]
          || !nonnegative(point.elapsedSec) || point.elapsedSec <= 0 || distances.has(point.distance)) invalid();
        distances.add(point.distance);
      }
      if (best.observedStatistics !== undefined) {
        const statistics = best.observedStatistics;
        if (!Array.isArray(statistics) || statistics.length > RUN_DISTANCES.length) invalid();
        const seen = new Set<string>();
        for (const statistic of statistics) {
          const source = best.points.find(point => point.distance === statistic?.distance);
          if (!statistic || !RUN_DISTANCES.includes(statistic.distance) || seen.has(statistic.distance)
            || !nonnegative(statistic.bestTimeSeconds) || statistic.bestTimeSeconds <= 0
            || !nonnegative(statistic.medianTimeSeconds) || statistic.medianTimeSeconds < statistic.bestTimeSeconds
            || !count(statistic.contributingActivityCount) || statistic.contributingActivityCount < 1
            || statistic.contributingActivityCount > best.coverage.eligibleActivityCount
            || !source || !near(source.elapsedSec, statistic.bestTimeSeconds) || source.contributingActivityCount !== statistic.contributingActivityCount) invalid();
          seen.add(statistic.distance);
        }
      }
      const seenBases = new Set<string>();
      const canonicalDurations = new Set([30, 60, 180, 300, 600, 1200, 1800, 3600, 7200]);
      const convertedDurations = new Set([30, 60, 300, 600, 1200, 1800, 3600]);
      for (const curve of running.paceCurves) {
        if (!curve || !["run_metrics_pace_curve", "speed_curve_kmh_converted"].includes(curve.sourceBasis)
          || seenBases.has(curve.sourceBasis) || curve.timingBasis !== "elapsed" || curve.unit !== "sec_per_km"
          || !Array.isArray(curve.points) || curve.points.length > 11 || curve.coverage?.eligibleActivityCount === 0 && curve.points.length > 0) invalid();
        seenBases.add(curve.sourceBasis);
        validRunningCoverage(curve.coverage, curve.status);
        let previousDuration = 0;
        for (const point of curve.points) {
          validRunSource(point, curve.coverage.eligibleActivityCount);
          if (!(curve.sourceBasis === "run_metrics_pace_curve" ? canonicalDurations : convertedDurations).has(point.durationSeconds) || point.durationSeconds <= previousDuration || !nonnegative(point.paceSecPerKm) || point.paceSecPerKm <= 0
            || (curve.sourceBasis === "run_metrics_pace_curve" ? point.speedKph !== null : !nonnegative(point.speedKph) || point.speedKph <= 0 || !near(point.paceSecPerKm, 3600 / point.speedKph))) invalid();
          previousDuration = point.durationSeconds;
        }
        if (curve.observedStatistics !== undefined) {
          const statistics = curve.observedStatistics;
          const durations = curve.sourceBasis === "run_metrics_pace_curve" ? canonicalDurations : convertedDurations;
          if (!Array.isArray(statistics) || statistics.length > durations.size) invalid();
          const seen = new Set<number>();
          for (const statistic of statistics) {
            const source = curve.points.find(point => point.durationSeconds === statistic?.durationSeconds);
            if (!statistic || !durations.has(statistic.durationSeconds) || seen.has(statistic.durationSeconds)
              || !nonnegative(statistic.observedBestPaceSecPerKm) || statistic.observedBestPaceSecPerKm <= 0
              || !nonnegative(statistic.observedMedianPaceSecPerKm) || statistic.observedMedianPaceSecPerKm <= 0
              || statistic.observedMedianPaceSecPerKm < statistic.observedBestPaceSecPerKm
              || !count(statistic.contributingActivityCount) || statistic.contributingActivityCount < 1
              || statistic.contributingActivityCount > curve.coverage.eligibleActivityCount
              || !source || !near(source.paceSecPerKm, statistic.observedBestPaceSecPerKm)
              || source.contributingActivityCount !== statistic.contributingActivityCount) invalid();
            seen.add(statistic.durationSeconds);
          }
        }
      }
      if (running.evidence !== undefined) {
        const evidence = running.evidence;
        if (!evidence || evidence.version !== 1 || evidence.scope !== "observed_representatives"
          || evidence.timingBasis !== "elapsed_including_stops" || !Array.isArray(evidence.activities)
          || evidence.activities.length > 200 || evidence.activities.length > coverage.includedActivityCount) invalid();
        const seen = new Set<string>();
        const observedByBasis = new Map<string, number>();
        let distanceActivities = 0;
        for (const activity of evidence.activities) {
          const representative = period.activities.find(value => value.activityId === activity?.activityId);
          if (!activity || !id(activity.activityId) || seen.has(activity.activityId) || !representative || activity.startTime !== representative.startTime
            || typeof activity.metricsRevision !== "string" || !activity.metricsRevision.trim() || activity.metricsRevision.length > 256
            || !Array.isArray(activity.distanceRecords) || activity.distanceRecords.length > RUN_DISTANCES.length) invalid();
          seen.add(activity.activityId);
          const distances = new Set<string>();
          for (const record of activity.distanceRecords) {
            if (!record || !RUN_DISTANCES.includes(record.distance) || distances.has(record.distance) || !nonnegative(record.elapsedSec) || record.elapsedSec <= 0) invalid();
            distances.add(record.distance);
          }
          if (distances.size) distanceActivities++;
          if (activity.paceCurve !== null) {
            const pace = activity.paceCurve;
            const channel = running.paceCurves.find(curve => curve.sourceBasis === pace?.sourceBasis);
            const durations = pace?.sourceBasis === "run_metrics_pace_curve" ? canonicalDurations : convertedDurations;
            if (!pace || !channel || !["run_metrics_pace_curve", "speed_curve_kmh_converted"].includes(pace.sourceBasis)
              || pace.unit !== "sec_per_km" || !Array.isArray(pace.points) || pace.points.length === 0 || pace.points.length > durations.size) invalid();
            const seenDurations = new Set<number>();
            for (const point of pace.points) {
              if (!point || !durations.has(point.durationSeconds) || seenDurations.has(point.durationSeconds)
                || !nonnegative(point.paceSecPerKm) || point.paceSecPerKm <= 0
                || (pace.sourceBasis === "run_metrics_pace_curve" ? point.speedKph !== null : !nonnegative(point.speedKph) || point.speedKph < 5 || !near(point.paceSecPerKm, 3600 / point.speedKph))) invalid();
              seenDurations.add(point.durationSeconds);
            }
            observedByBasis.set(pace.sourceBasis, (observedByBasis.get(pace.sourceBasis) ?? 0) + 1);
          } else if (!distances.size) invalid();
        }
        if (distanceActivities > running.bestDistances.coverage.eligibleActivityCount
          || running.paceCurves.some(curve => (observedByBasis.get(curve.sourceBasis) ?? 0) > curve.coverage.eligibleActivityCount)) invalid();
      }
    }
    if (period.zones.power.reason !== (request.discipline === "bike" ? "recorded_ftp" : "not_applicable")) invalid();
    const pace = period.zones.pace;
    if (pace && "candidateActivityCount" in pace) {
      if (request.discipline !== "run" || request.includeRunningPaceZones !== true || !validPeriodRunningPaceZones(pace, period)) invalid();
    } else if (pace?.status !== "unavailable" || pace.reason !== "canonical_pace_zones_unavailable") invalid();
    if (period.running?.stageEffortOverlay !== undefined) {
      if (request.discipline !== "run" || request.includeStageRunEffortPreferences !== true
        || !validRunEffortStageOverlay(period.running.stageEffortOverlay, coverage.candidateActivityCount)) invalid();
      const bindings = new Map(period.running.stageEffortOverlay.preferenceBindings.map(binding => [binding.activityId, binding]));
      const retainedSource = (activityId: string, metricsRevision: string, target: typeof RUN_DISTANCES[number] | typeof RUN_DISTANCE_TARGETS_V2[number]) => {
        const binding = bindings.get(activityId);
        return !!binding && binding.metricsRevision === metricsRevision && !binding.excludedTargets.includes(target);
      };
      if (period.running.bestDistances.points.some(point => !retainedSource(point.sourceActivityId, point.metricsRevision, point.distance))
        || period.running.evidence?.activities.some(activity => activity.distanceRecords.some(record => !retainedSource(activity.activityId, activity.metricsRevision, record.distance)))
        || period.running.expandedDistanceAnalysis?.distances.some(distance => distance.sources.some(source => !retainedSource(source.sourceActivityId, source.metricsRevision, distance.distance)))) invalid();
      const excluded = period.running.bestDistances.excludedEffortActivityCount;
      if (!count(excluded) || excluded > coverage.representativeActivityCount) invalid();
      for (const distance of period.running.expandedDistanceAnalysis?.distances ?? []) {
        if (distance.excludedEffortActivityCount !== undefined && (!count(distance.excludedEffortActivityCount) || distance.excludedEffortActivityCount > coverage.representativeActivityCount)) invalid();
      }
    }
    if (request.stageRunDistanceSnapshotActivityIds && period.stageDerivedRunDistances === undefined) invalid();
    if (period.stageDerivedRunDistances !== undefined && !validStageDerivedDistances(period.stageDerivedRunDistances, period, request)) invalid();
    if (!request.stageRunDistanceSnapshotActivityIds && period.running?.stageEffortOverlay?.preferenceBindings.some(binding => binding.derivedRevision !== undefined)) invalid();
    const partial = coverage.truncated || Object.values(period.totals).some(total => total.missingActivityCount > 0)
      || period.zones.heartRate.missingSensorActivityCount + period.zones.heartRate.contextUnknownActivityCount
      + period.zones.power.missingSensorActivityCount + period.zones.power.contextUnknownActivityCount > 0;
    if (period.status !== (partial ? "partial" : "complete")) invalid();
  });
  return response;
}
/** 별도 저장축 근거만 검증한다. 정본 기록/집계의 eligibility에 끼워 넣지 않는다. */
function validStageDerivedDistances(value: StageDerivedRunDistancePeriod, period: TrainingAnalysisPeriodsResponse["periods"][number], request: TrainingAnalysisPeriodsRequest): boolean {
  if (!request.stageRunDistanceSnapshotActivityIds || request.includeStageRunEffortPreferences !== true || request.discipline !== "run"
    || !value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== ["version", "basis", "originalClockVerified", "coverage", "quality", "targetsVersion", "scope", "sources"].sort().join(",")
    || value.version !== 1 || value.basis !== "stage_derived_from_stored_elapsed_axis" || value.originalClockVerified !== false
    || value.coverage !== "unknown" || value.quality !== "unknown" || value.targetsVersion !== 2 || value.scope !== "explicit_selected_snapshot"
    || !Array.isArray(value.sources) || value.sources.length > 1) return false;
  for (const source of value.sources) {
    const binding = period.running?.stageEffortOverlay?.preferenceBindings.find(row => row.activityId === source?.activityId);
    const activity = period.activities.find(row => row.activityId === source?.activityId);
    const qualifiedLegacy = !!source && (Object.prototype.hasOwnProperty.call(source, "qualification") || Object.prototype.hasOwnProperty.call(source, "manifestObjectIncarnationVerified"));
    const hasWallClockBasis = !!source && Object.prototype.hasOwnProperty.call(source, "timeBasis");
    if (hasWallClockBasis && source.timeBasis !== "stored_activity_wall_clock_window") return false;
    if (qualifiedLegacy && (source.qualification !== "legacy_manifest_revision_and_gcs_token_pinned" || source.manifestObjectIncarnationVerified !== false
      || !Object.prototype.hasOwnProperty.call(source, "qualification") || !Object.prototype.hasOwnProperty.call(source, "manifestObjectIncarnationVerified"))) return false;
    if (!source || typeof source !== "object" || Object.keys(source).sort().join(",") !== ["activityId", "startTime", "derivedRevision", "observedTargets", "excludedTargets", "records", ...(qualifiedLegacy ? ["qualification", "manifestObjectIncarnationVerified"] : []), ...(hasWallClockBasis ? ["timeBasis"] : [])].sort().join(",")
      || source.activityId !== request.stageRunDistanceSnapshotActivityIds[0] || !binding || !activity || source.startTime !== activity.startTime
      || typeof source.derivedRevision !== "string" || !/^[a-f0-9]{64}$/u.test(source.derivedRevision) || source.derivedRevision !== binding.derivedRevision
      || !Array.isArray(source.observedTargets) || source.observedTargets.length > 14 || new Set(source.observedTargets).size !== source.observedTargets.length
      || source.observedTargets.some(target => !RUN_DISTANCE_TARGETS_V2.includes(target))
      || !Array.isArray(source.excludedTargets) || JSON.stringify(source.excludedTargets) !== JSON.stringify(binding.excludedTargets)
      || !source.records || typeof source.records !== "object" || Array.isArray(source.records)) return false;
    const retained = source.observedTargets.filter(target => !source.excludedTargets.includes(target)).sort();
    if (JSON.stringify(Object.keys(source.records).sort()) !== JSON.stringify(retained)) return false;
    for (const anchor of Object.values(source.records)) {
      if (!anchor || Object.keys(anchor).sort().join(",") !== ["elapsedSec", "exactElapsedSec", "startIndex", "endBeforeIndex", "endIndex", "endFraction", "startTimeSec", "endTimeSec"].sort().join(",")
        || !count(anchor.elapsedSec) || anchor.elapsedSec < 1 || !nonnegative(anchor.exactElapsedSec) || anchor.exactElapsedSec <= 0 || anchor.elapsedSec !== Math.round(anchor.exactElapsedSec)
        || !count(anchor.startIndex) || !count(anchor.endIndex) || anchor.endIndex <= anchor.startIndex || anchor.endIndex >= 10_000 || anchor.endBeforeIndex !== anchor.endIndex - 1
        || !nonnegative(anchor.endFraction) || anchor.endFraction > 1 || !nonnegative(anchor.startTimeSec) || !nonnegative(anchor.endTimeSec)
        || !near(anchor.endTimeSec - anchor.startTimeSec, anchor.exactElapsedSec)) return false;
    }
  }
  return !period.running?.stageEffortOverlay?.preferenceBindings.some(binding => binding.derivedRevision !== undefined && !value.sources.some(source => source.activityId === binding.activityId));
}
/** Private single-activity snapshots and observed period groups share this fixed GAP policy. */
export function validRunningPaceZoneAnalysis(value: unknown): value is RunningPaceZoneAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as RunningPaceZoneAnalysis;
  const revision = data.thresholdProfileRevision;
  if (data.version !== 1 || data.policy !== "orider_gap_threshold_v1" || data.basis !== "calculation_snapshot"
    || data.timingBasis !== "observed_elapsed_intervals" || !count(data.calculatedAt) || data.calculatedAt <= 0
    || !Number.isFinite(new Date(data.calculatedAt).getTime())
    || revision !== undefined && (typeof revision !== "string" || !revision.trim() || revision.length > 256)
    || !Array.isArray(data.upperSpeedRatios) || data.upperSpeedRatios.length !== 5 || JSON.stringify(data.upperSpeedRatios) !== "[0.75,0.85,0.95,1.05,1.15]"
    || !Array.isArray(data.zoneSeconds) || data.zoneSeconds.length !== 6 || !Array.from(data.zoneSeconds).every(nonnegative)
    || !nonnegative(data.eligibleGapSeconds) || !near(data.zoneSeconds.reduce((sum, seconds) => sum + seconds, 0), data.eligibleGapSeconds)) return false;
  const threshold = data.thresholdPaceSecPerKm;
  const configured = typeof threshold === "number" && Number.isFinite(threshold) && threshold >= 120 && threshold <= 1200
    && ["training.thresholdPace", "thresholdPace"].includes(data.thresholdSource ?? "");
  if (!configured && (threshold !== null || data.thresholdSource !== null)) return false;
  const interval = data.intervalCoverage;
  if (interval !== null) {
    if (!interval || interval.scope !== "provided_elapsed_intervals"
      || ![interval.observedIntervalSeconds, interval.eligibleGapSeconds, interval.stoppedSeconds, interval.missingAltitudeMovingSeconds, interval.gapExcludedSeconds, interval.invalidDistanceSeconds].every(nonnegative)
      || !near(interval.observedIntervalSeconds, interval.eligibleGapSeconds + interval.stoppedSeconds + interval.missingAltitudeMovingSeconds + interval.gapExcludedSeconds + interval.invalidDistanceSeconds)
      || !near(interval.eligibleGapSeconds, data.eligibleGapSeconds)) return false;
  }
  if (data.state === "observed") return configured && data.reason === null && interval !== null && data.eligibleGapSeconds > 0;
  if (data.state !== "unavailable" || data.eligibleGapSeconds !== 0) return false;
  return data.reason === "gap_input_unavailable" ? configured : ["threshold_missing", "profile_read_failed"].includes(data.reason ?? "") && !configured;
}
function validPeriodRunningPaceZones(pace: PeriodRunningPaceZones, period: TrainingAnalysisPeriodsResponse["periods"][number]) {
  const counts = [pace.candidateActivityCount, pace.eligibleActivityCount, pace.legacyUnsupportedActivityCount,
    pace.unavailableActivityCount, pace.thresholdMissingActivityCount, pace.gapInputUnavailableActivityCount, pace.profileReadFailedActivityCount];
  if (!counts.every(count) || pace.candidateActivityCount !== period.coverage.representativeActivityCount
    || counts.slice(1).reduce((sum, value) => sum + value, 0) !== pace.candidateActivityCount
    || pace.truncated !== period.coverage.truncated || !Array.isArray(pace.groups) || pace.groups.length > pace.eligibleActivityCount
    || pace.status !== (pace.eligibleActivityCount > 0 ? "observed" : "unavailable")
    || pace.reason !== (pace.eligibleActivityCount > 0 ? "observed_canonical_gap_zones" : "canonical_pace_zones_unavailable")) return false;
  const seen = new Set<string>(), groups = new Set<string>();
  for (const group of pace.groups) {
    if (!group || !Array.isArray(group.sources) || !group.sources.length || group.sources.length > pace.eligibleActivityCount) return false;
    const first = group.sources[0];
    if (!first) return false;
    if (!validRunningPaceZoneAnalysis({ ...group, calculatedAt: first.calculatedAt, thresholdProfileRevision: first.thresholdProfileRevision }) || group.state !== "observed") return false;
    const basis = JSON.stringify([group.thresholdPaceSecPerKm, group.thresholdSource]);
    if (groups.has(basis)) return false;
    groups.add(basis);
    for (const source of group.sources) {
      const representative = period.activities.find(activity => activity.activityId === source?.sourceActivityId);
      if (!source || !id(source.sourceActivityId) || seen.has(source.sourceActivityId) || !representative || source.startTime !== representative.startTime
        || source.contributingActivityCount !== 1 || typeof source.metricsRevision !== "string" || !source.metricsRevision.trim() || source.metricsRevision.length > 256
        || !count(source.calculatedAt) || source.calculatedAt <= 0 || !Number.isFinite(new Date(source.calculatedAt).getTime())
        || source.thresholdProfileRevision !== undefined && (typeof source.thresholdProfileRevision !== "string" || !source.thresholdProfileRevision.trim() || source.thresholdProfileRevision.length > 256)) return false;
      seen.add(source.sourceActivityId);
    }
  }
  return seen.size === pace.eligibleActivityCount;
}
export async function loadTrainingAnalysisPeriods(services: FirebaseServices, uid: string, request: TrainingAnalysisPeriodsRequest) {
  if (!trainingAnalysisPeriodsAvailable()) throw new Error("api_unavailable");
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (services.functions.app !== services.auth.app
    || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-context-mismatch");
  if (!validTrainingAnalysisPeriodsRequest(request)) throw new Error("invalid_training_analysis_periods_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable<TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse>(services.functions, "getTrainingAnalysisPeriods")(request);
  if (!matches()) throw new Error("account_changed");
  return validateTrainingAnalysisPeriodsResponse(result.data, request);
}
