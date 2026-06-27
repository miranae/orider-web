/**
 * 활동별 영속 분석 메트릭 — `activity_metrics/{activityId}` 컬렉션.
 *
 * 휘발성이던 client AnalysisTab 계산 결과를 서버에서 1회 계산해 저장.
 * 효과:
 *   - PR 추적, 시즌 비교, LLM 컨텍스트 풍부화의 데이터 토대
 *   - 매 활동 조회 시 client 재계산 불필요
 *
 * 트리거: onActivityStreamsWrite (streams 도착 후 계산)
 * 버전: 계산식/스키마 변경 시 version 증가 → backfill 트리거
 */

export type DurationKey =
  | "1s" | "5s" | "10s" | "30s"
  | "1m" | "2m" | "5m" | "10m" | "20m" | "30m" | "1h";

export type ClimbCategory = "HC" | "Cat1" | "Cat2" | "Cat3" | "Cat4" | null;

export type WorkoutType =
  | "recovery" | "endurance" | "tempo" | "threshold"
  | "interval" | "race" | "mixed";

export interface ActivityMetrics {
  // ── 기본 (Coggan)
  np: number | null;
  if: number | null;
  tss: number | null;
  vi: number | null;
  xPower: number | null;
  workKj: number;
  caloriesKcal: number;

  // ── 평균/최대
  avgPower: number | null;
  maxPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  avgSpeedKph: number | null;
  maxSpeedKph: number | null;
  distanceKm: number;
  durationSec: number;
  elevationGainM: number;

  // ── A.6 신규: 거리/시간/경사 보강
  /** % — 평균 경사 = elevationGainM / (distanceKm × 1000) × 100. 거리 0 또는 gain 0 → null. */
  avgGrade: number | null;
  /** % — 30s 윈도우 최대 경사. altitude+distance 필요. */
  maxGrade: number | null;
  /** m — 누적 하강 (양수). */
  elevationLossM: number;
  /** sec — 정지 제외 (velocity_smooth 또는 distance Δ 기반). 데이터 부족 → durationSec. */
  movingTimeSec: number;
  /** sec — durationSec - movingTimeSec. */
  pauseTimeSec: number;
  /** HR peak per duration (intervals.icu HR MMP 표준). hr 없으면 빈 객체. */
  peakHr: {
    "1m"?: number;
    "5m"?: number;
    "20m"?: number;
  };

  // ── 모델 fit
  cp: number | null;
  wPrime: number | null;
  cpR2: number | null;

  // ── Quadrant Analysis (force×velocity, cadence×power 4 사분면 시간%)
  // null 이면 cadence 데이터 부재
  quadrant: {
    q1Pct: number;  // high cadence + high power (sprint)
    q2Pct: number;  // high cadence + low power (easy spin)
    q3Pct: number;  // low cadence + low power (coast)
    q4Pct: number;  // low cadence + high power (climb/strength)
  } | null;

  // ── 매치 (FTP 초과 연속 구간)
  matches: {
    count: number;
    totalSec: number;
    peakW: number;
    longestW: number;
  };

  // ── 클라임 (자동 감지 + 분류 + VAM/W·kg)
  climbs: ClimbMetric[];

  // ── Decoupling / EF
  decoupling: {
    ef: number | null;            // NP / avgHR
    decouplingPct: number | null; // (EF_1H - EF_2H) / EF_1H × 100
    hrDriftPct: number | null;
  };

  // ── TRIMP / Suffer
  trimp: number | null;
  sufferScore: number | null;

  // ── Zones (시간 초)
  zonesSec: {
    sweetSpot: number;  // 83-94% FTP
    threshold: number;  // 95-105%
    vo2: number;        // 106-120%
    anaerobic: number;  // >120%
  };
  hrZoneSec: number[];     // [z1..z5]
  powerZoneSec: number[];  // [z1..z7]

  // ── A.6 신규: 존 별 누적 일 (kJ) — power zone z1..z7.
  /** 사이클만 의미 있음 (watts 필요). watts 없으면 모두 0. */
  zoneKj: {
    z1: number; z2: number; z3: number;
    z4: number; z5: number; z6: number; z7: number;
  };

  // ── A.6 신규: W' balance min (Skiba ODE). CP + W' 둘 다 있어야 계산.
  /** J — 활동 중 W' battery 최저값. CP/W' 또는 watts 없으면 null. */
  wPrimeMinJ: number | null;

  // ── Power curve (단일 활동 best per duration)
  mmp: Partial<Record<DurationKey, number>>;

  // ── Run-specific
  splits?: SplitRow[];
  runMetrics?: {
    gapAvgSec: number | null;       // grade-adjusted pace 평균 (sec/km)
    /** A.6: split paces 표준편차 — 페이스 일관성. splits<2 → null. */
    paceStdDevSec?: number | null;
    /** A.6: 단일 km split 최저 페이스 (가장 빠름). */
    minPaceSecPerKm?: number | null;
    formPowerAvg?: number;          // Stryd
    gctAvg?: number;                // ground contact time (ms)
    voAvg?: number;                 // vertical oscillation (cm)
    strideLength?: number;
  };

  // ── A.6: Cycling-specific 보강.
  cyclingMetrics?: {
    /** rpm — cadence 표준편차 (페달링 일관성). cadence 없으면 null. */
    cadenceStdDev: number | null;
    /** sec — 가장 긴 Z4+ (≥91% FTP) 연속 구간. ftp/watts 없으면 null. */
    longestZ4PlusSec: number | null;
  };

  // ── Swim-specific
  swimMetrics?: {
    swolfAvg: number;
    strokesPerLap: number;
    distancePerStroke: number;
  };

  // ── 자동 분류
  workoutType: WorkoutType;
  /** A.6: 분류 규칙 매칭 강도 0..1. recovery/interval/threshold/tempo 의 강한 룰 명중 → 1, 잔여 mixed fallback → 0.3. */
  workoutTypeConfidence: number;

  // ── AeT (Aerobic Threshold) 자동 감지 — Phase A 에선 placeholder
  aet?: { hr: number; watts: number; confidence: number };

  // ── 환경
  weather?: {
    tempC: number;
    humidity: number;
    windSpeed: number;
    condition: string;
  };

  // ── 좌우 파워 균형 (dual power 사용자)
  lrBalance?: { avg: number; asymmetryPct: number };

  // ── Meta
  discipline: "bike" | "run" | "swim";
  activityType: string;            // raw a.type ("Ride", "VirtualRide", ...)
  startTime: number;
  computedAt: number;
  version: number;                 // 스키마/계산식 변경 시 증가
  // 입력 컨텍스트 스냅샷 (재계산 시 무엇으로 계산했는지 추적)
  contextSnapshot: {
    ftp?: number;
    maxHr?: number;
    weightKg?: number;
    lthr?: number;
  };
}

export interface ClimbMetric {
  startKm: number;
  endKm: number;
  lengthKm: number;
  elevationGainM: number;
  avgGrade: number;
  category: ClimbCategory;
  vam: number | null;          // m/h
  durationSec: number | null;
  avgPower: number | null;     // 클라임 구간 평균 파워
  wPerKg: number | null;       // climb 시 avgPower / weight
  normalizedPower: number | null;
  climbScore: number;          // grade% × lengthKm × 100 (Strava 식)
}

export interface SplitRow {
  km: number;
  paceSec: number;
  gapSec: number;
  elevGain: number;
  avgHr: number | null;
}

/** 현재 ActivityMetrics 계산 스키마 버전. 변경 시 +1, backfill 트리거. */
export const ACTIVITY_METRICS_VERSION = 2;
