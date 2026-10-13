import type { CyclingCoveredStamp, CyclingCoveredRow } from "./stage-cycling-distance-covered-rankings";
import type { BikeDistanceKey } from "../activity-bike-distance-evidence";

export const CYCLING_HISTORY_OVERLAY_MAX_IDS = 20;
export const CYCLING_HISTORY_OVERLAY_RESPONSE_MAX_BYTES = 512 * 1024;
/** Digest는 요청 상관관계만 검증한다. 모든 소유권은 서버 Auth uid로 검증한다. */
export interface CyclingHistoryOverlayScope {
  calendarBasis: "Asia/Seoul";
  rangeBasis: "calendar_year" | "explicit_range";
  year: number | null;
  range: { fromInclusive: number; toExclusive: number };
  sourceReadTime: CyclingCoveredStamp;
  includeActivityTotals: boolean;
}
export interface CyclingHistoryOverlaySession {
  scope: "cycling_history_stage_overlay_v1";
  ownerBinding: string;
  requestBinding: string;
  sourceProject: "miranae-orider-g1";
  stageProject: "orider-dev";
  targetsVersion: 1;
  provenanceVersion: 2;
  policyVersion: 1;
  calculatorArtifactHash: string;
  observedCalculatorArtifactHash: string;
  sourceReadTime: CyclingCoveredStamp;
  stageReadTime: CyclingCoveredStamp;
  expiresAt: number;
}
export interface StageCyclingDistanceHistoryOverlayRequest {
  version: 1;
  mode: "stage_cycling_distance_history_overlay_v1";
  history: CyclingHistoryOverlayScope;
  pageBinding: string;
  activities: Array<{ activityId: string; activityRevision: string; metricsRevision: string | null }>;
  session?: CyclingHistoryOverlaySession;
}
export interface CyclingHistoryOverlayEvidence {
  row: CyclingCoveredRow;
  activityRevision: string;
  metricsRevision: string | null;
  incarnationBinding: string;
  snapshotBinding: string;
  canonicalPreferenceBinding: string;
  snapshotPreferenceBinding: string;
  canonicalExcluded: BikeDistanceKey[];
  snapshotExcluded: BikeDistanceKey[];
}
export interface StageCyclingDistanceHistoryOverlayResponse {
  version: 1;
  mode: "stage_cycling_distance_history_overlay_v1";
  history: CyclingHistoryOverlayScope;
  session: CyclingHistoryOverlaySession;
  pageBinding: string;
  subsetBinding: string;
  batchBinding: string;
  evidence: CyclingHistoryOverlayEvidence[];
  readTimes: { sourceInitial: CyclingCoveredStamp; sourceFinal: CyclingCoveredStamp; stageInitial: CyclingCoveredStamp; stageFinal: CyclingCoveredStamp };
  scope: "loaded_and_checked_dual_snapshot_activities";
  io: { sourceDocs: number; stageDocs: number; metadata: number; payloads: 0; writes: 0;
    logicalDocMaximum: number; limits: { docs: 370; metadata: 40; payloads: 0; writes: 0 } };
}
