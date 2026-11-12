import { collection, getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { physicalRideMovingSeconds } from "@shared/training/physicalRideEvidence";
import { isStatsCountable } from "@shared/training/activityStatsEligibility";
import { disciplineOfType } from "@shared/sport/discipline";
import { firestore } from "../services/firebase";
import { isSamePhysicalRide, type PhysicalRideIdentity } from "../utils/samePhysicalRide";

export const YEAR_READ_BUDGET = { documents: 10_000, requests: 1200, pageSize: 250 };

export function localYearBounds(year: number) {
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

/** 빈 페이지도 요청 예산에 포함하며 EOF 미확인 결과는 성공으로 반환하지 않는다. */
function reader(uid: string, cancelled: () => boolean, budget = YEAR_READ_BUDGET) {
  let documents = 0;
  let requests = 0;
  const read = async (constraints: QueryConstraint[], size: number) => {
    if (cancelled()) throw new Error("year-read-cancelled");
    const remaining = budget.documents - documents;
    if (requests >= budget.requests || remaining <= 0) throw new Error("year-read-budget-exceeded");
    const count = Math.min(size, remaining);
    requests++;
    const snapshot = await getDocs(query(collection(firestore, "activities"),
      where("userId", "==", uid), where("deletedAt", "==", null), ...constraints, limit(count)));
    if (cancelled()) throw new Error("year-read-cancelled");
    documents += snapshot.docs.length;
    return { docs: snapshot.docs, count };
  };
  return {
    point: async (constraints: QueryConstraint[]) => (await read(constraints, 1)).docs[0],
    all: async (constraints: QueryConstraint[]) => {
      const docs: QueryDocumentSnapshot[] = [];
      let cursor: QueryDocumentSnapshot | undefined;
      for (;;) {
        const page = await read([...constraints, ...(cursor ? [startAfter(cursor)] : [])], budget.pageSize);
        docs.push(...page.docs);
        if (page.docs.length < page.count) return docs;
        const next = page.docs[page.docs.length - 1]!;
        if (next.id === cursor?.id) throw new Error("year-read-cursor-stalled");
        cursor = next;
      }
    },
  };
}

/** 집계값이 아닌 선택 가능한 로컬 달력 범위. 중간의 빈 연도도 선택 가능하다. */
export async function readRecapYears(uid: string, cancelled: () => boolean): Promise<number[]> {
  const read = reader(uid, cancelled, { documents: 2, requests: 2, pageSize: 1 });
  const bounds = [where("startTime", ">=", new Date(2000, 0, 1).getTime()), where("startTime", "<", localYearBounds(new Date().getFullYear()).end)];
  const first = await read.point([...bounds, orderBy("startTime", "asc"), orderBy("__name__", "asc")]);
  const last = await read.point([...bounds, orderBy("startTime", "desc"), orderBy("__name__", "desc")]);
  if (!first || !last) return [new Date().getFullYear()];
  const earliest = new Date(first.data().startTime).getFullYear();
  const latest = new Date(last.data().startTime).getFullYear();
  return Array.from({ length: latest - earliest + 1 }, (_, index) => latest - index);
}

function identity(activity: Activity): PhysicalRideIdentity {
  return { ...activity, sportFamily: disciplineOfType(activity.type) ?? activity.type,
    movingSec: physicalRideMovingSeconds(activity as unknown as Record<string, unknown>) };
}

function intervalEnd(activity: Activity) {
  return Number.isFinite(activity.endTime) && activity.endTime! > activity.startTime
    ? activity.endTime! : activity.startTime + (physicalRideMovingSeconds(activity as unknown as Record<string, unknown>) ?? 0) * 1000;
}

/** 선택 연도에서 실제 구간·식별 링크로 연결된 후보를 예산 내에 읽고 기존 정본으로 집계한다. */
export async function readYearActivities(uid: string, year: number, cancelled: () => boolean, budget = YEAR_READ_BUDGET): Promise<Activity[]> {
  const read = reader(uid, cancelled, budget);
  const { start, end } = localYearBounds(year);
  const items = new Map<string, Activity>();
  const add = (docs: QueryDocumentSnapshot[]) => {
    for (const doc of docs) {
      const activity = { ...doc.data(), id: doc.id } as Activity & { invalidSummary?: unknown };
      if (activity.summary != null && !activity.deletedAt && !activity.invalidSummary && isStatsCountable(activity)) items.set(doc.id, activity);
    }
  };
  const range = (low: number, high: number) => read.all([where("startTime", ">=", low), where("startTime", "<", high), orderBy("startTime", "asc"), orderBy("__name__", "asc")]);
  add(await range(start, end));
  if (!items.size) return [];
  // endTime 없는 기록의 최대 구간 길이는 실제 duration 최댓값으로 구한다.
  let maxDurationMs = 0;
  for (const [field, multiplier] of [["movingTimeSec", 1000], ["movingTimeMillis", 1], ["ridingTimeMillis", 1], ["elapsedTimeMillis", 1]] as const) {
    const doc = await read.point([where(`summary.${field}`, ">", 0), orderBy(`summary.${field}`, "desc"), orderBy("__name__", "desc")]);
    if (!doc) continue;
    const value = doc.data().summary?.[field];
    if (typeof value !== "number" || !Number.isFinite(value * multiplier)) throw new Error("year-read-invalid-duration-bound");
    maxDurationMs = Math.max(maxDurationMs, value * multiplier);
  }
  const connected = new Set(items.keys());
  const searchedKeys = new Set<string>();
  let coveredLow = start;
  let coveredHigh = end;
  let crossedLow = Infinity;
  for (;;) {
    // 키 공유·시간 중첩의 전이적 성분을 탐색하되 대표 선택은 기존 정본에 맡긴다.
    let changed = true;
    while (changed) {
      changed = false;
      for (const activity of items.values()) {
        if (connected.has(activity.id)) continue;
        if ([...connected].some((id) => isSamePhysicalRide(identity(items.get(id)!), identity(activity)))) {
          connected.add(activity.id);
          changed = true;
        }
      }
    }
    const members = [...connected].map((id) => items.get(id)!);
    const low = Math.min(start, ...members.map((a) => a.startTime));
    const high = Math.max(end, ...members.map(intervalEnd));
    let expanded = false;
    if (low - maxDurationMs < coveredLow) {
      add(await range(low - maxDurationMs, coveredLow));
      coveredLow = low - maxDurationMs;
      expanded = true;
    }
    if (high > coveredHigh) {
      add(await range(coveredHigh, high));
      coveredHigh = high;
      expanded = true;
    }
    if (low < crossedLow) {
      // 명시적 endTime이 긴 기록은 duration 폴백 범위 밖에서도 찾는다.
      add(await read.all([where("startTime", "<", low), where("endTime", ">=", low),
        orderBy("endTime", "asc"), orderBy("startTime", "asc"), orderBy("__name__", "asc")]));
      crossedLow = low;
      expanded = true;
    }
    const pendingKeys = new Map<string, (string | number)[]>();
    for (const activity of members) {
      for (const [field, value] of [["localSessionId", activity.localSessionId], ["stravaActivityId", activity.stravaActivityId], ["stravaTwinActivityId", activity.stravaTwinActivityId]] as const) {
        if ((typeof value !== "string" || !value.length) && (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) continue;
        const fields = field === "localSessionId" ? [field] : ["stravaActivityId", "stravaTwinActivityId"];
        for (const target of fields) {
          const key = `${target}:${value}`;
          if (searchedKeys.has(key)) continue;
          searchedKeys.add(key);
          const values = pendingKeys.get(target) ?? [];
          values.push(value);
          pendingKeys.set(target, values);
        }
      }
    }
    for (const [target, values] of pendingKeys) {
      for (let offset = 0; offset < values.length; offset += 30) {
        const constraints = [where(target, "in", values.slice(offset, offset + 30))];
        // 이미 EOF까지 읽은 연속 시간 범위는 식별 조회에서도 다시 읽지 않는다.
        for (const outside of [where("startTime", "<", coveredLow), where("startTime", ">=", coveredHigh)]) {
          add(await read.all([...constraints, outside, orderBy("startTime", "asc"), orderBy("__name__", "asc")]));
        }
        expanded = true;
      }
    }
    if (!expanded) return [...items.values()];
  }
}

/** 사용자가 누적 기록을 직접 펼쳤을 때만 호출하는 별도 유한 조회. */
export async function readLifetimeActivities(uid: string, cancelled: () => boolean, budget = YEAR_READ_BUDGET): Promise<Activity[]> {
  const docs = await reader(uid, cancelled, budget).all([orderBy("createdAt", "desc"), orderBy("__name__", "desc")]);
  return docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Activity).filter((activity) => activity.summary != null);
}
