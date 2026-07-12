export interface ViewerRecord {
  lastSeenAt?: number | { toMillis?: () => number } | null;
}

export function countActiveViewers(records: ViewerRecord[], now = Date.now()): number {
  const cutoff = now - 90_000;
  return records.filter((record) => {
    const value = record.lastSeenAt;
    const millis = typeof value === "number" ? value : typeof value?.toMillis === "function" ? value.toMillis() : 0;
    return millis >= cutoff;
  }).length;
}

export function createViewerSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "_");
}
