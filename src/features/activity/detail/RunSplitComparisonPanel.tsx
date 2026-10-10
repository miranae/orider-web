import { useTranslation } from "react-i18next";
import { Text } from "../../../theme";
import { formatPace } from "../../../utils/units";
import type { MetricsLike } from "./metricsPresentation";
import { compareRunSplits } from "./runSplitComparison";

export default function RunSplitComparisonPanel({ current, previous, units }: { current: MetricsLike | null; previous: MetricsLike | null; units: "metric" | "imperial" }) {
  const { t } = useTranslation("activity");
  const rows = compareRunSplits(current, previous);
  const pace = (value: number | null) => value == null ? "—" : formatPace(value, units);
  if (!rows.length) return <Text as="p" variant="bodySmall" tone="secondary">{t("splitCompare.unavailable")}</Text>;
  return <section className="min-w-0 space-y-3" aria-label={t("splitCompare.title")}>
    <Text as="h4" variant="subtitle">{t("splitCompare.title")}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("splitCompare.note")}</Text>
    <div className="activity-growth-table-shell" style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table className="activity-growth-table" style={{ minWidth: "calc(var(--space-8) * 12)" }}>
        <caption className="sr-only">{t("splitCompare.title")}</caption>
        <thead><tr>{["segment", "metric", "current", "previous"].map(key => <th key={key} scope="col"><Text variant="bodySmall" weight={600}>{t(`splitCompare.${key}`)}</Text></th>)}</tr></thead>
        <tbody>{rows.flatMap(row => (["pace", "heartRate"] as const).map((metric, index) => <tr key={`${row.km}-${metric}`}>
          {index === 0 && <th scope="rowgroup" rowSpan={2}><Text variant="bodySmall" mono>{row.km - 1}–{row.km} km</Text></th>}
          <th scope="row"><Text variant="bodySmall" tone="secondary">{t(`splitCompare.${metric}`)} · {metric === "heartRate" ? "bpm" : units === "imperial" ? "/mi" : "/km"}</Text></th>
          {(["current", "previous"] as const).map(side => <td key={side}><Text variant="bodySmall" mono>{metric === "heartRate" ? row[side][metric] == null ? "—" : Math.round(row[side][metric]) : pace(row[side][metric])}</Text></td>)}
        </tr>))}</tbody>
      </table>
    </div>
    <Text as="p" variant="bodySmall" tone="secondary">{t("splitCompare.missingNote")}</Text>
  </section>;
}
