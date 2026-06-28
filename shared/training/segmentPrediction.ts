/**
 * 세그먼트 예상기록 — 라이더의 PDC(CP/W') × 세그먼트 물리 프로파일로 결정적 예상 완주시간 (이슈 #487).
 *
 * 브라우저에서 이미 사용하는 클라이언트 추정 로직이다. 공개 저장소에서도 유지하되,
 * 권위 있는 서버 분석·랭킹 판정·보안 경계로 취급하지 않는다.
 * 모델: 지속파워 CP 2-파라미터 `P(t) = CP + W'/t` 와 정상상태 속도(파워 균형식)로 시간을
 * 고정점 반복 수렴 — 코스 PR 예측(`courseSim.predictPR`)을 평균경사 단일 구간으로 재사용한다.
 * 수렴 로직·짧은구간 파워 floor(30s)를 PR 예측과 단일 출처로 공유(분기 방지).
 *
 * 순수 함수. **추정치**이며 PDC 표본·체중·가상파워 여부에 따라 신뢰도가 다르다(호출부에서 confidence 표기).
 */
import { predictPR, DEFAULT_CDA, DEFAULT_CRR, DEFAULT_ETA } from "../sim/courseSim";
import { isPositiveFinite } from "./mathUtil";

/** 라이더 미상 시 기본 자전거 무게(kg). */
const DEFAULT_BIKE_KG = 8;

export interface SegmentPredictionInput {
  /** 세그먼트 거리(m). */
  distanceM: number;
  /** 평균 경사(%) — 예: 7.2. */
  avgGradePct: number;
  /** 임계파워 CP(W). */
  cp: number;
  /** 무산소 용량 W'(J). */
  wPrime: number;
  /** 라이더 체중(kg). */
  riderWeightKg: number;
  /** 자전거 무게(kg). 생략 시 기본 8. */
  bikeWeightKg?: number;
  cda?: number;
  crr?: number;
}

/**
 * 예상 완주시간(초)을 계산한다. `courseSim.predictPR` 를 평균경사 단일 구간으로 재사용해
 * CP/W' 지속파워 고정점 반복으로 수렴시킨다.
 * @returns 반올림된 초. 필수 입력(distance·cp·weight)이 유효하지 않으면 null.
 */
export function predictSegmentTimeSec(input: SegmentPredictionInput): number | null {
  if (!isPositiveFinite(input.distanceM) || !isPositiveFinite(input.cp) || !isPositiveFinite(input.riderWeightKg)) {
    return null;
  }
  const wPrime = Number.isFinite(input.wPrime) && input.wPrime >= 0 ? input.wPrime : 0;
  const massKg = input.riderWeightKg + (isPositiveFinite(input.bikeWeightKg) ? input.bikeWeightKg : DEFAULT_BIKE_KG);
  const cda = isPositiveFinite(input.cda) ? input.cda : DEFAULT_CDA;
  const crr = isPositiveFinite(input.crr) ? input.crr : DEFAULT_CRR;

  const { totalSec } = predictPR(
    [{ distanceM: input.distanceM, grade: input.avgGradePct / 100 }],
    input.cp,
    wPrime,
    { massKg, cda, crr, eta: DEFAULT_ETA },
  );
  if (!Number.isFinite(totalSec) || totalSec <= 0) return null;
  return Math.round(totalSec);
}

/**
 * 예상시간 대비 도달 순위(1-based). 예상보다 빠른 effort 수 + 1.
 * @param predictedSec 예상 완주시간(초).
 * @param effortTimesSec 리더보드 effort elapsed 초 배열(정렬 무관).
 */
export function predictedRank(predictedSec: number, effortTimesSec: number[]): number {
  let faster = 0;
  for (const e of effortTimesSec) {
    if (Number.isFinite(e) && e > 0 && e < predictedSec) faster += 1;
  }
  return faster + 1;
}
