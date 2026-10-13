import type { ActivityCanonicalAverage } from "./activity-route-comparison";
import type { ObservedRouteIndexMatch } from "./activity-route-index";

export interface ActivityRouteIndexCursor {
  readTime: { seconds: number; nanoseconds: number };
  anchorPrivateSourceRevision: string;
  policyVersion: "observed-route-index-v1";
  queryPolicyVersion: "start-latitude-band-v1";
  after: { startLatitude: number; activityId: string };
  scannedCount: number;
  requestBinding: string;
}
export interface ActivityRouteIndexPageRequest {
  mode: "route_index_page";
  anchorActivityId: string;
  discipline: "bike" | "run";
  cursor?: ActivityRouteIndexCursor;
}
export interface ActivityRouteIndexPageResponse {
  mode: "route_index_page";
  anchorActivityId: string;
  state: "available" | "index_missing" | "changed_input" | "unsupported_source" | "budget_partial" | "no_forward_candidates_in_scanned_page";
  reason: string | null;
  readTime: ActivityRouteIndexCursor["readTime"];
  expiresAt: number;
  searchScope: { kind: "stored_index_start_latitude_band"; queryPolicyVersion: "start-latitude-band-v1" };
  scannedCount: number;
  pageScannedCount: number;
  queryFetchedCount: number;
  /** 저장 형태의 정방향 prefilter 제외 수. 현재 원본 검증 수가 아니다. */
  geometryPrefilteredCount: number;
  /** 후보 중 최종 현재 소유권·source 검증까지 통과한 수. */
  sourceValidatedCount: number;
  nextCursor: ActivityRouteIndexCursor | null;
  exhausted: boolean;
  scanCapReached: boolean;
  candidates: Array<{ activityId: string; startTime: number; match: Extract<ObservedRouteIndexMatch, { state: "available" }>;
    canonicalAverage: ActivityCanonicalAverage }>;
  omitted: Array<{ activityId: string; state: "changed_input" | "unsupported_source" | "validation_budget_exceeded" | "stored_geometry_not_forward_unverified" }>;
  io: { documents: number; metadata: number; rawDownloads: 0; writes: 0 };
  limitations: ["direct_anchor_only", "scanned_page_only", "source_geo_quality_unknown", "gcs_firestore_non_atomic"];
}
