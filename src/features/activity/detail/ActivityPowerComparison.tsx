import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure, Text, ToggleButton, ToggleControls } from "../../../theme";

/** One reading surface, one comparison basis at a time. Data ownership stays with each source. */
export function ActivityPowerComparison({ current, benchmark, evidence }: { current: ReactNode; benchmark: ReactNode; evidence: ReactNode }) {
  const { t } = useTranslation("activity");
  const [basis, setBasis] = useState<"records" | "recent">("records");
  const id = useId();
  const recent = basis === "recent" && !!benchmark;
  return <div className="activity-power-comparison">
    <div className="activity-power-comparison__header">
      <div><Text as="h3" variant="subtitle">{t("analysisReading.powerTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("analysisReading.powerDescription")}</Text></div>
      {benchmark && <ToggleControls variant="axis" aria-label={t("analysisReading.compareWith")}>
        <ToggleButton selected={!recent} aria-controls={id} onClick={() => setBasis("records")}>{t("analysisReading.records")}</ToggleButton>
        <ToggleButton selected={recent} aria-controls={id} onClick={() => setBasis("recent")}>{t("analysisReading.recent")}</ToggleButton>
      </ToggleControls>}
    </div>
    <div id={id}>{recent ? benchmark : current}</div>
    <div className="activity-analysis-comparison-reading"><Text as="h4" variant="bodyMedium" weight={600}>{t("analysisReading.comparisonMeaning")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("analysisReading.comparisonContext")}</Text></div>
    {!recent && evidence && <Disclosure title={t("analysisReading.powerDetails")} description={t("analysisReading.powerDetailsDescription")}>{evidence}</Disclosure>}
  </div>;
}
