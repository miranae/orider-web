import { useTranslation } from "react-i18next";
import { useWeeklyStats } from "../../hooks/useActivities";
import { useRunHistory } from "../../hooks/useRunHistory";
import { computeRunWeeklyRecap, isRecapVisible } from "../../utils/runWeeklyRecap";
import { seoulWeekday } from "../../utils/seoulWeek";
import WeeklyRecapCard from "../../components/dashboard/WeeklyRecapCard";
import { Card, Stack, Text } from "../../theme/components";

/** 홈에서 옮겨 온 월간 흐름. 코치의 선택 기간과 별개인 달력 월 집계다. */
export default function CoachActivitySummary({ discipline }: { discipline: "bike" | "run" | "swim" }) {
  const { t } = useTranslation("fitness");
  const running = discipline === "run";
  const stats = useWeeklyStats({ includeMonthlyDistance: true, discipline: running ? "run" : undefined });
  const history = useRunHistory(8, running);
  const now = Date.now();
  const recap = running && !history.loading && history.available && isRecapVisible(now, seoulWeekday)
    ? computeRunWeeklyRecap(history.runs, now) : null;
  const ready = stats.coverage === "ready";
  return <Stack gap="var(--space-3)" style={{ marginBottom: "var(--space-4)" }}>
    <Card>
      <Text as="h2" variant="subtitle">{t(running ? "activitySummary.monthRun" : "activitySummary.monthAll")}</Text>
      {ready ? <>
        <Text as="p" variant="dataMedium" mono>{(stats.monthlyActivityDistance / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} <Text as="span" variant="unit">km</Text></Text>
        {stats.monthlyFlowPercent != null && <Text as="p" variant="bodySmall" tone="secondary">{t("activitySummary.monthComparison", { percent: stats.monthlyFlowPercent })}</Text>}
        <Text as="p" variant="caption" tone="secondary">{t(running ? "activitySummary.runBasis" : "activitySummary.allBasis")}</Text>
      </> : <Text as="p" variant="bodySmall" tone="secondary" role={stats.coverage === "loading" ? "status" : undefined}>{t(stats.coverage === "loading" ? "activitySummary.loading" : "activitySummary.unavailable")}</Text>}
    </Card>
    {recap && <WeeklyRecapCard recap={recap} />}
  </Stack>;
}
