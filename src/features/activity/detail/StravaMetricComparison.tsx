import type { StravaSummaryV1 } from "@shared/analysis/stravaRecord";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { useTranslation } from "react-i18next";
import { DataTable, Section, Text } from "../../../theme/components";
import { useLocale } from "../../../contexts/LocaleContext";
import { formatDistance, formatSpeed, formatElev, formatTemp, type Units } from "../../../utils/units";
export default function StravaMetricComparison({ record: r, metrics: m }: { record: StravaSummaryV1; metrics: Partial<ActivityMetrics> | null }) {
  const { units } = useLocale();
  return <StravaMetricComparisonContent record={r} metrics={m} units={units} />;
}
export function StravaMetricComparisonContent({ record: r, metrics: m, units }: { record: StravaSummaryV1; metrics: Partial<ActivityMetrics> | null; units: Units }) {
  const { t } = useTranslation("activity");
  const num = (v: number | null | undefined, unit = "", digits = 0) => v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}${unit}`;
  const speed = (v: number | null | undefined) => v == null ? "—" : formatSpeed(v / 3.6, units, "bike");
  const elevation = (v: number | null | undefined) => v == null ? "—" : formatElev(v, units);
  const rows = [
    [t("stat.distance"), r.distance == null ? "—" : formatDistance(r.distance, units), m?.distanceKm == null ? "—" : formatDistance(m.distanceKm * 1000, units)],
    [t("stat.avgSpeed"), speed(r.average_speed == null ? null : r.average_speed * 3.6), speed(m?.avgSpeedKph)],
    [t("stat.maxSpeed"), speed(r.max_speed == null ? null : r.max_speed * 3.6), speed(m?.maxSpeedKph)],
    [t("analysis.metric.elevGain"), elevation(r.total_elevation_gain), elevation(m?.elevationGainM)],
    [t("stat.avgPower"), num(r.average_watts, " W"), num(m?.avgPower, " W")],
    [t("sourceMetrics.weightedPower"), num(r.weighted_average_watts, " W"), "—"],
    ["NP", "—", num(m?.np, " W", 1)],
    ["TSS", "—", num(m?.tss)],
    [t("sourceMetrics.work"), num(r.kilojoules, " kJ"), num(m?.workKj, " kJ", 1)],
    [t("stat.calories"), num(r.calories, " kcal"), num(m?.caloriesKcal, " kcal")],
    ["Relative Effort", num(r.suffer_score), "—"],
    [t("sourceMetrics.deviceTemperature"), r.average_temp == null ? "—" : formatTemp(r.average_temp, units), "—"],
  ];
  return <Section title={t("sourceMetrics.comparison")}>
    <Text as="p" variant="caption" tone="secondary">{t("sourceMetrics.explanation")}</Text>
    <DataTable caption={t("sourceMetrics.comparison")} captionVisibility="screen-reader" emptyLabel="—" rowKey={row => row[0]!} rows={rows}
      columns={[{ id: "metric", header: t("sourceMetrics.metric"), rowHeader: true, cell: row => row[0] },
        { id: "strava", header: "Strava", align: "end", cell: row => row[1] },
        { id: "orider", header: t("sourceMetrics.orider"), align: "end", cell: row => row[2] }]} />
  </Section>;
}
