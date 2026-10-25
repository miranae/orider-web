/** Public owner-only projection: no private source paths or input receipts. */
export interface RecordedRouteHistoryBestDto {
  anchorActivityId: string; anchorInputRevision: string;
  groups: number; rows: number; eligibleGroups: number; ambiguousGroups: number; unavailableGroups: number; excludedGroups: number;
  states: Record<"verified" | "missing" | "unsupported" | "changed", number>;
  bestElapsedSec: number | null; bestActivityIds: string[]; tieCount: number; tiesTruncated: boolean;
}

export interface RouteHistorySnapshotRequest { anchorActivityId: string; discipline: "bike" | "run"; action: "start" | "advance" | "status"; runId?: string; expectedVersion?: number }
export interface RouteHistorySnapshotResponse {
  runId: string; version: number; state: "scanning" | "identity" | "reducing" | "complete" | "invalidated" | "expired"; asOf: number; expiresAt: number;
  scope: "recorded_observations_at_snapshot"; scanned: number; excluded: number; unresolved: number; candidateCount: number;
  wholeHistory: "in_progress" | "enumerated_at_read_time"; physicalRideCompleteness: "unknown";
  bestStatus: "pending" | "unavailable" | "observed_best_with_gaps" | "verified_recorded_best";
  best: RecordedRouteHistoryBestDto | null;
}
