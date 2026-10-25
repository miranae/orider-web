import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { SegmentLeaderboardEntry, SegmentLeaderboardRequest, SegmentLeaderboardResponse } from "@shared/types/segment-leaderboard";
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(v);
function entriesValid(rows: SegmentLeaderboardEntry[], segmentId: string): boolean {
  return Array.isArray(rows) && rows.length <= 50 && rows.every(e => e && id(e.id) && id(e.userId) && id(e.activityId) && e.segmentId === segmentId &&
    Number.isFinite(e.elapsedTime) && e.elapsedTime > 0 && Number.isFinite(e.averageSpeed) && e.averageSpeed >= 0 && Number.isFinite(e.startDate) &&
    typeof e.nickname === "string" && e.profileImage === null && [e.averageWatts, e.averageHeartrate].every(v => v === null || Number.isFinite(v)));
}
export function validateSegmentLeaderboard(r: SegmentLeaderboardResponse, request: SegmentLeaderboardRequest) {
  if (!r || !entriesValid(r.entries, request.segmentId) || r.population !== "authorized_native_outdoor_bike" || r.comparisonBasis !== "best_per_rider_in_page" || r.globalRankAvailable !== false ||
      !Number.isInteger(r.scannedCount) || r.scannedCount < r.entries.length || r.scannedCount > 50 || typeof r.limitReached !== "boolean" ||
      !(r.nextCursor === null || typeof r.nextCursor === "string" && r.nextCursor.length > 0 && r.nextCursor.length <= 300000) ||
      !(r.scopeMemberCount === null || Number.isInteger(r.scopeMemberCount) && r.scopeMemberCount >= 0 && r.scopeMemberCount <= 1000) ||
      new Set(r.entries.map(e => e.userId)).size !== r.entries.length || r.entries.some((e, i) => e.averageWatts !== null || e.averageHeartrate !== null || e.averageSpeed > 80 || e.startDate < request.fromMs || e.startDate > request.toMs || i > 0 && r.entries[i - 1]!.elapsedTime > e.elapsedTime)) throw new Error("invalid_leaderboard_response");
  return r;
}
async function invoke<T>(services: FirebaseServices, uid: string, name: string, data: unknown): Promise<T> {
  const current = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!current()) throw new Error("account_changed");
  await services.ensureAppCheckReady();
  if (!current()) throw new Error("account_changed");
  const result = await httpsCallable<unknown, T>(services.functions, name)(data);
  if (!current()) throw new Error("account_changed");
  return result.data;
}
export async function loadSegmentLeaderboard(services: FirebaseServices, uid: string, request: SegmentLeaderboardRequest) {
  return validateSegmentLeaderboard(await invoke<SegmentLeaderboardResponse>(services, uid, "getSegmentLeaderboard", request), request);
}
export async function loadMySegmentAttempts(services: FirebaseServices, uid: string, segmentId: string) {
  const result = await invoke<{ entries: SegmentLeaderboardEntry[] }>(services, uid, "getMySegmentAttempts", { segmentId });
  if (!result || !entriesValid(result.entries, segmentId) || result.entries.some(e => e.userId !== uid)) throw new Error("invalid_owner_attempts");
  return result.entries;
}
