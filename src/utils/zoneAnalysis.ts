export interface ZoneDistribution {
  zone: number;
  name: string;
  /** 존 이름 i18n 키 (예: "fitness:zone.recovery") */
  nameKey: string;
  /** 샘플 수 (1Hz 스트림 기준 = 초) */
  seconds: number;
  percentage: number;
  color: string;
}

const HR_ZONES = [
  { zone: 1, name: "회복", nameKey: "fitness:zone.recovery", min: 0, max: 0.6, color: "#94a3b8" },
  { zone: 2, name: "지구력", nameKey: "fitness:zone.endurance", min: 0.6, max: 0.7, color: "#3b82f6" },
  { zone: 3, name: "템포", nameKey: "fitness:zone.tempo", min: 0.7, max: 0.8, color: "#22c55e" },
  { zone: 4, name: "역치", nameKey: "fitness:zone.threshold", min: 0.8, max: 0.9, color: "#f59e0b" },
  { zone: 5, name: "최대", nameKey: "fitness:zone.maxAerobic", min: 0.9, max: Infinity, color: "#ef4444" },
];

const POWER_ZONES = [
  { zone: 1, name: "회복", nameKey: "fitness:zone.recovery", min: 0, max: 0.55, color: "#94a3b8" },
  { zone: 2, name: "지구력", nameKey: "fitness:zone.endurance", min: 0.55, max: 0.75, color: "#3b82f6" },
  { zone: 3, name: "템포", nameKey: "fitness:zone.tempo", min: 0.75, max: 0.90, color: "#22c55e" },
  { zone: 4, name: "역치", nameKey: "fitness:zone.threshold", min: 0.90, max: 1.05, color: "#f59e0b" },
  { zone: 5, name: "VO2max", nameKey: "fitness:zone.vo2max", min: 1.05, max: 1.20, color: "#f97316" },
  { zone: 6, name: "무산소", nameKey: "fitness:zone.anaerobic", min: 1.20, max: 1.50, color: "#ef4444" },
  { zone: 7, name: "신경근", nameKey: "fitness:zone.neurological", min: 1.50, max: Infinity, color: "#7c3aed" },
];

export function calculateHrZoneDistribution(heartrates: number[], maxHr: number): ZoneDistribution[] {
  const counts = new Array(HR_ZONES.length).fill(0);
  for (const hr of heartrates) {
    const ratio = hr / maxHr;
    for (let i = HR_ZONES.length - 1; i >= 0; i--) {
      if (ratio >= HR_ZONES[i]!.min) { counts[i]++; break; }
    }
  }
  const total = heartrates.length || 1;
  return HR_ZONES.map((z, i) => ({
    zone: z.zone,
    name: z.name,
    nameKey: z.nameKey,
    seconds: counts[i],
    percentage: (counts[i] / total) * 100,
    color: z.color,
  }));
}

export function calculatePowerZoneDistribution(watts: number[], ftp: number): ZoneDistribution[] {
  const counts = new Array(POWER_ZONES.length).fill(0);
  for (const w of watts) {
    const ratio = w / ftp;
    for (let i = POWER_ZONES.length - 1; i >= 0; i--) {
      if (ratio >= POWER_ZONES[i]!.min) { counts[i]++; break; }
    }
  }
  const total = watts.length || 1;
  return POWER_ZONES.map((z, i) => ({
    zone: z.zone,
    name: z.name,
    nameKey: z.nameKey,
    seconds: counts[i],
    percentage: (counts[i] / total) * 100,
    color: z.color,
  }));
}

// ─── Seiler 3존 (양극화 훈련 모델) ───────────────────────────────────────────
// 기준: Stephen Seiler의 양극화 훈련 모델
//   Z1 (저강도): < 75% FTP — 주로 지방 대사, 낮은 교감신경 부하
//   Z2 (역치):  75~100% FTP — LT1~LT2 구간, 높은 대사 스트레스
//   Z3 (고강도): > 100% FTP — LT2 초과, 무산소 / VO2max 자극
// 참고: Seiler & Tønnessen (2009) "Intervals, Thresholds, and Long Slow Distance"
//      Scandinavian Journal of Medicine & Science in Sports

const SEILER_ZONES = [
  { zone: 1 as const, name: "저강도", nameKey: "activity:analysis.seiler.z1", min: 0, max: 0.75, color: "#3b82f6" },
  { zone: 2 as const, name: "역치",   nameKey: "activity:analysis.seiler.z2", min: 0.75, max: 1.00, color: "#f59e0b" },
  { zone: 3 as const, name: "고강도", nameKey: "activity:analysis.seiler.z3", min: 1.00, max: Infinity, color: "#ef4444" },
];

export interface SeilerZoneDistribution {
  zone: 1 | 2 | 3;
  label: string;
  seconds: number;
  pct: number;
  color: string;
}

export function calculateSeilerZones(watts: number[], ftp: number): SeilerZoneDistribution[] {
  const counts: [number, number, number] = [0, 0, 0];
  for (const w of watts) {
    const ratio = w / ftp;
    if (ratio < 0.75) counts[0]++;
    else if (ratio < 1.00) counts[1]++;
    else counts[2]++;
  }
  const total = watts.length || 1;
  return SEILER_ZONES.map((z, i) => ({
    zone: z.zone,
    label: z.name,
    seconds: counts[i] as number,
    pct: ((counts[i] as number) / total) * 100,
    color: z.color,
  }));
}

export type PolarizationVerdict = "polarized" | "threshold" | "pyramidal";

export interface PolarizationResult {
  verdict: PolarizationVerdict;
  /** 한국어 라벨 */
  labelKo: string;
  /** 영어 라벨 */
  labelEn: string;
  /** 한국어 설명 */
  descriptionKo: string;
  /** 영어 설명 */
  descriptionEn: string;
  /** Z1 + Z3 비율 (%) */
  extremePct: number;
  /** Z2 비율 (%) */
  thresholdPct: number;
}

/**
 * Seiler 3존 분포로부터 양극화 패턴 판정.
 *
 * 판정 기준 (Stöggl & Sperlich 2014; Seiler 2010):
 * - "양극화(polarized)": Z1+Z3 >= 80% AND Z3 >= 15%
 *   → 저강도·고강도 양극화, 역치 최소화 — 엘리트 지구력 선수 빈발 패턴
 * - "임계집중(threshold)": Z2 >= 40%
 *   → 역치 강도에 집중, 소규모 그룹 훈련·고강도 레이스 준비에서 나타남
 * - "피라미드(pyramidal)": 그 외
 *   → Z1 > Z2 > Z3 감소 패턴, 일반적 기초 훈련 구조
 */
export function polarizationIndex(seiler: SeilerZoneDistribution[]): PolarizationResult {
  const z1 = seiler.find((z) => z.zone === 1)?.pct ?? 0;
  const z2 = seiler.find((z) => z.zone === 2)?.pct ?? 0;
  const z3 = seiler.find((z) => z.zone === 3)?.pct ?? 0;
  const extremePct = z1 + z3;

  let verdict: PolarizationVerdict;
  if (extremePct >= 80 && z3 >= 15) {
    verdict = "polarized";
  } else if (z2 >= 40) {
    verdict = "threshold";
  } else {
    verdict = "pyramidal";
  }

  const labels: Record<PolarizationVerdict, { ko: string; en: string; descKo: string; descEn: string }> = {
    polarized: {
      ko: "양극화",
      en: "Polarized",
      descKo: "저강도·고강도 집중, 역치 최소화 — 엘리트 지구력 패턴",
      descEn: "High Z1+Z3, low Z2 — elite endurance pattern",
    },
    threshold: {
      ko: "임계집중",
      en: "Threshold",
      descKo: "역치 강도(Z2)에 집중 — 고강도 레이스 준비 또는 블록 훈련 패턴",
      descEn: "Concentrated at threshold intensity — race prep or block training",
    },
    pyramidal: {
      ko: "피라미드",
      en: "Pyramidal",
      descKo: "저강도 기반, Z2·Z3 단계적 감소 — 일반 기초 훈련 구조",
      descEn: "Z1 dominant, Z2 and Z3 decreasing — common base training structure",
    },
  };

  const l = labels[verdict];
  return {
    verdict,
    labelKo: l.ko,
    labelEn: l.en,
    descriptionKo: l.descKo,
    descriptionEn: l.descEn,
    extremePct,
    thresholdPct: z2,
  };
}
