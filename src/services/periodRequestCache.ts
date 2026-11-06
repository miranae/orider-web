import { trainingCalendarDate } from "./trainingComparisonCalendar";

/**
 * 기간 분석(getPowerCurvePeriods·getTrainingAnalysisPeriods)은 사용자당 시간당 12회·10초 2회로 제한되고, 결과는
 * 지난 날짜의 기록이라 자주 바뀌지 않는다. 그래서 한 번 받은 응답을 기기에 저장해 다시 쓰고, 아래일 때만 서버를 부른다.
 *
 * - 날짜(KST)가 바뀌었을 때 — "최근 N일" 창이 하루 밀린다.
 * - 저장한 지 [PERIOD_REQUEST_CACHE_TTL_MS] 가 지났을 때 — 지난 기록의 수정·재분석을 반영한다.
 *   오늘이 포함된 기간(직접 고른 날짜)은 오늘 기록이 계속 바뀌므로 [PERIOD_REQUEST_TODAY_TTL_MS] 만 쓴다.
 *
 * 메모리(같은 탭) → IndexedDB(새로고침·다른 탭) 순서로 찾는다. 같은 요청이 진행 중이면 그 결과를 함께 기다린다.
 * 실패한 요청은 저장하지 않으므로 다시 시도는 서버를 부른다. 저장 값은 읽을 때 다시 검증하고, 계정·프로젝트마다 따로 둔다.
 */
export const PERIOD_REQUEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const PERIOD_REQUEST_TODAY_TTL_MS = 10 * 60 * 1000;
/** 분석 상단 기간을 바꾼 뒤 다시 불러오기까지 기다리는 시간. */
export const WINDOW_RELOAD_DELAY_MS = 700;
const SCHEMA = 1;
const MAX_MEMORY_ENTRIES = 16;
const MAX_STORED_ENTRIES = 40;
const DB_NAME = "orider-period-analysis-cache";
const STORE = "responses";

type Freshness = { day: string; storedAt: number; includesToday: boolean };
type Stored = Freshness & { key: string; uid: string; schema: number; value: unknown };
type Memory = Freshness & { promise: Promise<unknown> };
const memory = new Map<string, Memory>();

export interface PeriodCacheRequest { periods?: readonly { fromInclusive: number; toExclusive: number }[] }

function fresh(entry: Freshness, now: number) {
  const age = now - entry.storedAt;
  return entry.day === trainingCalendarDate(now) && age >= 0 && age < (entry.includesToday ? PERIOD_REQUEST_TODAY_TTL_MS : PERIOD_REQUEST_CACHE_TTL_MS);
}
function todayStart(now: number) { return Date.parse(`${trainingCalendarDate(now)}T00:00:00+09:00`); }

let dbPromise: Promise<IDBDatabase | null> | null = null;
function database(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: "key" }); };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}
async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await database();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode), request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function readStored(key: string): Promise<Stored | null> {
  const value = await transact<Stored | undefined>("readonly", store => store.get(key) as IDBRequest<Stored | undefined>);
  return value && typeof value === "object" && value.key === key && value.schema === SCHEMA ? value : null;
}
async function writeStored(entry: Stored, now: number) {
  await transact("readwrite", store => {
    store.put(entry);
    // 날짜가 지났거나 오래된 항목을 지우고, 너무 많으면 오래된 것부터 지운다.
    const all = store.getAll() as IDBRequest<Stored[]>;
    all.onsuccess = () => {
      const rows = (all.result ?? []).filter(row => row && typeof row.key === "string");
      const keep = rows.filter(row => row.schema === SCHEMA && fresh(row, now)).sort((a, b) => b.storedAt - a.storedAt).slice(0, MAX_STORED_ENTRIES);
      const kept = new Set(keep.map(row => row.key));
      for (const row of rows) if (!kept.has(row.key)) store.delete(row.key);
    };
  });
}

/** Firebase 프로젝트(운영·스테이지·에뮬레이터)마다 따로 저장한다. */
export function periodCacheScope(services: { auth?: { app?: { options?: { projectId?: string } } } } | null | undefined): string {
  return services?.auth?.app?.options?.projectId ?? "default";
}

/** [scope] 는 프로젝트 구분, [validate] 는 저장된 값을 다시 쓸 때의 응답 검증이다. */
export function cachedPeriodRequest<T>(options: { scope: string; name: string; uid: string; request: PeriodCacheRequest; load: () => Promise<T>; validate: (value: unknown) => T; now?: number }): Promise<T> {
  const { scope, name, uid, request, load, validate } = options;
  const now = options.now ?? Date.now();
  const key = JSON.stringify([SCHEMA, scope, name, uid, request]);
  const hit = memory.get(key);
  if (hit && fresh(hit, now)) return hit.promise as Promise<T>;
  const includesToday = (request.periods ?? []).some(period => period.toExclusive > todayStart(now));
  const day = trainingCalendarDate(now);
  const promise = (async () => {
    const stored = await readStored(key);
    if (stored && stored.uid === uid && fresh(stored, now)) {
      try { return validate(stored.value); } catch { /* 저장 값이 지금 계약과 다르면 서버에서 다시 받는다 */ }
    }
    const value = await load();
    void writeStored({ key, uid, schema: SCHEMA, day, storedAt: now, includesToday, value }, now);
    return value;
  })();
  const entry: Memory = { day, storedAt: now, includesToday, promise };
  memory.delete(key); memory.set(key, entry);
  while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
  promise.catch(() => { if (memory.get(key) === entry) memory.delete(key); });
  return promise;
}

/** 로그아웃에서 메모리와 기기 저장을 모두 비운다. */
export async function clearPeriodRequestCache() {
  memory.clear();
  await transact("readwrite", store => { store.clear(); });
}
/** 테스트 사이에 메모리 캐시를 비운다(jsdom 에는 IndexedDB 가 없다). */
export function clearPeriodRequestMemory() { memory.clear(); }
