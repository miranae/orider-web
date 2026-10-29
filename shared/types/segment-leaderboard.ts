/** Server verified native outdoor cycling records. No global rank is inferred from a page. */
export interface SegmentLeaderboardRequest {
  segmentId: string;
  fromMs: number;
  toMs: number;
  scope: "all" | "following" | "club";
  clubId?: string;
  cursor?: string;
}
export interface SegmentLeaderboardEntry {
  id: string; segmentId: string; activityId: string; userId: string; nickname: string;
  profileImage: null; elapsedTime: number; averageSpeed: number; startDate: number;
  averageWatts: number | null; averageHeartrate: number | null;
}
export interface SegmentLeaderboardResponse {
  entries: SegmentLeaderboardEntry[];
  nextCursor: string | null;
  scannedCount: number;
  limitReached: boolean;
  population: "authorized_native_outdoor_bike";
  comparisonBasis: "best_per_rider_in_page";
  scopeMemberCount: number | null;
  globalRankAvailable: false;
}
