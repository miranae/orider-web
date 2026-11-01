/** The local review catalogue is provisional, never a production prescription. */
export type StartSport = "bike" | "run";
export type Experience = "new" | "sometimes" | "regular" | "skip";
export interface FirstWorkout {
  id: string;
  sport: StartSport;
  date: string;
  revision: number;
  template: string;
  status: "scheduled" | "cancelled";
}
export const FIRST_WORKOUT_PREVIEWS = {
  bike: { template: "bike-first-local-v1", minutes: 20, blocks: [5, 10, 5] },
  run: { template: "run-first-local-v1", minutes: 15, blocks: [5, 5, 5] },
} as const;

export function startSport(value: string | null | undefined): StartSport | null {
  return value === "bike" || value === "run" ? value : null;
}

export function seoulDate(now = Date.now()): string {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

export function validWorkoutDate(value: unknown, today = seoulDate()): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value
    && value >= today && date <= Date.parse(`${today}T00:00:00Z`) + 30 * 86400000;
}

export function isFirstWorkout(value: unknown): value is FirstWorkout {
  if (!value || typeof value !== "object") return false;
  const v = value as FirstWorkout;
  return typeof v.id === "string" && startSport(v.sport) !== null && typeof v.date === "string"
    && Number.isInteger(v.revision) && v.revision > 0
    && v.template === FIRST_WORKOUT_PREVIEWS[v.sport].template
    && (v.status === "scheduled" || v.status === "cancelled");
}
