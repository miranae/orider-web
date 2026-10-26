import type { ActivityOverviewPresentation } from "@shared/types/activity-overview";
import { useTranslation } from "react-i18next";
import { Card, Chip, Stat, Text } from "../../../theme";
import GlossaryProvider from "../../../components/common/GlossaryProvider";
import GlossaryText from "../../../components/common/GlossaryText";

/** The first reading: what this activity was, then three distinct measures of its demand. */
export function ActivityAnalysisSummary({ presentation: p }: { presentation: ActivityOverviewPresentation }) {
  const { t } = useTranslation("activity");
  const session = p.session;
  return <GlossaryProvider scopeKey="activity-analysis-summary"><Card variant="flat" className="activity-analysis-summary" id="activity-analysis-summary">
    <div className="activity-analysis-summary__reading">
      <Text as="h3" variant="bodySmall" tone="secondary">{t("analysisReading.summary")}</Text>
      {p.coachSentence && <Text as="p" variant="title"><GlossaryText>{p.coachSentence}</GlossaryText></Text>}
      <div className="activity-analysis-summary__tags">
        {session.character && <Chip variant="accent">{t(`overviewEvidence.characters.${session.character}`)}</Chip>}
        {p.availability?.power === "estimated" && <Chip>{t("overviewEvidence.powerEstimated")}</Chip>}
        {p.aboveUsualVolume && <Chip>{t("overviewSummary.aboveUsualVolume")}</Chip>}
      </div>
    </div>
    <div className="activity-analysis-fact-cluster">
      {session.load != null && <Stat label={t("detail.acceptedLoadLabel")} value={Math.round(session.load * 10) / 10} />}
      {session.normalizedPowerW != null && <Stat label={<GlossaryText>NP</GlossaryText>} value={Math.round(session.normalizedPowerW * 10) / 10} unit="W" />}
      {session.intensityFactor != null && <Stat label={<GlossaryText>IF</GlossaryText>} value={session.intensityFactor.toFixed(2)} />}
    </div>
  </Card></GlossaryProvider>;
}
