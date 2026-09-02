export const TRAINING_SURFACE_CACHE_SCHEMA_VERSION = 1;

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 12;

export type TrainingCacheSurface = "fitness" | "fitness-timeseries" | "plan";

export interface TrainingSurfaceCacheKey {
  uid: string;
  surface: TrainingCacheSurface;
  sport: string;
  locale: string;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const entries = new Map<string, CacheEntry>();
let ownerUid: string | null = null;

function serializeKey(key: TrainingSurfaceCacheKey): string {
  return [
    TRAINING_SURFACE_CACHE_SCHEMA_VERSION,
    key.uid,
    key.surface,
    key.sport,
    key.locale,
  ].join("\u0000");
}

function cloneDto<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function prepareTrainingSurfaceCacheOwner(uid: string | null, anonymous = false): boolean {
  if (!uid || anonymous) {
    clearTrainingSurfaceCache();
    return false;
  }
  if (ownerUid !== null && ownerUid !== uid) entries.clear();
  ownerUid = uid;
  return true;
}

export function getTrainingSurfaceCache<T>(key: TrainingSurfaceCacheKey): T | null {
  if (ownerUid !== key.uid) return null;
  const serialized = serializeKey(key);
  const entry = entries.get(serialized);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(serialized);
    return null;
  }
  entries.delete(serialized);
  entries.set(serialized, entry);
  return cloneDto(entry.value as T);
}

export function setTrainingSurfaceCache<T>(key: TrainingSurfaceCacheKey, value: T): void {
  if (ownerUid !== key.uid) return;
  const serialized = serializeKey(key);
  entries.delete(serialized);
  entries.set(serialized, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: cloneDto(value),
  });
  while (entries.size > CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function clearTrainingSurfaceCache(): void {
  entries.clear();
  ownerUid = null;
}

export const trainingSurfaceCacheTestApi = {
  size: () => entries.size,
};
