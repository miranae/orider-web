import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure, Text, ToggleButton, ToggleControls } from "../../../theme";

import { PowerReadingControlsContext } from "./PowerReadingControls";

/** One reading surface, one comparison basis at a time. Data ownership stays with each source. */
export function ActivityPowerComparison({ current, benchmark, evidence, inlineControls = false }: { inlineControls?: boolean; current: ReactNode; benchmark: ReactNode; evidence: ReactNode }) {
  const { t } = useTranslation("activity");
  const [basis, setBasis] = useState<"records" | "recent">("records");
  const id = useId();
  const recent = basis === "recent" && !!benchmark;
  const controls = benchmark && <div className="activity-power-basis"><Text variant="bodySmall" tone="secondary">{t("analysisReading.compareWith")}</Text><ToggleControls variant="axis" aria-label={t("analysisReading.compareWith")}>
        <ToggleButton selected={!recent} aria-controls={id} onClick={() => setBasis("records")}>{t("analysisReading.records")}</ToggleButton>
        <ToggleButton selected={recent} aria-controls={id} onClick={() => setBasis("recent")}>{t("analysisReading.recent")}</ToggleButton>
      </ToggleControls></div>;
  return <div className="activity-power-comparison">
    <div className="activity-power-comparison__header">
      <div><Text as="h3" variant="subtitle">{t("analysisReading.powerTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("analysisReading.powerDescription")}</Text></div>
      {!inlineControls && controls}
    </div>
    <PowerReadingControlsContext.Provider value={inlineControls ? controls : null}><div id={id}>{recent ? benchmark : current}</div></PowerReadingControlsContext.Provider>
    <div className="activity-analysis-comparison-reading"><Text as="h4" variant="bodyMedium" weight={600}>{t("analysisReading.comparisonMeaning")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("analysisReading.comparisonContext")}</Text></div>
    {!recent && evidence && <Disclosure title={t("analysisReading.powerDetails")} description={t("analysisReading.powerDetailsDescription")}>{evidence}</Disclosure>}
  </div>;
}
