export const TRAINING_SURFACE_CACHE_SCHEMA_VERSION = 2;

const CACHE_TTL_MS = 10 * 60 * 1000;
const SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 12;
const CACHE_MAX_BYTES = 512 * 1024;
const STORAGE_PREFIX = "orider.trainingSurfaceCache.";
const STORAGE_KEY = `${STORAGE_PREFIX}v2`;

export type TrainingCacheSurface = "fitness" | "fitness-timeseries" | "fitness-summary" | "plan" | "plan-snapshot" | "run30";

export interface TrainingSurfaceCacheKey {
  uid: string;
  surface: TrainingCacheSurface;
  sport: string;
  locale: string;
  range?: string | number;
}

function cacheTtl(surface: TrainingCacheSurface): number {
  return ["fitness-summary", "plan-snapshot", "run30"].includes(surface) ? SUMMARY_CACHE_TTL_MS : CACHE_TTL_MS;
}

interface CacheEntry {
  key: TrainingSurfaceCacheKey;
  expiresAt: number;
  value: unknown;
}

declare global {
  interface Window { __ORIDER_TRAINING_CACHE_SCOPE__?: string }
}

export function trainingSurfaceCacheScope(): string | null {
  const scope = typeof window === "undefined" ? undefined : window.__ORIDER_TRAINING_CACHE_SCOPE__;
  return typeof scope === "string" && /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64})$/i.test(scope) ? scope : null;
}

const entries = new Map<string, CacheEntry>();
let ownerUid: string | null = null;
let ownerScope: string | null = null;

function serializeKey(key: TrainingSurfaceCacheKey): string {
  return JSON.stringify([key.uid, key.surface, key.sport, key.locale, key.range ?? ""]);
}

function cloneDto<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validKey(value: unknown, uid: string): value is TrainingSurfaceCacheKey {
  if (!isRecord(value) || value.uid !== uid) return false;
  return ["fitness", "fitness-timeseries", "fitness-summary", "plan", "plan-snapshot", "run30"].includes(String(value.surface))
    && typeof value.sport === "string" && value.sport.length > 0 && value.sport.length <= 64
    && typeof value.locale === "string" && value.locale.length > 0 && value.locale.length <= 64
    && (value.range === undefined || (typeof value.range === "string" && value.range.length <= 64)
      || (typeof value.range === "number" && Number.isFinite(value.range)));
}

// 영속 스냅샷은 JSON DTO만 허용한다. 인증 자격증명과 프로토타입 키는 어떤 깊이에서도 거부한다.
function validJson(value: unknown, depth = 0): boolean {
  if (depth > 24) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10_000 && value.every((item) => validJson(item, depth + 1));
  if (!isRecord(value)) return false;
  const fields = Object.entries(value);
  return fields.length <= 512 && fields.every(([key, item]) =>
    !/token|password|secret|cookie|authorization|credential|handoff|^__proto__$|^constructor$|^prototype$/i.test(key)
    && validJson(item, depth + 1));
}

function validSnapshot(surface: TrainingCacheSurface, value: unknown, uid: string): boolean {
  if (!isRecord(value) || !validJson(value)) return false;
  if (surface === "plan-snapshot" || surface === "run30") {
    return Object.keys(value).length === 4 && typeof value.invalidated === "boolean" && typeof value.savedAt === "number"
      && Number.isFinite(value.savedAt) && typeof value.timezone === "string"
      && (surface === "plan-snapshot" ? validSnapshot("plan", value.data, uid)
        : value.data === null || (isRecord(value.data) && typeof value.data.goalId === "string"
          && value.data.template === "run-30-intro-v1" && Array.isArray(value.data.sessions)));
  }
  if (surface === "fitness-summary") {
    return Object.keys(value).length === 2 && isRecord(value.envelope)
      && value.envelope.status === "canonical" && isRecord(value.envelope.data)
      && typeof value.savedAt === "number" && Number.isFinite(value.savedAt);
  }
  if (surface === "fitness") {
    return Object.keys(value).length === 1 && Array.isArray(value.activities)
      && value.activities.every((activity) => isRecord(activity) && typeof activity.id === "string"
        && activity.userId === uid && typeof activity.type === "string"
        && typeof activity.startTime === "number" && Number.isFinite(activity.startTime)
        && (activity.summary == null || isRecord(activity.summary)));
  }
  if (surface === "fitness-timeseries") {
    return Object.keys(value).length === 1 && "timeseries" in value
      && (value.timeseries === null || (isRecord(value.timeseries) && Array.isArray(value.timeseries.points)
        && value.timeseries.points.every((point) => isRecord(point) && typeof point.date === "string"
          && [point.ctl, point.atl, point.tsb, point.dailyLoad].every((metric) => typeof metric === "number" && Number.isFinite(metric)))));
  }
  return Object.keys(value).length === 2 && "goal" in value
    && (value.goal === null || (isRecord(value.goal) && value.goal.userId === uid
      && typeof value.goal.id === "string")) && Array.isArray(value.weeks)
    && value.weeks.every((week) => isRecord(week) && typeof week.id === "string"
      && Array.isArray(week.days) && week.days.every(isRecord));
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function purgeDisk(): void {
  try {
    const disk = storage();
    if (!disk) return;
    for (let index = disk.length - 1; index >= 0; index -= 1) {
      const key = disk.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) disk.removeItem(key);
    }
  } catch {
    // 저장소 차단·용량 오류는 메모리 캐시나 원본 조회를 막지 않는다.
  }
}

function persist(): void {
  const scope = trainingSurfaceCacheScope();
  if (!ownerUid || !scope) return;
  try {
    const snapshots = [...entries.values()].filter((entry) =>
      entry.expiresAt > Date.now() && validKey(entry.key, ownerUid!)
      && validSnapshot(entry.key.surface, entry.value, ownerUid!));
    let encoded = "";
    for (let remaining = snapshots.length; remaining >= 0; remaining -= 1) {
      encoded = JSON.stringify({ schema: TRAINING_SURFACE_CACHE_SCHEMA_VERSION, uid: ownerUid, scope, entries: snapshots });
      if (new TextEncoder().encode(encoded).byteLength <= CACHE_MAX_BYTES) break;
      snapshots.shift();
    }
    storage()?.setItem(STORAGE_KEY, encoded);
  } catch {
    // 디스크 저장 실패 시에도 이미 검증된 메모리 값은 유지한다.
  }
}

function restore(uid: string): void {
  const scope = trainingSurfaceCacheScope();
  if (!scope) return;
  try {
    const encoded = storage()?.getItem(STORAGE_KEY);
    if (!encoded) return;
    if (encoded.length > CACHE_MAX_BYTES || new TextEncoder().encode(encoded).byteLength > CACHE_MAX_BYTES) {
      purgeDisk();
      return;
    }
    const envelope: unknown = JSON.parse(encoded);
    if (!isRecord(envelope) || envelope.schema !== TRAINING_SURFACE_CACHE_SCHEMA_VERSION
      || envelope.uid !== uid || envelope.scope !== scope || !Array.isArray(envelope.entries) || envelope.entries.length > CACHE_MAX_ENTRIES) {
      purgeDisk();
      return;
    }
    const now = Date.now();
    for (const entry of envelope.entries) {
      if (!isRecord(entry) || !validKey(entry.key, uid) || typeof entry.expiresAt !== "number"
        || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now || entry.expiresAt > now + cacheTtl(entry.key.surface)
        || !validSnapshot(entry.key.surface, entry.value, uid)) continue;
      entries.set(serializeKey(entry.key), entry as unknown as CacheEntry);
    }
    persist();
  } catch {
    purgeDisk();
  }
}

/** Firebase가 확인한 비익명 사용자만 전달한다. 임베드는 host 승인 완료 후 호출한다. */
export function prepareTrainingSurfaceCacheOwner(uid: string | null, anonymous = false): boolean {
  if (!uid || uid.length > 128 || anonymous) {
    clearTrainingSurfaceCache();
    return false;
  }
  const scope = trainingSurfaceCacheScope();
  if (ownerUid === uid && ownerScope === scope) return true;
  if (ownerUid !== null) clearTrainingSurfaceCache();
  ownerUid = uid;
  ownerScope = scope;
  restore(uid);
  return true;
}

export function getTrainingSurfaceCache<T>(key: TrainingSurfaceCacheKey): T | null {
  if (ownerUid !== key.uid || ownerScope !== trainingSurfaceCacheScope()) return null;
  const serialized = serializeKey(key);
  const entry = entries.get(serialized);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(serialized);
    persist();
    return null;
  }
  entries.delete(serialized);
  entries.set(serialized, entry);
  return cloneDto(entry.value as T);
}

export function setTrainingSurfaceCache<T>(key: TrainingSurfaceCacheKey, value: T): void {
  if (ownerUid !== key.uid || ownerScope !== trainingSurfaceCacheScope() || !validKey(key, ownerUid)) return;
  let detached: T;
  try {
    const encoded = JSON.stringify(value);
    if (new TextEncoder().encode(encoded).byteLength > CACHE_MAX_BYTES) return;
    detached = JSON.parse(encoded) as T;
  } catch { return; }
  if (["plan-snapshot", "run30"].includes(key.surface) && !validSnapshot(key.surface, detached, key.uid)) return;
  const serialized = serializeKey(key);
  entries.delete(serialized);
  entries.set(serialized, { key: { ...key }, expiresAt: Date.now() + cacheTtl(key.surface), value: detached });
  while (entries.size > CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  persist();
}

export function removeTrainingSurfaceCache(key: TrainingSurfaceCacheKey): void {
  if (ownerUid !== key.uid || ownerScope !== trainingSurfaceCacheScope()) return;
  entries.delete(serializeKey(key));
  persist();
}

/** 변경 성공 후 같은 종목의 다른 언어 스냅샷도 fresh로 재사용하지 않는다. */
export function removeTrainingSurfaceCacheForSport(uid: string, sport: string): void {
  if (ownerUid !== uid || ownerScope !== trainingSurfaceCacheScope()) return;
  for (const [serialized, entry] of entries) {
    if (entry.key.uid !== uid || entry.key.sport !== sport) continue;
    if (entry.key.surface === "plan") entries.delete(serialized);
    else if (["plan-snapshot", "run30"].includes(entry.key.surface) && isRecord(entry.value)) {
      entry.value = { ...entry.value, invalidated: true };
    }
  }
  persist();
}

export function clearTrainingSurfaceCache(): void {
  entries.clear();
  ownerUid = null;
  ownerScope = null;
  purgeDisk();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) {
      // 다른 탭의 로그아웃·계정 변경 이후 메모리 값이 남지 않도록 즉시 무효화한다.
      entries.clear();
      ownerUid = null;
      ownerScope = null;
    }
  });
}

export const trainingSurfaceCacheTestApi = {
  size: () => entries.size,
};
