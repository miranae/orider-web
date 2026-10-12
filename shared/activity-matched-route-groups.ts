import type { ActivityCanonicalAverage } from './activity-route-comparison';

/** 고정된 저장 index cohort 정책이며 전체 이력·같은 도로·물리 주행 중복 제거 증거가 아니다. */
export const MATCHED_ROUTE_GROUP_LIMITS = Object.freeze({ descriptorLimit: 20, queryLookahead: 1,
  validatedLimit: 6, comparedPairs: 15, memberPageSize: 5, documents: 200, metadata: 40, ttlMs: 30 * 60 * 1000 });
export interface ActivityMatchedRouteGroupRequest {
  mode: 'matched_route_group_page'; anchorActivityId: string; discipline: 'bike' | 'run';
  /** 이후 reader가 인증하는 opaque 값. 클라이언트 membership/좌표를 담지 않는다. */
  cursor?: string;
}
export type MatchedRouteRankingExclusion = 'metric_unavailable' | 'partial_terminal' | 'null_or_zero_speed';
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
  mode: 'matched_route_group_page'; anchorActivityId: string; discipline: 'bike' | 'run';
  state: 'available' | 'index_missing' | 'anchor_unsupported' | 'changed_input' | 'expired' | 'budget_partial';
  readTime: { seconds: number; nanoseconds: number }; expiresAt: number;
  groupToken: string | null; nextCursor: string | null;
  scope: { kind: 'bounded_owner_stored_index_cohort'; indexQueryPolicy: 'document_id_first20_v1';
    groupPolicy: 'observed-complete-link-v1'; descriptorLimit: 20; validatedLimit: 6 };
  coverage: { indexCohort: 'exhausted' | 'descriptor_capped' | 'not_inspected'; sourceValidation: 'complete_in_cohort' | 'validation_capped' | 'omitted' | 'not_inspected';
    wholeHistory: 'unknown'; geometry: 'observed_complete_gap_free' | 'unavailable'; gpsAccuracy: 'unknown'; deduplication: 'unknown' };
  omittedCounts: MatchedRouteGroupOmittedCounts;
  /** member page와 별개로 summary는 전체 bounded anchor cluster 기준이다. */
  members: ActivityMatchedRouteGroupMember[]; summary: ActivityMatchedRouteGroupSummary | null;
  io: { logicalDocuments: number; metadataRequests: number; descriptorComparisons: number; rawDownloads: 0; writes: 0 };
}
