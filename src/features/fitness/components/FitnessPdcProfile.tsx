import { useTranslation } from "react-i18next";
import AbilityScoreScale from "../../../components/fitness/AbilityScoreScale";
import { Chip, Text } from "../../../theme/components";

export interface FitnessPdcProfileData {
  riderType: { type: string; confidence: number } | null;
  abilityScore: number | null;
  activityCount: number | null;
  weightKgSnapshot: number | null;
  version: number | null;
  provenanceVersion: number | null;
  measuredPower: boolean;
}

const RIDER_TYPES = new Set(["RoadSprinter", "TrackSprinter", "AllRounder", "Puncher", "Climber", "TimeTrialist"]);

/** Stored PDC classification, separate from the recent 90-day three-axis profile. */
export default function FitnessPdcProfile({ pdc }: { pdc?: FitnessPdcProfileData | null }) {
  const { t } = useTranslation("dashboard");
  const definitive = (pdc?.version === 5 || pdc?.version === 6) && pdc.provenanceVersion === 2 && pdc.measuredPower
    && (pdc.activityCount ?? 0) >= 5 && pdc.weightKgSnapshot != null
    && pdc.riderType != null && pdc.riderType.confidence >= 0.75 && RIDER_TYPES.has(pdc.riderType.type);
  return <section aria-label={t("fitness:riderType.title")}>
    <Text as="h3" variant="subtitle" style={{ margin: "0 0 var(--space-3)" }}>{t("fitness:riderType.title")}</Text>
    {definitive && pdc?.riderType
      ? <><Chip variant="accent" dot>{t(`fitness:riderType.type.${pdc.riderType.type}.label`)}</Chip>
        <Text as="p" variant="bodySmall" tone="secondary">{t(`fitness:riderType.type.${pdc.riderType.type}.desc`)}</Text></>
      : <Text as="p" variant="bodySmall">{t("mobileFitness.performance.riderUnknown")}</Text>}
    <Text as="div" variant="caption" tone="secondary" style={{ margin: "var(--space-3) 0 var(--space-1)" }}>{t("mobileFitness.performance.abilityLabel")}</Text>
    {pdc?.abilityScore != null
      ? <AbilityScoreScale score={pdc.abilityScore} ariaLabel={t("mobileFitness.performance.abilityScoreAria")} accentColor="var(--lime)" />
      : <Text as="p" variant="bodySmall">{t("mobileFitness.performance.abilityUnknown")}</Text>}
    {pdc?.riderType && <Text as="p" variant="caption" tone="tertiary">{t("mobileFitness.performance.evidence.riderConfidence")} · {Math.round(pdc.riderType.confidence * 100)}%</Text>}
    <Text as="p" variant="caption" tone="tertiary">{t("mobileFitness.snapshot.riderSource")}</Text>
  </section>;
}
