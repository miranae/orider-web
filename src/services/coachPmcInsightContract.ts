export const PMC_EXAMPLE_QUESTION_CODES = [
  "pmc_recent_load_change",
  "pmc_current_form_intensity",
] as const;

export type CoachPmcExampleQuestionCode = typeof PMC_EXAMPLE_QUESTION_CODES[number];
export type CoachPmcDiscipline = "bike" | "run" | "swim";
export type CoachPmcInsightStatus = "ok" | "partial" | "stale" | "missing";
export type CoachPmcInterpretationCode = "normal_load" | "productive_load" | "high_load"
  | "recovery_review" | "insufficient_history" | "incomplete_data" | "refresh_required" | "data_unavailable";

interface CoachPmcMetrics {
  ctl: number | null;
  atl: number | null;
  form: number | null;
}

export interface CoachPmcInsight {
  schemaVersion: "coach-pmc-insight-v1";
  status: CoachPmcInsightStatus;
  discipline: CoachPmcDiscipline;
  snapshotId: string;
  sourceRevision: string;
  asOf: string;
  current: CoachPmcMetrics;
  delta7d: CoachPmcMetrics;
  freshness: { status: "fresh" | "stale" | "missing"; maxAgeHours: 36; reasonCodes: string[] };
  sourceQuality: {
    level: "complete" | "estimated" | "incomplete" | "unavailable";
    estimatedLoad: boolean;
    reasonCodes: string[];
  };
  classification: "normal" | "productive_load" | "high_load" | "recovery_review_recommended" | null;
  interpretationCode: CoachPmcInterpretationCode;
  exampleQuestionCodes: ["pmc_recent_load_change", "pmc_current_form_intensity"];
  execution: { providerCalls: 0; quotaConsumed: false; writes: 0 };
}

const TOP_KEYS = ["asOf", "classification", "current", "delta7d", "discipline", "exampleQuestionCodes", "execution",
  "freshness", "interpretationCode", "schemaVersion", "snapshotId", "sourceQuality", "sourceRevision", "status"];
const METRIC_KEYS = ["atl", "ctl", "form"];
const FRESHNESS_KEYS = ["maxAgeHours", "reasonCodes", "status"];
const QUALITY_KEYS = ["estimatedLoad", "level", "reasonCodes"];
const EXECUTION_KEYS = ["providerCalls", "quotaConsumed", "writes"];
const STATUSES = new Set<CoachPmcInsightStatus>(["ok", "partial", "stale", "missing"]);
const DISCIPLINES = new Set<CoachPmcDiscipline>(["bike", "run", "swim"]);
const INTERPRETATIONS = new Set<CoachPmcInterpretationCode>([
  "normal_load", "productive_load", "high_load", "recovery_review", "insufficient_history", "incomplete_data",
  "refresh_required", "data_unavailable",
]);
const CLASSIFICATIONS = new Set(["normal", "productive_load", "high_load", "recovery_review_recommended"]);
const SNAPSHOT_ID = /^pmc_[a-f0-9]{24}$/;
const SOURCE_REVISION = /^pmcr_[a-f0-9]{24}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function finiteMetric(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function reasonCodes(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems
    && value.every((item) => typeof item === "string" && item.length <= 64);
}

function metrics(value: unknown): CoachPmcMetrics | null {
  const parsed = object(value);
  if (!parsed || !hasExactKeys(parsed, METRIC_KEYS)
      || !finiteMetric(parsed.ctl) || !finiteMetric(parsed.atl) || !finiteMetric(parsed.form)) return null;
  return { ctl: parsed.ctl, atl: parsed.atl, form: parsed.form };
}

export function parseCoachPmcInsight(input: unknown, expectedDiscipline?: CoachPmcDiscipline): CoachPmcInsight {
  const envelope = object(input); const data = object(envelope?.data);
  let encodedBytes = Number.POSITIVE_INFINITY;
  try { encodedBytes = new TextEncoder().encode(JSON.stringify(data)).byteLength; } catch { /* rejected below */ }
  const current = metrics(data?.current); const delta7d = metrics(data?.delta7d);
  const freshness = object(data?.freshness); const quality = object(data?.sourceQuality);
  const execution = object(data?.execution);
  if (encodedBytes > 2_000 || !envelope || !hasExactKeys(envelope, ["data"]) || !data || !hasExactKeys(data, TOP_KEYS)
      || data.schemaVersion !== "coach-pmc-insight-v1" || !STATUSES.has(data.status as CoachPmcInsightStatus)
      || !DISCIPLINES.has(data.discipline as CoachPmcDiscipline) || (expectedDiscipline && data.discipline !== expectedDiscipline)
      || typeof data.snapshotId !== "string" || !SNAPSHOT_ID.test(data.snapshotId)
      || typeof data.sourceRevision !== "string" || !SOURCE_REVISION.test(data.sourceRevision)
      || typeof data.asOf !== "string" || !RFC3339.test(data.asOf) || !Number.isFinite(Date.parse(data.asOf))
      || !current || !delta7d || !freshness || !hasExactKeys(freshness, FRESHNESS_KEYS)
      || !["fresh", "stale", "missing"].includes(String(freshness.status)) || freshness.maxAgeHours !== 36
      || !reasonCodes(freshness.reasonCodes, 32) || !quality || !hasExactKeys(quality, QUALITY_KEYS)
      || !["complete", "estimated", "incomplete", "unavailable"].includes(String(quality.level))
      || typeof quality.estimatedLoad !== "boolean" || !reasonCodes(quality.reasonCodes, 48)
      || !(data.classification === null || CLASSIFICATIONS.has(String(data.classification)))
      || !INTERPRETATIONS.has(data.interpretationCode as CoachPmcInterpretationCode)
      || !Array.isArray(data.exampleQuestionCodes)
      || data.exampleQuestionCodes.length !== PMC_EXAMPLE_QUESTION_CODES.length
      || !data.exampleQuestionCodes.every((code, index) => code === PMC_EXAMPLE_QUESTION_CODES[index])
      || !execution || !hasExactKeys(execution, EXECUTION_KEYS)
      || execution.providerCalls !== 0 || execution.quotaConsumed !== false || execution.writes !== 0) {
    throw new Error("INVALID_COACH_PMC_INSIGHT");
  }
  const classificationInterpretation = {
    normal: "normal_load", productive_load: "productive_load", high_load: "high_load",
    recovery_review_recommended: "recovery_review",
  } as const;
  const statusValid = data.status === "stale"
    ? freshness.status === "stale" && quality.level === "incomplete"
      && data.interpretationCode === "refresh_required" && data.classification === null
    : data.status === "missing"
      ? freshness.status === "missing" && quality.level === "unavailable"
        && data.interpretationCode === "data_unavailable" && data.classification === null
      : data.status === "partial"
        ? freshness.status === "fresh" && quality.level === "incomplete" && data.classification === null
          && ["insufficient_history", "incomplete_data"].includes(String(data.interpretationCode))
        : freshness.status === "fresh" && data.classification !== null
          && ["complete", "estimated"].includes(String(quality.level))
          && quality.estimatedLoad === (quality.level === "estimated")
          && classificationInterpretation[data.classification as keyof typeof classificationInterpretation]
            === data.interpretationCode;
  if (!statusValid) throw new Error("INVALID_COACH_PMC_INSIGHT");
  return {
    schemaVersion: "coach-pmc-insight-v1", status: data.status as CoachPmcInsightStatus,
    discipline: data.discipline as CoachPmcDiscipline, snapshotId: data.snapshotId, sourceRevision: data.sourceRevision,
    asOf: data.asOf, current, delta7d,
    freshness: { status: freshness.status as CoachPmcInsight["freshness"]["status"], maxAgeHours: 36,
      reasonCodes: [...freshness.reasonCodes] as string[] },
    sourceQuality: { level: quality.level as CoachPmcInsight["sourceQuality"]["level"],
      estimatedLoad: quality.estimatedLoad, reasonCodes: [...quality.reasonCodes] as string[] },
    classification: data.classification as CoachPmcInsight["classification"],
    interpretationCode: data.interpretationCode as CoachPmcInterpretationCode,
    exampleQuestionCodes: [...PMC_EXAMPLE_QUESTION_CODES],
    execution: { providerCalls: 0, quotaConsumed: false, writes: 0 },
  };
}
