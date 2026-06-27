/**
 * 코스/세그먼트 시뮬레이터 — 순수 물리 모델 (#287).
 *
 * 자전거 정상상태(steady-state) 파워 방정식으로 구간별 속도/소요시간을 구한다.
 * 클라/서버 어디서도 부작용 없이 호출 가능한 순수 함수만 둔다.
 *
 * ── 물리 모델 ──────────────────────────────────────────────────────────
 * 한 구간을 평균 경사(grade) 의 직선 비탈로 보고, 라이더가 일정 파워 P 를
 * 낼 때 도달하는 정상상태 속도 v (m/s) 를 다음 파워 균형식에서 구한다:
 *
 *   P·η = P_aero + P_roll + P_grav
 *       = ½·ρ·CdA·v³                    (공기 저항)
 *       + Crr·m·g·cosθ·v                (구름 저항)
 *       + m·g·sinθ·v                    (중력 — 오르막 +, 내리막 −)
 *
 * 여기서
 *   η    = 구동계 효율 (0~1), 페달 입력 중 노면에 전달되는 비율
 *   ρ    = 공기 밀도 (kg/m³), 해수면 1.225
 *   CdA  = 항력계수×전면적 (m²)
 *   Crr  = 구름 저항 계수 (무차원)
 *   m    = 라이더+장비 총 질량 (kg)
 *   g    = 중력 가속도 9.81 m/s²
 *   θ    = 비탈 각, grade = tanθ. 작은 각 근사로 sinθ≈grade, cosθ≈1 도 가능하나
 *          여기선 정확히 sinθ = grade/√(1+grade²), cosθ = 1/√(1+grade²) 를 쓴다.
 *
 * 좌변(P·η)에서 우변을 뺀 함수 f(v) 는 v 에 대해 단조 증가(공기항이 v³)이므로
 * 이분법으로 유일근을 안정적으로 찾는다. 내리막에서 중력항이 음수라 저파워에서도
 * 해가 존재하며, 동력 없이 굴러가는(P=0) 내리막은 별도 종단속도로 처리한다.
 *
 * ── 가정 / 한계 ────────────────────────────────────────────────────────
 *  - 바람(맞바람/뒷바람), 드래프팅, 코너링 감속, 노면 변화, 가감속(관성, ma 항)
 *    을 무시한다. 즉 각 구간을 즉시 정상상태에 도달한 등속 주행으로 근사.
 *  - 고도에 따른 ρ 변화, 타이어/체인 온도, 자세 변화로 인한 CdA 변동 무시.
 *  - grade 는 구간 평균. 짧은 급경사 디테일은 평균에 흡수된다.
 *  => 결과는 "베타" 추정치이며 절대 정확도를 보장하지 않는다.
 */

// ── 기본 상수 (export) ─────────────────────────────────────────────────
/** 공기 밀도 (kg/m³, 해수면 15°C). */
export const RHO_SEA_LEVEL = 1.225;
/** 중력 가속도 (m/s²). */
export const GRAVITY = 9.81;
/** 기본 CdA (m²) — 후드 자세 로드바이크 근사. */
export const DEFAULT_CDA = 0.32;
/** 기본 Crr (무차원) — 로드 타이어 + 아스팔트 근사. */
export const DEFAULT_CRR = 0.005;
/** 기본 구동계 효율. */
export const DEFAULT_ETA = 0.97;

/** 속도 클램프 범위 (m/s). 0 ~ 120km/h. */
const V_MIN = 0;
const V_MAX = 120 / 3.6; // ≈ 33.33 m/s
/** 이분법 반복/허용오차. */
const BISECT_ITERS = 80;
const BISECT_TOL = 1e-4;

export interface SimSegment {
  /** 구간 거리 (m). */
  distanceM: number;
  /** 구간 평균 경사. grade = tanθ (예: 0.05 = 5%). 내리막은 음수. */
  grade: number;
}

export interface SimParams {
  /** 일정 출력 파워 (W). */
  powerW: number;
  /** 라이더+장비 총 질량 (kg). */
  massKg: number;
  /** CdA (m²). */
  cda: number;
  /** Crr (무차원). */
  crr: number;
  /** 구동계 효율 (0~1). */
  eta: number;
  /** 공기 밀도 (kg/m³). 생략 시 해수면. */
  rho?: number;
}

export interface SimSegmentResult {
  /** 구간 소요시간 (초). */
  sec: number;
  /** 구간 속도 (km/h). */
  speedKmh: number;
}

export interface SimResult {
  /** 총 소요시간 (초). */
  totalSec: number;
  perSegment: SimSegmentResult[];
  /** 전체 평균 속도 (km/h). */
  avgSpeedKmh: number;
}

/**
 * 주어진 파워에서 한 비탈 구간의 정상상태 속도(m/s)를 구한다.
 * 파워 균형식 f(v)=P·η − (aero+roll+grav)·v 의 근을 이분법으로 탐색.
 *
 * 비수렴/비물리(전력 부족으로 전진 불가 등) 케이스는 graceful 하게
 * 매우 낮은 양의 속도로 폴백한다 (totalSec 가 Infinity 가 되지 않도록).
 */
export function steadyStateSpeed(grade: number, params: SimParams): number {
  const { powerW, massKg, cda, crr, eta } = params;
  const rho = params.rho ?? RHO_SEA_LEVEL;

  // 비탈 각 분해 — sinθ, cosθ.
  const denom = Math.sqrt(1 + grade * grade);
  const sinT = grade / denom;
  const cosT = 1 / denom;

  // 단위속도당 저항력 항 (선형부분) — roll + grav.
  const linForce = crr * massKg * GRAVITY * cosT + massKg * GRAVITY * sinT;
  const aeroK = 0.5 * rho * cda; // P_aero = aeroK·v³

  const driveP = Math.max(0, powerW) * eta;

  // f(v) = driveP − aeroK·v³ − linForce·v.
  // v 증가 시 f 단조 감소(공기·구름항 증가). f(0)=driveP.
  // 내리막(linForce<0)에서는 동력 없이도 v>0 해가 존재.
  const f = (v: number): number => driveP - aeroK * v * v * v - linForce * v;

  const f0 = f(0);
  const fMax = f(V_MAX);

  // f(0) 과 f(V_MAX) 가 같은 부호면 구간 내 부호변화 없음 → 클램프 처리.
  if (f0 <= 0) {
    // 정지 상태에서도 저항이 동력을 초과 (가파른 오르막 + 저파워).
    // 물리적으로는 전진 불가지만, totalSec 폭주를 막기 위해 최저 양속도 폴백.
    return 0.3; // ≈ 1.08 km/h
  }
  if (fMax > 0) {
    // V_MAX 에서도 동력이 남음 → 종단속도가 클램프 위. 상한 클램프.
    return V_MAX;
  }

  // 이분법: f(lo)>0, f(hi)<0.
  let lo = V_MIN;
  let hi = V_MAX;
  for (let i = 0; i < BISECT_ITERS; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < BISECT_TOL || hi - lo < BISECT_TOL) return mid;
    if (fm > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 코스 전체(구간 배열)를 주어진 일정 파워로 시뮬레이션.
 * 각 구간을 등속으로 보고 시간(거리/속도)을 합산한다.
 */
export function simulateCourse(segments: SimSegment[], params: SimParams): SimResult {
  let totalSec = 0;
  let totalDist = 0;
  const perSegment: SimSegmentResult[] = [];

  for (const seg of segments) {
    const dist = Math.max(0, seg.distanceM);
    const v = clampSpeed(steadyStateSpeed(seg.grade, params)); // m/s
    const sec = v > 0 ? dist / v : 0;
    perSegment.push({ sec, speedKmh: v * 3.6 });
    totalSec += sec;
    totalDist += dist;
  }

  const avgSpeedKmh = totalSec > 0 ? (totalDist / totalSec) * 3.6 : 0;
  return { totalSec, perSegment, avgSpeedKmh };
}

function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return V_MIN;
  return Math.min(V_MAX, Math.max(V_MIN, v));
}

/**
 * 목표 시간(targetSec)을 달성하기 위한 평균 필요 파워(W)를 역산한다.
 * 파워가 클수록 총 시간이 단조 감소하므로 파워 축에서 이분법.
 *
 * @param params powerW 는 무시되며 내부에서 스윕된다.
 * @returns 필요 평균 파워(W). 목표가 물리적 한계 밖이면 클램프된 경계값.
 */
export function requiredPowerForTime(
  segments: SimSegment[],
  targetSec: number,
  params: Omit<SimParams, "powerW">,
): number {
  const P_LO = 1;
  const P_HI = 2000; // W — 현실적 상한
  const ITERS = 60;

  const timeAt = (p: number): number =>
    simulateCourse(segments, { ...params, powerW: p }).totalSec;

  // 단조 감소: 더 큰 파워 → 더 짧은 시간.
  if (timeAt(P_HI) > targetSec) return P_HI; // 최대 파워로도 못 미침
  if (timeAt(P_LO) < targetSec) return P_LO; // 최소 파워로도 이미 빠름

  let lo = P_LO;
  let hi = P_HI;
  for (let i = 0; i < ITERS; i++) {
    const mid = (lo + hi) / 2;
    const tMid = timeAt(mid);
    if (Math.abs(tMid - targetSec) < 0.5) return mid;
    if (tMid > targetSec) lo = mid; // 너무 느림 → 파워 올림
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface PrPrediction {
  /** PR 예측 시간 (초). */
  totalSec: number;
  /** 지속 가능 평균 파워 추정 (W). */
  sustainablePowerW: number;
  perSegment: SimSegmentResult[];
  avgSpeedKmh: number;
}

/**
 * PDC(CP/W' 모델)로 코스 길이에 맞는 지속 가능 파워를 추정해 PR(최고기록) 시간을 예측.
 *
 * 핵심 순환 문제: 지속 가능 파워는 "얼마나 오래 타느냐(T)"에 의존(P = CP + W'/T),
 * 그런데 T 자체가 파워에 의존한다. 고정점 반복으로 수렴시킨다:
 *   1) T 초기 추정 → P(T) = CP + W'/T 계산
 *   2) 그 P 로 코스 시뮬 → 새 T
 *   3) T 수렴까지 반복 (보통 수 회).
 *
 * CP 가 0/음수거나 비수렴이면 CP 만으로(무한지속 가정) 폴백.
 */
export function predictPR(
  segments: SimSegment[],
  cp: number,
  wPrime: number,
  params: Omit<SimParams, "powerW">,
): PrPrediction {
  const safeCp = cp > 0 ? cp : 0;
  const safeWPrime = wPrime > 0 ? wPrime : 0;

  // P(T) = CP + W'/T (T 초). 단, T 가 매우 짧으면 비현실적으로 커지므로
  // 최소 30초 floor 로 클램프.
  const powerForTime = (tSec: number): number => {
    const t = Math.max(30, tSec);
    return safeCp + safeWPrime / t;
  };

  // 초기 T: CP 만으로 한 번 시뮬.
  let t =
    safeCp > 0
      ? simulateCourse(segments, { ...params, powerW: safeCp }).totalSec
      : 0;

  let lastP = safeCp;
  for (let i = 0; i < 12; i++) {
    const p = powerForTime(t);
    const sim = simulateCourse(segments, { ...params, powerW: p });
    if (Math.abs(sim.totalSec - t) < 0.5) {
      t = sim.totalSec;
      lastP = p;
      break;
    }
    t = sim.totalSec;
    lastP = p;
  }

  const finalSim = simulateCourse(segments, { ...params, powerW: lastP });
  return {
    totalSec: finalSim.totalSec,
    sustainablePowerW: lastP,
    perSegment: finalSim.perSegment,
    avgSpeedKmh: finalSim.avgSpeedKmh,
  };
}
