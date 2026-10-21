import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { auth, firestore } from "./firebase";
import { acceptedStatsActivities } from "../utils/estimateTSS";
import { seoulWeekStartMs, WEEK_MS } from "../utils/seoulWeek";
import { profileWeeklyStreak } from "../utils/profileWeeklyStreak";

function assertOwner(uid: string) {
  if (!uid || auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous) throw new Error("profile-activity-owner-required");
}
export function buildProfileActivitySummary(latestRows: Activity[], recentRows: Activity[], now: number) {
  const valid = (rows: Activity[]) => acceptedStatsActivities(rows.filter(activity => {
    const record = activity as Activity & { _stravaImportPending?: unknown; rollupSupersededBy?: unknown };
    return activity.summary != null && Number.isFinite(activity.startTime) && activity.startTime > 0
      && activity.startTime <= now && !record._stravaImportPending && !record.rollupSupersededBy;
  }));
  const latest = valid(latestRows).sort((a, b) => b.startTime - a.startTime)[0] ?? null;
  const limited = recentRows.length > 400;
  const bounded = recentRows.slice(0, 400);
  const cutoff = seoulWeekStartMs(now) - 51 * WEEK_MS;
  const oldest = bounded[bounded.length - 1]?.startTime;
  const coveredSince = limited ? Math.max(cutoff, typeof oldest === "number" && Number.isFinite(oldest) ? oldest + 1 : now) : cutoff;
  return { latest, latestComplete: latest != null || latestRows.length < 20, limited,
    ...profileWeeklyStreak(valid(bounded).map(activity => activity.startTime), coveredSince, now) };
}
type Summary = ReturnType<typeof buildProfileActivitySummary>;
let cached: { uid: string; expires: number; promise: Promise<Summary> } | null = null;

export async function readOwnProfileActivitySummary(uid: string) {
  assertOwner(uid);
  const now = Date.now();
  if (!cached || cached.uid !== uid || cached.expires <= now) {
    const own = [where("userId", "==", uid), where("deletedAt", "==", null)];
    // 피드 필터와 분리한 제한 조회. 계정별 2분 캐시 하나와 진행 중 요청을 공유한다.
    const promise = Promise.all([
      getDocs(query(collection(firestore, "activities"), ...own, orderBy("startTime", "desc"), limit(20))),
      getDocs(query(collection(firestore, "activities"), ...own, where("startTime", ">=", seoulWeekStartMs(now) - 51 * WEEK_MS),
        orderBy("startTime", "desc"), limit(401))),
    ]).then(([latest, recent]) => {
      assertOwner(uid);
      if (latest.metadata?.fromCache || recent.metadata?.fromCache) throw new Error("profile-activity-server-confirmation-required");
      const rows = (docs: typeof latest.docs) => docs.map(row => ({ ...row.data(), id: row.id }) as Activity).filter(activity => activity.userId === uid);
      return buildProfileActivitySummary(rows(latest.docs), rows(recent.docs), now);
    });
    cached = { uid, expires: now + 120000, promise };
    void promise.catch(() => { if (cached?.promise === promise) cached = null; });
  }
  const summary = await cached.promise;
  assertOwner(uid);
  return summary;
}
