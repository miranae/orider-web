import { useTranslation } from "react-i18next";
import type { RunningPaceZoneAnalysis, PeriodRunningPaceZones } from "@shared/types/training-analysis-periods";
import { Text } from "../../theme";
import { LocalizedLink } from "../LocalizedLink";
import { formatPace } from "../../utils/units";
import { formatElapsedBoundary } from "../../features/activity/detail/activityRangeSelection";
import { validRunningPaceZoneAnalysis } from "../../services/trainingAnalysisPeriods";

type PaceGroup = PeriodRunningPaceZones["groups"][number];
/** 읽은 계산 스냅샷만 표시한다. 현재 프로필이나 raw stream으로 존을 만들지 않는다. */
export default function RunningPaceZonesPanel({ analysis }: { analysis: RunningPaceZoneAnalysis | PaceGroup }) {
  const { t, i18n } = useTranslation("activity");
  const single = "calculatedAt" in analysis;
  const sources = single ? [] : analysis.sources;
  const snapshot = single ? analysis : { ...analysis, calculatedAt: sources[0]?.calculatedAt, thresholdProfileRevision: sources[0]?.thresholdProfileRevision };
  if (!validRunningPaceZoneAnalysis(snapshot)) return <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.invalid")}</Text>;
  const date = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
  const interval = analysis.intervalCoverage;
  const threshold = analysis.thresholdPaceSecPerKm;
  const range = (index: number) => {
    if (threshold == null) return "—";
    const slower = index > 0 ? formatPace(threshold / analysis.upperSpeedRatios[index - 1]!, "metric") : null;
    const faster = index < 5 ? formatPace(threshold / analysis.upperSpeedRatios[index]!, "metric") : null;
    return slower == null ? t("runningPaceZones.slower", { pace: faster }) : faster == null ? t("runningPaceZones.faster", { pace: slower }) : `${faster} – <${slower}`;
  };
  return <section className="min-w-0 space-y-3" aria-label={t("runningPaceZones.title")}>
    <Text as="h4" variant="bodyMedium" weight={600}>{t("runningPaceZones.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.policy")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.snapshot")}</Text>
    {threshold != null && <Text as="p" variant="bodyMedium">{t("runningPaceZones.threshold", { pace: formatPace(threshold, "metric"), source: t(analysis.thresholdSource === "training.thresholdPace" ? "runningPaceZones.trainingSource" : "runningPaceZones.profileSource") })}</Text>}
    {analysis.state === "observed" ? <>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.denominator", { time: formatElapsedBoundary(analysis.eligibleGapSeconds) })}</Text>
      <div className="space-y-3">{analysis.zoneSeconds.map((seconds, index) => <div key={index} className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><Text variant="bodyMedium">Z{index + 1} · {range(index)}</Text><Text variant="bodyMedium" mono>{formatElapsedBoundary(seconds)} · {seconds > 0 && seconds / analysis.eligibleGapSeconds * 100 < 0.1 ? "<0.1" : (seconds / analysis.eligibleGapSeconds * 100).toFixed(1)}%</Text></div>
        <div className="rounded-[var(--r-sm)] overflow-hidden bg-[var(--bg-2)]" aria-hidden="true"><div style={{ width: `${seconds / analysis.eligibleGapSeconds * 100}%`, height: "var(--space-2)", background: index === 5 ? "var(--violet)" : `var(--zone-${index + 1})` }} /></div>
      </div>)}</div>
    </> : <Text as="p" variant="bodyMedium" tone="secondary">{t(`runningPaceZones.reason.${analysis.reason}`)}</Text>}
    <details className="space-y-2">
      <summary className="cursor-pointer py-2 inline-flex items-center" style={{ minHeight: "calc(var(--dim-button-height) + var(--space-1))" }}><Text variant="bodyMedium" weight={600}>{t("runningPaceZones.evidence")}</Text></summary>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.intervalScope")}</Text>
      {interval ? <div className="space-y-2">{(["observedIntervalSeconds", "eligibleGapSeconds", "stoppedSeconds", "missingAltitudeMovingSeconds", "gapExcludedSeconds", "invalidDistanceSeconds"] as const).map(key => <Text key={key} as="p" variant="bodyMedium">{t(`runningPaceZones.interval.${key}`)} · {formatElapsedBoundary(interval[key])}</Text>)}</div> : <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.intervalUnknown")}</Text>}
      {single && <><Text as="p" variant="bodyMedium">{t("runningPaceZones.calculated", { date: date(analysis.calculatedAt) })}</Text>{analysis.thresholdProfileRevision && <Text as="p" variant="bodyMedium" tone="secondary" style={{ overflowWrap: "anywhere" }}>{t("runningPaceZones.revision", { revision: analysis.thresholdProfileRevision })}</Text>}</>}
      {sources.map(source => <div key={source.sourceActivityId} className="space-y-1"><LocalizedLink className="inline-flex items-center" style={{ minHeight: "calc(var(--dim-button-height) + var(--space-1))" }} to={`/activity/${encodeURIComponent(source.sourceActivityId)}`}>{t("runningPaceZones.sourceActivity", { date: date(source.startTime) })}</LocalizedLink><Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.calculated", { date: date(source.calculatedAt) })}</Text>{source.thresholdProfileRevision && <Text as="p" variant="bodyMedium" tone="secondary" style={{ overflowWrap: "anywhere" }}>{t("runningPaceZones.revision", { revision: source.thresholdProfileRevision })}</Text>}</div>)}
    </details>
  </section>;
}
