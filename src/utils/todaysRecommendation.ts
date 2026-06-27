/**
 * 오늘의 권장 운동 — 룰 엔진 (facts only).
 *
 * 컨텍스트 신호를 받아 *결정적* 사실(facts) 만 출력:
 *   - 어떤 타입 (recovery/endurance/threshold/...) — type-safe enum
 *   - 어떤 zone, 얼마나, 얼마나 강하게
 *   - 핵심 chip 라벨
 *   - LLM 에게 전달할 컨텍스트 태그
 *
 * **narrative 는 생성하지 않음** — 짧은 fallback 은 `composer.ts`,
 * 자연어 풍부 버전(영양/회복/form 가이드 포함) 은 Cloud Function (Gemini) 가 생성.
 *
 * 결정 트리 (5 케이스):
 *   1. 부상/번아웃 위험   ATL/CTL > 1.4 && TSB < -20            → burnout-rest
 *   2. 회복 필요          TSB < -5 || ATL/CTL > 1.2             → recovery
 *   3. 평이 (균형)        -5 ≤ TSB ≤ +5                         → endurance / tempo
 *   4. 핵심 자극          +5 < TSB ≤ +20                        → threshold
 *   5. 과회복             TSB > 20                              → vo2 또는 taper(레이스 주)
 */

import type { Discipline } from "./disciplineFilter";
import { recommendWeeklyLoad } from "@shared/training/weeklyLoad";

/** tri 는 별도 뷰가 처리. 단일 종목만 추천. */
export type RecDiscipline = Exclude<Discipline, "tri">;

export interface RecommendationContext {
  tsb: number;
  ctl: number;
  atl: number;
  recent7dTss: number;
  recent14dTss: number;
  /** 마지막 운동일로부터 며칠 (0 = 오늘, 1 = 어제) */
  daysSinceLastWorkout: number | null;
  /** 마지막 운동의 평균 zone (1~5). 모르면 null */
  lastWorkoutAvgZone: number | null;
  discipline: RecDiscipline;
  /** 0 = 일, 6 = 토 */
  dayOfWeek: number;
  goal?: {
    courseName: string;
    daysUntil: number;
    distanceKm?: number;
    elevationM?: number;
  } | null;
  adaptation?: {
    severity: "info" | "warn" | "critical";
    recent4wRatio?: number; // 0~1
  } | null;
  /** 이번 주 (월~현재) 누적 wTSS — 주간 권장부하 대비 "남은 분배" 계산용. */
  weeklyAccumulatedTss?: number | null;
  /** 라이프스타일 — 주간 권장부하 상한 보정 (가용시간/직업부하). */
  lifestyle?: {
    weeklyAvailableHours?: number;
    occupationLoad?: "low" | "mid" | "high";
  } | null;
}

export type RecommendationType =
  | "burnout-rest"
  | "recovery"
  | "endurance"
  | "tempo"
  | "threshold"
  | "vo2"
  | "taper";

export type ToneColor = "lime" | "amber" | "rose";

/**
 * 룰 엔진 출력 — narrative 없음. LLM/composer 가 이걸 받아 자연어 생성.
 */
export interface RecommendationFacts {
  type: RecommendationType;
  /** 짧은 세션 이름 (큰 글씨 표시용 — UI 전용. LLM 입력엔 사용 안 함). */
  sessionName: string;
  /** i18n 키 — "training:session.xxx". UI 에서 t(sessionNameKey, { disc: t("training:discipline.X") }) 로 번역. */
  sessionNameKey: string;
  /** WorkoutKind enum (예: "tempoRun"). LLM 이 종목 + 이걸 보고 라벨 생성. UI 의 sessionName
   *  과 별도 — 한국어 라벨이 LLM 을 오도하는 사고 (Z3 템포 → 사이클) 방지용. */
  workoutKind?: string;
  /** Tone 색 — UI 배경/테두리 색 결정. */
  tone: ToneColor;
  /** 권장 zone (Z1~Z5) — 인터벌이면 메인 자극 zone. */
  zone: 1 | 2 | 3 | 4 | 5;
  /** 권장 시간 범위 (분). 예: [60, 75] */
  durationMin: [number, number];
  /** 핵심 메타 chip (zone / 시간 / 강도 / 기타). 3~4개. */
  chips: string[];
  /**
   * LLM 에게 전달할 컨텍스트 태그 — facts 만으로 표현 어려운 조건.
   * (예: "어제 Z4 강도", "최근 4주 실행률 50%", "D-3 레이스 주")
   */
  contextTags: string[];
  /**
   * 결정에 사용된 핵심 수치 — 캐시 해시 + LLM 프롬프트에 포함.
   */
  inputSnapshot: {
    tsb: number;
    ctl: number;
    atl: number;
    recent7dTss: number;
    discipline: RecDiscipline;
    daysUntilGoal?: number;
  };
  /**
   * 이번 주 권장 wTSS 범위 [lo, hi] — CTL 기반 개인화 주간 부하 (G5).
   * 입력(ctl)이 있을 때만 채워짐.
   */
  weeklyTargetTss?: [number, number];
  /** 권장 wTSS hi 대비 남은 분배 분량 (max(0, hi − 누적)). 누적 입력 있을 때만. */
  remainingTss?: number;
  /** Balance(TSB) phase 별 목표 범위 + 한국어 행동지침. */
  balanceGuide?: {
    lo: number;
    hi: number;
    phase: "build" | "maintain" | "taper" | "recovery";
    note: string;
  };
}

// ---- 헬퍼 ----

interface DiscText {
  name: string;
  zoneNames: Record<1 | 2 | 3 | 4 | 5, string>;
}
const DISC: Record<RecDiscipline, DiscText> = {
  bike: {
    name: "라이딩",
    zoneNames: { 1: "Z1 회복", 2: "Z2 지구력", 3: "Z3 템포", 4: "Z4 역치", 5: "Z5 VO₂max" },
  },
  run: {
    name: "러닝",
    zoneNames: { 1: "Z1 회복 조깅", 2: "Z2 이지", 3: "Z3 마라톤 페이스", 4: "Z4 역치", 5: "Z5 인터벌" },
  },
  swim: {
    name: "수영",
    zoneNames: { 1: "Z1 이지", 2: "Z2 지구력", 3: "Z3 CSS", 4: "Z4 역치", 5: "Z5 스프린트" },
  },
};

function durationFor(d: RecDiscipline, base: "short" | "mid" | "long"): [number, number] {
  const map: Record<RecDiscipline, Record<"short" | "mid" | "long", [number, number]>> = {
    bike: { short: [45, 60], mid: [90, 120], long: [180, 240] },
    run:  { short: [30, 40], mid: [60, 75],  long: [90, 120] },
    swim: { short: [20, 30], mid: [40, 60],  long: [60, 90] },
  };
  return map[d][base];
}

// ---- 메인 ----

/**
 * 주간 권장부하 + Balance 가이드 (G5) — facts 에 병합할 추가 필드 계산.
 * ctl > 0 일 때만 의미 있음. weeklyAccumulatedTss 가 있으면 남은 분배도 계산.
 */
function computeWeeklyExtra(
  ctx: RecommendationContext,
): Pick<RecommendationFacts, "weeklyTargetTss" | "remainingTss" | "balanceGuide"> {
  if (!(ctx.ctl > 0)) return {};
  const wl = recommendWeeklyLoad({
    ctl: ctx.ctl,
    tsb: ctx.tsb,
    daysUntilGoal: ctx.goal?.daysUntil ?? null,
    lifestyle: ctx.lifestyle ?? null,
  });
  const accumulated = ctx.weeklyAccumulatedTss;
  const remaining =
    accumulated != null ? Math.max(0, wl.targetTss[1] - Math.round(accumulated)) : undefined;
  return {
    weeklyTargetTss: wl.targetTss,
    ...(remaining != null ? { remainingTss: remaining } : {}),
    balanceGuide: wl.balanceGuide,
  };
}

export function recommendToday(ctx: RecommendationContext): RecommendationFacts {
  return { ...recommendTodayBase(ctx), ...computeWeeklyExtra(ctx) };
}

function recommendTodayBase(ctx: RecommendationContext): RecommendationFacts {
  const { tsb, ctl, atl, recent7dTss, daysSinceLastWorkout, lastWorkoutAvgZone, discipline, dayOfWeek, goal, adaptation } = ctx;
  const atlOverCtl = ctl > 0 ? atl / ctl : 1;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isRaceWeek = goal != null && goal.daysUntil >= 0 && goal.daysUntil <= 7;
  const yesterdayHard = lastWorkoutAvgZone != null && lastWorkoutAvgZone >= 4 && daysSinceLastWorkout != null && daysSinceLastWorkout <= 1;
  const adherenceLow = adaptation?.recent4wRatio != null && adaptation.recent4wRatio < 0.7;

  // LLM 에 전달할 공통 컨텍스트 태그
  const baseTags: string[] = [];
  if (yesterdayHard) baseTags.push(`어제 Z${lastWorkoutAvgZone} 자극`);
  else if (daysSinceLastWorkout != null && daysSinceLastWorkout >= 2) baseTags.push(`마지막 운동 ${daysSinceLastWorkout}일 전`);
  if (adherenceLow) baseTags.push(`최근 4주 실행률 ${Math.round((adaptation!.recent4wRatio ?? 0) * 100)}% (낮음)`);
  if (goal != null) {
    baseTags.push(`목표: ${goal.courseName}, D-${goal.daysUntil}`);
    if (goal.distanceKm && goal.distanceKm > 0) baseTags.push(`코스 ${Math.round(goal.distanceKm)}km${goal.elevationM ? ` ↑${goal.elevationM}m` : ""}`);
  }
  if (isWeekend) baseTags.push("주말");
  baseTags.push(`최근 7일 TSS ${Math.round(recent7dTss)}`);

  const snap = {
    tsb: Math.round(tsb),
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    recent7dTss: Math.round(recent7dTss),
    discipline,
    ...(goal ? { daysUntilGoal: goal.daysUntil } : {}),
  };

  // ===== 1. 부상/번아웃 위험 =====
  if (atlOverCtl > 1.4 && tsb < -20) {
    return {
      type: "burnout-rest",
      sessionName: "완전 휴식 (필수)",
      sessionNameKey: "training:session.burnoutRest",
      tone: "rose",
      zone: 1,
      durationMin: [0, 0],
      chips: ["완전 휴식", `ATL/CTL ${atlOverCtl.toFixed(2)}`, `TSB ${snap.tsb}`, "수면 8h+"],
      contextTags: [...baseTags, `ATL ${snap.atl} 이 CTL ${snap.ctl} 의 ${Math.round(atlOverCtl * 100)}%`, "과부하 임계 초과"],
      inputSnapshot: snap,
    };
  }

  // ===== 2. 회복 필요 =====
  if (tsb < -5 || atlOverCtl > 1.2) {
    const restPreferred = tsb < -15 || daysSinceLastWorkout === 0;
    if (restPreferred) {
      return {
        type: "recovery",
        sessionName: `${DISC[discipline].name} 휴식 또는 초경량 Z1`,
        sessionNameKey: "training:session.restOrZ1",
        tone: "amber",
        zone: 1,
        durationMin: [0, 30],
        chips: ["회복", "Z1 (선택)", "20-30분", `TSB ${snap.tsb}`],
        contextTags: [...baseTags, "휴식 권장 (Z1 도 선택)"],
        inputSnapshot: snap,
      };
    }
    return {
      type: "recovery",
      sessionName: `회복 ${DISC[discipline].name} Z1`,
      sessionNameKey: "training:session.recoveryZ1",
      tone: "amber",
      zone: 1,
      durationMin: durationFor(discipline, "short"),
      chips: ["회복", DISC[discipline].zoneNames[1], `${durationFor(discipline, "short").join("-")}분`, `TSB ${snap.tsb}`],
      contextTags: [...baseTags, "active recovery"],
      inputSnapshot: snap,
    };
  }

  // ===== 5. 과회복 — 강한 자극 (단, 레이스 주면 테이퍼) =====
  if (tsb > 20) {
    if (isRaceWeek) {
      return {
        type: "taper",
        sessionName: `테이퍼 ${DISC[discipline].name} 샤프닝`,
        sessionNameKey: "training:session.taperSharpening",
        tone: "lime",
        zone: 2,
        durationMin: durationFor(discipline, "short"),
        chips: ["테이퍼", DISC[discipline].zoneNames[2], `${durationFor(discipline, "short").join("-")}분`, `D-${goal!.daysUntil}`],
        contextTags: [...baseTags, "레이스 주간 (taper)", "신경계 활성화 목적"],
        inputSnapshot: snap,
      };
    }
    return {
      type: "vo2",
      sessionName: `VO₂max 인터벌 ${DISC[discipline].name}`,
      sessionNameKey: "training:session.vo2Interval",
      tone: "lime",
      zone: 5,
      durationMin: durationFor(discipline, "mid"),
      chips: ["VO₂max", DISC[discipline].zoneNames[5], `${durationFor(discipline, "mid").join("-")}분`, `TSB +${snap.tsb}`],
      contextTags: [...baseTags, "컨디션 최상", "강한 자극 흡수 가능"],
      inputSnapshot: snap,
    };
  }

  // ===== 4. 핵심 자극 =====
  if (tsb > 5) {
    return {
      type: "threshold",
      sessionName: `Sweet Spot ${DISC[discipline].name}`,
      sessionNameKey: "training:session.sweetSpot",
      tone: "lime",
      zone: 4,
      durationMin: durationFor(discipline, "mid"),
      chips: ["Sweet Spot", DISC[discipline].zoneNames[3], `${durationFor(discipline, "mid").join("-")}분`, `TSB +${snap.tsb}`],
      contextTags: [...baseTags, "폼 좋음", "핵심 자극 흡수 가능"],
      inputSnapshot: snap,
    };
  }

  // ===== 3. 평이 — tempo 또는 endurance =====
  const needFreshStimulus = (daysSinceLastWorkout ?? 0) >= 2;
  if (needFreshStimulus && tsb >= 0) {
    return {
      type: "tempo",
      sessionName: `Tempo ${DISC[discipline].name}`,
      sessionNameKey: "training:session.tempo",
      tone: "lime",
      zone: 3,
      durationMin: durationFor(discipline, "mid"),
      chips: ["Tempo", DISC[discipline].zoneNames[3], `${durationFor(discipline, "mid").join("-")}분`, `TSB ${snap.tsb >= 0 ? "+" : ""}${snap.tsb}`],
      contextTags: [...baseTags, "휴식 누적 후 자극 단계 올림"],
      inputSnapshot: snap,
    };
  }

  // 표준 Z2 지구력
  const isLongDay = isWeekend && (goal?.daysUntil ?? 999) > 14;
  return {
    type: "endurance",
    sessionName: `Z2 지구력 ${DISC[discipline].name}`,
    sessionNameKey: "training:session.z2Endurance",
    tone: "lime",
    zone: 2,
    durationMin: isLongDay ? durationFor(discipline, "long") : durationFor(discipline, "mid"),
    chips: [
      "지구력",
      DISC[discipline].zoneNames[2],
      `${(isLongDay ? durationFor(discipline, "long") : durationFor(discipline, "mid")).join("-")}분`,
      `TSB ${snap.tsb >= 0 ? "+" : ""}${snap.tsb}`,
    ],
    contextTags: [
      ...baseTags,
      "균형 상태",
      isLongDay ? "주말 long ride 권장" : "표준 미드 지속",
    ],
    inputSnapshot: snap,
  };
}

// factsHash 제거 — CF 가 prompt 본문 sha1 기반으로 캐시 키 결정. 클라가 수동으로 해시
// 관리하던 옛 구조는 입력 필드 추가 시마다 hash 도 같이 업데이트해야 했고, 한 곳이라도
// 놓치면 옛 narrative 가 캐시 hit 되는 사고 빈발. 신규 구조에서는 사람 손 의존 0.
