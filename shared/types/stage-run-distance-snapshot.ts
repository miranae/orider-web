import type { ExpandedRunDistanceKey } from "./personal-records";
import type { ObservedRunDistanceFact } from "../activity-run-distance-evidence";
type RunDistanceEffortAnchor = Omit<ObservedRunDistanceFact, "distance" | "distanceM" | "startOffsetSec" | "endOffsetSec">;

/** 검증 환경의 저장 거리축 파생값. 정본 PR이나 원본 시계 검증을 대신하지 않는다. */
export interface StageRunDistanceSnapshot {
  version: 1;
  userId: string;
  activityId: string;
  derivedRevision: string;
  basis: "stage_derived_from_stored_elapsed_axis";
  originalClockVerified: false;
  coverage: "unknown";
  quality: "unknown";
  targetsVersion: 2;
  originEpochMs: number;
  durationSec: number;
  pointCount: number;
  observedStartOffsetSec: number;
  observedEndOffsetSec: number;
  records: Partial<Record<ExpandedRunDistanceKey, RunDistanceEffortAnchor>>;
  source: {
    activityIncarnation: string;
    activityRevision: string;
    baseMetricsRevision: string;
    manifestRevision: string;
    generation: string;
    crc32c: string;
    encodedBytes: number;
    decodedBytes: number;
    decodedDigest: string;
    calculatorArtifactHash: string;
  } & ({ ingestIncarnation: string } | {
    ingestIncarnation: null;
    qualification: "legacy_manifest_revision_and_gcs_token_pinned";
    manifestIncarnation: string;
    gcsIncarnationToken: string;
    manifestObjectIncarnationVerified: false;
  });
}
export interface StageDerivedRunDistancePeriod {
  version: 1;
  basis: StageRunDistanceSnapshot["basis"];
  originalClockVerified: false;
  coverage: "unknown";
  quality: "unknown";
  targetsVersion: 2;
  scope: "explicit_selected_snapshot";
  sources: Array<{
    activityId: string;
    startTime: number;
    derivedRevision: string;
    observedTargets: ExpandedRunDistanceKey[];
    excludedTargets: ExpandedRunDistanceKey[];
    records: StageRunDistanceSnapshot["records"];
    qualification?: "legacy_manifest_revision_and_gcs_token_pinned";
    manifestObjectIncarnationVerified?: false;
  }>;
}

/** CLI preview 시점의 검증 환경 문서 CAS. 원본 snapshot에는 저장하지 않는다. */
export interface StageRunDistancePublicationWitness { exists: boolean; documentRevision: string }
