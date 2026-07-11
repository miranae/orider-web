import type { PdcDoc } from "../types/pdc";

export interface EstimatedFtpPoint {
  period: string;
  ftpW: number;
  source: "20m" | "1h";
}

export interface FtpBreakthrough {
  currentFtpW: number;
  candidateFtpW: number;
  deltaW: number;
  deltaPct: number;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function positivePower(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Monthly eFTP derived from persisted PDC MMP snapshots. This is not manual FTP change history. */
export function deriveEstimatedFtpProgression(history: PdcDoc["history"] | null | undefined): EstimatedFtpPoint[] {
  if (!history?.length) return [];
  const byPeriod = new Map<string, EstimatedFtpPoint>();
  for (const snapshot of history) {
    if (!PERIOD_RE.test(snapshot.period)) continue;
    const twentyMin = positivePower(snapshot.mmp?.["20m"]);
    const oneHour = positivePower(snapshot.mmp?.["1h"]);
    const point = twentyMin != null
      ? { period: snapshot.period, ftpW: Math.round(twentyMin * 0.95), source: "20m" as const }
      : oneHour != null
        ? { period: snapshot.period, ftpW: Math.round(oneHour), source: "1h" as const }
        : null;
    if (point) byPeriod.set(snapshot.period, point);
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/** Conservative suggestion: both an absolute 10 W and relative 3% improvement must be met. */
export function detectFtpBreakthrough(currentFtpW: unknown, candidateFtpW: unknown): FtpBreakthrough | null {
  const current = positivePower(currentFtpW);
  const candidate = positivePower(candidateFtpW);
  if (current == null || candidate == null) return null;
  const rawDeltaW = candidate - current;
  const rawDeltaPct = rawDeltaW / current;
  if (rawDeltaW < 10 || rawDeltaPct < 0.03) return null;
  const roundedCandidate = Math.round(candidate);
  const deltaW = roundedCandidate - current;
  const deltaPct = deltaW / current;
  return { currentFtpW: current, candidateFtpW: roundedCandidate, deltaW, deltaPct };
}
