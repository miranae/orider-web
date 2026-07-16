export const FTP_HISTORY_SOURCES = ["manual", "test", "detected"] as const;
export type FtpHistorySource = typeof FTP_HISTORY_SOURCES[number];

export interface FtpHistoryEntry {
  id: string;
  value: number;
  source: FtpHistorySource;
  changedAt: number;
}

export function ftpHistoryEntryWrite(
  value: number,
  source: FtpHistorySource,
  changedAt = Date.now(),
) {
  return { value, source, changedAt };
}

export function parseFtpHistoryEntry(id: string, value: unknown): FtpHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.value !== "number" ||
    !Number.isFinite(data.value) ||
    data.value < 1 ||
    data.value > 2000 ||
    !FTP_HISTORY_SOURCES.includes(data.source as FtpHistorySource) ||
    typeof data.changedAt !== "number" ||
    !Number.isFinite(data.changedAt) ||
    data.changedAt <= 0
  ) return null;
  return {
    id,
    value: data.value,
    source: data.source as FtpHistorySource,
    changedAt: data.changedAt,
  };
}

export function ftpHistorySourceForChange(
  currentFtp: unknown,
  nextFtp: unknown,
  pendingSource: FtpHistorySource,
): FtpHistorySource | undefined {
  return typeof nextFtp === "number" && Number.isFinite(nextFtp) && nextFtp !== currentFtp
    ? pendingSource
    : undefined;
}
