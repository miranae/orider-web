import { PDC_VERSION, type PdcDoc, type RiderType } from "../types/pdc";

const DEFINITIVE_TYPES: RiderType[] = ["RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist"];
const RIDER_DURATIONS = ["5s", "1m", "5m", "20m"] as const;
const MEASURED_SOURCES = ["strava_api", "direct_file", "orider_native", "apple_health", "health_connect"] as const;

function hasCanonicalRiderMmpEvidence(pdc: PdcDoc): boolean {
  const values: number[] = [];
  for (const duration of RIDER_DURATIONS) {
    const entry = pdc.mmpAll[duration];
    const provenance = pdc.provenance.byDuration[duration];
    if (!entry || !provenance || !Number.isFinite(entry.value) || entry.value < 1 || entry.value > 3_000
        || typeof entry.activityId !== "string" || entry.activityId.length < 1 || entry.activityId.length > 256
        || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.date)
        || !Number.isFinite(Date.parse(`${entry.date}T00:00:00.000Z`))
        || new Date(`${entry.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== entry.date
        || !Number.isSafeInteger(entry.startTime) || entry.startTime < 0
        || !MEASURED_SOURCES.includes(entry.source as typeof MEASURED_SOURCES[number])
        || entry.cohortEligible !== true || provenance.source !== entry.source
        || provenance.cohortEligible !== true) return false;
    values.push(entry.value);
  }
  return values.every((value, index) => index === 0 || value <= values[index - 1]!);
}

export function hasCanonicalPdcV5Source(pdc: PdcDoc | null | undefined): pdc is PdcDoc {
  return pdc?.version === PDC_VERSION && pdc.provenance?.version === 2
    && pdc.provenance.power === "measured" && pdc.provenance.excludesVirtualPower === true
    && hasCanonicalRiderMmpEvidence(pdc);
}

export function hasDefinitiveRiderProfile(pdc: PdcDoc | null | undefined): pdc is PdcDoc & {
  riderType: NonNullable<PdcDoc["riderType"]> & { type: Exclude<RiderType, "Unclassified"> };
  weightKgSnapshot: number;
} {
  return hasCanonicalPdcV5Source(pdc) && pdc.activityCount >= 5
    && typeof pdc.weightKgSnapshot === "number" && Number.isFinite(pdc.weightKgSnapshot)
    && pdc.weightKgSnapshot >= 25 && pdc.weightKgSnapshot <= 250
    && pdc.riderType != null && DEFINITIVE_TYPES.includes(pdc.riderType.type)
    && Number.isFinite(pdc.riderType.confidence) && pdc.riderType.confidence >= 0.75 && pdc.riderType.confidence <= 1;
}
