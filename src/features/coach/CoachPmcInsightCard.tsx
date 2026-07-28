import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { Activity, MessageCircle } from "lucide-react";
import { Button, Card, Chip, Text } from "../../theme/components";
import { useCoachPmcInsight } from "../../hooks/useCoachPmcInsight";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import type { CoachDiscipline } from "../../services/coachClient";
import type { CoachPmcExampleQuestionCode, CoachPmcInsight } from "../../services/coachPmcInsightContract";
import "./coach-pmc-insight.css";

export interface CoachPmcQuestionSelection {
  question: string;
  snapshotId: string;
}

interface Props {
  user: User;
  discipline: CoachDiscipline;
  onQuestionSelect: (selection: CoachPmcQuestionSelection) => void;
}

export function isCoachPmcInsightFeatureEnabled(): boolean {
  return getRuntimeConfig().coachPmcInsightEnabled === true;
}

function formatMetric(value: number | null, locale: string): string {
  return value == null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatDelta(value: number | null, locale: string): string {
  if (value == null) return "—";
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: "always" }).format(value);
  return formatted === "-0" ? "+0" : formatted;
}

function formatAsOf(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function metricRows(insight: CoachPmcInsight, locale: string, t: (key: string) => string) {
  return (["ctl", "atl", "form"] as const).map((metric) => ({
    metric,
    label: t(`pmc.metrics.${metric}`),
    current: formatMetric(insight.current[metric], locale),
    delta: formatDelta(insight.delta7d[metric], locale),
  }));
}

export function CoachPmcInsightCard({ user, discipline, onQuestionSelect }: Props) {
  const { t, i18n } = useTranslation("coach");
  const titleId = useId();
  const enabled = isCoachPmcInsightFeatureEnabled();
  const { insight, loading, unavailable } = useCoachPmcInsight(user.uid, discipline, enabled);
  if (!enabled) return null;
  if (loading) return <Card className="coach-pmc-card" role="status" aria-live="polite">
    <div className="coach-pmc-card__loading"><span className="ds-btn__spinner" aria-hidden /><Text>{t("pmc.loading")}</Text></div>
  </Card>;
  if (!insight) return unavailable ? <Card className="coach-pmc-card" role="status" aria-live="polite">
    <Text as="h2" variant="subtitle">{t("pmc.title")}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("pmc.unavailable")}</Text>
  </Card> : null;

  const trusted = insight.status === "ok" && insight.freshness.status === "fresh";
  const questionEnabled = insight.freshness.status === "fresh"
    && (insight.status === "ok" || insight.status === "partial");
  const statusLabel = t(`pmc.status.${insight.status}`);
  const qualityLabel = t(`pmc.quality.${insight.sourceQuality.level}`);
  const freshnessLabel = t(`pmc.freshness.${insight.freshness.status}`);
  const rows = metricRows(insight, i18n.language, t);
  return <Card className="coach-pmc-card" role="region" aria-labelledby={titleId}>
    <header className="coach-pmc-card__header">
      <div className="coach-pmc-card__heading">
        <Activity aria-hidden />
        <div><Text id={titleId} as="h2" variant="subtitle">{t("pmc.title")}</Text>
          <Text as="p" variant="caption" tone="secondary">{t("pmc.subtitle", { discipline: t(`discipline.${discipline}`) })}</Text></div>
      </div>
      <Chip variant={trusted ? "success" : insight.status === "stale" ? "warning" : "default"}>{statusLabel}</Chip>
    </header>

    <Text className="sr-only" as="p" role="status" aria-live="polite">
      {t("pmc.accessibleStatus", { status: statusLabel, freshness: freshnessLabel, quality: qualityLabel })}
    </Text>
    <dl className="coach-pmc-card__metrics">
      {rows.map((row) => <div className="coach-pmc-card__metric" key={row.metric}>
        <dt><Text variant="caption" tone="secondary">{row.label}</Text></dt>
        <dd><Text variant="title" mono>{row.current}</Text>
          <Text variant="caption" tone="tertiary">{t("pmc.delta7d", { value: row.delta })}</Text></dd>
      </div>)}
    </dl>

    <div className="coach-pmc-card__meta">
      <Text as="p" variant="caption" tone="secondary">{t("pmc.asOf", { value: formatAsOf(insight.asOf, i18n.language) })}</Text>
      <Text as="p" variant="caption" tone="secondary">{t("pmc.sourceQuality", { freshness: freshnessLabel, quality: qualityLabel })}</Text>
    </div>
    {trusted
      ? <Text className="coach-pmc-card__interpretation" as="p" variant="bodySmall">{t(`pmc.interpretation.${insight.interpretationCode}`)}</Text>
      : <Text className="coach-pmc-card__interpretation" as="p" variant="bodySmall" tone="secondary">{t(`pmc.safe.${insight.status}`)}</Text>}

    <div className="coach-pmc-card__questions" aria-label={t("pmc.questionsLabel")}>
      {insight.exampleQuestionCodes.map((code: CoachPmcExampleQuestionCode) => {
        const question = t(`pmc.questions.${code}`);
        return <Button key={code} type="button" block variant="ghost" leadingIcon={<MessageCircle aria-hidden />}
          disabled={!questionEnabled} aria-label={question}
          onClick={() => onQuestionSelect({ question, snapshotId: insight.snapshotId })}>
          {question}
        </Button>;
      })}
    </div>
  </Card>;
}
