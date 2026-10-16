import { decideCanonicalRender } from "@shared/types/canonicalDisplay";
import type { CanonicalEnvelope } from "@shared/types/canonical";
import { parseCanonicalFitnessSummary } from "../services/canonicalApi";
import { getTrainingSurfaceCache, removeTrainingSurfaceCache, setTrainingSurfaceCache, trainingSurfaceCacheScope } from "./trainingSurfaceCache";

const FRESH_MS = 3 * 60_000;
const RETAIN_MS = 24 * 60 * 60_000;
const key = (uid: string) => ({ uid, surface: "fitness-summary" as const, sport: "all", locale: "canonical", range: "v1" });

interface CachedSummary {
  envelope: CanonicalEnvelope<unknown>;
  savedAt: number;
}

function calendarDay(at: number, timezone: string | null): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(at);
  } catch { return null; }
}

export function readFitnessSummaryCache(uid: string): (CachedSummary & { fresh: boolean; freshUntil: number }) | null {
  if (!trainingSurfaceCacheScope()) return null;
  const cached = getTrainingSurfaceCache<CachedSummary>(key(uid));
  if (!cached || typeof cached.savedAt !== "number" || !Number.isFinite(cached.savedAt)
    || cached.savedAt > Date.now() || Date.now() - cached.savedAt >= RETAIN_MS
    || !cached.envelope || cached.envelope.status !== "canonical") return null;
  const envelope = cached.envelope;
  if (typeof envelope.algorithmVersion !== "string" || !envelope.algorithmVersion
    || typeof envelope.computedAt !== "number" || !Number.isFinite(envelope.computedAt)
    || (envelope.inputRevision !== null && typeof envelope.inputRevision !== "string")
    || (envelope.inputDigest !== null && typeof envelope.inputDigest !== "string")
    || (envelope.period !== null && (typeof envelope.period !== "object" || !envelope.period
      || typeof envelope.period.start !== "number" || !Number.isFinite(envelope.period.start)
      || typeof envelope.period.end !== "number" || !Number.isFinite(envelope.period.end)
      || typeof envelope.period.timezone !== "string"))) return null;
  const parsed = parseCanonicalFitnessSummary(envelope.data);
  if (!parsed || decideCanonicalRender(cached.envelope, false).display !== "value") return null;
  const timezone = parsed.timezone ?? cached.envelope.period?.timezone ?? null;
  const today = calendarDay(Date.now(), timezone);
  let freshUntil = cached.savedAt + FRESH_MS;
  if (today !== null && calendarDay(freshUntil, timezone) !== today) {
    let lower = Date.now();
    while (freshUntil - lower > 1) {
      const middle = Math.floor((lower + freshUntil) / 2);
      if (calendarDay(middle, timezone) === today) lower = middle;
      else freshUntil = middle;
    }
  }
  return {
    ...cached,
    freshUntil,
    fresh: Date.now() - cached.savedAt < FRESH_MS && today !== null
      && today === calendarDay(cached.savedAt, timezone),
  };
}

export function writeFitnessSummaryCache(uid: string, envelope: CanonicalEnvelope<unknown>): void {
  if (!trainingSurfaceCacheScope()) return;
  if (envelope.status !== "canonical" || !parseCanonicalFitnessSummary(envelope.data)
    || decideCanonicalRender(envelope, false).display !== "value") {
    // 실패·낡은 응답 뒤 재진입에서 이전 성공값을 최신 캐시로 오인하지 않는다.
    removeTrainingSurfaceCache(key(uid));
    return;
  }
  setTrainingSurfaceCache(key(uid), { envelope, savedAt: Date.now() });
}
