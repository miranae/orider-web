import { PDC_VERSION, type PdcDoc, type PdcPowerSource, type PowerProfile, type RiderType } from "@shared/types/pdc";
import type { PowerDurationKey } from "@shared/types/personal-records";

const DURATIONS: PowerDurationKey[] = ["1s", "5s", "10s", "30s", "1m", "2m", "5m", "10m", "20m", "30m", "1h"];
const RIDER_DURATIONS = ["5s", "1m", "5m", "20m"] as const;
const SOURCES: PdcPowerSource[] = ["strava_api", "direct_file", "orider_native", "apple_health", "health_connect", "unknown"];
const RIDER_TYPES: RiderType[] = ["RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist", "Unclassified"];
const POWER_PROFILES: PowerProfile[] = ["sprinter", "pursuiter", "tt_specialist", "all_rounder", "climber", "unclassified"];
const TOP_KEYS = ["ability", "activityCount", "computedAt", "cp", "discipline", "history", "mmpAll", "pdcModel", "powerProfile", "provenance", "riderType", "stamina", "sustainablePower", "version", "vo2maxEst", "wPerKgAtKey", "weightKgSnapshot"];
const LEGACY_TOP_KEYS = TOP_KEYS.filter((key) => key !== "provenance");

const object = (value: unknown): Record<string, unknown> | null => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const subset = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && finite(value, min, max);
const nullable = (value: unknown, min: number, max: number) => value === null || finite(value, min, max);
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));

function invalid(): never { throw new Error("INVALID_PERSISTED_PDC_V5"); }

function migrateLegacyPdcV1(raw: Record<string, unknown>): PdcDoc {
  if (!exact(raw, LEGACY_TOP_KEYS) || raw.discipline !== "bike" || raw.version !== 1
      || !integer(raw.computedAt, 0, Number.MAX_SAFE_INTEGER) || !integer(raw.activityCount, 0, 10_000)) invalid();
  const legacyMmp = object(raw.mmpAll);
  if (!legacyMmp || !subset(legacyMmp, DURATIONS)) invalid();
  const mmpAll: PdcDoc["mmpAll"] = {};
  for (const [duration, value] of Object.entries(legacyMmp)) {
    const entry = object(value);
    if (!DURATIONS.includes(duration as PowerDurationKey) || !entry
        || !subset(entry, ["activityId", "context", "date", "startTime", "value"])
        || !exact(entry, "context" in entry
          ? ["activityId", "context", "date", "startTime", "value"] : ["activityId", "date", "startTime", "value"])
        || !finite(entry.value, 1, 3_000) || typeof entry.activityId !== "string"
        || entry.activityId.length < 1 || entry.activityId.length > 256 || !date(entry.date)
        || !integer(entry.startTime, 0, Number.MAX_SAFE_INTEGER)
        || ("context" in entry && (typeof entry.context !== "string" || entry.context.length > 128))) invalid();
    mmpAll[duration as PowerDurationKey] = { value: entry.value, activityId: entry.activityId,
      date: entry.date, startTime: entry.startTime, ...(typeof entry.context === "string" ? { context: entry.context } : {}),
      source: "unknown", cohortEligible: false };
  }
  const curve = DURATIONS.flatMap((duration) => mmpAll[duration] ? [mmpAll[duration]!.value] : []);
  if (curve.some((value, index) => index > 0 && value > curve[index - 1]!)) invalid();

  const legacyCp = raw.cp === null ? null : object(raw.cp);
  if (!(legacyCp === null || (exact(legacyCp, ["computedAt", "r2", "value", "wPrime"])
      && finite(legacyCp.value, 1, 1_500) && finite(legacyCp.wPrime, 0, 100_000)
      && finite(legacyCp.r2, 0, 1) && integer(legacyCp.computedAt, 0, Number.MAX_SAFE_INTEGER)))) invalid();
  const cp: PdcDoc["cp"] = legacyCp === null ? null : { value: Number(legacyCp.value), wPrime: Number(legacyCp.wPrime),
    r2: Number(legacyCp.r2), computedAt: Number(legacyCp.computedAt) };
  const byDuration = Object.fromEntries(Object.keys(mmpAll).map((duration) => [duration,
    { source: "unknown" as const, cohortEligible: false }]));

  return { discipline: "bike", mmpAll, cp, pdcModel: null, stamina: null, powerProfile: "unclassified",
    wPerKgAtKey: null, riderType: null, ability: null, sustainablePower: [], history: [], vo2maxEst: null,
    provenance: { version: 2, power: "unknown", excludesVirtualPower: false, migration: "legacy_v1",
      byDuration, derived: { ftpEst: false, vo2maxEst: false } }, activityCount: raw.activityCount,
    weightKgSnapshot: null, computedAt: raw.computedAt, version: PDC_VERSION };
}

export function parsePersistedPdc(input: unknown): PdcDoc {
  const raw = object(input);
  if (raw?.version === 1) return migrateLegacyPdcV1(raw);
  if (!raw || !exact(raw, TOP_KEYS) || raw.discipline !== "bike" || raw.version !== PDC_VERSION
      || !integer(raw.computedAt, 0, Number.MAX_SAFE_INTEGER) || !integer(raw.activityCount, 0, 10_000)
      || !nullable(raw.weightKgSnapshot, 25, 250) || !nullable(raw.stamina, 0, 1)
      || !nullable(raw.vo2maxEst, 20, 95) || !POWER_PROFILES.includes(raw.powerProfile as PowerProfile)) invalid();

  const mmpAll = object(raw.mmpAll);
  if (!mmpAll || !subset(mmpAll, DURATIONS)) invalid();
  for (const [duration, value] of Object.entries(mmpAll)) {
    const entry = object(value);
    if (!DURATIONS.includes(duration as PowerDurationKey) || !entry
        || !exact(entry, "context" in entry
          ? ["activityId", "cohortEligible", "context", "date", "source", "startTime", "value"]
          : ["activityId", "cohortEligible", "date", "source", "startTime", "value"])
        || !finite(entry.value, 1, 3_000) || typeof entry.activityId !== "string" || entry.activityId.length < 1 || entry.activityId.length > 256
        || !date(entry.date) || !integer(entry.startTime, 0, Number.MAX_SAFE_INTEGER)
        || !SOURCES.includes(entry.source as PdcPowerSource) || typeof entry.cohortEligible !== "boolean"
        || ("context" in entry && (typeof entry.context !== "string" || entry.context.length > 128))) invalid();
  }
  const curve = DURATIONS.flatMap((duration) => {
    const entry = object(mmpAll[duration]); return entry ? [Number(entry.value)] : [];
  });
  if (curve.some((value, index) => index > 0 && value > curve[index - 1]!)) invalid();

  const cp = raw.cp === null ? null : object(raw.cp);
  if (!(cp === null || (exact(cp, ["computedAt", "r2", "value", "wPrime"])
      && finite(cp.value, 1, 1_500) && finite(cp.wPrime, 0, 100_000) && finite(cp.r2, 0, 1)
      && integer(cp.computedAt, 0, Number.MAX_SAFE_INTEGER)))) invalid();
  const model = raw.pdcModel === null ? null : object(raw.pdcModel);
  if (!(model === null || (exact(model, ["cpEst", "frc", "ftpEst", "pmax", "tteMin"])
      && finite(model.pmax, 1, 3_000) && finite(model.frc, 0, 100_000) && finite(model.ftpEst, 1, 1_500)
      && finite(model.cpEst, 1, 1_500) && finite(model.tteMin, 1, 120)))) invalid();
  if (cp && model && (Math.abs(Number(cp.value) - Number(model.cpEst)) > 2 || Math.abs(Number(cp.wPrime) - Number(model.frc)) > 2)) invalid();

  const wPerKg = raw.wPerKgAtKey === null ? null : object(raw.wPerKgAtKey);
  if (!(wPerKg === null || (subset(wPerKg, RIDER_DURATIONS) && Object.values(wPerKg).every((value) => finite(value, 0.1, 30))))) invalid();
  const riderType = raw.riderType === null ? null : object(raw.riderType);
  if (!(riderType === null || (exact(riderType, ["axisX", "axisY", "confidence", "type"])
      && RIDER_TYPES.includes(riderType.type as RiderType) && finite(riderType.axisX, -1, 1)
      && finite(riderType.axisY, -1, 1) && finite(riderType.confidence, 0, 1)))) invalid();

  const ability = raw.ability === null ? null : object(raw.ability);
  const abilityRows = ability && Array.isArray(ability.byDuration) ? ability.byDuration : null;
  if (!(ability === null || (exact(ability, ["byDuration", "overallPercentile"]) && finite(ability.overallPercentile, 0, 100)
      && abilityRows && abilityRows.length <= 4 && new Set(abilityRows.map((item) => object(item)?.duration)).size === abilityRows.length
      && abilityRows.every((item) => { const row = object(item); return row && exact(row, ["duration", "percentile", "wPerKg"])
        && RIDER_DURATIONS.includes(row.duration as typeof RIDER_DURATIONS[number]) && finite(row.wPerKg, 0.1, 30) && finite(row.percentile, 0, 100); })))) invalid();

  const provenance = object(raw.provenance);
  const byDuration = object(provenance?.byDuration); const derived = object(provenance?.derived);
  if (!provenance || !exact(provenance, ["byDuration", "derived", "excludesVirtualPower", "power", "version"])
      || provenance.version !== 2 || provenance.power !== "measured" || provenance.excludesVirtualPower !== true
      || !byDuration || !subset(byDuration, DURATIONS) || !derived || !exact(derived, ["ftpEst", "vo2maxEst"])
      || typeof derived.ftpEst !== "boolean" || typeof derived.vo2maxEst !== "boolean") invalid();
  for (const [duration, value] of Object.entries(byDuration)) {
    const item = object(value); const mmp = object(mmpAll[duration]);
    if (!item || !exact(item, ["cohortEligible", "source"]) || !SOURCES.includes(item.source as PdcPowerSource)
        || typeof item.cohortEligible !== "boolean" || !mmp || item.source !== mmp.source || item.cohortEligible !== mmp.cohortEligible) invalid();
  }
  if (Object.keys(mmpAll).some((duration) => !(duration in byDuration))) invalid();

  if (raw.weightKgSnapshot === null && (wPerKg !== null || ability !== null
      || (riderType !== null && riderType.type !== "Unclassified"))) invalid();
  if (abilityRows && raw.weightKgSnapshot != null && abilityRows.some((item) => {
    const row = object(item)!; const entry = object(mmpAll[String(row.duration)]);
    return !entry || Math.abs(Number(entry.value) / Number(raw.weightKgSnapshot) - Number(row.wPerKg)) > 0.05
      || wPerKg?.[String(row.duration)] == null || Math.abs(Number(wPerKg[String(row.duration)]) - Number(row.wPerKg)) > 0.05;
  })) invalid();

  if (!Array.isArray(raw.sustainablePower) || raw.sustainablePower.length > 32 || raw.sustainablePower.some((item) => {
    const row = object(item); return !row || !exact(row, ["basis", "minutes", "watts"]) || row.basis !== "cp_w_prime"
      || !finite(row.minutes, 0.01, 1_440) || !finite(row.watts, 1, 3_000);
  })) invalid();
  if (!Array.isArray(raw.history) || raw.history.length > 12 || raw.history.some((item) => {
    const row = object(item); const mmp = object(row?.mmp);
    return !row || !exact(row, ["mmp", "period"]) || typeof row.period !== "string" || !/^\d{4}-\d{2}$/u.test(row.period)
      || !mmp || !subset(mmp, DURATIONS) || !Object.values(mmp).every((value) => finite(value, 1, 3_000));
  })) invalid();
  return raw as unknown as PdcDoc;
}
