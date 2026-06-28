import type { WorkoutKind } from "@shared/types/goal";

export interface WorkoutMeta {
  label: string;
  color: string;
}

export const WORKOUT_COLORS: Record<WorkoutKind, string> = {
  rest: "transparent",
  rec: "var(--ink-4)",
  z2: "var(--aqua)",
  z2Long: "var(--aqua)",
  tempo: "var(--amber)",
  ftp: "var(--rose)",
  vo2: "var(--rose)",
  sim: "var(--lime)",
  goal: "var(--lime)",
  easyRun: "var(--aqua)",
  tempoRun: "var(--amber)",
  intervalRun: "var(--rose)",
  longRun: "var(--aqua)",
  recoveryRun: "var(--ink-4)",
  easySwim: "var(--aqua)",
  drillSwim: "var(--amber)",
  intervalSwim: "var(--rose)",
  longSwim: "var(--aqua)",
  recoverySwim: "var(--ink-4)",
  stridesRun: "var(--aqua)",
  progressRun: "var(--amber)",
  threshRun: "var(--lime)",
  raceRun: "var(--lime)",
  kickSwim: "oklch(0.72 0.10 260)",
  enduranceSwim: "var(--aqua)",
  cssSwim: "var(--aqua)",
  racepaceSwim: "var(--rose)",
  sprintSwim: "var(--rose)",
  owSwim: "oklch(0.70 0.09 220)",
  brickSwim: "var(--amber)",
};

export function buildWorkoutMeta(t: (key: string) => string): Record<WorkoutKind, WorkoutMeta> {
  const labels: Record<WorkoutKind, string> = {
    rest: t("workouts.rest"),
    rec: t("workouts.rec"),
    z2: t("workouts.z2"),
    z2Long: t("workouts.z2Long"),
    tempo: t("workouts.tempo"),
    ftp: t("workouts.ftp"),
    vo2: t("workouts.vo2"),
    sim: t("workouts.sim"),
    goal: t("workouts.goal"),
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
    progressRun: t("workouts.progressRun"),
    threshRun: t("workouts.threshRun"),
    raceRun: t("workouts.raceRun"),
    kickSwim: t("workouts.kickSwim"),
    enduranceSwim: t("workouts.enduranceSwim"),
    cssSwim: t("workouts.cssSwim"),
    racepaceSwim: t("workouts.racepaceSwim"),
    sprintSwim: t("workouts.sprintSwim"),
    owSwim: t("workouts.owSwim"),
    brickSwim: t("workouts.brickSwim"),
  };
  const out = {} as Record<WorkoutKind, WorkoutMeta>;
  (Object.keys(labels) as WorkoutKind[]).forEach((kind) => {
    out[kind] = { label: labels[kind], color: WORKOUT_COLORS[kind] };
  });
  return out;
}

export function buildDayNames(tCommon: (key: string) => string): string[] {
  return [
    tCommon("weekday.mon"),
    tCommon("weekday.tue"),
    tCommon("weekday.wed"),
    tCommon("weekday.thu"),
    tCommon("weekday.fri"),
    tCommon("weekday.sat"),
    tCommon("weekday.sun"),
  ];
}

export function formatDateLabel(ms: number, dayOfWeek: number): string {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const d = new Date(ms + KST_OFFSET);
  const dom = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  if (dayOfWeek === 0 || dom === 1) return `${month}/${dom}`;
  return String(dom);
}

export function phaseColor(phase: string): string {
  if (phase === "build") return "var(--aqua)";
  if (phase === "peak") return "var(--lime)";
  return "var(--amber)";
}

export function phaseLabel(phase: string, t: (key: string) => string): string {
  if (phase === "build") return t("phase.build");
  if (phase === "peak") return t("phase.peak");
  return t("phase.taper");
}
