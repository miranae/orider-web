import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useCanonicalHomeSummary } from "../../hooks/useCanonicalHomeSummary";
import { useWeeklyStats } from "../../hooks/useActivities";
import { canonicalKpiPresentation, canonicalKpiSource, canonicalWeekTotals, type HomeWeekTotals } from "../../features/home/canonicalKpiSource";
import { getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { formatDistance, formatElev } from "../../utils/units";
import { Card, Chip, Text } from "../../theme/components";

type SummarySport = "all" | "bike" | "run" | "swim";

/** 활동 기록에서 사용하는 최근 7일 합계. 호출부는 모바일 활동 탭에만 마운트한다. */
export default function RecentActivitySummary({ sport }: { sport: SummarySport }) {
  const { user, loading } = useAuth();
  if (loading || !user || user.isAnonymous) return null;
  return <OwnerSummary key={user.uid} sport={sport} />;
}

function OwnerSummary({ sport }: { sport: SummarySport }) {
  const canonical = useCanonicalHomeSummary();
  const { t } = useTranslation("dashboard");
  const source = canonicalKpiSource(canonical.enabled, canonical.display, canonical.totals);
  if (source.kind === "client") return <LegacySummary key={sport} sport={sport} />;
  const presentation = canonicalKpiPresentation(source, {
    value: t("kpi.subRecent7d"), pending: t("canonical.pending"), failed: t("canonical.failed"),
    empty: t("canonical.empty"), staleChip: t("canonical.staleChip"),
  });
  return <SummaryCard title={t("recentActivitySummary.allSports")}
    totals={source.kind === "server" ? canonicalWeekTotals(source.values) : null}
    note={presentation.showNumbers ? null : presentation.sub} chip={presentation.chip} />;
}

function LegacySummary({ sport }: { sport: SummarySport }) {
  const { t } = useTranslation("dashboard");
  const stats = useWeeklyStats({ includeMonthlyDistance: false, discipline: sport === "run" ? "run" : undefined,
    recent7DayDiscipline: sport === "all" ? undefined : sport });
  const ready = stats.recent7DayCoverage === "ready";
  return <SummaryCard title={sport === "all" ? t("recentActivitySummary.allSports") : t("todayStrip.weekTitle", { sport: t(getDisciplineLabelKey(sport)) })}
    totals={ready ? stats.thisWeek : null}
    note={ready ? null : t(stats.recent7DayCoverage === "loading" ? "canonical.pending" : stats.recent7DayCoverage === "partial" ? "recentActivitySummary.partial" : "canonical.failed")} />;
}

function SummaryCard({ title, totals, note, chip }: { title: string; totals: HomeWeekTotals | null; note: string | null; chip?: string | null }) {
  const { t } = useTranslation("dashboard");
  const { units } = useLocale();
  const metrics = [
    [t("kpi.weekDistance"), totals ? formatDistance(totals.distance, units) : "—"],
    [t("kpi.activities"), totals ? t("feed.countSuffix", { value: totals.rides }) : "—"],
    [t("kpi.movingTime"), totals ? t("weeklySummary.durationHourMin", { h: Math.floor(totals.time / 3600000), m: Math.floor(totals.time / 60000) % 60 }) : "—"],
    [t("kpi.elevation"), totals ? formatElev(totals.elevation, units) : "—"],
  ];
  return <Card padding="compact" header={<Text as="h2" variant="subtitle">{title}</Text>}>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
      {metrics.map(([label, value]) => <div key={label}>
        <Text as="dt" variant="caption" tone="tertiary">{label}</Text>
        <Text as="dd" variant="dataSmall" mono>{value}</Text>
      </div>)}
    </dl>
    {note && <Text as="p" variant="caption" tone="tertiary">{note}</Text>}
    {chip && <Chip>{chip}</Chip>}
  </Card>;
}
