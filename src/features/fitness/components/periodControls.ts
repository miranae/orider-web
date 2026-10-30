import { trainingCalendarPeriod, type TrainingComparisonPreset } from "../../../services/trainingComparisonCalendar";
export type PeriodDraft = { preset: "year" | "all" | "custom"; from: string; through: string };
export type PowerPeriodControls = { skillsMode: boolean; comparison: TrainingComparisonPreset | null; drafts: PeriodDraft[]; unit: "W" | "W/kg"; duration: number };
export type TrainingPeriodControls = { preset: TrainingComparisonPreset | null; ranges: { from: string; through: string }[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const preset = (v: unknown) => v === null || v === "fourWeeks" || v === "yearToDate";
const range = (v: unknown): v is { from: string; through: string } => record(v) && typeof v.from === "string" && typeof v.through === "string" && !!trainingCalendarPeriod(v.from, v.through, Date.now());
export function validPowerPeriodControls(v: unknown): PowerPeriodControls | null {
  if (!record(v) || Object.keys(v).length !== 5 || typeof v.skillsMode !== "boolean" || !preset(v.comparison) || (v.unit !== "W" && v.unit !== "W/kg") || !Number.isInteger(v.duration) || Number(v.duration) < 1 || Number(v.duration) > 86400
    || !Array.isArray(v.drafts) || v.drafts.length < 1 || v.drafts.length > 2 || !v.drafts.every(d => range(d) && ["year", "all", "custom"].includes(String((d as PeriodDraft).preset)) && Object.keys(d).length === 3)) return null;
  return v as PowerPeriodControls;
}
export function validTrainingPeriodControls(v: unknown): TrainingPeriodControls | null {
  if (!record(v) || Object.keys(v).length !== 2 || !preset(v.preset) || !Array.isArray(v.ranges) || v.ranges.length !== 2 || !v.ranges.every(r => range(r) && Object.keys(r).length === 2)) return null;
  return v as TrainingPeriodControls;
}
