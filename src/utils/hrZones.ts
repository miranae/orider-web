export type HrZoneSource = "lthr" | "max_hr";

export interface DerivedHrZone {
  name: string;
  label: string;
  minPct: number;
  maxPct: number | null;
  minBpm: number;
  /** Exclusive upper bound. Integer display maximum is maxBpmExclusive - 1. */
  maxBpmExclusive: number | null;
  color: string;
}

export interface DerivedHrZones {
  source: HrZoneSource;
  referenceBpm: number;
  zones: DerivedHrZone[];
}

export type ActivityHrSource = "profile_lthr" | "activity_context_lthr" | "profile_max_hr" | "activity_context_max_hr" | "stream_max_hr" | "summary_peak_hr" | "default";
export type MaxHrSource = Exclude<ActivityHrSource, "profile_lthr" | "activity_context_lthr">;
export interface ActivityHrZoneResolution {
  zones: DerivedHrZones;
  maxHr: number;
  source: ActivityHrSource;
  maxHrSource: MaxHrSource;
}

const COLORS = [
  "var(--zone-1)",
  "var(--zone-2)",
  "var(--zone-3)",
  "var(--zone-4)",
  "var(--zone-5)",
];

const MAX_HR_BOUNDS: Array<[number, number | null]> = [[0, 60], [60, 70], [70, 80], [80, 90], [90, 100]];
// Friel running zones, collapsed to five UI bands (5a-c remain within Z5).
const LTHR_BOUNDS: Array<[number, number | null]> = [[0, 85], [85, 90], [90, 95], [95, 100], [100, null]];

export function validBpm(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 50 && value <= 250;
}

/** Empty/invalid individual values are handled separately; this validates their relationship. */
export function isValidHrThresholdRelationship(maxHr: unknown, lthr: unknown): boolean {
  return !validBpm(maxHr) || !validBpm(lthr) || lthr < maxHr;
}

export function deriveHrZones({ maxHr, lthr }: { maxHr: unknown; lthr?: unknown }): DerivedHrZones {
  const normalizedMaxHr = validBpm(maxHr) ? maxHr : 184;
  const useLthr = validBpm(lthr) && (!validBpm(maxHr) || lthr < maxHr);
  const source: HrZoneSource = useLthr ? "lthr" : "max_hr";
  const referenceBpm = useLthr ? lthr : normalizedMaxHr;
  const bounds = useLthr ? LTHR_BOUNDS : MAX_HR_BOUNDS;

  return {
    source,
    referenceBpm,
    zones: bounds.map(([minPct, maxPct], index) => ({
      name: `Z${index + 1}`,
      label: ["recovery", "endurance", "tempo", "threshold", "vo2"][index]!,
      minPct,
      maxPct,
      // A percentage boundary belongs to the upper zone. ceil creates one exact
      // integer boundary shared by calculation and display without gaps/overlap.
      minBpm: Math.ceil(referenceBpm * minPct / 100),
      maxBpmExclusive: maxPct === null
        ? null
        : !useLthr && index === bounds.length - 1
          ? referenceBpm + 1
          : Math.ceil(referenceBpm * maxPct / 100),
      color: COLORS[index]!,
    })),
  };
}

export function resolveActivityHrZones(input: {
  isOwner: boolean; sport?: "ride" | "run" | "swim" | "other";
  profileMaxHr?: unknown; profileLthr?: unknown;
  activityContextMaxHr?: unknown; activityContextLthr?: unknown;
  streamMaxHr?: unknown; summaryPeakHr?: unknown;
}): ActivityHrZoneResolution {
  const candidates: Array<[unknown, ActivityHrSource]> = input.isOwner
    ? [[input.profileMaxHr, "profile_max_hr"], [input.activityContextMaxHr, "activity_context_max_hr"], [input.streamMaxHr, "stream_max_hr"], [input.summaryPeakHr, "summary_peak_hr"]]
    : [[input.streamMaxHr, "stream_max_hr"], [input.summaryPeakHr, "summary_peak_hr"]];
  const selected = candidates.find(([value]) => validBpm(value));
  const maxHr = selected ? selected[0] as number : 190;
  const maxHrSource = (selected?.[1] ?? "default") as MaxHrSource;
  let source: ActivityHrSource = maxHrSource;
  let lthr: unknown;
  if (input.isOwner && input.sport === "run") {
    const validProfileLthr = validBpm(input.profileLthr) && input.profileLthr < maxHr;
    const validContextLthr = validBpm(input.activityContextLthr) && input.activityContextLthr < maxHr;
    lthr = validProfileLthr ? input.profileLthr : validContextLthr ? input.activityContextLthr : undefined;
    if (validBpm(lthr)) source = validProfileLthr ? "profile_lthr" : "activity_context_lthr";
  }
  return { zones: deriveHrZones({ maxHr, lthr }), maxHr, source, maxHrSource };
}
