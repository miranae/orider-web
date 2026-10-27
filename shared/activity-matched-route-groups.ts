import type { ActivityCanonicalAverage } from './activity-route-comparison';

/** 고정된 저장 index cohort 정책이며 전체 이력·같은 도로·물리 주행 중복 제거 증거가 아니다. */
export const MATCHED_ROUTE_GROUP_LIMITS = Object.freeze({ descriptorLimit: 20, queryLookahead: 1,
  validatedLimit: 6, comparedPairs: 15, memberPageSize: 5, documents: 200, metadata: 40, ttlMs: 30 * 60 * 1000 });
export type MatchedRouteGeometryPolicy = 'complete' | 'observed_native';
export interface ActivityMatchedRouteGroupRequest {
  mode: 'matched_route_group_page' | 'matched_route_inventory_page'; anchorActivityId: string; discipline: 'bike' | 'run';
  /** 이후 reader가 인증하는 opaque 값. 클라이언트 membership/좌표를 담지 않는다. */
  cursor?: string;
  /** Separate fixed-snapshot inventory continuation; never a cohort member cursor. */
  inventoryCursor?: string;
  year?: number;
  /** Opt-in observed native shapes only; never enables record/fitness rankings. */
  geometryPolicy?: MatchedRouteGeometryPolicy;
}
export type MatchedRouteRankingExclusion = 'inventory_discovery_only' | 'observed_geometry_only' | 'metric_unavailable' | 'partial_terminal' | 'null_or_zero_speed';
export interface ActivityMatchedRouteGroupMember {
  activityId: string; startTime: number; year: number; isAnchor: boolean;
  canonicalAverage: ActivityCanonicalAverage;
  rankingEligible: boolean; rankingExclusionReason: MatchedRouteRankingExclusion | null;
}
export type MatchedRouteTrend = { state: 'available'; basis: 'canonical_avg_speed_kph'; count: number;
  window: { fromInclusive: number; toInclusive: number }; slopePerDay: number } | {
  state: 'insufficient'; basis: 'canonical_avg_speed_kph'; count: number;
  reason: 'insufficient_distinct_dates' | 'non_finite';
};
export interface MatchedRouteMetricSummary {
  memberCount: number; knownMetricCount: number; rankEligibleCount: number;
  fastestActivityIds: string[]; trend: MatchedRouteTrend;
}
export interface ActivityMatchedRouteGroupSummary extends MatchedRouteMetricSummary {
  /** 연도별 값도 전체 bounded cluster에서만 계산한다. */
  years: Array<MatchedRouteMetricSummary & { year: number }>;
}
export interface MatchedRouteGroupOmittedCounts {
  unsupportedDescriptor: number; partialGeometry: number; gapGeometry: number;
  changedSource: number; validationCap: number; nonAnchorCluster: number;
}
export interface ActivityMatchedRouteGroupResponse {
  mode: 'matched_route_group_page' | 'matched_route_inventory_page'; anchorActivityId: string; discipline: 'bike' | 'run';
  state: 'available' | 'index_missing' | 'anchor_unsupported' | 'changed_input' | 'expired' | 'budget_partial';
  readTime: { seconds: number; nanoseconds: number }; expiresAt: number;
  groupToken: string | null; nextCursor: string | null;
  scope: { kind: 'bounded_owner_stored_index_cohort' | 'bounded_owner_stored_index_inventory'; indexQueryPolicy: 'document_id_first20_v1' | 'document_id_continuation_v1';
    groupPolicy: 'anchor-pair-observation-v1' | 'observed-complete-link-v1' | 'observed-native-complete-link-v1'; descriptorLimit: 20 | 5; validatedLimit: 6 };
  coverage: { indexCohort: 'exhausted' | 'descriptor_capped' | 'not_inspected'; sourceValidation: 'complete_in_cohort' | 'validation_capped' | 'omitted' | 'not_inspected';
    wholeHistory: 'unknown'; geometry: 'observed_complete_gap_free' | 'observed_gap_free_coverage_unproven' | 'unavailable'; gpsAccuracy: 'unknown'; deduplication: 'unknown' };
  ownerHistoryReadiness?: OwnerRouteHistoryReadiness;
  inventory?: { nextCursor: string | null; exhausted: boolean; scannedCount: number; year: number | null; matchingBasis: 'anchor_pairwise' };
  omittedCounts: MatchedRouteGroupOmittedCounts;
  /** member page와 별개로 summary는 전체 bounded anchor cluster 기준이다. */
  members: ActivityMatchedRouteGroupMember[]; summary: ActivityMatchedRouteGroupSummary | null;
  io: { logicalDocuments: number; metadataRequests: number; descriptorComparisons: number; rawDownloads: 0; writes: 0 };
}

/** Observational owner inventory, never a whole-history PB certificate. */
export interface OwnerRouteHistoryReadiness {
  state: 'scanning' | 'traversed' | 'invalidated';
  /** Milliseconds of last committed scan page; invalidation preserves this timestamp and counts. */
  asOf: number;
  scanned: number;
  /** Stored owner-bound index observed; NOT current source validation. */
  indexed: number;
  missing: number;
  /** Capture completeness unproven; overlaps indexed/missing. */
  unknown: number;
  consistency: 'current_owner_seek_pages';
  personalBest: 'unavailable';
}
