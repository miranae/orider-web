/**
 * 서버 `activity_metrics` → 화면 모양 (#2437, 에픽 app#2237 G).
 *
 * 여기에는 **계산이 없다.** 존 이름·색·라벨처럼 화면의 것만 붙인다. 이전엔 웹이
 * `src/utils/{advancedMetrics,zoneAnalysis,powerCurve,powerMetrics,runMetrics}.ts` 사본으로
 * 스트림에서 다시 계산했고, 같은 이름 함수 11개의 본문이 서버와 달라져 같은 활동이 화면과
 * 서버에서 다른 값을 냈다. 사본은 삭제됐다 — 값은 서버에서 온다.
 */
import type { ActivityMetricsDoc } from "../../../hooks/useActivityMetrics";

/** 표시 매퍼 입력 — 필터된 문서(일부 필드 제거)도 받는다. 매퍼는 없는 필드를 null 로 다룬다. */
export type MetricsLike = Partial<ActivityMetricsDoc>;

export interface ZoneDistribution {
  zone: number;
  name: string;
  nameKey: string;
  seconds: number;
  percentage: number;
  color: string;
}

export interface SeilerZoneDistribution {
  zone: 1 | 2 | 3;
  label: string;
  seconds: number;
  pct: number;
  color: string;
}

export interface CriticalBand {
  label: string;
  range: string;
  seconds: number;
  color: string;
}

export interface PowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

export interface ClimbSegment {
  startKm: number;
  endKm: number;
  lengthKm: number;
  elevationGain: number;
  avgGrade: number;
  vam: number | null;
  durationSec: number | null;
}

const HR_ZONE_LABELS = [
  { name: "회복", nameKey: "fitness:zone.recovery", color: "var(--zone-1)" },
  { name: "지구력", nameKey: "fitness:zone.endurance", color: "var(--zone-2)" },
  { name: "템포", nameKey: "fitness:zone.tempo", color: "var(--zone-3)" },
  { name: "역치", nameKey: "fitness:zone.threshold", color: "var(--zone-4)" },
  { name: "최대", nameKey: "fitness:zone.maxAerobic", color: "var(--zone-5)" },
];

const POWER_ZONE_LABELS = [
  { name: "회복", nameKey: "fitness:zone.recovery", color: "var(--zone-1)" },
  { name: "지구력", nameKey: "fitness:zone.endurance", color: "var(--zone-2)" },
  { name: "템포", nameKey: "fitness:zone.tempo", color: "var(--zone-3)" },
  { name: "역치", nameKey: "fitness:zone.threshold", color: "var(--zone-4)" },
  { name: "VO2max", nameKey: "fitness:zone.vo2max", color: "var(--zone-5)" },
  { name: "무산소", nameKey: "fitness:zone.anaerobic", color: "var(--zone-5)" },
  { name: "신경근", nameKey: "fitness:zone.neurological", color: "var(--zone-5)" },
];

function distribution(seconds: readonly number[] | undefined, labels: typeof HR_ZONE_LABELS): ZoneDistribution[] | null {
  if (!seconds || seconds.length === 0) return null;
  const total = seconds.reduce((sum, s) => sum + s, 0);
  return labels.slice(0, seconds.length).map((label, i) => ({
    zone: i + 1,
    ...label,
    seconds: seconds[i] ?? 0,
    percentage: total > 0 ? ((seconds[i] ?? 0) / total) * 100 : 0,
  }));
}

export function hrZoneDistribution(m: MetricsLike): ZoneDistribution[] | null {
  return distribution(m.hrZoneSec, HR_ZONE_LABELS);
}

export function powerZoneDistribution(m: MetricsLike): ZoneDistribution[] | null {
  return distribution(m.powerZoneSec, POWER_ZONE_LABELS);
}

export function seilerZones(m: MetricsLike): SeilerZoneDistribution[] | null {
  const sec = m.seilerZoneSec;
  if (!sec) return null;
  const total = sec[0] + sec[1] + sec[2];
  const labels: Array<[1 | 2 | 3, string, string]> = [[1, "저강도", "var(--zone-2)"], [2, "역치", "var(--zone-4)"], [3, "고강도", "var(--zone-5)"]];
  return labels.map(([zone, label, color], i) => ({ zone, label, color, seconds: sec[i]!, pct: total > 0 ? (sec[i]! / total) * 100 : 0 }));
}

/** 양극화 판정 설명 — 표시 문구. 판정 자체는 서버(`polarization.verdict`)의 것이다. */
export const POLARIZATION_DESCRIPTION: Record<"polarized" | "threshold" | "pyramidal", { ko: string; en: string }> = {
  polarized: { ko: "저강도·고강도 집중, 역치 최소화 — 엘리트 지구력 패턴", en: "High Z1+Z3, low Z2 — elite endurance pattern" },
  threshold: { ko: "역치 강도(Z2)에 집중 — 고강도 레이스 준비 또는 블록 훈련 패턴", en: "Concentrated at threshold intensity — race prep or block training" },
  pyramidal: { ko: "저강도 기반, Z2·Z3 단계적 감소 — 일반 기초 훈련 구조", en: "Z1 dominant, Z2 and Z3 decreasing — common base training structure" },
};

export function criticalBands(m: MetricsLike): CriticalBand[] | null {
  const z = m.zonesSec;
  if (!z) return null;
  return [
    { label: "Sweet Spot", range: "83-95% FTP", seconds: z.sweetSpot, color: "var(--zone-3)" },
    { label: "Threshold", range: "95-106% FTP", seconds: z.threshold, color: "var(--zone-4)" },
    { label: "VO2max", range: "106-120% FTP", seconds: z.vo2, color: "var(--zone-5)" },
    { label: "Anaerobic", range: ">120% FTP", seconds: z.anaerobic, color: "var(--zone-5)" },
  ];
}

const MMP_SECONDS: Array<[keyof NonNullable<ActivityMetricsDoc["mmp"]>, number]> = [
  ["1s", 1], ["5s", 5], ["10s", 10], ["30s", 30], ["1m", 60], ["2m", 120],
  ["5m", 300], ["10m", 600], ["20m", 1200], ["30m", 1800], ["1h", 3600],
];

/** 파워 커브 점 — 서버 `mmp` 를 초 단위 지속시간으로 푼다. */
export function powerCurvePoints(m: MetricsLike): PowerCurvePoint[] {
  return MMP_SECONDS.flatMap(([key, durationSeconds]) => {
    const maxPower = m.mmp?.[key];
    return typeof maxPower === "number" ? [{ durationSeconds, maxPower }] : [];
  });
}

/** W' 잔량 곡선 + 최소점. `minJ` 는 서버 요약을 그대로 쓴다 — 곡선에서 다시 뽑지 않는다. */
export function wPrimeBalance(m: MetricsLike): { series: number[]; minJ: number; idxMin: number } | null {
  const series = m.wPrimeBalance;
  if (!series || series.length === 0 || m.wPrimeMinJ == null) return null;
  let idxMin = 0;
  series.forEach((v, i) => { if (v < series[idxMin]!) idxMin = i; });
  return { series, minJ: m.wPrimeMinJ, idxMin };
}

/** 심박 존 번호(1-based). 경계는 서버 정본. 표시 상한을 넘는 값은 마지막 존. */
export function resolveHrZone(bpm: number, m: MetricsLike): number | null {
  const zones = m.hrZoneBoundaries?.zones;
  if (!zones?.length || !Number.isFinite(bpm)) return null;
  for (let i = zones.length - 1; i >= 0; i--) if (bpm >= zones[i]!.minBpm) return zones[i]!.zone;
  return zones[0]!.zone;
}

const POWER_ZONE_MIN_RATIO = [0, 0.55, 0.75, 0.90, 1.05, 1.20, 1.50];

/** 파워 존 번호(1-based). 경계 비율은 서버 `zoneAnalysis` 와 같은 Coggan 7존. */
export function resolvePowerZone(watts: number, ftp: number): number | null {
  if (!Number.isFinite(watts) || !Number.isFinite(ftp) || ftp <= 0) return null;
  const ratio = watts / ftp;
  for (let i = POWER_ZONE_MIN_RATIO.length - 1; i >= 0; i--) if (ratio >= POWER_ZONE_MIN_RATIO[i]!) return i + 1;
  return null;
}
