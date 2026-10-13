export function isVerifiedEventFinisher(
  contractVersion: number | undefined,
  status: string,
  resultVerified: unknown,
  finishedAtMs: number | null,
  startMs: number | null,
): boolean {
  if (status !== "FINISHED") return false;
  if ((contractVersion ?? 1) < 2) return true;
  return resultVerified === true && startMs != null && Number.isFinite(startMs) && startMs > 0
    && finishedAtMs != null && Number.isFinite(finishedAtMs) && finishedAtMs >= startMs;
}
