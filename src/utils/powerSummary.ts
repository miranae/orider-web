import { calculateNP, calculateIF, calculateTSS } from "./powerMetrics";

// 가상파워 max는 노이즈 스파이크에 취약 — 5초 롤링 평균 최대값으로 안정화
function rollingMax(watts: number[], window: number): number | null {
  if (watts.length === 0) return null;
  if (watts.length < window) return Math.max(...watts);
  let bestSum = -Infinity;
  let curSum = 0;
  for (let i = 0; i < window; i++) curSum += watts[i]!;
  bestSum = curSum;
  for (let i = window; i < watts.length; i++) {
    curSum += watts[i]! - watts[i - window]!;
    if (curSum > bestSum) bestSum = curSum;
  }
  return bestSum / window;
}

export interface PowerSummary {
  avg: number | null;
  max: number | null;
  np: number | null;
  if: number | null;
  tss: number | null;
}

/**
 * 파워 스트림(W)으로부터 요약 지표 계산
 * - avg/max: 데이터 없음(전부 0/빈 배열) → null. 그 외 정수 반올림
 * - max: 5초 롤링 평균의 최대값 (단일 샘플 스파이크 회피)
 * - np: Normalized Power (≥30s 필요, 미만이면 null)
 * - if: Intensity Factor (FTP>0 필요)
 * - tss: Training Stress Score (FTP>0 필요)
 */
export function summarizePower(watts: number[], ftp: number): PowerSummary {
  const hasData = watts.some((w) => typeof w === "number" && w > 0);
  const avg = hasData
    ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length)
    : null;
  const maxRaw = hasData ? rollingMax(watts, 5) : null;
  const max = maxRaw !== null ? Math.round(maxRaw) : null;
  const npRaw = calculateNP(watts);
  const np = npRaw !== null ? Math.round(npRaw) : null;
  const ifactor = ftp > 0 ? calculateIF(watts, ftp) : null;
  const tss = ftp > 0 ? calculateTSS(watts, ftp) : null;
  return { avg, max, np, if: ifactor, tss };
}
