import type { PdcDoc } from "../types/pdc";
import { deriveEstimatedFtpProgression } from "./ftpProgression";

export interface BikeThresholdDecision {
  activeFtpW: number | null;
  automaticCandidateW: number | null;
  cpW: number | null;
  recentTwentyMinuteW: number | null;
  latestMonthlyEstimate: { period: string; ftpW: number } | null;
  tteMin: number | null;
  activityCount: number;
}

function roundedPositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

/**
 * 훈련에 실제 적용되는 프로필 FTP와 분석 근거를 명시적으로 분리한다.
 * 이 함수는 표시만 결정하며 프로필이나 기기를 절대 변경하지 않는다.
 */
export function resolveBikeThresholdDecision(
  activeProfileFtp: unknown,
  pdc: PdcDoc | null | undefined,
): BikeThresholdDecision {
  const progression = deriveEstimatedFtpProgression(pdc?.history);
  const latest = progression[progression.length - 1] ?? null;
  const activeFtpW = roundedPositive(activeProfileFtp);
  const modeledFtp = roundedPositive(pdc?.pdcModel?.ftpEst);

  return {
    activeFtpW,
    automaticCandidateW: modeledFtp !== activeFtpW ? modeledFtp : null,
    cpW: roundedPositive(pdc?.pdcModel?.cpEst ?? pdc?.cp?.value),
    recentTwentyMinuteW: roundedPositive(pdc?.mmpAll?.["20m"]?.value),
    latestMonthlyEstimate: latest ? { period: latest.period, ftpW: latest.ftpW } : null,
    tteMin: roundedPositive(pdc?.pdcModel?.tteMin),
    activityCount: pdc?.activityCount ?? 0,
  };
}
