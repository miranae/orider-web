// 고급 활동 분석 메트릭 (intervals.icu 스타일)
import { calculateNP } from "./powerMetrics";
import { sampleDurationsSec, weightedMean, type SampleTiming } from "./sampleTime";
import type { StreamTimeArray } from "./streamTime";

/** 평균/최대값 + 유효 샘플 수 (0 제외 옵션) */
export function avgMax(arr: number[] | undefined, opts?: { ignoreZero?: boolean }): { avg: number | null; max: number | null; count: number } {
  if (!arr?.length) return { avg: null, max: null, count: 0 };
  let sum = 0;
  let max = -Infinity;
  let n = 0;
  for (const v of arr) {
    if (!Number.isFinite(v)) continue;
    if (opts?.ignoreZero && v === 0) continue;
    sum += v;
    if (v > max) max = v;
    n++;
  }
  if (n === 0) return { avg: null, max: null, count: 0 };
  return { avg: sum / n, max, count: n };
}

/** 총 일 (kJ) — Σwatts × dt / 1000 */
export function calculateWorkKj(watts: number[], time?: StreamTimeArray, timing?: SampleTiming): number {
  const durations = sampleDurationsSec(watts.length, time, timing);
  let sum = 0;
  for (let i = 0; i < watts.length; i++) {
    const w = watts[i]!;
    const dt = durations[i] ?? 0;
    if (Number.isFinite(w) && Number.isFinite(dt) && dt > 0) sum += w * dt;
  }
  return sum / 1000;
}

/** Efficiency Factor — NP / avgHR. 같은 사람의 추세 비교용 (높을수록 효율 ↑) */
export function calculateEF(watts: number[], heartrate: number[], timing?: SampleTiming): number | null {
  const np = calculateNP(watts, undefined, timing);
  if (np === null) return null;
  const { avg } = avgMax(heartrate, { ignoreZero: true });
  if (!avg || avg <= 0) return null;
  return np / avg;
}

/**
 * Aerobic Decoupling (Pw:Hr) — 전반/후반 EF 변화율(%).
 * <5%: 우수한 유산소 내구성, >5%: 카디악 드리프트 발생.
 */
export function calculateDecoupling(watts: number[], heartrate: number[], timing?: SampleTiming): number | null {
  const n = Math.min(watts.length, heartrate.length);
  if (n < 600) return null; // 최소 10분
  const half = Math.floor(n / 2);
  const w1 = watts.slice(0, half);
  const w2 = watts.slice(half, n);
  const h1 = heartrate.slice(0, half);
  const h2 = heartrate.slice(half, n);
  const timing1 = timing ? {
    durationsSec: timing.durationsSec?.slice(0, half),
    segmentStarts: timing.segmentStarts?.slice(0, half),
  } : undefined;
  const timing2 = timing ? {
    durationsSec: timing.durationsSec?.slice(half, n),
    segmentStarts: timing.segmentStarts?.slice(half, n),
  } : undefined;
  const ef1 = calculateEF(w1, h1, timing1);
  const ef2 = calculateEF(w2, h2, timing2);
  if (ef1 == null || ef2 == null || ef1 === 0) return null;
  return ((ef1 - ef2) / ef1) * 100;
}

/**
 * 심박 드리프트 (%) — 동일 강도 가정 시 후반 평균HR이 얼마나 상승했는가.
 * HR 단독으로 본 단순 드리프트.
 */
export function calculateHrDrift(heartrate: number[]): number | null {
  if (heartrate.length < 600) return null;
  const half = Math.floor(heartrate.length / 2);
  const a1 = avgMax(heartrate.slice(0, half), { ignoreZero: true }).avg;
  const a2 = avgMax(heartrate.slice(half), { ignoreZero: true }).avg;
  if (!a1 || !a2) return null;
  return ((a2 - a1) / a1) * 100;
}

/**
 * TRIMP (Banister) 근사 — Σ duration_min × HRr × 0.64·e^(1.92·HRr)
 * HRr = (HR - restHr) / (maxHr - restHr). 남자 가중치 1.92, 여자 1.67. 기본 남자.
 */
export function calculateTRIMP(
  heartrate: number[],
  maxHr: number,
  restHr = 60,
  gender: "male" | "female" = "male",
  time?: StreamTimeArray,
  timing?: SampleTiming,
): number | null {
  if (!heartrate.length || maxHr <= restHr) return null;
  const k = gender === "female" ? 1.67 : 1.92;
  const c = gender === "female" ? 0.86 : 0.64;
  const durations = sampleDurationsSec(heartrate.length, time, timing);
  let sum = 0;
  for (let i = 0; i < heartrate.length; i++) {
    const hr = heartrate[i]!;
    const dt = durations[i] ?? 0;
    if (!Number.isFinite(hr) || hr <= restHr) continue;
    const r = Math.max(0, Math.min(1, (hr - restHr) / (maxHr - restHr)));
    sum += (dt / 60) * r * c * Math.exp(k * r);
  }
  return sum;
}

/** LTHR 미상 시 임계 HR 근사치 (%maxHR). Friel: 잘 훈련된 선수 LTHR ≈ maxHR 의 85~92% —
 *  과대평가(=부하 저평가) 방지를 위해 보수적 하한 채택(TIME_FACTORS 보수화와 동일 철학). */
const DEFAULT_THRESHOLD_HR_PCT = 0.85;

/**
 * TRIMP(Banister) → TSS 등가 정규화 (hrTSS 방식).
 *
 * TSS 는 "FTP 로 1시간 라이딩 = 100" 이 정의다. 원시 TRIMP 는 이 기준이 없어 개인의
 * restHr/maxHr·강도 분포에 따라 스케일이 크게 요동친다(예: HRr 0.85 로 1시간이면
 * TRIMP ≈ 167, HRr 0.55 Z2 라이딩 1시간이면 TRIMP ≈ 17 — TSS 라면 각각 100·30 대여야 함).
 * PMC(CTL/ATL/TSB)에 파워 기반 TSS 와 같은 척도로 섞이려면 "임계 HR(LTHR, 없으면
 * maxHR×0.85 근사)에서 1시간 = 100" 이 되도록 재정규화해야 한다 — TrainingPeaks 의
 * hrTSS 산정 원리와 동일. thresholdHr 을 기준 TRIMP/h 로 나눠 100 을 곱한다.
 */
export function trimpToTssEquivalent(params: {
  heartrate: number[];
  maxHr: number;
  restHr?: number;
  /** LTHR(있으면 최우선). 없으면 maxHr × DEFAULT_THRESHOLD_HR_PCT 근사. */
  thresholdHr?: number | null;
  gender?: "male" | "female";
  time?: StreamTimeArray;
}): number | null {
  const { heartrate, maxHr, restHr = 60, gender = "male", time } = params;
  if (!heartrate.length || maxHr <= restHr) return null;
  const thresholdHr =
    params.thresholdHr != null && params.thresholdHr > restHr && params.thresholdHr < maxHr
      ? params.thresholdHr
      : maxHr * DEFAULT_THRESHOLD_HR_PCT;
  const trimp = calculateTRIMP(heartrate, maxHr, restHr, gender, time);
  if (trimp == null) return null;
  // 임계HR 로 1시간(3600 × 1Hz) 유지했을 때의 기준 TRIMP — calculateTRIMP 재사용으로 상수(k/c) 중복 방지.
  const oneHourAtThreshold = calculateTRIMP(new Array(3600).fill(thresholdHr), maxHr, restHr, gender);
  if (!oneHourAtThreshold || oneHourAtThreshold <= 0) return null;
  return (trimp / oneHourAtThreshold) * 100;
}

/** 누적 고도 상승 (m) — altitude 스트림에서 양의 변화량 합 */
export function calculateElevationGain(altitude: number[] | undefined, threshold = 0.5): number | null {
  if (!altitude?.length) return null;
  let gain = 0;
  let last = altitude[0]!;
  for (let i = 1; i < altitude.length; i++) {
    const a = altitude[i]!;
    const d = a - last;
    if (d >= threshold) {
      gain += d;
      last = a;
    } else if (d < 0) {
      last = a;
    }
  }
  return gain;
}

/** 임계 영역 시간(초) — Sweet Spot(83-94% FTP), Threshold(95-105%), VO2(106-120%), Anaerobic(>120%) */
export interface CriticalBand {
  label: string;
  range: string;
  seconds: number;
  color: string;
}
export function calculateCriticalBands(watts: number[], ftp: number, time?: StreamTimeArray, timing?: SampleTiming): CriticalBand[] {
  const bands = [
    { label: "Sweet Spot", lo: 0.83, hi: 0.95, color: "var(--zone-3)" },
    { label: "Threshold", lo: 0.95, hi: 1.06, color: "var(--zone-4)" },
    { label: "VO2max", lo: 1.06, hi: 1.20, color: "var(--zone-5)" },
    { label: "Anaerobic", lo: 1.20, hi: Infinity, color: "var(--zone-5)" },
  ];
  const counts = bands.map(() => 0);
  const durations = sampleDurationsSec(watts.length, time, timing);
  for (let sampleIdx = 0; sampleIdx < watts.length; sampleIdx++) {
    const w = watts[sampleIdx]!;
    const dt = durations[sampleIdx] ?? 0;
    const r = w / ftp;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]!;
      if (r >= b.lo && r < b.hi) { counts[i] = (counts[i] ?? 0) + dt; break; }
    }
  }
  return bands.map((b, i) => ({
    label: b.label,
    range: b.hi === Infinity ? `>${Math.round(b.lo * 100)}% FTP` : `${Math.round(b.lo * 100)}-${Math.round(b.hi * 100)}% FTP`,
    seconds: counts[i]!,
    color: b.color,
  }));
}

function elapsedSeconds(time: number[] | undefined, startIdx: number, endIdx: number): number | null {
  if (!time || time.length <= endIdx) return null;
  const start = time[startIdx];
  const end = time[endIdx];
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return end - start;
}

/** 거리 스트림에서 N초 윈도우 최대 속도 (m/s) — time 스트림이 있으면 non-1Hz 샘플링 보정 */
function maxSpeedFromDistance(distance: number[], time?: number[], window = 10): number | null {
  if (distance.length < 2 || (!time?.length && distance.length < window + 1)) return null;
  let max = 0;
  if (time?.length) {
    for (let i = 1; i < distance.length; i++) {
      for (let startIdx = i - 1; startIdx >= 0; startIdx--) {
        const duration = elapsedSeconds(time, startIdx, i);
        if (duration == null || duration < window) continue;
        const d = (distance[i] ?? 0) - (distance[startIdx] ?? 0);
        if (d > 0) max = Math.max(max, d / duration);
        break;
      }
    }
    return max > 0 ? max : null;
  }
  for (let i = 1; i < distance.length; i++) {
    const startIdx = i - window;
    if (startIdx < 0) continue;
    const d = (distance[i] ?? 0) - (distance[startIdx] ?? 0);
    if (d <= 0) continue;
    const v = d / (i - startIdx);
    if (v > max) max = v;
  }
  return max > 0 ? max : null;
}

/** N초 롤링 평균의 최대값 — 단일 샘플 GPS 스파이크 제거 */
function rollingMaxSmoothed(arr: number[], window: number): number | null {
  if (!arr.length) return null;
  if (arr.length < window) return null;
  let sum = 0;
  for (let i = 0; i < window; i++) sum += arr[i] ?? 0;
  let max = sum / window;
  for (let i = window; i < arr.length; i++) {
    sum += (arr[i] ?? 0) - (arr[i - window] ?? 0);
    const avg = sum / window;
    if (avg > max) max = avg;
  }
  return max;
}

/** 사이클·러닝에서 물리적으로 가능한 최대 속도 상한 (m/s = 33 ≈ 120km/h) */
const MAX_REALISTIC_MPS = 33;

/**
 * Skiba xPower — 25초 지수가중 평균 후 4승 평균의 4제곱근.
 * 가변 강도 활동(MTB, 산악, 인터벌)에서 NP 대안.
 */
export function calculateXPower(watts: number[], time?: StreamTimeArray, timing?: SampleTiming): number | null {
  const durations = sampleDurationsSec(watts.length, time, timing);
  const totalDuration = durations.reduce((sum, dt) => sum + dt, 0);
  if (totalDuration < 25) return null;
  const tau = 25;
  const ewma: number[] = [];
  let prev = watts[0]!;
  ewma.push(prev);
  for (let i = 1; i < watts.length; i++) {
    if (timing?.segmentStarts?.[i]) {
      prev = watts[i]!;
      ewma.push(prev);
      continue;
    }
    const dt = durations[i] ?? 1;
    const alpha = 1 - Math.exp(-dt / tau);
    prev = prev + alpha * ((watts[i] ?? 0) - prev);
    ewma.push(prev);
  }
  const m = weightedMean(ewma.map((v) => v ** 4), durations);
  if (m == null) return null;
  return Math.sqrt(Math.sqrt(m));
}

/** "매치" 분석 — FTP 초과 노력의 횟수·시간·평균 파워 (지속시간 ≥ minSeconds) */
export interface MatchStats {
  count: number;
  totalSeconds: number;
  avgPower: number | null;
  longestSeconds: number;
  longestAvgPower: number | null;
}
export function analyzeMatches(
  watts: number[],
  ftp: number,
  minSeconds = 30,
  time?: StreamTimeArray,
  timing?: SampleTiming,
): MatchStats {
  const durations = sampleDurationsSec(watts.length, time, timing);
  let count = 0;
  let totalS = 0;
  let cumPowerSum = 0;
  let cumPowerDuration = 0;
  let longest = 0;
  let longestSum = 0;
  let longestDuration = 0;
  let i = 0;
  while (i < watts.length) {
    if ((watts[i] ?? 0) > ftp) {
      let j = i;
      let sum = 0;
      let dur = 0;
      while (j < watts.length && (watts[j] ?? 0) > ftp && (j === i || !timing?.segmentStarts?.[j])) {
        const dt = durations[j] ?? 0;
        sum += (watts[j] ?? 0) * dt;
        dur += dt;
        j++;
      }
      if (dur >= minSeconds) {
        count++;
        totalS += dur;
        cumPowerSum += sum;
        cumPowerDuration += dur;
        if (dur > longest) {
          longest = dur;
          longestSum = sum;
          longestDuration = dur;
        }
      }
      i = j;
    } else i++;
  }
  return {
    count,
    totalSeconds: totalS,
    avgPower: cumPowerDuration > 0 ? cumPowerSum / cumPowerDuration : null,
    longestSeconds: longest,
    longestAvgPower: longestDuration > 0 ? longestSum / longestDuration : null,
  };
}

/**
 * 2-파라미터 임계 파워 모델: P(t) = W'/t + CP.
 * 파워 커브의 (3분~20분) 구간으로 선형회귀 (P = W'·(1/t) + CP).
 */
export interface CriticalPowerEstimate {
  cp: number;
  wPrime: number; // joules
  rSquared: number;
}
export function estimateCriticalPower(curve: { durationSeconds: number; maxPower: number }[]): CriticalPowerEstimate | null {
  const pts = curve.filter((p) => p.durationSeconds >= 180 && p.durationSeconds <= 1200 && p.maxPower > 0);
  if (pts.length < 2) return null;
  const n = pts.length;
  const xs = pts.map((p) => 1 / p.durationSeconds);
  const ys = pts.map((p) => p.maxPower);
  const xMean = xs.reduce((s, v) => s + v, 0) / n;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - xMean) * (ys[i]! - yMean);
    den += (xs[i]! - xMean) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den; // = W'
  const intercept = yMean - slope * xMean; // = CP
  // R²
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yh = intercept + slope * xs[i]!;
    ssRes += (ys[i]! - yh) ** 2;
    ssTot += (ys[i]! - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  if (intercept <= 0 || slope <= 0) return null;
  return { cp: intercept, wPrime: slope, rSquared: r2 };
}

/**
 * 클라임 자동 탐지 — altitude·distance 스트림에서 평균 경사 ≥ minGrade 가
 * 최소 minLengthM 이상 지속되는 구간을 추출.
 */
export interface ClimbSegment {
  startKm: number;
  endKm: number;
  lengthKm: number;
  elevationGain: number; // m
  avgGrade: number; // %
  vam: number | null; // m/h (시간 데이터 있을 때)
  durationSec: number | null;
}
export function detectClimbs(
  altitude: number[] | undefined,
  distance: number[] | undefined,
  time?: number[],
  minGrade = 3,
  minLengthM = 500,
  smoothWindow = 30,
): ClimbSegment[] {
  if (!altitude?.length || !distance?.length) return [];
  const n = Math.min(altitude.length, distance.length);
  if (n < smoothWindow * 2) return [];

  // 거리·고도 평활 (앞뒤 평균)
  const sm = (arr: number[]) => {
    const out: number[] = new Array(arr.length);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i] ?? 0;
      if (i >= smoothWindow) sum -= arr[i - smoothWindow] ?? 0;
      const w = Math.min(i + 1, smoothWindow);
      out[i] = sum / w;
    }
    return out;
  };
  const altS = sm(altitude.slice(0, n));
  const distS = distance.slice(0, n);

  const climbs: ClimbSegment[] = [];
  let i = 0;
  while (i < n - 1) {
    // 100m 단위로 grade 계산 후 minGrade 이상이면 시작
    let j = i;
    while (j < n - 1) {
      const dDist = (distS[j + 1] ?? 0) - (distS[j] ?? 0);
      const dAlt = (altS[j + 1] ?? 0) - (altS[j] ?? 0);
      if (dDist <= 0) { j++; continue; }
      const grade = (dAlt / dDist) * 100;
      if (grade < 1) break; // 평지/내리막
      j++;
    }
    if (j > i + smoothWindow) {
      const lenM = (distS[j] ?? 0) - (distS[i] ?? 0);
      const gain = (altS[j] ?? 0) - (altS[i] ?? 0);
      const avgGrade = lenM > 0 ? (gain / lenM) * 100 : 0;
      if (lenM >= minLengthM && avgGrade >= minGrade) {
        // 시간 데이터 있으면 VAM (m/h) = gain / (durationSec/3600)
        let durationSec: number | null = null;
        let vam: number | null = null;
        if (time && time.length >= j + 1 && time[i] != null && time[j] != null) {
          const t0 = time[i] as number;
          const t1 = time[j] as number;
          if (t1 > t0) {
            durationSec = t1 - t0;
            vam = Math.round((gain / durationSec) * 3600);
          }
        }
        climbs.push({
          startKm: (distS[i] ?? 0) / 1000,
          endKm: (distS[j] ?? 0) / 1000,
          lengthKm: lenM / 1000,
          elevationGain: gain,
          avgGrade,
          vam,
          durationSec,
        });
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return climbs;
}

/** 평균 속도 (m/s) → km/h. velocity_smooth 또는 distance/time fallback. 최대값은 거리스트림 10s 윈도우 우선, 비현실치는 폐기. */
export function calculateAvgSpeed(streams: { velocity_smooth?: number[]; distance?: number[]; time?: number[] }): { avgKph: number | null; maxKph: number | null } {
  let avgMps: number | null = null;
  let maxMps: number | null = null;

  // 평균: velocity_smooth → distance/time
  if (streams.velocity_smooth?.length) {
    const { avg } = avgMax(streams.velocity_smooth);
    avgMps = avg;
  }
  if (avgMps == null && streams.distance?.length) {
    const len = streams.distance.length;
    const totalM = streams.distance[len - 1]! - streams.distance[0]!;
    const durationSec = elapsedSeconds(streams.time, 0, len - 1) ?? (len - 1);
    if (len > 1 && totalM > 0 && durationSec > 0) avgMps = totalM / durationSec;
  }

  // 최대: distance 10s 윈도우 (가장 안정) → velocity_smooth 10s 평활 → null
  if (streams.distance?.length) {
    maxMps = maxSpeedFromDistance(streams.distance, streams.time, 10);
  }
  if (maxMps == null && streams.velocity_smooth?.length) {
    maxMps = rollingMaxSmoothed(streams.velocity_smooth, 10);
  }
  // 비현실 값 차단 (센서 글리치)
  if (maxMps != null && maxMps > MAX_REALISTIC_MPS) maxMps = null;

  return {
    avgKph: avgMps != null ? avgMps * 3.6 : null,
    maxKph: maxMps != null ? maxMps * 3.6 : null,
  };
}

/**
 * W'bal(잔량 에너지) 시계열 — Skiba 2015 단순화 모델. 서버
 * functions/src/analysis/activity-metrics.ts:wPrimeBalanceMin 과 동일 알고리즘의 클라 미러.
 *  - P > CP: W_bal -= (P - CP) × dt
 *  - P ≤ CP: W_bal += (W'max - W_bal) × (1 - exp(-dt/tau)), tau = 546·exp(-0.01(CP-P)) + 316
 * 차트용으로 maxPoints 까지 다운샘플(구간 최소값 보존 — 고갈 저점이 사라지지 않게).
 * @returns { series: 다운샘플된 W'bal(J) 배열, minJ, idxMin: series 내 최소 위치 } | null
 */
export function wPrimeBalanceSeries(
  watts: number[] | undefined,
  cp: number | null,
  wPrimeMax: number | null,
  dtSec: number | number[],
  maxPoints = 200,
): { series: number[]; minJ: number; idxMin: number } | null {
  if (!watts || watts.length < 30 || !cp || cp <= 0 || !wPrimeMax || wPrimeMax <= 0) return null;
  if (typeof dtSec === "number" && (!Number.isFinite(dtSec) || dtSec <= 0)) return null;
  if (Array.isArray(dtSec) && dtSec.some((dt) => !Number.isFinite(dt) || dt <= 0)) return null;
  let bal = wPrimeMax;
  const full: number[] = [];
  for (let i = 0; i < watts.length; i++) {
    const w = watts[i]!;
    const dt = Array.isArray(dtSec) ? (dtSec[i] ?? 1) : dtSec;
    if (Number.isFinite(w)) {
      if (w > cp) {
        bal -= (w - cp) * dt;
        if (bal < 0) bal = 0;
      } else {
        const tau = 546 * Math.exp(-0.01 * (cp - w)) + 316;
        bal += (wPrimeMax - bal) * (1 - Math.exp(-dt / tau));
        if (bal > wPrimeMax) bal = wPrimeMax;
      }
    }
    full.push(bal);
  }
  if (full.length === 0) return null;
  // 다운샘플: 버킷당 최소값 보존(저점 유지)
  const bucket = Math.max(1, Math.ceil(full.length / maxPoints));
  const series: number[] = [];
  for (let i = 0; i < full.length; i += bucket) {
    let m = Infinity;
    for (let j = i; j < Math.min(i + bucket, full.length); j++) if (full[j]! < m) m = full[j]!;
    series.push(m);
  }
  let minJ = Infinity, idxMin = 0;
  series.forEach((v, i) => { if (v < minJ) { minJ = v; idxMin = i; } });
  return { series, minJ, idxMin };
}
