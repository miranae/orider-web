import { createYearReadSession, readRecapYears, readActivityTimeWindow, type YearReadSession } from "../hooks/yearActivitiesRead";
import { planMonthBounds, planDayStartMs } from "@shared/training/planDate";
import { planCalendarDate } from "@shared/training/planDate";
import { loadActivityDiscovery } from "./activityDiscovery";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../components/WeeklyChart";
import { resolveDuration } from "../utils/activityTime";
import { acceptedTrainingActivities, acceptedStatsActivities, sumAcceptedActivityTss } from "../utils/estimateTSS";


export async function loadAthleteChartActivities(
  userId: string,
  isOwnProfile: boolean,
  cancelled: () => boolean,
  services?: FirebaseServices,
  year = planCalendarDate(Date.now()).getUTCFullYear(),
  session: YearReadSession = createYearReadSession(userId, isOwnProfile ? services : undefined),
): Promise<Activity[] | null> {
  const activities: Activity[] = [];
  if (!isOwnProfile) {
    if (!services) throw new Error("public_activity_services_required");
    let cursor: string | undefined;
    const ids = new Set<string>();
    for (let pageNumber = 0; pageNumber < 10 && !cancelled(); pageNumber++) {
      const page = await loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, order: "id_asc", limit: 20, ...(cursor ? { cursor } : {}) });
      if (cancelled()) return null;
      for (const activity of page.items) {
        if (ids.has(activity.id)) throw new Error("public_activity_inventory_changed");
        ids.add(activity.id); activities.push(activity);
      }
      if (page.exhausted) return activities;
      if (!page.nextCursor || page.nextCursor === cursor) throw new Error("public_activity_inventory_changed");
      cursor = page.nextCursor;
    }
    if (cancelled()) return null;
    throw new Error("public_activity_inventory_incomplete");
  }
  try {
    if (session.owner?.uid !== userId || session.owner !== session.auth.currentUser) throw new Error("athlete-owner-session-changed");
    await readRecapYears(userId, cancelled, session);
    const start = planMonthBounds(year, 0).start, end = planMonthBounds(year + 1, 0).start;
    await readActivityTimeWindow(userId, { start, end }, cancelled, undefined, session, true);
    const today = planDayStartMs(Date.now());
    return readActivityTimeWindow(userId, { start: today - 27 * 86400000, end: today + 86400000 }, cancelled, undefined, session, true);
  } catch (error) { if (cancelled()) return null; throw error; }
}

/** 달력 옵션은 이미 확인한 earliest/latest 원본으로 만들며 중간 빈 연도도 선택할 수 있다. */
export function athleteProfileYears(session: YearReadSession, selectedYear: number) {
  const currentYear = planCalendarDate(Date.now()).getUTCFullYear();
  const years = [...session.docs.values()].map(row => row.data().startTime)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .map(value => planCalendarDate(value).getUTCFullYear()).filter(year => year <= currentYear);
  const first = Math.min(currentYear, selectedYear, ...years);
  return Array.from({ length: currentYear - first + 1 }, (_, index) => currentYear - index);
}

export function aggregateMonthlyActivities(activities: Activity[], now = new Date(), alreadyAccepted = false): WeeklyStat[] {
  const months = new Map<number, WeeklyStat>();
  const membersByMonth = new Map<number, Activity[]>();
  for (const activity of alreadyAccepted ? activities : acceptedTrainingActivities(activities)) {
    if (!Number.isFinite(activity.startTime) || activity.startTime <= 0) continue;
    const date = planCalendarDate(activity.startTime);
    const month = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const members = membersByMonth.get(month) ?? [];
    members.push(activity); membersByMonth.set(month, members);
    if (!months.has(month)) months.set(month, emptyMonth(month));
  }
  // 조회된 동일 입력셋에서 먼저 대표를 고른다. 기간 경계의 쌍둥이를 두 달에 세지 않는다.
  for (const activity of alreadyAccepted ? activities : acceptedStatsActivities(activities)) {
    if ("discoveryFacts" in activity && (!Number.isFinite(activity.startTime) || activity.startTime <= 0)) continue;
    const timestamp = Number.isFinite(activity.startTime) && activity.startTime > 0
      ? activity.startTime : activity.createdAt;
    const date = planCalendarDate(timestamp);
    const summary = activity.summary ?? {};
    if (!Number.isFinite(date.getTime()) || timestamp <= 0) continue;
    const month = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const row = months.get(month) ?? emptyMonth(month);
    row.distance += Number.isFinite(summary.distance) ? summary.distance / 1000 : 0;
    const duration = resolveDuration(summary).displayMs;
    row.time += Number.isFinite(duration) ? duration / 3600000 : 0;
    row.elevation += Number.isFinite(summary.elevationGain) ? summary.elevationGain : 0;
    row.rides += 1;
    months.set(month, row);

  }
  for (const [month, row] of months) {
    const members = membersByMonth.get(month) ?? [];
    const load = sumAcceptedActivityTss(members);
    row.tss = load.value;
    row.tssEstimated = load.estimated;
    row.tssUnknownCount = load.unknownCount;
  }
  if (months.size === 0) return [];
  const first = Math.min(...months.keys());
  const last = Math.max(...months.keys(), planCalendarDate(now.getTime()).getUTCFullYear() * 12 + planCalendarDate(now.getTime()).getUTCMonth());
  return Array.from({ length: last - first + 1 }, (_, i) => months.get(first + i) ?? emptyMonth(first + i));
}

function emptyMonth(month: number): WeeklyStat {
  return {
    week: `${Math.floor(month / 12)}.${String(month % 12 + 1).padStart(2, "0")}`,
    distance: 0, time: 0, elevation: 0, rides: 0,
    // 활동이 없거나 아는 부하가 하나도 없는 달은 null — 빈 슬롯으로 그려진다.
    tss: null, tssEstimated: false, tssUnknownCount: 0,
  };
}
