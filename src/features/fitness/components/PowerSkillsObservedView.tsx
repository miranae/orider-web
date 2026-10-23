import "./fitness-analysis-controls.css";
import InfoTip from "../../../components/InfoTip";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { DropdownSelect, Text } from "../../../theme";
import { makeDurationLabel } from "../fitnessPageUtils";
import { powerSkillsDisplayValue, powerSkillsObservedRows } from "../models/powerSkillsObserved";
import "./power-duration-periods.css";

export function PowerSkillsObservedView({ response, unit = "W" }: { response: PowerCurvePeriodsResponse; unit?: "W" | "W/kg" }) {
  const { t } = useTranslation("fitness");
  const id = useId();
  const [duration, setDuration] = useState(300);
  const rows = powerSkillsObservedRows(response, unit);
  const selected = rows.find(row => row.durationSeconds === duration)!;
  const durationLabel = makeDurationLabel(t);
  const labels = [t("powerSkills.recent"), t("powerSkills.allObserved")];
  const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return <section className="fitness-analysis-controls dense-period-power" aria-label={t("powerSkills.title")}>
    <Text as="h4" variant="bodyMedium" weight={600}>{t("powerSkills.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.scope")}</Text>
    {unit === "W/kg" && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightBasis")}</Text>}
    <label className="dense-period-duration" htmlFor={id}><Text variant="bodyMedium">{t("periodCurve.duration")}</Text><DropdownSelect id={id} label={t("periodCurve.duration")} value={String(duration)} onChange={next => setDuration(Number(next))} options={rows.map((row) => ({ value: String(row.durationSeconds), label: durationLabel(row.durationSeconds) }))} /></label>
    <div className="dense-period-values">{response.periods.map((period, index) => {
      const cell = selected.cells[index]!;
      const channel = unit === "W/kg" ? period.weightNormalized?.powerDurationObservations : period.powerDurationObservations;
      return <div key={index} className="space-y-2"><Text as="h5" variant="bodyMedium" weight={600}>{labels[index]}</Text><Text as="p" variant="bodyMedium" tone="secondary">{period.fromInclusive === 0 ? t("powerSkills.through", { date: date(period.toExclusive - 1) }) : `${date(period.fromInclusive)} – ${date(period.toExclusive - 1)}`}</Text>
        <Text as="p" variant="bodyMedium" weight={600}>{cell.state === "observed" ? `${powerSkillsDisplayValue(cell.value, unit)} ${unit}` : t(`powerSkills.${cell.state}`)}</Text>
        <Text as="p" variant="bodyMedium" tone="secondary">{channel ? <>{t("powerSkills.scanned", { scanned: period.coverage.scannedActivityCount, included: channel.counts.available })} · {t(channel.partial || channel.scanTruncated || period.coverage.truncated || period.status === "partial" ? "densePeriod.partial" : "densePeriod.complete")}</> : t("powerSkills.scannedUnavailable", { scanned: period.coverage.scannedActivityCount })}</Text>
        {cell.state === "observed" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("densePeriod.n", { count: cell.point.observedActivityCount })} · {t(`periodCurve.source.${cell.point.provenance}`)}</Text><LocalizedLink className="dense-period-source" to={`/activity/${encodeURIComponent(cell.point.sourceActivityId)}`}>{t("periodCurve.source", { date: date(cell.point.startTime) })}</LocalizedLink>{"weightKg" in cell.point && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightWinner", { watts: cell.point.maxAveragePowerW, kg: cell.point.weightKg })}</Text>}</>}
      </div>;
    })}</div>
    <details className="dense-period-details"><summary>{t("powerSkills.table")}</summary>{rows.some(row => row.cells.some(cell => cell.state !== "observed")) && <Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.tableUnavailable")}</Text>}<Text as="p" variant="bodyMedium" tone="secondary" className="dense-period-scroll-hint">{t("densePeriod.scrollHint")}</Text><div className="dense-period-table-scroll"><table className="dense-period-table"><thead><tr><th>{t("periodCurve.duration")}</th>{response.periods.map((_, index) => <th key={index}>{labels[index]}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.durationSeconds}><th scope="row">{durationLabel(row.durationSeconds)}</th>{row.cells.map((cell, index) => <td key={index}>{cell.state === "observed" ? `${powerSkillsDisplayValue(cell.value, unit)} ${unit}` : <InfoTip label={t(`powerSkills.${cell.state}`)} content={t(`powerSkills.${cell.state}`)}>—</InfoTip>}</td>)}</tr>)}</tbody></table></div></details>
    <details className="dense-period-details"><summary>{t("periodCurve.details")}</summary><div className="space-y-3"><Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.gridNote")}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t("powerSkills.cutoff", { date: new Date(response.periods[0]!.toExclusive).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) })}</Text><Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.asOf", { date: new Date(response.asOf).toISOString() })}</Text>{response.periods.map((period, index) => {
      const channel = unit === "W/kg" ? period.weightNormalized?.powerDurationObservations : period.powerDurationObservations;
      const cell = selected.cells[index]!;
      return <div key={index} className="space-y-2"><Text as="p" variant="bodyMedium">{labels[index]} · {t("periodCurve.exactBounds", { from: new Date(period.fromInclusive).toISOString(), to: new Date(period.toExclusive).toISOString() })}</Text>{channel && <Text as="p" variant="bodyMedium" tone="secondary">{t("densePeriod.coverage", { period: index + 1, candidate: channel.inputCandidateCount, ...channel.counts })}{channel.scanTruncated || period.coverage.truncated ? ` · ${t("densePeriod.truncated")}` : ""}</Text>}{channel && unit === "W/kg" && "weightCounts" in channel && <Text as="p" variant="bodyMedium" tone="secondary">{t("periodCurve.weightCoverage", { ...(channel as import("@shared/types/power-curve-periods").WeightNormalizedDurationObservations).weightCounts })}</Text>}{cell.state === "observed" && <Text as="p" variant="bodyMedium">{t("powerSkills.evidence", { duration: selected.durationSeconds, value: String(cell.value), revision: cell.point.parentRevision })}</Text>}</div>;
    })}</div></details>
  </section>;
}
