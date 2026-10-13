export interface EventCapacityCounts {
  total: number | null;
  byCategory: Record<string, number | null>;
  source: "canonical" | "participants" | "unknown";
}

export const UNKNOWN_CAPACITY_CATEGORY = "_oriderUnknownCapacityCategory";
const nonCapacityStatuses = new Set(["CANCELLED", "REFUNDED", "WITHDRAWN", "WAITLISTED"]);
const validCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function unknownEventCapacityCounts(categories: string[]): EventCapacityCounts {
  return { total: null, byCategory: Object.fromEntries(categories.map(id => [id, null])), source: "unknown" };
}

export function canonicalEventCapacityCounts(value: unknown, categories: string[]): EventCapacityCounts | null {
  if (!record(value) || value.capacitySchemaVersion !== 1 || !validCount(value.totalRegistered)
    || !record(value.byCategory) || !record(value.byRsvp)) return null;
  const categoryCounts = Object.values(value.byCategory);
  const rsvpCounts = [value.byRsvp.going, value.byRsvp.maybe, value.byRsvp.declined, value.byRsvp.unresponded];
  if (!categoryCounts.every(validCount) || !rsvpCounts.every(validCount)
    || categoryCounts.reduce((sum, count) => sum + count, 0) !== value.totalRegistered
    || rsvpCounts.reduce((sum, count) => sum + count, 0) !== value.totalRegistered) return null;
  const byCategory = value.byCategory;
  return { total: value.totalRegistered,
    byCategory: Object.fromEntries(categories.map(id => [id, validCount(byCategory[id]) ? byCategory[id] : null])),
    source: "canonical" };
}

/** Mirrors the server capacity policy for an authorized, complete private participant snapshot. */
export function participantEventCapacityCounts(categories: string[], participants: Record<string, unknown>[]): EventCapacityCounts {
  const riders = participants.filter(p => p.role === "RIDER" && !nonCapacityStatuses.has(String(p.status).toUpperCase()));
  const counts: Record<string, number> = Object.fromEntries(categories.map(id => [id, 0]));
  for (const rider of riders) {
    const id = typeof rider.category === "string" && rider.category ? rider.category : UNKNOWN_CAPACITY_CATEGORY;
    counts[id] = (Object.prototype.hasOwnProperty.call(counts, id) ? counts[id] ?? 0 : 0) + 1;
  }
  return { total: riders.length, byCategory: counts, source: "participants" };
}
