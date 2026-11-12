import { collection, getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { physicalRideMovingSeconds } from "@shared/training/physicalRideEvidence";
import { isStatsCountable } from "@shared/training/activityStatsEligibility";
import { disciplineOfType } from "@shared/sport/discipline";
import { auth, firestore } from "../services/firebase";
import { isSamePhysicalRide, type PhysicalRideIdentity } from "../utils/samePhysicalRide";

export const YEAR_READ_BUDGET = { documents: 10_000, requests: 1200, pageSize: 250 };
type Interval = { start: number; end: number };
type PageState = { docs: QueryDocumentSnapshot[]; complete: boolean; cursor?: QueryDocumentSnapshot };
export function localYearBounds(year: number) {
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

/** 이전 전체 snapshot과 같은 mount 수명. 전역/영구 캐시가 아니며 인증 교체 뒤 재사용하지 않는다. */
export function createYearReadSession(uid: string) {
  return { uid, owner: auth.currentUser, valid: true, docs: new Map<string, QueryDocumentSnapshot>(),
    coverage: [] as Interval[], queries: new Map<string, PageState>(), years: null as number[] | null, duration: null as number | null, crossings: new Map<string, number>() };
}
export type YearReadSession = ReturnType<typeof createYearReadSession>;
function missing(coverage: Interval[], requested: Interval): Interval[] {
  let cursor = requested.start;
  const result: Interval[] = [];
  for (const interval of coverage) {
    if (interval.end <= cursor || interval.start >= requested.end) continue;
    if (interval.start > cursor) result.push({ start: cursor, end: Math.min(interval.start, requested.end) });
    cursor = Math.max(cursor, interval.end);
    if (cursor >= requested.end) break;
  }
  if (cursor < requested.end) result.push({ start: cursor, end: requested.end });
  return result;
}
function cover(session: YearReadSession, interval: Interval) {
  if (interval.start >= interval.end) return;
  const merged: Interval[] = [];
  for (const row of [...session.coverage, interval].sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && previous.end >= row.start) previous.end = Math.max(previous.end, row.end);
    else merged.push({ ...row });
  }
  session.coverage = merged;
}
// 내림차순 point와 같은 시각의 미조회 ID는 coverage에 넣지 않는다.
function afterTimestamp(time: number) {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, time);
  buffer.setBigUint64(0, buffer.getBigUint64(0) + (time >= 0 ? 1n : -1n));
  return time === 0 ? Number.MIN_VALUE : buffer.getFloat64(0);
}
function reader(uid: string, cancelled: () => boolean, budget = YEAR_READ_BUDGET, session = createYearReadSession(uid)) {
  let charged = 0;
  let requests = 0;
  const current = () => {
    if (cancelled() || !session.valid || session.uid !== uid || session.owner !== auth.currentUser) throw new Error("year-read-cancelled");
  };
  const read = async (constraints: QueryConstraint[], size: number) => {
    current();
    const remaining = budget.documents - charged;
    if (requests >= budget.requests || remaining <= 0) throw new Error("year-read-budget-exceeded");
    const count = Math.min(size, remaining);
    requests++;
    const snapshot = await getDocs(query(collection(firestore, "activities"),
      where("userId", "==", uid), where("deletedAt", "==", null), ...constraints, limit(count)));
    current();
    charged += Math.max(1, snapshot.docs.length);
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.userId !== uid || data.deletedAt != null) throw new Error("year-read-owner-mismatch");
      const old = session.docs.get(doc.id);
      if (old && JSON.stringify(old.data()) !== JSON.stringify(data)) {
        session.valid = false;
        throw new Error("year-read-inventory-changed");
      }
      session.docs.set(doc.id, doc);
    }
    return { docs: snapshot.docs, count };
  };
  const all = async (key: string, constraints: QueryConstraint[]) => {
    current();
    let state = session.queries.get(key);
    if (!state) { state = { docs: [], complete: false }; session.queries.set(key, state); }
    while (!state.complete) {
      const page = await read([...constraints, ...(state.cursor ? [startAfter(state.cursor)] : [])], budget.pageSize);
      state.docs.push(...page.docs);
      if (page.docs.length < page.count) state.complete = true;
      else {
        const next = page.docs[page.docs.length - 1]!;
        if (next.id === state.cursor?.id) throw new Error("year-read-cursor-stalled");
        state.cursor = next;
      }
    }
    return state.docs;
  };
  return { session, current, read, all,
    point: async (key: string, constraints: QueryConstraint[]) => {
      current();
      if (!session.queries.has(key)) session.queries.set(key, { docs: (await read(constraints, 1)).docs, complete: true });
      return session.queries.get(key)!.docs[0];
    },
    range: async (requested: Interval) => {
      for (const gap of missing(session.coverage, requested)) {
        const bounds = [...(Number.isFinite(gap.start) ? [where("startTime", ">=", gap.start)] : []),
          ...(Number.isFinite(gap.end) ? [where("startTime", "<", gap.end)] : [])];
        await all(`range:${gap.start}:${gap.end}`, [...bounds, orderBy("startTime", "asc"), orderBy("__name__", "asc")]);
        cover(session, gap);
      }
    },
  };
}

/** 전체 원본을 버리지 않고 달력 endpoint와 조회한 외곽 구간의 증거로 보관한다. */
export async function readRecapYears(uid: string, cancelled: () => boolean, session = createYearReadSession(uid)): Promise<number[]> {
  const read = reader(uid, cancelled, { documents: 3, requests: 2, pageSize: 2 }, session);
  read.current();
  if (session.years) return session.years;
  const first = await read.point("calendar:first", [orderBy("startTime", "asc"), orderBy("__name__", "asc")]);
  const tail = await read.read([orderBy("startTime", "desc"), orderBy("__name__", "desc")], 2);
  if ([...(first ? [first] : []), ...tail.docs].some(doc => !Number.isFinite(doc.data().startTime))) throw new Error("year-read-invalid-calendar");
  const currentYear = new Date().getFullYear();
  if (!first || tail.docs.length < 2) cover(session, { start: -Infinity, end: Infinity });
  else {
    const firstTime = first.data().startTime;
    const lastTime = tail.docs[tail.docs.length - 1]!.data().startTime;
    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) throw new Error("year-read-invalid-calendar");
    cover(session, { start: -Infinity, end: firstTime });
    cover(session, { start: afterTimestamp(lastTime), end: Infinity });
  }
  const earliest = first ? Math.max(2000, new Date(first.data().startTime).getFullYear()) : currentYear;
  const latest = tail.docs[0] ? Math.min(currentYear, new Date(tail.docs[0].data().startTime).getFullYear()) : currentYear;
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) throw new Error("year-read-invalid-calendar");
  session.years = earliest > latest ? [currentYear] : Array.from({ length: latest - earliest + 1 }, (_, index) => latest - index);
  return session.years;
}
function identity(activity: Activity): PhysicalRideIdentity {
  return { ...activity, sportFamily: disciplineOfType(activity.type) ?? activity.type,
    movingSec: physicalRideMovingSeconds(activity as unknown as Record<string, unknown>) };
}
function intervalEnd(activity: Activity) {
  return Number.isFinite(activity.endTime) && activity.endTime! > activity.startTime
    ? activity.endTime! : activity.startTime + (physicalRideMovingSeconds(activity as unknown as Record<string, unknown>) ?? 0) * 1000;
}
function accepted(session: YearReadSession) {
  return [...session.docs.values()].map(doc => ({ ...doc.data(), id: doc.id }) as Activity & { invalidSummary?: unknown })
    .filter(activity => activity.summary != null && !activity.deletedAt && !activity.invalidSummary && isStatsCountable(activity))
    .sort((a, b) => a.startTime - b.startTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export async function readYearActivities(uid: string, year: number, cancelled: () => boolean, budget = YEAR_READ_BUDGET, session = createYearReadSession(uid)): Promise<Activity[]> {
  return readActivityTimeWindow(uid, localYearBounds(year), cancelled, budget, session);
}

/** 선택 기간과 실제 연결된 구간만 읽으며 원격 identity 사이의 공백은 읽지 않는다. */
export async function readActivityTimeWindow(uid: string, requested: Interval, cancelled: () => boolean, budget = YEAR_READ_BUDGET, session = createYearReadSession(uid)): Promise<Activity[]> {
  if (!Number.isFinite(requested.start) || !Number.isFinite(requested.end) || requested.end <= requested.start) throw new Error("year-read-invalid-window");
  const read = reader(uid, cancelled, budget, session);
  await read.range(requested);
  let items = accepted(session);
  if (!items.some(activity => activity.startTime >= requested.start && activity.startTime < requested.end)) return items;
  if (!missing(session.coverage, { start: -Infinity, end: Infinity }).length) return items;
  if (session.duration === null) {
    let duration = 0;
    for (const [field, multiplier] of [["movingTimeSec", 1000], ["movingTimeMillis", 1], ["ridingTimeMillis", 1], ["elapsedTimeMillis", 1]] as const) {
      const doc = await read.point(`duration:${field}`, [where(`summary.${field}`, ">", 0), orderBy(`summary.${field}`, "desc"), orderBy("__name__", "desc")]);
      if (!doc) continue;
      const value = doc.data().summary?.[field];
      if (typeof value !== "number" || !Number.isFinite(value * multiplier)) throw new Error("year-read-invalid-duration-bound");
      duration = Math.max(duration, value * multiplier);
    }
    session.duration = duration;
  }
  const connected = new Set(items.filter(a => a.startTime >= requested.start && a.startTime < requested.end).map(a => a.id));
  const inspected = new Set<string>();
  for (;;) {
    read.current();
    items = accepted(session);
    let changed = true;
    while (changed) {
      changed = false;
      for (const activity of items) if (!connected.has(activity.id) && items.some(member => connected.has(member.id) && isSamePhysicalRide(identity(member), identity(activity)))) {
        connected.add(activity.id); changed = true;
      }
    }
    const members = items.filter(a => connected.has(a.id) && !inspected.has(a.id));
    if (!members.length) return items;
    const intervals: Interval[] = [];
    for (const member of members) {
      inspected.add(member.id);
      const interval = { start: member.startTime - session.duration, end: Math.max(afterTimestamp(member.startTime), intervalEnd(member)) };
      if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end)) throw new Error("year-read-invalid-interval");
      intervals.push(interval);
    }
    // 실제로 겹치는 구간만 합쳐 빈 응답의 query 최소 과금을 줄인다.
    const union = { coverage: [] as Interval[] } as YearReadSession;
    for (const interval of intervals) cover(union, interval);
    for (const interval of union.coverage) await read.range(interval);
    if (!missing(session.coverage, { start: -Infinity, end: Infinity }).length) return accepted(session);
    const gaps = missing(session.coverage, { start: -Infinity, end: Infinity });
    const pendingKeys = new Map<string, (string | number)[]>();
    for (const member of members) {
      for (const [field, value] of [["localSessionId", member.localSessionId], ["stravaActivityId", member.stravaActivityId], ["stravaTwinActivityId", member.stravaTwinActivityId]] as const) {
        if (field === "localSessionId" ? typeof value !== "string" || !value.length : typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) continue;
        for (const target of field === "localSessionId" ? [field] : ["stravaActivityId", "stravaTwinActivityId"]) {
          const values = pendingKeys.get(target) ?? [];
          if (!values.includes(value!)) values.push(value!);
          pendingKeys.set(target, values);
        }
      }
    }
    for (const gap of gaps) {
      const before = Math.min(...members.map(a => a.startTime).filter(time => time >= gap.end));
      const crossingKey = `${gap.start}:${gap.end}`;
      if (Number.isFinite(before) && gap.start < before && (session.crossings.get(crossingKey) ?? Infinity) > before) {
        await read.all(`cross:${crossingKey}:${before}`, [
          ...(Number.isFinite(gap.start) ? [where("startTime", ">=", gap.start)] : []),
          ...(Number.isFinite(gap.end) ? [where("startTime", "<", gap.end)] : []),
          where("endTime", ">=", before), orderBy("endTime", "asc"), orderBy("startTime", "asc"), orderBy("__name__", "asc"),
        ]);
        session.crossings.set(crossingKey, before);
      }
      for (const [target, values] of pendingKeys) for (let offset = 0; offset < values.length; offset += 30) {
        const batch = values.slice(offset, offset + 30).sort();
        await read.all(`identity:${target}:${JSON.stringify(batch)}:${gap.start}:${gap.end}`, [where(target, "in", batch),
          ...(Number.isFinite(gap.start) ? [where("startTime", ">=", gap.start)] : []),
          ...(Number.isFinite(gap.end) ? [where("startTime", "<", gap.end)] : []), orderBy("startTime", "asc"), orderBy("__name__", "asc")]);
      }
    }
  }
}
export async function readLifetimeActivities(uid: string, cancelled: () => boolean, budget = YEAR_READ_BUDGET): Promise<Activity[]> {
  const docs = await reader(uid, cancelled, budget).all("manual-lifetime", [orderBy("createdAt", "desc"), orderBy("__name__", "desc")]);
  return docs.map(doc => ({ ...doc.data(), id: doc.id }) as Activity).filter(activity => activity.summary != null);
}
