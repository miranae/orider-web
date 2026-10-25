import { loadActivityDiscovery } from "./activityDiscovery";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { collection, getDocs, limit, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../components/WeeklyChart";
import { firestore } from "./firebase";
import { resolveDuration } from "../utils/activityTime";
import { acceptedTrainingActivities, acceptedStatsActivities, sumAcceptedActivityTss } from "../utils/estimateTSS";

const PAGE_SIZE = 200;

export async function loadAthleteChartActivities(
  userId: string,
  isOwnProfile: boolean,
  cancelled: () => boolean,
  services?: FirebaseServices,
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
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  while (!cancelled()) {
    // 기본 문서 ID 정렬: startTime이 없는 레거시 문서도 누락하지 않는다.
    const snap = await getDocs(query(collection(firestore, "activities"),
      where("userId", "==", userId),
      where("deletedAt", "==", null),
      ...(!isOwnProfile ? [where("visibility", "==", "everyone")] : []),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE),
    ));
    if (cancelled()) return null;
    for (const doc of snap.docs) {
      const activity = { ...doc.data(), id: doc.id } as Activity;
      activities.push(activity);
    }
    if (snap.docs.length < PAGE_SIZE) return activities;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return null;
}

export function aggregateMonthlyActivities(activities: Activity[], now = new Date(), alreadyAccepted = false): WeeklyStat[] {
  const months = new Map<number, WeeklyStat>();
  const membersByMonth = new Map<number, Activity[]>();
  for (const activity of alreadyAccepted ? activities : acceptedTrainingActivities(activities)) {
    if (!Number.isFinite(activity.startTime) || activity.startTime <= 0) continue;
    const date = new Date(activity.startTime);
    const month = date.getFullYear() * 12 + date.getMonth();
    const members = membersByMonth.get(month) ?? [];
    members.push(activity); membersByMonth.set(month, members);
    if (!months.has(month)) months.set(month, emptyMonth(month));
  }
  // 조회된 동일 입력셋에서 먼저 대표를 고른다. 기간 경계의 쌍둥이를 두 달에 세지 않는다.
  for (const activity of alreadyAccepted ? activities : acceptedStatsActivities(activities)) {
    if ("discoveryFacts" in activity && (!Number.isFinite(activity.startTime) || activity.startTime <= 0)) continue;
    const timestamp = Number.isFinite(activity.startTime) && activity.startTime > 0
      ? activity.startTime : activity.createdAt;
    const date = new Date(timestamp);
    const summary = activity.summary ?? {};
    if (!Number.isFinite(date.getTime()) || timestamp <= 0) continue;
    const month = date.getFullYear() * 12 + date.getMonth();
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
  const last = Math.max(...months.keys(), now.getFullYear() * 12 + now.getMonth());
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
