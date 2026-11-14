import { httpsCallable } from "firebase/functions";
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed -- 일반 웹 GroupEventsPage 일정 API. 클럽 상세 임베드는 dashboard/members/week 경로만 연다.
import { ensureAppCheckReady, functions } from "./firebase";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
export async function getClubCafeSchedule(groupId: string): Promise<ClubCafeSchedule | null> {
  await ensureAppCheckReady();
  const { data } = await httpsCallable<{groupId: string}, {schedule: ClubCafeSchedule | null}>(functions, "getClubCafeSchedule")({groupId});
  const s = data.schedule;
  if (s === null) return null;
  if (!s || s.source !== "naver-cafe" || s.cafeUrl !== "https://cafe.naver.com/clublara" || !Number.isFinite(s.syncedAt) || !Array.isArray(s.entries) || s.entries.length > 250 || s.entries.some(e => !/^https:\/\/cafe\.naver\.com\/clublara\/\d+$/.test(e.url) || !Array.isArray(e.dates) || e.dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error("Invalid cafe schedule");
  return s;
}
