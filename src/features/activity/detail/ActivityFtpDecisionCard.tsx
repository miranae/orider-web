import { useTranslation } from "react-i18next";

import { useBikeFtpDecision } from "../../../hooks/useBikeFtpDecision";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Text, buttonClass } from "../../../theme/components";

export function ActivityFtpDecisionCard({ uid, activityId, enabled }: { uid: string | null; activityId: string; enabled: boolean }) {
  const { t } = useTranslation("activity");
  const { decision } = useBikeFtpDecision({ uid, sourceActivityId: activityId, enabled });
  if (!enabled || !decision || !["actionable", "blocked"].includes(decision.status)) return null;
  const link = { pathname: "/fitness", search: `?sport=bike&decisionId=${encodeURIComponent(decision.decisionId)}` };
  return (
    <Card padding="none" data-activity-ftp-decision style={{ padding: "var(--space-5)" }}>
      <Text as="div" variant="eyebrow" style={{ color: "var(--aqua)" }}>{t("ftpDecision.eyebrow")}</Text>
      <Text as="h3" variant="title" style={{ margin: "var(--space-1) 0 0" }}>{t("ftpDecision.title")}</Text>
      <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
        {t(decision.status === "blocked" ? "ftpDecision.blocked" : "ftpDecision.summary", {
          current: decision.candidate.currentFtp,
          candidate: decision.candidate.ftp,
        })}
      </Text>
      <LocalizedLink to={link} className={buttonClass({ variant: "primary", size: "sm" })}>
        {t("ftpDecision.openFitness")}
      </LocalizedLink>
    </Card>
  );
}
