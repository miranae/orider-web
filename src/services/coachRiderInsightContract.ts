export const RIDER_DURATIONS = ["5s", "1m", "5m", "20m"] as const;
export const RIDER_TYPES = ["RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist"] as const;
export const RIDER_QUESTION_CODES = ["RIDER_TYPE_STRENGTHS", "RIDER_DURATION_PRIORITY"] as const;

export type RiderDuration = typeof RIDER_DURATIONS[number];
export type RiderType = typeof RIDER_TYPES[number];
export type CoachRiderQuestionCode = typeof RIDER_QUESTION_CODES[number];
export type CoachRiderInsightStatus = "missing" | "missing_weight" | "insufficient_activity" | "low_confidence" | "ok" | "unsupported";
export type CoachRiderInsightReason = "pdc_missing" | "weight_missing" | "activity_count_below_5" |
  "classification_low_confidence" | "classification_unavailable" | "discipline_not_supported";

export interface CoachRiderInsight {
  schemaVersion: "coach-rider-insight-v1";
  status: CoachRiderInsightStatus;
  discipline: "bike" | "run" | "swim";
  snapshotId: string;
  sourceRevision: string;
  asOf: string;
  mmpWatts: Record<RiderDuration, number | null>;
  criticalPower: { cpWatts: number; wPrimeJoules: number; r2: number } | null;
  model: { pmaxWatts: number; frcJoules: number; ftpEstWatts: number; cpEstWatts: number; tteMinutes: number } | null;
  profile: { type: RiderType; axisX: number; axisY: number; confidence: number } | null;
  ability: { overallPercentile: number; byDuration: Array<{ duration: RiderDuration; wPerKg: number; percentile: number }> } | null;
  activityCount: number;
  weightKgSnapshot: number | null;
  reasonCodes: CoachRiderInsightReason[];
  exampleQuestionCodes: [typeof RIDER_QUESTION_CODES[0], typeof RIDER_QUESTION_CODES[1]];
  execution: { providerCalls: 0; quotaConsumed: false; writes: 0 };
}

const TOP_KEYS = ["ability", "activityCount", "asOf", "criticalPower", "discipline", "exampleQuestionCodes", "execution", "mmpWatts", "model", "profile", "reasonCodes", "schemaVersion", "snapshotId", "sourceRevision", "status", "weightKgSnapshot"];
const REASONS: CoachRiderInsightReason[] = ["pdc_missing", "weight_missing", "activity_count_below_5", "classification_low_confidence", "classification_unavailable", "discipline_not_supported"];
const object = (value: unknown): Record<string, unknown> | null => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const nullable = (value: unknown, min: number, max: number) => value === null || finite(value, min, max);

function invalid(): never {
  throw new Error("INVALID_COACH_RIDER_INSIGHT");
}

export function parseCoachRiderInsight(input: unknown, expectedDiscipline = "bike"): CoachRiderInsight {
  const envelope = object(input);
  const data = object(envelope?.data);
  if (!envelope || !exact(envelope, ["data"]) || !data || !exact(data, TOP_KEYS)) invalid();
  let bytes = Infinity;
  try { bytes = new TextEncoder().encode(JSON.stringify(data)).byteLength; } catch { invalid(); }

  const mmp = object(data.mmpWatts);
  const cp = data.criticalPower === null ? null : object(data.criticalPower);
  const model = data.model === null ? null : object(data.model);
  const profile = data.profile === null ? null : object(data.profile);
  const ability = data.ability === null ? null : object(data.ability);
  const execution = object(data.execution);
  const reasons = data.reasonCodes;
  const questions = data.exampleQuestionCodes;
  const status = data.status as CoachRiderInsightStatus;

  if (bytes > 2_000 || data.schemaVersion !== "coach-rider-insight-v1"
      || !["missing", "missing_weight", "insufficient_activity", "low_confidence", "ok", "unsupported"].includes(String(status))
      || data.discipline !== expectedDiscipline || typeof data.snapshotId !== "string" || !/^rider_[a-f0-9]{24}$/u.test(data.snapshotId)
      || typeof data.sourceRevision !== "string" || !/^pdcr_[a-f0-9]{24}$/u.test(data.sourceRevision)
      || typeof data.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(data.asOf)
      || !Number.isFinite(Date.parse(data.asOf)) || !mmp || !exact(mmp, RIDER_DURATIONS)
      || !RIDER_DURATIONS.every((duration) => nullable(mmp[duration], 1, 3_000))) invalid();

  const curve = RIDER_DURATIONS.map((duration) => mmp[duration]).filter((value): value is number => typeof value === "number");
  if (curve.some((value, index) => index > 0 && value > curve[index - 1]!)) invalid();
  if (!(cp === null || (exact(cp, ["cpWatts", "r2", "wPrimeJoules"])
      && finite(cp.cpWatts, 1, 1_500) && finite(cp.wPrimeJoules, 0, 100_000) && finite(cp.r2, 0, 1)))) invalid();
  if (!(model === null || (exact(model, ["cpEstWatts", "frcJoules", "ftpEstWatts", "pmaxWatts", "tteMinutes"])
      && finite(model.pmaxWatts, 1, 3_000) && finite(model.frcJoules, 0, 100_000)
      && finite(model.ftpEstWatts, 1, 1_500) && finite(model.cpEstWatts, 1, 1_500) && finite(model.tteMinutes, 1, 120)))) invalid();
  if (cp && model && (Math.abs(Number(cp.cpWatts) - Number(model.cpEstWatts)) > 2
      || Math.abs(Number(cp.wPrimeJoules) - Number(model.frcJoules)) > 2)) invalid();
  if (!(profile === null || (exact(profile, ["axisX", "axisY", "confidence", "type"])
      && RIDER_TYPES.includes(profile.type as RiderType) && finite(profile.axisX, -1, 1)
      && finite(profile.axisY, -1, 1) && finite(profile.confidence, 0.75, 1)))) invalid();

  const rows = ability && Array.isArray(ability.byDuration) ? ability.byDuration : null;
  if (!(ability === null || (exact(ability, ["byDuration", "overallPercentile"])
      && finite(ability.overallPercentile, 0, 100) && rows && rows.length <= 4
      && new Set(rows.map((item) => object(item)?.duration)).size === rows.length
      && rows.every((item) => { const row = object(item); return row && exact(row, ["duration", "percentile", "wPerKg"])
        && RIDER_DURATIONS.includes(row.duration as RiderDuration) && finite(row.wPerKg, 0.1, 30) && finite(row.percentile, 0, 100); })))) invalid();
  if (!Number.isInteger(data.activityCount) || !finite(data.activityCount, 0, 10_000) || !nullable(data.weightKgSnapshot, 25, 250)
      || !Array.isArray(reasons) || reasons.length > 2 || new Set(reasons).size !== reasons.length
      || !reasons.every((reason) => REASONS.includes(reason as CoachRiderInsightReason))
      || !Array.isArray(questions) || questions.join(",") !== RIDER_QUESTION_CODES.join(",")
      || !execution || !exact(execution, ["providerCalls", "quotaConsumed", "writes"])
      || execution.providerCalls !== 0 || execution.quotaConsumed !== false || execution.writes !== 0) invalid();

  const expectedReasons: Record<CoachRiderInsightStatus, CoachRiderInsightReason[]> = {
    missing: ["pdc_missing"], missing_weight: ["weight_missing"], insufficient_activity: ["activity_count_below_5"],
    low_confidence: reasons.includes("classification_unavailable") ? ["classification_unavailable"] : ["classification_low_confidence"],
    ok: [], unsupported: ["discipline_not_supported"],
  };
  if (JSON.stringify(reasons) !== JSON.stringify(expectedReasons[status])
      || (status === "ok") !== (profile !== null) || (data.discipline !== "bike") !== (status === "unsupported")
      || (status === "ok" && (data.weightKgSnapshot === null || Number(data.activityCount) < 5))
      || (status === "missing_weight" && data.weightKgSnapshot !== null)
      || (status === "insufficient_activity" && Number(data.activityCount) >= 5)) invalid();

  if (ability && rows && data.weightKgSnapshot != null && rows.some((item) => {
    const row = object(item)!; const watts = mmp[row.duration as RiderDuration];
    return typeof watts !== "number" || Math.abs(watts / Number(data.weightKgSnapshot) - Number(row.wPerKg)) > 0.05;
  })) invalid();
  return data as unknown as CoachRiderInsight;
}
