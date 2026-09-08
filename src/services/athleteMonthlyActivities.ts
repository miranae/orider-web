import { collection, getDocs, limit, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../components/WeeklyChart";
import { firestore } from "./firebase";
import { resolveDuration } from "../utils/activityTime";
import { estimateTSS } from "../utils/estimateTSS";

const PAGE_SIZE = 200;

export async function loadAthleteChartActivities(
  userId: string,
  isOwnProfile: boolean,
  cancelled: () => boolean,
): Promise<Activity[] | null> {
  const activities: Activity[] = [];
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
      if (activity.summary) activities.push(activity);
    }
    if (snap.docs.length < PAGE_SIZE) return activities;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return null;
}

export function aggregateMonthlyActivities(activities: Activity[], now = new Date()): WeeklyStat[] {
  const months = new Map<number, WeeklyStat>();
  for (const activity of activities) {
    const timestamp = Number.isFinite(activity.startTime) && activity.startTime > 0
      ? activity.startTime : activity.createdAt;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) continue;
    const month = date.getFullYear() * 12 + date.getMonth();
    const row = months.get(month) ?? emptyMonth(month);
    row.distance += Number.isFinite(activity.summary.distance) ? activity.summary.distance / 1000 : 0;
    const duration = resolveDuration(activity.summary).displayMs;
    row.time += Number.isFinite(duration) ? duration / 3600000 : 0;
    row.elevation += Number.isFinite(activity.summary.elevationGain) ? activity.summary.elevationGain : 0;
    row.rides += 1;
    const tss = estimateTSS(activity);
    row.tss += Number.isFinite(tss) ? tss : 0;
    months.set(month, row);
  }
  if (months.size === 0) return [];
  const first = Math.min(...months.keys());
  const last = Math.max(...months.keys(), now.getFullYear() * 12 + now.getMonth());
  return Array.from({ length: last - first + 1 }, (_, i) => months.get(first + i) ?? emptyMonth(first + i));
}

function emptyMonth(month: number): WeeklyStat {
  return {
    week: `${Math.floor(month / 12)}.${String(month % 12 + 1).padStart(2, "0")}`,
    distance: 0, time: 0, elevation: 0, rides: 0, tss: 0,
  };
}
