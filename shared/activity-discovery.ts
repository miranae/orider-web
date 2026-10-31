/** First-party safe discovery. Each page is currently authorized; seek pagination is not a fixed whole-history snapshot. */
export interface ActivityDiscoveryRequest {
  scope: 'all' | 'friends' | 'following' | 'self' | 'athlete' | 'groupRide';
  targetUid?: string; rideId?: string; keyword?: string;
  /** Owner anchor only; emits only reciprocal confirmed v3 co-riders. */
  anchorActivityId?: string;
  fromInclusive?: number; toExclusive?: number; limit?: number; cursor?: string;
  /** Athlete chart inventory only: includes undated rows, unlike startTime order. */
  order?: 'startTime_desc' | 'id_asc';
  /**
   * 홈 피드 종목 필터. 서버 쿼리가 `type in [저장 표기]` 로 거른다(클라이언트 사후 필터 아님).
   * 피드 범위(all·friends·following·self)의 시간순 조회에서만 받는다 — 검색 키워드와는 함께 쓰지 않는다.
   */
  discipline?: 'bike' | 'run' | 'swim';
}
export interface ActivityDiscoveryActivity {
  id: string; userId: string; nickname: string; profileImage: string | null; type: string;
  discipline: 'bike' | 'run' | 'swim' | null; source: 'orider' | 'strava' | 'file' | 'unknown';
  startTime: number; endTime: number; createdAt: number; description: string; visibility: string;
  photoCount: number; kudosCount: number; commentCount: number; externalId: null;
  summary: Record<string, number>; summarySource: 'recorded';
  effectiveFacts: { source: 'activity_metrics'; status: string; inputRevision: string | null; computedAt: number | null;
    coverage: string | null; thresholdBasis: null; powerSource: 'measured' | 'estimated' | 'unknown' | null; metrics: Record<string, number | null> | null };
}
export interface ActivityDiscoveryItem {
  /** Exact current viewer membership, not inferred from the bounded recent avatar list. */
  viewerHasKudos: boolean;
  /** Opaque activity/metric/repair revision. No paths or source fields. */
  presentationRevision: string;
  anchorBoundCoRider?: true;
  generatedSummary?: {text:{ko:string;en:string};formatterVersion:string;inputDigest:string};
  activity: ActivityDiscoveryActivity;
  content: { status: 'ready'; memo: string | null; memoTruncated: boolean;
    photos: Array<{id:string;url:string;caption:string|null;nativePhoto?:{activityId:string;photoId:string};kind?:'video';videoUrl?:string;durationSeconds?:number}>;
    totalPhotoCount:number;totalPhotoCountExact:boolean } | {status:'pending'};
  mapPreview: {imageUrl:string|null;encodedPolyline:string|null};
}
export interface ActivityDiscoveryResponse {
  items: ActivityDiscoveryItem[]; nextCursor: string | null; exhausted: boolean; scannedCount: number;
  totalCount: null; expiresAt: number; order: 'startTime_desc' | 'id_asc'; includesUndated: boolean;
  consistency: 'current_authorized_seek_pages';
}
