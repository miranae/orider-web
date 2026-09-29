import { useTranslation } from "react-i18next";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";
import { useLocale } from "../../contexts/LocaleContext";
import { formatPace, formatElev } from "../../utils/units";
import { resolveObservedDistanceKm } from "@shared/training/activityDistanceEvidence";
import type { ActivitySummary } from "@shared/types";
import { Card, Text } from "../../theme/components";
import ZoneDistributionChart from "../ZoneDistributionChart";
import { hrZoneDistribution } from "../../features/activity/detail/metricsPresentation";

function RunMetric({ label, value, description, unit }: { label: string; value: string; description?: string; unit?: string }) {
  return <Card padding="compact">
    <div><Text as="div" variant="eyebrow">{label}</Text></div>
    <Text as="div" variant="dataLarge" style={{ marginTop: "var(--space-2)" }}>{value}{value !== "—" && unit && <Text variant="unit"> {unit}</Text>}</Text>
    {description && <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{description}</Text>}
  </Card>;
}

/** 서버의 러닝 지표만 표시한다. 사이클 FTP 기반 수치는 러닝 파워에 적용하지 않는다. */
export default function RunAnalysisPanel({ metrics, summary, suppressCadence = false }: {
  metrics: ActivityMetricsDoc;
  summary?: ActivitySummary;
  suppressCadence?: boolean;
}) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const pace = (sec: number | null | undefined) => sec != null && Number.isFinite(sec) && sec > 0 ? formatPace(sec, units) : "—";
  const number = (n: number | null | undefined, unit: string) => n != null && Number.isFinite(n) ? `${Math.round(n)} ${unit}` : "—";
  const avgPace = metrics.avgSpeedKph != null && metrics.avgSpeedKph > 0 ? 3600 / metrics.avgSpeedKph : null;
  const distanceKm = resolveObservedDistanceKm(metrics, summary?.distance);
  const cadenceUnit = metrics.cadenceUnit;
  const cadence = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0
    ? number(cadenceUnit === "strides_per_minute" ? value * 2 : value, cadenceUnit === "spm" || cadenceUnit === "strides_per_minute" ? "spm" : t("analysis.run.cadenceUnit")) : "—";
  const cadenceLabel = t(cadenceUnit === "spm" || cadenceUnit === "strides_per_minute" ? "stat.cadence" : "analysis.run.recordedCadence");
  const zones = hrZoneDistribution(metrics);
  const splits = metrics.splits ?? [];
  return <div className="space-y-6" data-testid="run-analysis">
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <RunMetric label={t("stat.avgPace")} value={pace(avgPace)} />
      <RunMetric label={t("runCards.gapPace")} value={pace(metrics.runMetrics?.gapAvgSec)} description={t("runCards.gapDesc")} />
      <RunMetric label={t("analysis.metric.fastestKm")} value={pace(metrics.runMetrics?.minPaceSecPerKm)} />
      <RunMetric label={t("analysis.metric.paceConsistency")} value={metrics.runMetrics?.paceStdDevSec != null ? `${Math.round(metrics.runMetrics.paceStdDevSec * (units === "imperial" ? 1.609344 : 1))} s/${units === "imperial" ? "mi" : "km"}` : "—"} description={t("analysis.metric.paceConsistencyDesc")} />
      <RunMetric label={t("analysis.metric.distance")} unit={units === "imperial" ? "mi" : "km"} value={distanceKm != null ? (units === "imperial" ? distanceKm / 1.609344 : distanceKm).toFixed(2) : "—"} />
      <RunMetric label={t("analysis.metric.elevGain")} value={metrics.elevationGainM != null ? formatElev(metrics.elevationGainM, units) : "—"} />
    </div>
    {(metrics.avgHr != null || metrics.maxHr != null) && <div>
      <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3">{t("analysis.section.hr")}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RunMetric label={t("analysis.metric.avgHr")} value={metrics.avgHr != null ? Math.round(metrics.avgHr).toString() : "—"} unit="bpm" />
        <RunMetric label={t("analysis.metric.maxHr")} value={number(metrics.maxHr, "bpm")} />
        <RunMetric label={t("analysis.metric.hrDrift")} value={metrics.decoupling?.hrDriftPct != null ? `${metrics.decoupling.hrDriftPct.toFixed(1)}%` : "—"} description={t("analysis.metric.hrDriftDesc")} />
        {metrics.decoupling?.basis === "speed_hr" && metrics.decoupling.decouplingPct != null && <RunMetric label={t("analysis.run.paceHrDecoupling")} value={`${metrics.decoupling.decouplingPct.toFixed(1)}%`} description={t("analysis.run.paceHrDecouplingDesc")} />}
      </div>
      {zones && <div style={{ marginTop: "var(--space-3)" }}><ZoneDistributionChart zones={zones} title={t("analysis.zones.hr")} /></div>}
    </div>}
    {!suppressCadence && metrics.avgCadence != null && <RunMetric label={cadenceLabel} value={cadence(metrics.avgCadence)} description={cadenceUnit == null ? t("analysis.run.cadenceDesc") : undefined} />}
    {metrics.avgPower != null && !metrics.isVirtualPower && <RunMetric label={t("stat.runningPower")} value={number(metrics.avgPower, "W")} description={t("analysis.run.powerDesc")} />}
    {metrics.trimp != null && <RunMetric label="TRIMP" value={number(metrics.trimp, "")} description={t("analysis.metric.trimpDesc")} />}
    {splits.length > 0 ? <div>
      <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3">{t("analysis.section.splits")}</h3>
      <div className="rounded-[var(--r-lg)] overflow-x-auto" style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}>
        <table className="w-full text-[length:var(--fs-sm)]">
          <thead><tr style={{ color: "var(--ink-3)" }}>
            {["km", "pace", "gap", "elev", "hr"].map(key => <th key={key} className="text-right px-3 py-2">{t(`analysis.splits.header.${key}`)}</th>)}
            {!suppressCadence && <th className="text-right px-3 py-2">{cadenceLabel}</th>}
          </tr></thead>
          <tbody>{splits.map(split => <tr key={split.km} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
            <td className="px-3 py-2 text-right">{split.km}</td>
            <td className="px-3 py-2 text-right tabular-nums">{pace(split.paceSec)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--lime)" }}>{pace(split.gapSec)}</td>
            <td className="px-3 py-2 text-right">{Number.isFinite(split.elevGain) && Number.isFinite(split.elevLoss) ? `+${formatElev(split.elevGain, units)} / −${formatElev(split.elevLoss!, units)}` : "—"}</td>
            <td className="px-3 py-2 text-right">{number(split.avgHr, "bpm")}</td>
            {!suppressCadence && <td className="px-3 py-2 text-right">{cadence(split.avgCadence)}</td>}
          </tr>)}</tbody>
        </table>
      </div>
      <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>{t("analysis.run.splitsUnits")}</Text>
    </div> : <Text as="div" variant="bodySmall" tone="tertiary">{t("analysis.run.splitsUnavailable")}</Text>}
  </div>;
}
