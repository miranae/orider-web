import type { WorkoutKind } from "@shared/types/goal";

import type { RecommendationType, ToneColor, RecDiscipline } from "../../../utils/todaysRecommendation";

export type WorkoutCategory =
  | "rest" | "recovery" | "base" | "long" | "tempo" | "threshold"
  | "vo2" | "simulation" | "specialty" | "goal";

export interface WorkoutDetail {
  workout: WorkoutKind;
  workoutName?: string;
  duration: number;
  tss: number;
  intervals: import("@shared/types/goal").IntervalBlock[];
  intervalSummary?: string;
  courseName?: string;
  daysLeft: number;
  weekNumber: number;
  phase: string;
  weekCompleted: number;
  weekTotal: number;
  tsb: number;
  ctlDelta: number;
  recommendation?: string;
  contextNarration?: string;
  discipline?: "bike" | "run" | "swim";
  completed?: boolean;
  actualTSS?: number | null;
  actualActivityId?: string | null;
  isAdjusted?: boolean;
  adjustmentFactor?: number | null;
  plannedTSSOriginal?: number | null;
  adaptationFlag?: {
    severity: "info" | "warn" | "critical";
    reason?: string;
    snoozedUntil?: number;
    shouldRerollSuggested?: boolean;
  } | null;
}

export interface TodaysWorkoutCFResponse {
  todaysWorkout: WorkoutDetail | null;
}

export interface FactChip {
  label: string;
  tone?: ToneColor;
  mono?: boolean;
}

export function buildWorkoutLabels(t: (key: string) => string): Record<WorkoutKind, string> {
  return {
    rest: t("workouts.rest"),
    rec: t("workouts.rec"),
    z2: t("workouts.z2"),
    z2Long: t("workouts.z2Long"),
    tempo: t("workouts.tempo"),
    ftp: t("workouts.ftp"),
    vo2: t("workouts.vo2Max"),
    sim: t("workouts.simFull"),
    goal: t("workouts.goalEmoji"),
    easyRun: t("workouts.easyRun"),
    tempoRun: t("workouts.tempoRun"),
    intervalRun: t("workouts.intervalRun"),
    longRun: t("workouts.longRun"),
    recoveryRun: t("workouts.recoveryRun"),
    easySwim: t("workouts.easySwim"),
    drillSwim: t("workouts.drillSwim"),
    intervalSwim: t("workouts.intervalSwim"),
    longSwim: t("workouts.longSwim"),
    recoverySwim: t("workouts.recoverySwim"),
    stridesRun: t("workouts.stridesRun"),
    progressRun: t("workouts.progressRunFull"),
    threshRun: t("workouts.threshRun"),
    raceRun: t("workouts.raceRunFull"),
    kickSwim: t("workouts.kickSwim"),
    enduranceSwim: t("workouts.enduranceSwim"),
    cssSwim: t("workouts.cssSwim"),
    racepaceSwim: t("workouts.racepaceSwim"),
    sprintSwim: t("workouts.sprintSwimFull"),
    owSwim: t("workouts.owSwimFull"),
    brickSwim: t("workouts.brickSwimFull"),
  };
}

export function getWorkoutCategory(w: WorkoutKind): WorkoutCategory {
  if (w === "rest") return "rest";
  if (w === "rec" || w === "recoveryRun" || w === "recoverySwim") return "recovery";
  if (w === "z2" || w === "easyRun" || w === "easySwim" || w === "enduranceSwim") return "base";
  if (w === "z2Long" || w === "longRun" || w === "longSwim") return "long";
  if (w === "tempo" || w === "tempoRun" || w === "progressRun") return "tempo";
  if (w === "ftp" || w === "threshRun" || w === "cssSwim") return "threshold";
  if (w === "vo2" || w === "intervalRun" || w === "intervalSwim" || w === "racepaceSwim" || w === "sprintSwim") return "vo2";
  if (w === "sim" || w === "raceRun") return "simulation";
  if (w === "goal") return "goal";
  return "specialty";
}

export function workoutToRecType(w: WorkoutKind): RecommendationType {
  const cat = getWorkoutCategory(w);
  if (cat === "rest" || cat === "recovery") return "recovery";
  if (cat === "base" || cat === "long" || cat === "specialty") return "endurance";
  if (cat === "tempo") return "tempo";
  if (cat === "threshold") return "threshold";
  if (cat === "vo2") return "vo2";
  if (cat === "simulation") return "threshold";
  if (cat === "goal") return "taper";
  return "endurance";
}

export function workoutToZone(w: WorkoutKind): 1 | 2 | 3 | 4 | 5 {
  const cat = getWorkoutCategory(w);
  if (cat === "rest" || cat === "recovery") return 1;
  if (cat === "base" || cat === "long" || cat === "specialty") return 2;
  if (cat === "tempo") return 3;
  if (cat === "threshold" || cat === "simulation" || cat === "goal") return 4;
  if (cat === "vo2") return 5;
  return 2;
}

export function tsbTone(tsb: number): ToneColor {
  if (tsb <= -15) return "rose";
  if (tsb < 5) return "amber";
  return "lime";
}

export function applyDisciplineToWorkout(w: WorkoutKind, d: RecDiscipline): WorkoutKind {
  if (d === "run") {
    const m: Partial<Record<WorkoutKind, WorkoutKind>> = {
      rec: "recoveryRun", z2: "easyRun", z2Long: "longRun",
      tempo: "tempoRun", ftp: "threshRun", vo2: "intervalRun",
    };
    return m[w] ?? w;
  }
  if (d === "swim") {
    const m: Partial<Record<WorkoutKind, WorkoutKind>> = {
      rec: "recoverySwim", z2: "easySwim", z2Long: "longSwim",
      tempo: "enduranceSwim", ftp: "cssSwim", vo2: "intervalSwim",
    };
    return m[w] ?? w;
  }
  return w;
}

export function makeFactChips(
  args: {
    tsb: number;
    recent7d: number;
    daysSinceLastActivity: number | null;
    goalDaysUntil: number | null;
  },
  t: (key: string, opts?: Record<string, unknown>) => string,
): FactChip[] {
  const tsbStr = `${args.tsb >= 0 ? "+" : ""}${args.tsb.toFixed(1)}`;
  const daysLabel = args.daysSinceLastActivity == null
    ? t("today.noActivityRecord")
    : args.daysSinceLastActivity === 0
    ? t("today.activityToday")
    : args.daysSinceLastActivity === 1
    ? t("today.activityYesterday")
    : t("today.activityDaysAgo", { count: args.daysSinceLastActivity });
  return [
    { label: `TSB ${tsbStr}`, tone: tsbTone(args.tsb), mono: true },
    { label: t("today.sevenDayTss", { value: Math.round(args.recent7d) }), mono: true },
    { label: daysLabel, mono: true },
    ...(args.goalDaysUntil != null ? [{ label: `D-${args.goalDaysUntil}`, mono: true } as FactChip] : []),
  ];
}
