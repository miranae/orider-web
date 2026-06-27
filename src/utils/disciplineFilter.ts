import type { Activity } from "@shared/types";

export type Discipline = "tri" | "bike" | "run" | "swim";

const BIKE_TYPES = ["ride", "virtualride", "ebikeride", "gravelride", "mountainbikeride", "velolift"];
const RUN_TYPES = ["run", "virtualrun", "trailrun", "walk", "hike"];
const SWIM_TYPES = ["swim"];

export function getDisciplineFromUrl(): Discipline {
  const params = new URLSearchParams(window.location.search);
  const sport = params.get("sport");
  if (sport === "run") return "run";
  if (sport === "swim") return "swim";
  return "bike";
}

export function filterByDiscipline(activities: Activity[], discipline: Discipline): Activity[] {
  const typeSet = discipline === "run" ? RUN_TYPES
    : discipline === "swim" ? SWIM_TYPES
    : BIKE_TYPES;
  return activities.filter((a) => {
    const t = (a.type || "ride").toLowerCase();
    return typeSet.some((match) => t.includes(match));
  });
}

/** Activity type → discipline */
export function getDiscipline(type?: string): Discipline {
  if (!type) return "bike";
  const t = type.toLowerCase();
  if (RUN_TYPES.some((r) => t.includes(r))) return "run";
  if (SWIM_TYPES.some((s) => t.includes(s))) return "swim";
  return "bike";
}

/** Discipline → CSS variable color */
export function getDisciplineColor(d: Discipline): string {
  if (d === "tri") return "var(--ink-1)";
  if (d === "run") return "var(--amber)";
  if (d === "swim") return "var(--lime)";
  return "var(--aqua)";
}

/** Discipline → i18n 키 (common 네임스페이스). 소비처에서 t(...)로 번역. */
export function getDisciplineLabelKey(d: Discipline): string {
  if (d === "tri") return "common:discipline.tri";
  if (d === "run") return "common:discipline.run";
  if (d === "swim") return "common:discipline.swim";
  return "common:discipline.bike";
}

/** Discipline → icon */
export function getDisciplineIcon(d: Discipline): string {
  if (d === "tri") return "🔺";
  if (d === "run") return "🏃";
  if (d === "swim") return "🏊";
  return "🚴";
}

/** Discipline → English label */
export function getDisciplineTag(d: Discipline): string {
  if (d === "tri") return "TRI";
  if (d === "run") return "RUN";
  if (d === "swim") return "SWIM";
  return "RIDE";
}
