export type BodyUnit = "metric" | "imperial";
const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export function formatBodyValue(value: string, unit: BodyUnit, kind: "weight" | "height"): string {
  if (value.trim() === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (unit === "metric") return value;
  const converted = kind === "weight" ? n / KG_PER_LB : n / CM_PER_IN;
  return String(Math.round(converted * 10) / 10);
}

export function parseBodyValue(value: string, unit: BodyUnit, kind: "weight" | "height"): string {
  const clean = value.replace(/[^0-9.]/g, "");
  if (clean.trim() === "") return "";
  const n = Number(clean);
  if (!Number.isFinite(n)) return "";
  const metric = unit === "metric" ? n : kind === "weight" ? n * KG_PER_LB : n * CM_PER_IN;
  return String(Math.round(metric * 10) / 10);
}
