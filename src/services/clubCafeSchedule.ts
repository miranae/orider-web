import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
export async function getClubCafeSchedule(groupId: string): Promise<ClubCafeSchedule | null> {
  await ensureAppCheckReady();
  const { data } = await httpsCallable<{groupId: string}, {schedule: ClubCafeSchedule | null}>(functions, "getClubCafeSchedule")({groupId});
  return parseCafeSchedule(data.schedule);
}
export function parseCafeSchedule(s: ClubCafeSchedule | null): ClubCafeSchedule | null {
  if (s === null) return null;
  if (!s || s.source !== "naver-cafe" || s.cafeUrl !== "https://cafe.naver.com/clublara" || !Number.isFinite(s.syncedAt) || !Array.isArray(s.entries) || s.entries.length > 250 || s.entries.some(e => !/^https:\/\/cafe\.naver\.com\/clublara\/\d+$/.test(e.url) || !Array.isArray(e.dates) || e.dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error("Invalid cafe schedule");
  return s;
}
