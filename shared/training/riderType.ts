/**
 * 라이더 6타입 분류 + Ability(인구 분위) / Tendency(2축 성향) — pure, Firebase 무관.
 *
 * Riduck "역량과 성향" 컨셉. PDC 의 `wPerKgAtKey`(5s/1m/5m/20m W/kg) + 체중을 입력으로
 *  (1) 2축 성향(폭발↔지속 / 절대파워↔W/kg)을 [-1,1] 로 산출,
 *  (2) 두 축 사분면 + 강도로 6타입에 매핑,
 *  (3) duration 별 W/kg 를 Coggan power-profile 분위표와 비교해 Ability 백분위를 추정한다.
 *
 * 서버 미러: functions/src/analysis/pdc.ts 가 functions tsconfig include 제약으로 shared 를
 *  직접 import 하지 못해 동일 공식을 인라인 헬퍼로 복제한다 (vo2max 패턴과 동일).
 *  공식/매핑/분위표가 바뀌면 양쪽을 함께 수정하고, 이 파일의 테스트로 진실을 고정한다.
 */

export type RiderType =
  | "RoadSprinter"
  | "TrackSprinter"
  | "AllRounder"
  | "Puncher"
  | "Climber"
  | "TimeTrialist"
  | "Unclassified";

export interface RiderTypeResult {
  type: RiderType;
  /** [-1,1] 폭발/인터벌(−, 5s·1m 강함) ↔ 지속/페이싱(+, 20m 강함). */
  axisX: number;
  /** [-1,1] 절대파워(−) ↔ W/kg(+). 가벼운 클라이머 +, 무거운 스프린터 −. */
  axisY: number;
  /** [0,1] 분류 신뢰도. 키 개수·체중 유무로 결정. */
  confidence: number;
}

export interface RiderTypeInput {
  wPerKgAtKey: Partial<Record<"5s" | "1m" | "5m" | "20m", number>> | null;
  weightKg: number | null;
}

/** 타입 → 한국어 라벨/설명. */
export const RIDER_TYPE_LABELS_KO: Record<RiderType, { label: string; desc: string }> = {
  RoadSprinter: {
    label: "로드 스프린터",
    desc: "막판 스프린트가 강한 폭발형. 짧고 강한 파워(5초~1분)에서 두각.",
  },
  TrackSprinter: {
    label: "트랙 스프린터",
    desc: "절대 파워가 압도적인 순간 폭발형. 체중보다 raw 출력으로 승부.",
  },
  AllRounder: {
    label: "올라운더",
    desc: "폭발·지속·체급 균형형. 약점이 적어 다양한 코스에 두루 강함.",
  },
  Puncher: {
    label: "펀처",
    desc: "짧은 언덕·반복 인터벌(1~5분)에서 폭발하는 공격형.",
  },
  Climber: {
    label: "클라이머",
    desc: "가벼운 체급에 장시간 W/kg 가 높은 등판형. 긴 오르막에서 강함.",
  },
  TimeTrialist: {
    label: "타임트라이얼리스트",
    desc: "20분+ 지속 파워가 강한 페이싱형. 평지 단독 주행·TT 에 최적.",
  },
  Unclassified: {
    label: "분류 전",
    desc: "분류에 필요한 파워 기록이 부족합니다. 다양한 강도로 더 라이딩해 보세요.",
  },
};

/** clamp helper. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 라이더 2축 성향 + 6타입 분류.
 *
 * 매핑 규칙 (axisX = 지속성, axisY = W/kg 성향):
 *   - 데이터 부족(키 < 2개 또는 weight 없음) → Unclassified, confidence ≤ 0.3
 *   - 폭발형(axisX < -0.25):
 *       · axisY < -0.2 (절대파워 우위) → TrackSprinter
 *       · 그 외                        → RoadSprinter
 *   - 지속형(axisX > +0.25):
 *       · axisY > +0.2 (W/kg 우위, 가벼움) → Climber
 *       · 그 외                            → TimeTrialist
 *   - 중간대(|axisX| ≤ 0.25):
 *       · 1~5분 상대 강세(puncherScore 높음) → Puncher
 *       · 그 외                              → AllRounder
 */
export function classifyRider(input: RiderTypeInput): RiderTypeResult {
  const w = input.wPerKgAtKey;
  const weightKg = input.weightKg;

  const s5 = w?.["5s"] ?? null;
  const m1 = w?.["1m"] ?? null;
  const m5 = w?.["5m"] ?? null;
  const m20 = w?.["20m"] ?? null;

  const present = [s5, m1, m5, m20].filter((v) => v != null && Number.isFinite(v) && v > 0).length;

  // 데이터 부족: 키 2개 미만 또는 체중 없음.
  if (present < 2 || weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return { type: "Unclassified", axisX: 0, axisY: 0, confidence: present === 0 ? 0 : 0.2 };
  }

  // ── axisX: 폭발(−) ↔ 지속(+) ──────────────────────────────────
  // 단시간(5s·1m) 강세를 norm5s1m, 장시간(20m) 강세를 norm20m 로 정규화 후 차.
  // Coggan 전형 W/kg 스케일(엘리트 상한)로 0..1 정규화: 5s≈24, 1m≈11, 20m≈6.4.
  const n5s = s5 != null ? s5 / 24 : null;
  const n1m = m1 != null ? m1 / 11 : null;
  const n20m = m20 != null ? m20 / 6.4 : null;
  const explosiveParts = [n5s, n1m].filter((v): v is number => v != null);
  const explosive = explosiveParts.length
    ? explosiveParts.reduce((a, b) => a + b, 0) / explosiveParts.length
    : null;
  let axisX: number;
  if (explosive != null && n20m != null) {
    // 지속 우위면 +, 폭발 우위면 −. 차를 1.5배 증폭 후 clamp.
    axisX = clamp((n20m - explosive) * 1.5, -1, 1);
  } else if (n20m != null) {
    axisX = clamp((n20m - 0.6) * 1.5, -1, 1); // 20m 만 있으면 절대 수준으로 추정
  } else if (explosive != null) {
    axisX = clamp((0.6 - explosive) * 1.5, -1, 1);
  } else {
    axisX = 0;
  }

  // ── axisY: 절대파워(−) ↔ W/kg(+) ─────────────────────────────
  // 가벼운 라이더는 같은 W/kg 라도 절대 W 가 낮음 → 클라이머 성향(+).
  // 무거운 라이더는 절대 W 가 높음 → 스프린터/파워 성향(−).
  // 기준 체중 72kg 중심, ±18kg 범위로 [-1,1] 매핑.
  const REF_WEIGHT = 72;
  let axisY = clamp((REF_WEIGHT - weightKg) / 18, -1, 1);
  // 장시간 W/kg 가 매우 높으면(클라이머 신호) +로 보정.
  if (m20 != null && m20 >= 5.0) axisY = clamp(axisY + 0.2, -1, 1);

  // ── 타입 매핑 ───────────────────────────────────────────────
  // puncherScore: 1~5분 상대 강세 (장시간 대비). 중간대에서 Puncher 식별.
  let puncherScore = 0;
  if (m5 != null && m20 != null && m20 > 0) puncherScore = m5 / m20; // >1.25 이면 인터벌 강세
  if (m1 != null && m20 != null && m20 > 0) puncherScore = Math.max(puncherScore, (m1 / m20) / 1.5);

  let type: RiderType;
  if (axisX < -0.25) {
    type = axisY < -0.2 ? "TrackSprinter" : "RoadSprinter";
  } else if (axisX > 0.25) {
    type = axisY > 0.2 ? "Climber" : "TimeTrialist";
  } else {
    type = puncherScore > 1.28 ? "Puncher" : "AllRounder";
  }

  // ── confidence: 키 개수(최대 4) + 체중 보유. ─────────────────
  // 4키+체중=1.0, 2키=0.5 근처.
  const confidence = clamp(0.25 + present * 0.18, 0, 1);

  return {
    type,
    axisX: Math.round(axisX * 100) / 100,
    axisY: Math.round(axisY * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ── Ability: Coggan power-profile 분위표 ──────────────────────────
//
// 출처: Allen & Coggan, "Training and Racing with a Power Meter" — 남성 power profile
//  chart (W/kg). 각 duration 의 등급 경계를 untrained(≈0p) ~ world-class(≈100p) 로 매핑.
// 한계 (v1): 남성 단일 표, 성별·연령 미반영. 코호트(실제 사용자 모집단) 분위는 #285 에서
//  별도 도입 예정. 현재는 "전 세계 사이클 인구 대비 대략적 위치" 의 근사값.
//
// 각 행: [W/kg, percentile] 오름차순. 선형보간으로 백분위 산출.
interface AbilityPoint {
  duration: "5s" | "1m" | "5m" | "20m";
  /** [wPerKg, percentile] 오름차순. */
  table: Array<[number, number]>;
}

const COGGAN_MALE_TABLE: AbilityPoint[] = [
  {
    duration: "5s",
    table: [
      [9.0, 1], [11.5, 15], [14.0, 35], [16.8, 55], [19.4, 75], [22.0, 92], [24.0, 99],
    ],
  },
  {
    duration: "1m",
    table: [
      [5.0, 1], [6.8, 15], [8.2, 35], [9.5, 55], [10.6, 75], [11.5, 92], [12.5, 99],
    ],
  },
  {
    duration: "5m",
    table: [
      [2.6, 1], [3.5, 15], [4.3, 35], [5.1, 55], [5.9, 75], [6.6, 92], [7.6, 99],
    ],
  },
  {
    duration: "20m",
    table: [
      [2.0, 1], [2.9, 15], [3.6, 35], [4.4, 55], [5.1, 75], [5.8, 92], [6.6, 99],
    ],
  },
];

/** 단조표에서 선형보간으로 백분위 산출. */
function percentileFromTable(wPerKg: number, table: Array<[number, number]>): number {
  if (wPerKg <= table[0]![0]) return table[0]![1];
  const last = table[table.length - 1]!;
  if (wPerKg >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [hiW, hiP] = table[i]!;
    if (wPerKg <= hiW) {
      const [loW, loP] = table[i - 1]!;
      const t = (wPerKg - loW) / (hiW - loW);
      return Math.round(loP + t * (hiP - loP));
    }
  }
  return last[1];
}

export interface AbilityResult {
  byDuration: Array<{ duration: string; wPerKg: number; percentile: number }>;
  /** 사용 가능한 duration 백분위의 평균. */
  overallPercentile: number;
}

/**
 * duration 별 W/kg → Coggan 남성 분위표 대비 백분위.
 *
 * @returns 비교 가능한 duration 이 하나도 없으면 null.
 */
export function estimateAbility(
  wPerKgAtKey: Partial<Record<"5s" | "1m" | "5m" | "20m", number>> | null,
): AbilityResult | null {
  if (!wPerKgAtKey) return null;
  const byDuration: AbilityResult["byDuration"] = [];
  for (const point of COGGAN_MALE_TABLE) {
    const v = wPerKgAtKey[point.duration];
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    byDuration.push({
      duration: point.duration,
      wPerKg: Math.round(v * 100) / 100,
      percentile: percentileFromTable(v, point.table),
    });
  }
  if (byDuration.length === 0) return null;
  const overallPercentile = Math.round(
    byDuration.reduce((a, b) => a + b.percentile, 0) / byDuration.length,
  );
  return { byDuration, overallPercentile };
}
