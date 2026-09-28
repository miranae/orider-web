import { collection, getDocs, limit, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../components/WeeklyChart";
import { firestore } from "./firebase";
import { resolveDuration } from "../utils/activityTime";
import { acceptedTrainingActivities, sumActivityTss } from "../utils/estimateTSS";

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
      activities.push(activity);
    }
    if (snap.docs.length < PAGE_SIZE) return activities;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return null;
}

export function aggregateMonthlyActivities(activities: Activity[], now = new Date()): WeeklyStat[] {
  const months = new Map<number, WeeklyStat>();
  const membersByMonth = new Map<number, Activity[]>();
  // 조회된 동일 입력셋에서 먼저 대표를 고른다. 기간 경계의 쌍둥이를 두 달에 세지 않는다.
  const loadIds = new Set(acceptedTrainingActivities(activities).map((activity) => activity.id));
  for (const activity of activities) {
    const timestamp = Number.isFinite(activity.startTime) && activity.startTime > 0
      ? activity.startTime : activity.createdAt;
    const date = new Date(timestamp);
    const summary = activity.summary ?? {};
    if (!Number.isFinite(date.getTime())) continue;
    const month = date.getFullYear() * 12 + date.getMonth();
    const row = months.get(month) ?? emptyMonth(month);
    row.distance += Number.isFinite(summary.distance) ? summary.distance / 1000 : 0;
    const duration = resolveDuration(summary).displayMs;
    row.time += Number.isFinite(duration) ? duration / 3600000 : 0;
    row.elevation += Number.isFinite(summary.elevationGain) ? summary.elevationGain : 0;
    row.rides += 1;
    months.set(month, row);
    if (loadIds.has(activity.id)) {
      const members = membersByMonth.get(month) ?? [];
      members.push(activity);
      membersByMonth.set(month, members);
    }
  }
  for (const [month, row] of months) {
    const members = membersByMonth.get(month) ?? [];
    const load = sumActivityTss(members);
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
