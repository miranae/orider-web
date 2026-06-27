/**
 * 기대파워 (Expected Power) — 자기 CP/W' 모델 대비 잔차 기반 강점/약점 분석 v1.
 *
 * PDC(`users/{uid}/fitness/pdc_bike`)가 90일 윈도우로 fit 한 CP(임계파워)·W'(무산소 용량)를
 * 입력으로, CP 2-파라미터 모델 `P(d) = CP + W'/d` 가 예측하는 기대파워 곡선을 계산하고
 * 실제 best(peak)와의 갭(%)으로 각 duration 을 강점/동등/약점으로 분류한다.
 *
 * - 순수 함수만. firebase / 외부 IO 없음 → 클라에서 직접 계산(서버 저장·백필 불필요).
 * - 기준은 "자기 자신의 CP 모델" 이다. 인구 분위 대비(Ability/Riduck 식 절대 등급)는
 *   #280 에서 별도 모델로 다룬다.
 * - 지원 duration 은 CP 2-파라미터 모델의 유효구간(30초~1시간)으로 제한한다.
 *   30초 미만 신경근육(스프린트) 영역은 이 모델이 과대평가하므로 제외.
 */
import { isPositiveFinite, round2 } from "./mathUtil";

/** 강점/약점 판정 임계 (gapPct 절대값, %). */
export const EXPECTED_GAP_STRENGTH_PCT = 8;
export const EXPECTED_GAP_WEAKNESS_PCT = -8;

/** CP 2-파라미터 모델 유효 지원 duration(초). 30초~1시간. */
export const EXPECTED_DURATIONS_SEC: readonly number[] = [
  30, 60, 120, 300, 600, 1200, 1800, 3600,
];

/**
 * 야외 장거리 페이싱 가이드 — 임계파워(CP) 대비 권장 지속파워 범위.
 * 라이덕 가이드: 장거리/그란폰도는 기대파워(≈CP)에서 −5~−10% 로 순항하라.
 * 상한 0.95(−5%) / 하한 0.90(−10%).
 */
export const OUTDOOR_PACING_UPPER_FRACTION = 0.95;
export const OUTDOOR_PACING_LOWER_FRACTION = 0.90;

export interface OutdoorPacingGuide {
  /** 하한 W (CP×0.90, −10%). */
  lowerW: number;
  /** 상한 W (CP×0.95, −5%). */
  upperW: number;
  /** 체중 주어지면 W/kg (소수 2자리). */
  lowerWkg?: number;
  upperWkg?: number;
}

/**
 * CP 기반 야외 지속 페이싱 권장 범위를 계산한다. CP×[0.90, 0.95].
 * @param cp 임계파워 W.
 * @param weightKg 선택 — 주어지면 W/kg 도 산출.
 * @returns 가이드. cp 가 유효하지 않으면 null.
 */
export function computeOutdoorPacingGuide(cp: number, weightKg?: number): OutdoorPacingGuide | null {
  if (!isPositiveFinite(cp)) return null;
  const lowerW = Math.round(cp * OUTDOOR_PACING_LOWER_FRACTION);
  const upperW = Math.round(cp * OUTDOOR_PACING_UPPER_FRACTION);
  const guide: OutdoorPacingGuide = { lowerW, upperW };
  if (isPositiveFinite(weightKg)) {
    guide.lowerWkg = round2(lowerW / weightKg);
    guide.upperWkg = round2(upperW / weightKg);
  }
  return guide;
}

export type GapLabel = "strength" | "on_par" | "weakness";

export interface ExpectedPoint {
  durationSeconds: number;
  /** 모델 기대파워 W (반올림). */
  watts: number;
}

export interface GapEntry {
  durationSeconds: number;
  /** 실제 best(peak) W. */
  peak: number;
  /** 모델 기대파워 W. */
  expected: number;
  /** (peak - expected) / expected × 100. */
  gapPct: number;
  label: GapLabel;
}

/**
 * CP 2-파라미터 모델로 기대파워 곡선을 계산한다. 각 duration d 에 `P = CP + W'/d`.
 *
 * @param cp 임계파워 W.
 * @param wPrime 무산소 용량 W' (J).
 * @param durationsSec 계산할 duration(초) 목록. 생략 시 {@link EXPECTED_DURATIONS_SEC}.
 * @returns durationSeconds 오름차순 정렬된 기대파워 포인트. cp/wPrime 가 유효하지 않으면 빈 배열.
 */
export function computeExpectedCurve(
  cp: number,
  wPrime: number,
  durationsSec: readonly number[] = EXPECTED_DURATIONS_SEC,
): ExpectedPoint[] {
  if (!Number.isFinite(cp) || cp <= 0 || !Number.isFinite(wPrime) || wPrime < 0) {
    return [];
  }
  return durationsSec
    .filter((d) => Number.isFinite(d) && d > 0)
    .slice()
    .sort((a, b) => a - b)
    .map((d) => ({
      durationSeconds: d,
      watts: Math.round(cp + wPrime / d),
    }));
}

/**
 * 실제 best(peak) 와 CP 모델 기대파워의 갭(%)으로 각 duration 을 강점/동등/약점 분류한다.
 *
 * gapPct = (peak - expected) / expected × 100.
 * - gapPct ≥ +8 → "strength" (모델 예측보다 잘 버팀)
 * - gapPct ≤ -8 → "weakness" (모델 예측에 못 미침)
 * - 그 사이 → "on_par"
 *
 * @param peakByDurationSec duration(초) → 실제 best W 맵. 0/음수/비유한값은 무시.
 * @param cp 임계파워 W.
 * @param wPrime 무산소 용량 W' (J).
 * @returns durationSeconds 오름차순 갭 분석. cp/wPrime 또는 입력이 유효하지 않으면 빈 배열.
 */
export function classifyGaps(
  peakByDurationSec: Record<number, number>,
  cp: number,
  wPrime: number,
): GapEntry[] {
  if (!Number.isFinite(cp) || cp <= 0 || !Number.isFinite(wPrime) || wPrime < 0) {
    return [];
  }
  const entries: GapEntry[] = [];
  for (const [key, peakRaw] of Object.entries(peakByDurationSec)) {
    const d = Number(key);
    const peak = peakRaw;
    if (!Number.isFinite(d) || d <= 0) continue;
    if (typeof peak !== "number" || !Number.isFinite(peak) || peak <= 0) continue;
    const expected = cp + wPrime / d;
    if (expected <= 0) continue;
    const gapPct = ((peak - expected) / expected) * 100;
    const label: GapLabel =
      gapPct >= EXPECTED_GAP_STRENGTH_PCT
        ? "strength"
        : gapPct <= EXPECTED_GAP_WEAKNESS_PCT
          ? "weakness"
          : "on_par";
    entries.push({
      durationSeconds: d,
      peak: Math.round(peak),
      expected: Math.round(expected),
      gapPct,
      label,
    });
  }
  return entries.sort((a, b) => a.durationSeconds - b.durationSeconds);
}
