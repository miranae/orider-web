import { useTranslation } from "react-i18next";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";
import { useLocale } from "../../contexts/LocaleContext";
import { formatPace, formatElev, formatDistance } from "../../utils/units";
import { resolveObservedDistanceKm } from "@shared/training/activityDistanceEvidence";
import type { SplitRow } from "@shared/types/activity-metrics";
import type { ActivitySummary } from "@shared/types";
import { Card, Text } from "../../theme/components";
import { MetricExplainerTrigger } from "../common/MetricExplainer";
import type { InterpretationContext, MetricKey } from "../../utils/metricInterpretation";
import { runningCadenceSpm } from "../../utils/runningCadence";
import RunSplitProfile from "./RunSplitProfile";
import ZoneDistributionChart from "../ZoneDistributionChart";
import { hrZoneDistribution } from "../../features/activity/detail/metricsPresentation";

function RunMetric({ label, value, description, unit, explain }: { label: string; value: string; description?: string; unit?: string; explain?: { metric: MetricKey; context: InterpretationContext } }) {
  const content = <>
    <div><Text as="div" variant="eyebrow">{label}</Text></div>
    <Text as="div" variant="dataLarge" style={{ marginTop: "var(--space-2)" }}>{value}{value !== "—" && unit && <Text variant="unit"> {unit}</Text>}</Text>
    {description && <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{description}</Text>}
  </>;
  return <Card padding="compact">{explain ? <MetricExplainerTrigger {...explain} sport="run">{content}</MetricExplainerTrigger> : content}</Card>;
}

/** 서버의 러닝 지표만 표시한다. 사이클 FTP 기반 수치는 러닝 파워에 적용하지 않는다. */
export default function RunAnalysisPanel({ metrics, summary, suppressCadence = false, onSelectSplit, onViewSplitLocation, canViewSplitLocation = false }: {
  metrics: ActivityMetricsDoc;
  onSelectSplit?: (split: SplitRow | null) => void;
  onViewSplitLocation?: () => void;
  canViewSplitLocation?: boolean;
  summary?: ActivitySummary;
  suppressCadence?: boolean;
}) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const pace = (sec: number | null | undefined) => sec != null && Number.isFinite(sec) && sec > 0 ? formatPace(sec, units) : "—";
  const number = (n: number | null | undefined, unit: string) => n != null && Number.isFinite(n) ? `${Math.round(n)} ${unit}` : "—";
  const avgPace = metrics.avgSpeedKph != null && Number.isFinite(metrics.avgSpeedKph) && metrics.avgSpeedKph > 0 ? 3600 / metrics.avgSpeedKph : null;
  const distanceKm = resolveObservedDistanceKm(metrics, summary?.distance);
  const cadenceUnit = metrics.cadenceUnit;
  const cadence = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0
    ? number(runningCadenceSpm(value, cadenceUnit) ?? value, cadenceUnit === "spm" || cadenceUnit === "strides_per_minute" ? "spm" : t("analysis.run.cadenceUnit")) : "—";
  const cadenceLabel = t(cadenceUnit === "spm" || cadenceUnit === "strides_per_minute" ? "stat.cadence" : "analysis.run.recordedCadence");
  const zones = hrZoneDistribution(metrics);
  const splits = metrics.splits ?? [];
  const gap = metrics.runMetrics?.gapAvgSec;
  const fastestKm = metrics.runMetrics?.minPaceSecPerKm;
  const context = { paceSecPerKm: avgPace, gapSecPerKm: gap, thresholdPaceSecPerKm: null };
  const recap: Array<{ text: string; metric?: MetricKey }> = [];
  if (avgPace != null) recap.push({ metric: "pace", text: t(distanceKm != null ? "analysis.run.recapDistancePace" : "analysis.run.recapPace", { distance: distanceKm != null ? formatDistance(distanceKm * 1000, units) : undefined, pace: pace(avgPace) }) });
  else if (distanceKm != null) recap.push({ text: t("analysis.run.recapDistance", { distance: formatDistance(distanceKm * 1000, units) }) });
  if (gap != null && Number.isFinite(gap) && gap > 0) recap.push({ metric: "gap", text: t("analysis.run.recapGap", { pace: pace(gap) }) });
  if (fastestKm != null && Number.isFinite(fastestKm) && fastestKm > 0) recap.push({ text: t("analysis.run.recapFastestKm", { pace: pace(fastestKm) }) });
  if (metrics.avgHr != null && Number.isFinite(metrics.avgHr) && metrics.avgHr > 0) recap.push({ text: t("analysis.run.recapHr", { bpm: Math.round(metrics.avgHr) }) });
  return <div className="min-w-0 space-y-6" data-testid="run-analysis">
    {recap.length > 0 && <Card padding="compact" data-testid="run-recap">
      <Text as="h3" variant="subtitle">{t("analysis.run.recapTitle")}</Text>
      <div style={{ marginTop: "var(--space-2)" }}>{recap[0]!.metric ? <MetricExplainerTrigger metric={recap[0]!.metric!} context={context} sport="run"><Text as="p" variant="bodyMedium">{recap[0]!.text}</Text></MetricExplainerTrigger> : <Text as="p" variant="bodyMedium">{recap[0]!.text}</Text>}</div>
      {recap.length > 1 && <details data-testid="run-recap-details">
        <summary className="cursor-pointer text-[length:var(--fs-sm)]" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{t("analysis.run.recapDetails")}</summary>
        <div className="space-y-2">{recap.slice(1).map((line, index) => line.metric ? <MetricExplainerTrigger key={index} metric={line.metric} context={context} sport="run"><Text as="p" variant="bodySmall" tone="secondary">{line.text}</Text></MetricExplainerTrigger> : <Text as="p" key={index} variant="bodySmall" tone="secondary">{line.text}</Text>)}</div>
      </details>}
    </Card>}
    <RunSplitProfile splits={splits} distanceKm={distanceKm} suppressCadence={suppressCadence} cadenceLabel={cadenceLabel} formatCadence={cadence} onSelectSplit={onSelectSplit} onViewSplitLocation={onViewSplitLocation} canViewSplitLocation={canViewSplitLocation} />
    {(metrics.avgHr != null || metrics.maxHr != null) && <div>
      <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3">{t("analysis.section.hr")}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RunMetric label={t("analysis.metric.avgHr")} value={metrics.avgHr != null ? Math.round(metrics.avgHr).toString() : "—"} unit="bpm" />
        <RunMetric label={t("analysis.metric.maxHr")} value={number(metrics.maxHr, "bpm")} />
      </div>
      <details className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3" style={{ marginTop: "var(--space-3)" }} data-testid="run-hr-details">
        <summary className="cursor-pointer font-semibold text-[length:var(--fs-sm)]" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{t("analysis.run.hrDetails")}</summary>
        <div className="grid grid-cols-2 gap-3" style={{ marginTop: "var(--space-2)" }}>
          <RunMetric label={t("analysis.metric.hrDrift")} value={metrics.decoupling?.hrDriftPct != null ? `${metrics.decoupling.hrDriftPct.toFixed(1)}%` : "—"} description={t("analysis.run.hrDriftDefinition")} />
          {metrics.decoupling?.basis === "speed_hr" && metrics.decoupling.decouplingPct != null && <RunMetric label={t("analysis.run.paceHrDecoupling")} value={`${metrics.decoupling.decouplingPct.toFixed(1)}%`} description={t("analysis.run.paceHrDecouplingDesc")} />}
        </div>
        <Text as="p" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>{t("analysis.run.hrComparisonLimits")}</Text>
        {zones && <div style={{ marginTop: "var(--space-3)" }}><ZoneDistributionChart zones={zones} title={t("analysis.zones.hr")} /></div>}
      </details>
    </div>}
    <details className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3" data-testid="run-detail-disclosure">
      <summary className="cursor-pointer font-semibold text-[length:var(--fs-sm)]" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{t("analysis.run.detailedAnalysis")}</summary>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ marginTop: "var(--space-3)" }}>
        <RunMetric label={t("stat.avgPace")} value={pace(avgPace)} explain={{ metric: "pace", context }} />
        <RunMetric label={t("runCards.gapPace")} value={pace(gap)} description={t("runCards.gapDesc")} explain={{ metric: "gap", context }} />
        <RunMetric label={t("analysis.metric.distance")} unit={units === "imperial" ? "mi" : "km"} value={distanceKm != null ? (units === "imperial" ? distanceKm / 1.609344 : distanceKm).toFixed(2) : "—"} />
        <RunMetric label={t("analysis.metric.fastestKm")} value={pace(fastestKm)} />
        <RunMetric label={t("analysis.metric.paceConsistency")} value={metrics.runMetrics?.paceStdDevSec != null ? `${Math.round(metrics.runMetrics.paceStdDevSec * (units === "imperial" ? 1.609344 : 1))} s/${units === "imperial" ? "mi" : "km"}` : "—"} description={t("analysis.metric.paceConsistencyDesc")} />
        <RunMetric label={t("analysis.metric.elevGain")} value={metrics.elevationGainM != null ? formatElev(metrics.elevationGainM, units) : "—"} />
        {!suppressCadence && metrics.avgCadence != null && <RunMetric label={cadenceLabel} value={cadence(metrics.avgCadence)} description={cadenceUnit == null ? t("analysis.run.cadenceDesc") : undefined} explain={{ metric: "cadence", context: { thresholdPaceSecPerKm: null } }} />}
        {metrics.avgPower != null && !metrics.isVirtualPower && <RunMetric label={t("stat.runningPower")} value={number(metrics.avgPower, "W")} description={t("analysis.run.powerDesc")} />}
        {metrics.trimp != null && <RunMetric label="TRIMP" value={number(metrics.trimp, "")} description={t("analysis.metric.trimpDesc")} />}
      </div>
    </details>
    {splits.length > 0 && <details className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3" data-testid="run-raw-splits">
      <summary className="cursor-pointer font-semibold text-[length:var(--fs-sm)]" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{t("analysis.run.allSplitData")}</summary>
      <div className="rounded-[var(--r-lg)] overflow-x-auto" style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
        <table className="w-full text-[length:var(--fs-sm)]">
          <caption className="text-left px-3 py-2">{t("analysis.section.splits")}</caption>
          <thead><tr style={{ color: "var(--ink-3)" }}>
            {["km", "pace", "gap", "elev", "hr"].map(key => <th scope="col" key={key} className="text-right px-3 py-2">{t(`analysis.splits.header.${key}`)}</th>)}
            {!suppressCadence && <th scope="col" className="text-right px-3 py-2">{cadenceLabel}</th>}
          </tr></thead>
          <tbody>{splits.map(split => <tr key={split.km} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
            <th scope="row" className="px-3 py-2 text-right">{split.km}</th>
            <td className="px-3 py-2 text-right tabular-nums">{pace(split.paceSec)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--accent-dark)" }}>{pace(split.gapSec)}</td>
            <td className="px-3 py-2 text-right">{Number.isFinite(split.elevGain) && Number.isFinite(split.elevLoss) ? `+${formatElev(split.elevGain, units)} / −${formatElev(split.elevLoss!, units)}` : "—"}</td>
            <td className="px-3 py-2 text-right">{number(split.avgHr, "bpm")}</td>
            {!suppressCadence && <td className="px-3 py-2 text-right">{cadence(split.avgCadence)}</td>}
          </tr>)}</tbody>
        </table>
      </div>
      <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>{t("analysis.run.splitsUnits")}</Text>
    </details>}
  </div>;
}
