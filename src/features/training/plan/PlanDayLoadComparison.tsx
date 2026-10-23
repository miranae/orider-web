import { useTranslation } from "react-i18next";
import type { PlanDay } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { Text } from "../../../theme/components";
import type { PlanLoadComparisonRow } from "./planLoadComparison";
import type { usePlanLoadComparison } from "./usePlanLoadComparison";
import "./PlanDayLoadComparison.css";

export interface PlanCalendarLoads {
  dayLoads?: ReadonlyMap<string, PlanLoadComparisonRow>;
  loadState?: ReturnType<typeof usePlanLoadComparison>["state"];
}

/** Daily load attainment does not confirm that a prescribed workout was performed. */
export default function PlanDayLoadComparison({ day, row, state }: {
  day: PlanDay;
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
  return <div className="plan-day-load-comparison" role="group" aria-label={t("loadComparison.calendarLabel", { date })}>
    <Text as="p" variant="caption">{t("loadComparison.calendarLoads", { planned: number(planned), actual })}{known && row.estimated ? ` · ${t("page.tssEstimated")}` : ""}</Text>
    <Text as="p" variant="bodySmall" weight={600}>{t("loadComparison.calendarAttainment", { ratio: known && !future && row.ratioPct != null ? `${number(row.ratioPct)}%` : "—", difference: known && !future ? number(row.deltaTss, true) : "—" })}</Text>
  </div>;
}
