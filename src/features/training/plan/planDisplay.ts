import type { WorkoutKind } from "@shared/types/goal";

export interface WorkoutMeta {
  label: string;
  color: string;
}

/** 자동 생성된 코스 식별자의 기계적인 구분자를 표시명과 메타로 분리한다. 원문은 저장/공유하지 않고 UI에서만 변환한다. */
export function formatPlanGoalTitle(rawTitle: string): { name: string; meta: string | null } {
  const title = rawTitle.trim();
  const generated = /^(\d{4})_([^_]+)_(그란폰도|메디오폰도|마라톤|트라이애슬론|철인3종|레이스|대회|코스)_(\d+(?:\.\d+)?\s?km)$/i.exec(title);
  if (!generated) return { name: rawTitle, meta: null };
  const year = generated[1]!;
  const name = generated[2]!;
  const eventType = generated[3]!;
  const distance = generated[4]!;
  return { name, meta: `${year} · ${eventType} · ${distance.replace(/\s?km$/i, " km")}` };
}

export const WORKOUT_COLORS: Record<WorkoutKind, string> = {
  rest: "transparent",
  rec: "var(--ink-4)",
  z2: "var(--aqua)",
  z2Long: "var(--aqua)",
  tempo: "var(--amber)",
  ftp: "var(--rose)",
  vo2: "var(--rose)",
  hillRepeats: "var(--amber)",
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
    hillRepeats: t("workouts.hillRepeats"),
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
  if (phase === "base") return "var(--violet)"; // #365 — 기초 유산소 축적기
  if (phase === "build") return "var(--aqua)";
  if (phase === "peak") return "var(--lime)";
  return "var(--amber)";
}

export function phaseLabel(phase: string, t: (key: string) => string): string {
  if (phase === "base") return t("phase.base");
  if (phase === "build") return t("phase.build");
  if (phase === "peak") return t("phase.peak");
  return t("phase.taper");
}
