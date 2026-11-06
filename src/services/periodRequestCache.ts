/**
 * 기간 분석 호출(getPowerCurvePeriods·getTrainingAnalysisPeriods)은 사용자당 시간당 12회·10초 2회로 제한된다.
 * 분석 상단 기간을 오가며 같은 기간을 다시 부르면 한도를 금방 다 써서 이후 불러오기가 실패했다.
 * 같은 사용자·같은 요청은 짧은 시간 동안 응답(진행 중인 요청 포함)을 재사용한다. 실패한 요청은 남기지 않는다.
 */
/** 분석 상단 기간을 바꾼 뒤 다시 불러오기까지 기다리는 시간. */
export const WINDOW_RELOAD_DELAY_MS = 700;
export const PERIOD_REQUEST_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 16;
type Entry = { at: number; promise: Promise<unknown> };
// Firebase 서비스(앱·인증 세션 묶음)마다 따로 둔다 — 서비스가 바뀌면 이전 응답을 쓰지 않는다.
let stores = new WeakMap<object, Map<string, Entry>>();

export function cachedPeriodRequest<T>(scope: object, name: string, uid: string, request: unknown, load: () => Promise<T>, now = Date.now()): Promise<T> {
  let store = stores.get(scope);
  if (!store) { store = new Map(); stores.set(scope, store); }
  const key = `${name}\u0000${uid}\u0000${JSON.stringify(request)}`;
  const hit = store.get(key);
  if (hit && now - hit.at < PERIOD_REQUEST_CACHE_TTL_MS) return hit.promise as Promise<T>;
  const promise = load();
  const entry = { at: now, promise };
  store.delete(key); store.set(key, entry);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!);
  promise.catch(() => { if (store.get(key) === entry) store.delete(key); });
  return promise;
}

/** 테스트와 계정 전환에서 비운다. */
export function clearPeriodRequestCache() { stores = new WeakMap(); }
