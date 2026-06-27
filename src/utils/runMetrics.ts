// 러닝 전용 메트릭: km 스플릿, GAP (Grade Adjusted Pace)

/**
 * Minetti 에너지 비용 모델 (J/kg/m) — 경사 g (0~1).
 * c(g) = 155.4·g⁵ - 30.4·g⁴ - 43.3·g³ + 46.3·g² + 19.5·g + 3.6
 */
function minettiCost(grade: number): number {
  const g = Math.max(-0.45, Math.min(0.45, grade));
  return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
}

const C_FLAT = minettiCost(0); // 3.6 J/kg/m

export interface RunSplit {
  km: number;             // 1, 2, 3, ... (이 km 스플릿 번호)
  paceSecPerKm: number;   // 실제 페이스 (초/km)
  gapSecPerKm: number | null; // 경사 보정 페이스
  avgHr: number | null;
  avgCadence: number | null;
  elevationGain: number;  // m (양의 변화 합)
  elevationLoss: number;  // m
}

interface RunSplitsInput {
  distance?: number[];   // m, cumulative
  time?: number[];        // s
  heartrate?: number[];
  cadence?: number[];
  altitude?: number[];
}

/** 1km 단위 스플릿 — distance 스트림 기반으로 인덱스 분할 */
export function calculateRunSplits(streams: RunSplitsInput): RunSplit[] {
  const { distance, heartrate, cadence, altitude } = streams;
  const time = streams.time;
  if (!distance?.length) return [];
  const n = distance.length;

  // 시간 인덱스 변환 — time이 없으면 1Hz 가정
  const timeAt = (i: number): number => {
    if (time && time.length === n) return (time[i] ?? 0);
    return i; // 1Hz
  };

  // 누적 거리 → 1km 경계점 인덱스 찾기
  const start = distance[0] ?? 0;
  const totalKm = Math.floor(((distance[n - 1] ?? start) - start) / 1000);
  const splits: RunSplit[] = [];
  let prevIdx = 0;

  for (let k = 1; k <= totalKm; k++) {
    const targetM = start + k * 1000;
    let idx = prevIdx;
    while (idx < n && (distance[idx] ?? 0) < targetM) idx++;
    if (idx >= n) break;

    const startIdx = prevIdx;
    const endIdx = idx;
    const sliceLen = Math.max(1, endIdx - startIdx);

    const tStart = timeAt(startIdx);
    const tEnd = timeAt(endIdx);
    const dt = Math.max(0.1, tEnd - tStart);
    const dx = Math.max(1, (distance[endIdx] ?? 0) - (distance[startIdx] ?? 0));
    const paceSecPerKm = (dt / dx) * 1000;

    // 평균 HR / 케이던스
    let hrSum = 0, hrN = 0;
    let cadSum = 0, cadN = 0;
    if (heartrate?.length) {
      for (let i = startIdx; i < endIdx; i++) {
        const v = heartrate[i] ?? 0;
        if (v > 0) { hrSum += v; hrN++; }
      }
    }
    if (cadence?.length) {
      for (let i = startIdx; i < endIdx; i++) {
        const v = cadence[i] ?? 0;
        if (v > 0) { cadSum += v; cadN++; }
      }
    }

    // 고도 상승/하강 + GAP
    let elevGain = 0;
    let elevLoss = 0;
    let weightedCost = 0; // sum c(g) * dx
    let totalDx = 0;
    if (altitude?.length) {
      const STEP = Math.max(5, Math.floor(sliceLen / 20));
      for (let i = startIdx; i < endIdx; i += STEP) {
        const j = Math.min(i + STEP, endIdx);
        const dAlt = (altitude[j] ?? 0) - (altitude[i] ?? 0);
        const segDx = Math.max(0.01, (distance[j] ?? 0) - (distance[i] ?? 0));
        if (dAlt > 0) elevGain += dAlt;
        else elevLoss += -dAlt;
        const grade = dAlt / segDx;
        weightedCost += minettiCost(grade) * segDx;
        totalDx += segDx;
      }
    }
    const gapSecPerKm = totalDx > 0
      ? paceSecPerKm * (C_FLAT / (weightedCost / totalDx))
      : null;

    splits.push({
      km: k,
      paceSecPerKm,
      gapSecPerKm,
      avgHr: hrN > 0 ? hrSum / hrN : null,
      avgCadence: cadN > 0 ? cadSum / cadN : null,
      elevationGain: elevGain,
      elevationLoss: elevLoss,
    });
    prevIdx = endIdx;
  }
  return splits;
}

/** 활동 전체의 평균 GAP (초/km). */
export function calculateOverallGap(streams: RunSplitsInput): number | null {
  const splits = calculateRunSplits(streams);
  if (!splits.length) return null;
  let totalGapSec = 0;
  let totalKm = 0;
  for (const s of splits) {
    if (s.gapSecPerKm == null) continue;
    totalGapSec += s.gapSecPerKm;
    totalKm += 1;
  }
  return totalKm > 0 ? totalGapSec / totalKm : null;
}
