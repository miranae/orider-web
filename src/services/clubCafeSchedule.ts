import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { ClubCafeSchedule } from "@shared/clubCafeSchedule";
export async function getClubCafeSchedule(groupId: string, services: Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">): Promise<ClubCafeSchedule | null> {
  const viewer = services.auth.currentUser;
  await services.ensureAppCheckReady();
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  const { data } = await httpsCallable<{groupId: string}, {schedule: ClubCafeSchedule | null}>(services.functions, "getClubCafeSchedule")({groupId});
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  const s = data.schedule;
  if (s === null) return null;
  if (!s || s.source !== "naver-cafe" || s.cafeUrl !== "https://cafe.naver.com/clublara" || !Number.isFinite(s.syncedAt) || !Array.isArray(s.entries) || s.entries.length > 250 || s.entries.some(e => !/^https:\/\/cafe\.naver\.com\/clublara\/\d+$/.test(e.url) || !Array.isArray(e.dates) || e.dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error("Invalid cafe schedule");
  return s;
}
