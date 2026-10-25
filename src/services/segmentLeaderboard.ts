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
export const SEGMENT_LEADERBOARD_TIMEOUT_MS = 10000;
async function invoke<T>(services: FirebaseServices, uid: string, name: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const { auth, functions } = services, viewer = auth.currentUser, app = auth.app, functionsApp = functions.app;
  let expired = false;
  const current = () => !expired && !signal?.aborted && !!viewer && !!uid && viewer.uid === uid && !viewer.isAnonymous
    && app === functionsApp && services.auth === auth && auth.app === app && auth.currentUser === viewer && services.functions === functions && functions.app === functionsApp;
  if (!current()) throw new Error("account_changed");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const boundary = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new Error("leaderboard_timeout")); }, SEGMENT_LEADERBOARD_TIMEOUT_MS);
    abort = () => { expired = true; reject(new Error("leaderboard_cancelled")); };
    signal?.addEventListener("abort", abort, { once: true });
  });
  const work = async () => {
    await services.ensureAppCheckReady();
    if (!current()) throw new Error("account_changed");
    const result = await httpsCallable<unknown, T>(functions, name)(data);
    if (!current()) throw new Error("account_changed");
    return result.data;
  };
  try { return await Promise.race([work(), boundary]); }
  finally { clearTimeout(timer); if (abort) signal?.removeEventListener("abort", abort); }
}
export async function loadSegmentLeaderboard(services: FirebaseServices, uid: string, request: SegmentLeaderboardRequest, signal?: AbortSignal) {
  return validateSegmentLeaderboard(await invoke<SegmentLeaderboardResponse>(services, uid, "getSegmentLeaderboard", request, signal), request);
}
export async function loadMySegmentAttempts(services: FirebaseServices, uid: string, segmentId: string) {
  const result = await invoke<{ entries: SegmentLeaderboardEntry[] }>(services, uid, "getMySegmentAttempts", { segmentId });
  if (!result || !entriesValid(result.entries, segmentId) || result.entries.some(e => e.userId !== uid)) throw new Error("invalid_owner_attempts");
  return result.entries;
}
