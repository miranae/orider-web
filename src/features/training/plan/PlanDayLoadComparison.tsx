import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { planDayKey } from "@shared/training/planDate";
import { Disclosure, Text } from "../../../theme/components";
import type { PlanLoadComparisonRow } from "./planLoadComparison";
import type { usePlanLoadComparison } from "./usePlanLoadComparison";
import "./PlanDayLoadComparison.css";
import { planLoadFulfillment, type PlanLoadEntry } from "./planRecordPresentation";

export interface PlanCalendarLoads {
  dayLoads?: ReadonlyMap<string, PlanLoadComparisonRow>;
  loadState?: ReturnType<typeof usePlanLoadComparison>["state"];
}

/** Daily load attainment does not confirm that a prescribed workout was performed. */
export default function PlanDayLoadComparison({ day, row, state, compact = false, evidence }: {
  compact?: boolean; evidence?: ReactNode;
  day: PlanLoadEntry & { date: number };
  row?: PlanLoadComparisonRow;
  state: PlanCalendarLoads["loadState"];
}) {
  const { t, i18n } = useTranslation("training");
  const date = planDayKey(day.date);
  const future = date > planDayKey(Date.now());
  const planned = row ? row.plannedTss : day.workout === "rest" ? 0 : day.adjustedTSS ?? day.plannedTSS;
  const number = (value: number | null | undefined, signed = false) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto" }).format(value);
  const known = state === "ready" && row?.actualTss != null;
  const actual = future ? t("loadComparison.upcoming") : state === "loading" ? t("loadComparison.calendarLoading") : known ? number(row.actualTss) : t("loadComparison.calendarUnknown");
  const fulfillment = planLoadFulfillment(day, row, state === "ready");
  return <div className={`plan-day-load-comparison${compact ? " plan-day-load-comparison--compact" : ""}`} role="group" aria-label={t("loadComparison.calendarLabel", { date })}>
    {compact ? <dl className="plan-day-load-values">
      <div><dt>{t("loadComparison.calendarPlanned")}</dt><dd>{number(planned)} <small>TSS</small></dd></div>
      <div><dt>{t("loadComparison.calendarActual")}</dt><dd>{actual}{known && !future && <small> TSS</small>}</dd></div>
      {known && row.estimated && <Text as="p" variant="caption" tone="secondary">{t("page.tssEstimated")}</Text>}
    </dl> : <Text as="p" variant="caption">{t("loadComparison.calendarLoads", { planned: number(planned), actual })}{known && row.estimated ? ` · ${t("page.tssEstimated")}` : ""}</Text>}
    {compact ? <Disclosure title={t("loadComparison.calendarEvidence")} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {fulfillment && fulfillment !== "week" && <Text as="p" variant="bodySmall" weight={600}>{t(`loadComparison.fulfillment.${fulfillment}`)}</Text>}
      {row?.parentWeekPending && <Text as="p" variant="caption" tone="secondary">{t("loadComparison.parentWeekPendingRecord")}</Text>}
      <Text as="p" variant="bodySmall">{t("loadComparison.calendarAttainment", { ratio: known && !future && row.ratioPct != null ? `${number(row.ratioPct)}%` : "—", difference: known && !future ? number(row.deltaTss, true) : "—" })}</Text>
      {evidence}
    </Disclosure> : <>
    {fulfillment && <Text as="p" variant="bodySmall" weight={600}>{t(`loadComparison.fulfillment.${fulfillment}`, { week: row?.fulfilledWeek?.weekNumber })}{(fulfillment === "week" ? row?.fulfilledWeek?.estimated : row?.estimated) ? ` · ${t("page.tssEstimated")}` : ""}</Text>}
    {fulfillment === "week" && <Text as="p" variant="caption" tone="secondary">{t("loadComparison.fulfillment.weekBasis", { actual: number(row?.fulfilledWeek?.actualTss), planned: number(row?.fulfilledWeek?.plannedTss) })}</Text>}
    {row?.parentWeekPending && <Text as="p" variant="caption" tone="secondary">{t("loadComparison.parentWeekPendingRecord")}</Text>}
    <Text as="p" variant="bodySmall" weight={600}>{t("loadComparison.calendarAttainment", { ratio: known && !future && row.ratioPct != null ? `${number(row.ratioPct)}%` : "—", difference: known && !future ? number(row.deltaTss, true) : "—" })}</Text>
    </>}

  </div>;
}
