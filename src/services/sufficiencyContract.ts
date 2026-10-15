/**
 * 서버가 보낸 충분도 블록(`shared/types/sufficiency.ts`)의 모양 검증.
 *
 * 블록은 **읽기만** 한다 — 상태를 다시 판정하거나 요건을 더하지 않는다(기획 C2.11.3).
 * 여기서 하는 일은 "약속한 모양인가"뿐이고, 모양이 틀리면 블록을 버리고 기존 화면을 그대로
 * 보여 준다(블록이 없는 사용자와 같은 경로). 모르는 기능·요건·행동 코드는 그 블록만 버린다 —
 * 서버가 카탈로그를 먼저 늘려도 화면이 깨지지 않게.
 */
import { logClientError } from "./errorLogger";
import type {
  SufficiencyActionCode, SufficiencyBlock, SufficiencyExclusionReason, SufficiencyGuarantee,
  SufficiencyRequirement, SufficiencyRequirementKind, SufficiencySet, SufficiencyState,
} from "@shared/types/sufficiency";

const STATES: SufficiencyState[] = ["open", "low_evidence", "locked", "processing", "delayed", "not_applicable"];
const GUARANTEES: SufficiencyGuarantee[] = ["sufficient", "minimum", "unpredictable"];
const KINDS: SufficiencyRequirementKind[] = ["input", "count", "channel", "period", "quality", "eligibility", "freshness", "self_report"];
const EXCLUSIONS: SufficiencyExclusionReason[] = ["virtual_power", "metrics_pending"];
export const KNOWN_SUFFICIENCY_ACTIONS: SufficiencyActionCode[] = ["input_weight", "confirm_weight", "connect_power_meter",
  "record_power_ride", "ride_effort_3_20min", "ride_long_1h", "ride_varied_efforts", "wait_analysis",
  "record_activity", "keep_recording"];
/** 웹이 문구를 가진 기능·요건. 여기 없는 것은 그 블록만 표시하지 않는다. */
export const KNOWN_SUFFICIENCY_FEATURES = ["power_model", "ftp_estimate", "vo2max", "rider_profile", "load_history", "power_curve", "training_zones"] as const;
const KNOWN_REQUIREMENTS = ["measured_power_activities", "effort_3_20min_points", "cp_fit", "long_rides_1h", "curve_fit",
  "estimate_agreement", "weight", "power_5min_or_cp", "vo2max_plausible", "classification_confidence",
  "load_days", "load_history_period", "load_quality", "power_curve_points", "zone_samples", "vo2max_months"];
const UNITS = ["activity", "point", "ride_1h", "kg", "day", "month", "second"];

const object = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000;
const time = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;

function amount(value: unknown): boolean {
  const row = object(value);
  return row != null && typeof row.value === "number" && Number.isFinite(row.value) && row.value >= 0
    && UNITS.includes(row.unit as string);
}

function requirement(value: unknown): SufficiencyRequirement | null {
  const row = object(value);
  if (!row || !KNOWN_REQUIREMENTS.includes(row.requirementId as string) || !KINDS.includes(row.kind as SufficiencyRequirementKind)
      || (row.satisfaction !== "met" && row.satisfaction !== "not_met")
      || !GUARANTEES.includes(row.guarantee as SufficiencyGuarantee)) return null;
  // 품질 조건에 수치가 실려 오면 계약 위반이다 — 내부 지표를 사용자에게 보이지 않는다.
  if (row.guarantee === "unpredictable" && ("target" in row || "current" in row)) return null;
  if ("target" in row && !amount(row.target)) return null;
  if ("current" in row && !amount(row.current)) return null;
  if ("excluded" in row && !(Array.isArray(row.excluded) && row.excluded.every(item => {
    const ex = object(item); return ex != null && EXCLUSIONS.includes(ex.reason as SufficiencyExclusionReason) && count(ex.count) && ex.count > 0;
  }))) return null;
  return row as unknown as SufficiencyRequirement;
}

function block(value: unknown): SufficiencyBlock | null {
  const row = object(value);
  if (!row || !(KNOWN_SUFFICIENCY_FEATURES as readonly string[]).includes(row.featureId as string)
      || typeof row.viewId !== "string" || !["bike", "run", "swim"].includes(row.discipline as string)
      || !STATES.includes(row.state as SufficiencyState) || !Array.isArray(row.requirements)
      || !count(row.remainingRequirementCount)) return null;
  const requirements = row.requirements.map(requirement);
  if (requirements.some(item => item == null)) return null;
  const action = row.nextAction === null ? null : object(row.nextAction);
  if (row.nextAction !== null && !(action && KNOWN_SUFFICIENCY_ACTIONS.includes(action.code as SufficiencyActionCode))) return null;
  const source = object(row.source);
  if (!source || (source.basis !== "measured" && source.basis !== "profile" && source.basis !== "estimated") || !Array.isArray(source.assumedInputs)
      || source.assumedInputs.some(item => typeof item !== "string")) return null;
  return row as unknown as SufficiencyBlock;
}

/**
 * 모양이 맞으면 블록 묶음을, 아니면 null. 개별 블록이 틀리면 그 블록만 뺀다.
 * `dropped` 는 버린 블록 수 — 호출부가 로그로 남긴다.
 */
export function parseSufficiencySet(input: unknown): { set: SufficiencySet; dropped: number } | null {
  const raw = object(input);
  if (!raw || raw.schemaVersion !== 1 || typeof raw.catalogVersion !== "string" || typeof raw.ownerOutput !== "string"
      || typeof raw.subjectKey !== "string" || !/^[a-f0-9]{32}$/u.test(raw.subjectKey)
      || !time(raw.asOf) || !time(raw.computedAt) || !(raw.staleAfter === null || time(raw.staleAfter))
      || typeof raw.digest !== "string" || !Array.isArray(raw.blocks)) return null;
  if (raw.nextUpdateAt != null && !time(raw.nextUpdateAt)) return null;
  const blocks = raw.blocks.map(block).filter((item): item is SufficiencyBlock => item != null);
  return { set: { ...(raw as unknown as SufficiencySet), blocks }, dropped: raw.blocks.length - blocks.length };
}

/**
 * 소유 산출물 문서의 `sufficiency` 필드를 읽는다. 필드가 없으면(도입 전 문서) null — 호출부는
 * 기존 표시를 쓴다. 모양이 틀리거나 블록을 버렸으면 `${scope}.*` 로 남긴다.
 */
export function readSufficiencyField(raw: unknown, uid: string, scope: string): SufficiencySet | null {
  const value = raw != null && typeof raw === "object" ? (raw as { sufficiency?: unknown }).sufficiency : undefined;
  if (value === undefined) return null;
  const parsed = parseSufficiencySet(value);
  if (!parsed) {
    logClientError(`${scope}.invalidSufficiency`, new Error("INVALID_SUFFICIENCY_SET"), { uid });
    return null;
  }
  if (parsed.dropped > 0) {
    logClientError(`${scope}.droppedSufficiencyBlocks`, new Error(String(parsed.dropped)), { uid });
  }
  return parsed.set;
}

/**
 * 읽기 쪽에 허용된 **유일한 시간 규칙**: owner 가 적은 만료 시각이 지났으면 「지연」으로 본다.
 * 그 밖의 상태 판정은 하지 않는다(기획 RESULT §1.4 검토 B).
 */
export function displayedSufficiencyState(set: SufficiencySet, block: SufficiencyBlock, nowMs: number): SufficiencyState {
  if (block.state === "not_applicable") return block.state;
  return set.staleAfter != null && nowMs > set.staleAfter ? "delayed" : block.state;
}
