import type { RunEvidence } from "./multisportPerformance";

export function qualifiedRunRecords(evidence: RunEvidence) {
  return evidence.records.filter(record => record.qualification === "source_qualified" && record.unit === "seconds"
    && Number.isFinite(record.seconds) && record.seconds > 0 && typeof record.activityId === "string"
    && record.activityId.trim() && Number.isFinite(record.startTime));
}

export function needsRunAnalysisReadiness(evidence: RunEvidence, hasThreshold: boolean, hasZones: boolean) {
  return !hasThreshold && !hasZones && evidence.thresholdPaceSec == null && qualifiedRunRecords(evidence).length === 0;
}
