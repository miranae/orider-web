import type { FatMaxProfile, RideSubstrate } from "../training/metabolism";
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

export interface CyclingDynamicsMetrics {
  source: "session" | "records" | "session_summary";
  sampleCount: number;
  validSampleCount: number;
  coverage: number;
  balance?: { leftAvgPct: number; rightAvgPct: number; asymmetryPct: number };
  torqueEffectiveness?: { leftAvgPct?: number; rightAvgPct?: number; combinedAvgPct?: number };
  pedalSmoothness?: { leftAvgPct?: number; rightAvgPct?: number; combinedAvgPct?: number };
  platformCenterOffset?: { leftAvgMm?: number; rightAvgMm?: number };
  powerPhase?: {
    left?: { startDeg: number; endDeg: number; arcDeg: number; peakStartDeg?: number; peakEndDeg?: number };
    right?: { startDeg: number; endDeg: number; arcDeg: number; peakStartDeg?: number; peakEndDeg?: number };
  };
}

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
    longestSec?: number;
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
  /** HR 스트림 TRIMP를 LTHR 1시간=100으로 정규화한 PMC 부하. */
  streamTrimpTss?: number | null;
  sufferScore: number | null;

  // ── Zones (시간 초)
  zonesSec: {
    sweetSpot: number;  // 83-94% FTP
    threshold: number;  // 95-105%
    vo2: number;        // 106-120%
    anaerobic: number;  // >120%
  };
  hrZoneSec: number[];     // [z1..z5]
  /** 존 경계 정본(서버 파생). 웹은 경계를 다시 파생하지 않는다 (#2437). */
  hrZoneBoundaries?: {
    reference: "lthr" | "max_hr";
    referenceBpm: number;
    sport: "bike" | "run" | "other";
    zones: Array<{ zone: number; minPct: number; maxPct: number | null; minBpm: number; maxBpmExclusive: number | null }>;
  } | null;
  powerZoneSec: number[];  // [z1..z7]
  /** Seiler 3존 체류 초 [저강도, 역치, 고강도] (사이클만). */
  seilerZoneSec?: [number, number, number] | null;
  polarization?: { verdict: "polarized" | "threshold" | "pyramidal"; extremePct: number; thresholdPct: number } | null;
  /** 3초 최대 파워 — 화면의 "최대 파워". 1초 최대(`maxPower`)는 스파이크에 취약하다. */
  maxPower3s?: number | null;
  maxCadence?: number | null;
  /** W' 잔량 곡선(≤200점). `wPrimeMinJ` 와 같은 적산. */
  wPrimeBalance?: number[] | null;
  /** 기질(지방/탄수 kcal) — 서버 시간 가중 적분 (#2437). 웹은 계산하지 않고 읽는다. */
  substrate?: RideSubstrate | null;
  fatMax?: FatMaxProfile | null;
  /** 그래프용 축약 시계열. 계산 입력이 아니다 — 여기서 값을 다시 계산하면 요약과 어긋난다. */
  renderSeries?: { resolution: number; axes: Record<string, Array<number | null>> } | null;
  /** 어느 입력에서 나온 값인가. inline 은 800KB 에서 잘린 스트림이다. */
  sourceLayer?: "raw_parts" | "inline_streams";
  /** 원시 파트가 아직 올라오는 중 — 지금 값은 잠정값이다. */
  inputPending?: boolean;

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
  /** 주행 당시 날씨 — 서버 v22: 습도·풍속은 결측이면 null(0 으로 채우지 않음), windSpeed m/s, condition `wmo_<code>`|unknown. */
  weather?: {
    tempC: number;
    humidity: number | null;
    windSpeed: number | null;
    condition: string;
  } | null;

  // ── 좌우 파워 균형 (dual power 사용자)
  lrBalance?: { avg: number; asymmetryPct: number };
  cyclingDynamics?: CyclingDynamicsMetrics;

  // ── Meta
  /** 가상파워 활동 — mmp/cp/wPrime 은 비운다. */
  /** GPS 품질 요약 (#2345). */
  gpsQuality?: { medianAccuracyM: number; p90AccuracyM: number; coverage: number; poorFixPct: number } | null;
  isVirtualPower?: boolean;
  /** 부하 3축 — **서버 형태 그대로**. 웹이 다른 이름(cardiovascular/muscular/perceptual)으로 재선언하던 것을 제거(ETL 감사). */
  loadAxes?: {
    cardio: { score: number | null; source: "tss" | "trimp" | "time"; confidence: "low" | "medium" | "high" };
    muscle: { score: number | null; source: "wprime" | "power-zones" | "cardio"; confidence: "low" | "medium" | "high" };
    perceived: { score: number | null; source: "rpe" | "decoupling" | "cardio"; confidence: "low" | "medium" | "high" };
  };
  thresholdFlags?: { ftpStale: boolean; ifSuspect: boolean; suggestedFtp?: number } | null;
  discipline: "bike" | "run" | "swim" | "other";
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
  elevLoss?: number;
  avgHr: number | null;
  avgCadence?: number | null;
}

/** 현재 ActivityMetrics 계산 스키마 버전. 변경 시 +1, backfill 트리거. */
export const ACTIVITY_METRICS_VERSION = 22;
