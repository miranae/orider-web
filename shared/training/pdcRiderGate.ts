import { PDC_VERSION, type PdcDoc, type RiderType } from "../types/pdc";

const DEFINITIVE_TYPES: RiderType[] = ["RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist"];

export function hasCanonicalPdcV5Source(pdc: PdcDoc | null | undefined): pdc is PdcDoc {
  return pdc?.version === PDC_VERSION && pdc.provenance?.version === 2
    && pdc.provenance.power === "measured" && pdc.provenance.excludesVirtualPower === true;
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
