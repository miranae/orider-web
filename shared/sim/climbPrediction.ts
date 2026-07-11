import {
  DEFAULT_CDA,
  DEFAULT_CRR,
  DEFAULT_ETA,
  predictPR,
  simulateCourse,
} from "./courseSim";

export interface ClimbSummary {
  gain: number;
  dist: number;
  cat: number;
}

export interface ClimbRiderProfile {
  riderWeightKg: number;
  bikeWeightKg?: number;
  ftpW?: number;
  cpW?: number;
  wPrimeJ?: number;
  cda?: number;
  crr?: number;
  drivetrainEfficiency?: number;
}

export interface ClimbPrediction {
  totalSec: number;
  sustainablePowerW: number;
  wattsPerKg: number;
  source: "pdc" | "ftp";
}

/**
 * 코스 스냅샷의 climb 요약을 개인 능력치와 결합해 등반 시간을 예측한다.
 *
 * climb 스냅샷에는 시작점별 고도 프로파일이 없으므로 해당 등반을
 * `상승고도 / 거리`의 일정 경사 구간으로 근사한다. CP/W′가 있으면 짧은
 * 노력까지 반영하고, 없으면 FTP 지속주로 보수적으로 계산한다.
 */
export function predictClimb(
  climb: ClimbSummary,
  rider: ClimbRiderProfile,
): ClimbPrediction | null {
  if (!(climb.dist > 0) || !(climb.gain >= 0) || !(rider.riderWeightKg > 0)) {
    return null;
  }

  const cpW = rider.cpW ?? 0;
  const ftpW = rider.ftpW ?? 0;
  if (!(cpW > 0) && !(ftpW > 0)) return null;

  const segments = [{ distanceM: climb.dist, grade: climb.gain / climb.dist }];
  const params = {
    massKg: rider.riderWeightKg + (rider.bikeWeightKg ?? 8),
    cda: rider.cda ?? DEFAULT_CDA,
    crr: rider.crr ?? DEFAULT_CRR,
    eta: rider.drivetrainEfficiency ?? DEFAULT_ETA,
  };

  if (cpW > 0) {
    const result = predictPR(segments, cpW, rider.wPrimeJ ?? 0, params);
    return {
      totalSec: result.totalSec,
      sustainablePowerW: result.sustainablePowerW,
      wattsPerKg: result.sustainablePowerW / rider.riderWeightKg,
      source: "pdc",
    };
  }

  const result = simulateCourse(segments, { ...params, powerW: ftpW });
  return {
    totalSec: result.totalSec,
    sustainablePowerW: ftpW,
    wattsPerKg: ftpW / rider.riderWeightKg,
    source: "ftp",
  };
}

export function formatClimbDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "--";
  const total = Math.round(sec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const padded = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${padded(minutes)}:${padded(seconds)}`
    : `${minutes}:${padded(seconds)}`;
}
