import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { Gauge, MessageCircle } from "lucide-react";
import { Button, Card, Chip, Text } from "../../theme/components";
import { useCoachRiderInsight } from "../../hooks/useCoachRiderInsight";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { RIDER_DURATIONS, type CoachRiderQuestionCode, type RiderDuration } from "../../services/coachRiderInsightContract";
import "./coach-rider-insight.css";

export interface CoachRiderQuestionSelection {
  question: string;
  snapshotId: string;
}

interface Props {
  user: User;
  discipline: "bike" | "run" | "swim";
  onQuestionSelect: (selection: CoachRiderQuestionSelection) => void;
}

export function isCoachRiderInsightFeatureEnabled(): boolean {
  return getRuntimeConfig().coachRiderInsightEnabled === true;
}

function formatAsOf(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function durationRank(rows: Array<{ duration: RiderDuration; percentile: number }>, duration: RiderDuration): "strength" | "improve" | null {
  if (rows.length < 2) return null;
  const value = rows.find((row) => row.duration === duration)?.percentile;
  if (value == null) return null;
  const values = rows.map((row) => row.percentile);
  if (value === Math.max(...values)) return "strength";
  if (value === Math.min(...values)) return "improve";
  return null;
}

export function CoachRiderInsightCard({ user, discipline, onQuestionSelect }: Props) {
  const { t, i18n } = useTranslation(["coach", "fitness"]);
  const titleId = useId();
  const enabled = isCoachRiderInsightFeatureEnabled() && discipline === "bike";
  const { insight, loading, unavailable } = useCoachRiderInsight(user.uid, enabled);
  if (!enabled) return null;
  if (loading) return <Card className="coach-rider-card" role="status" aria-live="polite">
    <div className="coach-rider-card__loading"><span className="ds-btn__spinner" aria-hidden /><Text>{t("coach:rider.loading")}</Text></div>
  </Card>;
  if (!insight) return unavailable ? <Card className="coach-rider-card" role="status" aria-live="polite">
    <Text as="h2" variant="subtitle">{t("coach:rider.title")}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("coach:rider.unavailable")}</Text>
  </Card> : null;

  const trusted = insight.status === "ok" && insight.profile !== null;
  const statusLabel = t(`coach:rider.status.${insight.status}`);
  const rows = insight.ability?.byDuration ?? [];
  return <Card className="coach-rider-card" role="region" aria-labelledby={titleId}>
    <header className="coach-rider-card__header">
      <div className="coach-rider-card__heading"><Gauge aria-hidden /><div>
        <Text id={titleId} as="h2" variant="subtitle">{t("coach:rider.title")}</Text>
        <Text as="p" variant="caption" tone="secondary">{t("coach:rider.subtitle")}</Text>
      </div></div>
      <Chip variant={trusted ? "success" : insight.status === "low_confidence" ? "warning" : "default"}>{statusLabel}</Chip>
    </header>
    <Text className="sr-only" as="p" role="status" aria-live="polite">
      {t("coach:rider.accessibleStatus", { status: statusLabel, count: insight.activityCount })}
    </Text>

    {trusted && insight.profile ? <>
      <div className="coach-rider-card__result">
        <div><Text as="p" variant="eyebrow">{t("coach:rider.resultLabel")}</Text>
          <Text as="p" variant="title">{t(`fitness:riderType.type.${insight.profile.type}.label`)}</Text>
          <Text as="p" variant="bodySmall" tone="secondary">{t(`fitness:riderType.type.${insight.profile.type}.desc`)}</Text></div>
        <div className="coach-rider-card__scores">
          <Chip variant="accent">{t("coach:rider.confidence", { value: Math.round(insight.profile.confidence * 100) })}</Chip>
          {insight.ability && <Chip>{t("coach:rider.ability", { value: Math.round(insight.ability.overallPercentile) })}</Chip>}
        </div>
      </div>
      <dl className="coach-rider-card__axes">
        <div><dt>{t("coach:rider.axis.endurance")}</dt><dd>{Math.round(insight.profile.axisX * 100)}</dd></div>
        <div><dt>{t("coach:rider.axis.weight")}</dt><dd>{Math.round(insight.profile.axisY * 100)}</dd></div>
      </dl>
      {rows.length > 0 && <div className="coach-rider-card__durations">
        <Text as="h3" variant="label">{t("coach:rider.durationTitle")}</Text>
        <div className="coach-rider-card__duration-grid">
          {RIDER_DURATIONS.flatMap((duration) => {
            const row = rows.find((item) => item.duration === duration);
            if (!row) return [];
            const rank = durationRank(rows, duration);
            return [<div key={duration} className="coach-rider-card__duration">
              <div><Text as="span" variant="label">{t(`coach:rider.duration.${duration}`)}</Text>
                {rank && <Chip variant={rank === "strength" ? "success" : "warning"}>{t(`coach:rider.${rank}`)}</Chip>}</div>
              <Text as="span" variant="mono">{row.wPerKg.toFixed(2)} W/kg · {Math.round(row.percentile)}%</Text>
            </div>];
          })}
        </div>
      </div>}
    </> : <div className="coach-rider-card__safe">
      <Text as="p" variant="bodySmall" tone="secondary">{t(`coach:rider.safe.${insight.status}`, { count: insight.activityCount })}</Text>
    </div>}

    <div className="coach-rider-card__meta">
      <Text as="p" variant="caption" tone="secondary">{t("coach:rider.asOf", { value: formatAsOf(insight.asOf, i18n.language) })}</Text>
      <Text as="p" variant="caption" tone="secondary">{t("coach:rider.sourceNote")}</Text>
    </div>
    <div className="coach-rider-card__questions" aria-label={t("coach:rider.questionsLabel")}>
      {insight.exampleQuestionCodes.map((code: CoachRiderQuestionCode) => {
        const question = t(`coach:rider.questions.${code}`);
        return <Button key={code} type="button" block variant="ghost" leadingIcon={<MessageCircle aria-hidden />}
          disabled={!trusted} aria-label={question} onClick={() => onQuestionSelect({ question, snapshotId: insight.snapshotId })}>
          {question}
        </Button>;
      })}
    </div>
  </Card>;
}
