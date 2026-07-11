/**
 * 러닝 워크아웃 목표 페이스 — 임계 페이스(threshold pace) 기반 존별 범위 산출.
 *
 * 배경: 기존 코드에는 임계 페이스 → 존별 페이스 범위를 계산하는 공식이 없었다.
 * `todaysRecommendation.ts` 의 zoneNames 는 표시 라벨일 뿐이고, `RunDetailCards` 의
 * 존 매핑(paceSec < 250 → Z5 …)은 임계값과 무관한 절대 매직넘버였다. 이 파일이 그 공식의
 * 단일 진실원이며, 두 소비처 모두 여기로 수렴한다.
 *
 * 계수 정의: 페이스는 sec/km 이므로 **계수 > 1 이면 임계보다 느림**, < 1 이면 빠름.
 * Daniels/Friel 계열 존 구분을 임계 페이스(≈1시간 최대 지속 페이스) 기준으로 정규화했다.
 * `estimateTSS.ts` 의 IF = thresholdPace / avgPace 정의와 정합한다
 * (avgPace = threshold × 계수 → IF = 1 / 계수. 예: Z5 계수 0.90~0.99 → IF 1.01~1.11 로 임계 초과).
 */

import { debugLog } from "../services/errorLogger";

export type PaceZone = 1 | 2 | 3 | 4 | 5;

/** 존별 [빠른쪽 계수, 느린쪽 계수] — 임계 페이스에 곱한다. 경계는 인접 존과 연속. */
const ZONE_COEFF: Record<PaceZone, readonly [number, number]> = {
  1: [1.28, 1.45], // 회복 조깅 — 임계보다 28~45% 느림
  2: [1.15, 1.28], // 이지
  3: [1.05, 1.15], // 마라톤 페이스 / 템포
  4: [0.99, 1.05], // 역치 (임계 근방)
  5: [0.9, 0.99], // 인터벌 (임계 초과)
};

export interface PaceRange {
  /** 빠른 쪽 경계 (작은 sec/km) */
  fastSecPerKm: number;
  /** 느린 쪽 경계 (큰 sec/km) */
  slowSecPerKm: number;
}

/**
 * 임계 페이스 → 해당 존의 목표 페이스 범위.
 * thresholdPace 가 유효하지 않으면 null (호출부가 "(추정)" 경로로 폴백).
 */
export function zonePaceRange(
  thresholdPaceSecPerKm: number | null | undefined,
  zone: PaceZone,
): PaceRange | null {
  if (!thresholdPaceSecPerKm || thresholdPaceSecPerKm <= 0) return null;
  const [fastCoeff, slowCoeff] = ZONE_COEFF[zone];
  return {
    fastSecPerKm: Math.round(thresholdPaceSecPerKm * fastCoeff),
    slowSecPerKm: Math.round(thresholdPaceSecPerKm * slowCoeff),
  };
}

/**
 * 실제 페이스 → 존 판정. 임계 페이스 상대 비율로 계산하므로 사용자마다 다르게 나온다
 * (기존 `RunDetailCards` 의 절대 매직넘버를 대체).
 */
export function paceToZone(
  paceSecPerKm: number,
  thresholdPaceSecPerKm: number | null | undefined,
): PaceZone | null {
  if (!thresholdPaceSecPerKm || thresholdPaceSecPerKm <= 0) return null;
  if (!paceSecPerKm || paceSecPerKm <= 0) return null;
  const ratio = paceSecPerKm / thresholdPaceSecPerKm;
  if (ratio < ZONE_COEFF[5][1]) return 5;
  if (ratio < ZONE_COEFF[4][1]) return 4;
  if (ratio < ZONE_COEFF[3][1]) return 3;
  if (ratio < ZONE_COEFF[2][1]) return 2;
  return 1; // Z1 보다 느린 구간도 회복으로 흡수
}

/** 초/km → `5'40"` 표기. */
export function formatPaceSec(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "-";
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm - m * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}'${String(s).padStart(2, "0")}"`;
}

/** 범위 표기 — 빠른 쪽을 먼저 (`4'35"–4'55"`). */
export function formatPaceRange(range: PaceRange): string {
  return `${formatPaceSec(range.fastSecPerKm)}–${formatPaceSec(range.slowSecPerKm)}`;
}

/**
 * 임계 페이스 추정 — 20~30분 최고 페이스를 앵커로 사용.
 *
 * 임계 페이스는 정의상 "약 1시간 지속 가능한 페이스"이므로, 20~30분 최고 페이스보다
 * 약간 느리다. 통상 20분 최대 노력의 ~95% 강도를 임계로 보는 관례(FTP 의 0.95 계수와 동형)를
 * 페이스에 적용하면 **임계 페이스 ≈ 20분 최고 페이스 ÷ 0.95** (느려짐).
 *
 * 확정 임계값이 아니므로 호출부는 반드시 "(추정)" 라벨을 노출해야 한다 — 나중에 사용자가
 * 실제 임계 페이스를 확정했을 때 값이 조용히 바뀌면 신뢰가 깨진다.
 */
const THRESHOLD_FROM_20MIN_COEFF = 0.95;

export interface ThresholdPaceResolution {
  thresholdPaceSecPerKm: number;
  /** confirmed = 사용자가 설정한 값, estimated = 최근 최고 페이스에서 추정 */
  source: "confirmed" | "estimated";
}

/**
 * 확정 임계 페이스가 있으면 그대로, 없으면 20~30분 최고 페이스에서 추정.
 * 둘 다 없으면 null.
 *
 * @param confirmedSecPerKm `training_profile/current.thresholdPace`
 * @param best20MinSecPerKm `computeBestPace(streams, 1200)` 결과 (없으면 30분 값도 허용)
 */
export function resolveThresholdPace(
  confirmedSecPerKm: number | null | undefined,
  best20MinSecPerKm: number | null | undefined,
): ThresholdPaceResolution | null {
  if (confirmedSecPerKm && confirmedSecPerKm > 0) {
    const result: ThresholdPaceResolution = {
      thresholdPaceSecPerKm: confirmedSecPerKm,
      source: "confirmed",
    };
    logThresholdResolution(result, { confirmedSecPerKm, best20MinSecPerKm });
    return result;
  }
  if (best20MinSecPerKm && best20MinSecPerKm > 0) {
    const result: ThresholdPaceResolution = {
      // 나눗셈이므로 값이 커진다 = 느려진다. 임계는 20분 최대 노력보다 느림.
      thresholdPaceSecPerKm: Math.round(best20MinSecPerKm / THRESHOLD_FROM_20MIN_COEFF),
      source: "estimated",
    };
    logThresholdResolution(result, { confirmedSecPerKm, best20MinSecPerKm });
    return result;
  }
  logThresholdResolution(null, { confirmedSecPerKm, best20MinSecPerKm });
  return null;
}

/**
 * 임계 페이스 출처 로깅 — 추정/확정 어느 경로로 값이 나왔는지 남긴다.
 * 사용자에게 보이는 목표 페이스가 어디서 왔는지 추적 못 하면 "왜 이 숫자냐" 문의를 못 푼다.
 */
function logThresholdResolution(
  result: ThresholdPaceResolution | null,
  inputs: {
    confirmedSecPerKm: number | null | undefined;
    best20MinSecPerKm: number | null | undefined;
  },
): void {
  if (typeof console === "undefined") return;
  const payload = {
    source: result?.source ?? "none",
    thresholdPaceSecPerKm: result?.thresholdPaceSecPerKm ?? null,
    hasConfirmed: !!inputs.confirmedSecPerKm,
    hasBest20Min: !!inputs.best20MinSecPerKm,
  };
  // 사용자에게 보이는 목표 페이스의 출처(확정/추정)를 남긴다 — 없으면 "왜 이 숫자냐"를 추적할 수 없다.
  debugLog("workoutPace.resolveThresholdPace", payload);
}

/** 진단·테스트용 — 존 계수 노출 (읽기 전용). */
export function zoneCoefficients(zone: PaceZone): readonly [number, number] {
  return ZONE_COEFF[zone];
}
