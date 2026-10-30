/** Private, generation-time evidence. Never reconstruct this from current documents on cache reads. */
export interface NarrativeGroundingSource {
  kind: "activity" | "metrics" | "profile" | "fitness" | "segment_effort";
  activityId: string | null;
  /** Opaque snapshot revision, not a claim that this input is current. */
  revision: string | null;
}
export interface NarrativeGroundingWindow {
  fromMs: number;
  toMs: number;
  fromInclusive: boolean;
  toExclusive: boolean;
}
export interface NarrativeGroundingBlock {
  kind: "coach_history" | "fitness_context" | "personal_baseline" | "segment_history";
  window: NarrativeGroundingWindow | null;
  comparisonWindows: NarrativeGroundingWindow[];
  basis: "activity_relative" | "generation_time";
  /** Null means the existing query had no row limit. */
  scanLimit: number | null;
  scannedCount: number;
  selectedCount: number;
  missingCount: number | null;
  /** Reached a query bound; does not assert that more rows exist. */
  capReached: boolean;
  coverage: "sample" | "complete_query" | "unknown";
  sources: NarrativeGroundingSource[];
  sourceCount: number;
  sourcesTruncated: boolean;
  /** Digest of ALL supplied source references, including omitted display references. */
  sourceSetDigest: string;
}
export interface ActivityNarrativeGrounding {
  version: 1;
  generatedAt: number;
  blocks: NarrativeGroundingBlock[];
}
