import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlanWeek } from "@shared/types/goal";
import { planCalendarDate, planDayKey } from "@shared/training/planDate";
import InfoTip from "../../../components/InfoTip";
import { Button, Card, Field, Input, Stat, Text, ToggleButton, ToggleControls } from "../../../theme/components";
import { usePlanLoadComparison } from "./usePlanLoadComparison";
import { getPlanLoadRangeBounds, type PlanLoadRange } from "./planLoadComparison";
import "./PlanLoadComparisonPanel.css";

type Period = "day" | "week" | "month" | "range";
const DAY_MS = 86_400_000;

function validDate(value: string): boolean {
  return getPlanLoadRangeBounds({ start: value, end: value }) !== null;
}

function periodRange(period: Period, date: string, custom: PlanLoadRange): PlanLoadRange {
  if (period === "range") return custom;
  if (!validDate(date)) return { start: "", end: "" };
  const time = Date.parse(`${date}T00:00:00+09:00`);
  if (period === "day") return { start: date, end: date };
  if (period === "week") {
    const weekday = (planCalendarDate(time).getUTCDay() + 6) % 7;
    const monday = time - weekday * DAY_MS;
    return { start: planDayKey(monday), end: planDayKey(monday + 6 * DAY_MS) };
  }
  const calendar = planCalendarDate(time);
  return { start: `${date.slice(0, 7)}-01`, end: planDayKey(Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, 1) - 9 * 3_600_000 - DAY_MS) };
}

export interface PlanLoadComparisonProps {
  uid: string;
  discipline: "bike" | "run" | "swim";
  weeks: PlanWeek[];
  selectedDate?: string;
  ftp?: number;
  enabled?: boolean;
}

/** Compare prescribed load with all accepted activity load, independently of workout completion links. */
export default function PlanLoadComparison({ uid, discipline, weeks, selectedDate, ftp, enabled = true }: PlanLoadComparisonProps) {
  const { t, i18n } = useTranslation("training");
  const id = useId();
  const today = planDayKey(Date.now());
  const initialDate = selectedDate && validDate(selectedDate) ? selectedDate : today;
  const [period, setPeriod] = useState<Period>("week");
  const [date, setDate] = useState(initialDate);
  const [custom, setCustom] = useState<PlanLoadRange>({ start: initialDate, end: initialDate });
  useEffect(() => {
    if (selectedDate && validDate(selectedDate)) setDate(selectedDate);
  }, [selectedDate]);
  const range = useMemo(() => periodRange(period, date, custom), [period, date, custom]);
  const valid = getPlanLoadRangeBounds(range) !== null;
  const result = usePlanLoadComparison({ uid, discipline, weeks, range, enabled: enabled && valid, ftp });
  const number = (value: number | null | undefined, signed = false) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto" }).format(value);
  const ready = valid && (result.state === "ready" || result.state === "incomplete");
  const summary = ready ? result.summary : null;
  const future = valid && range.start > today;
  const ongoing = valid && range.start <= today && range.end >= today;
  const changePeriod = (next: Period) => {
    if (next === "range") setCustom(range);
    setPeriod(next);
  };
  const shift = (direction: number) => {
    if (!validDate(date)) return;
    const time = Date.parse(`${date}T00:00:00+09:00`);
    if (period === "month") {
      const calendar = planCalendarDate(time);
      setDate(planDayKey(Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + direction, 1) - 9 * 3_600_000));
    } else setDate(planDayKey(time + direction * (period === "week" ? 7 : 1) * DAY_MS));
  };
  if (!enabled) return null;
  return <section className="plan-load-comparison" aria-labelledby={`${id}-title`}>
    <Card>
      <div className="plan-load-comparison__heading">
        <Text as="h2" variant="title" id={`${id}-title`}>{t("loadComparison.title")}</Text>
        <ToggleControls aria-label={t("loadComparison.period")}>
          {(["day", "week", "month", "range"] as const).map(value => <ToggleButton key={value} selected={period === value} onClick={() => changePeriod(value)}>{t(`loadComparison.${value}`)}</ToggleButton>)}
        </ToggleControls>
      </div>
      <div className="plan-load-comparison__controls">
        {period === "range" ? <>
          <Field label={t("loadComparison.startDate")} htmlFor={`${id}-start`}><Input id={`${id}-start`} type="date" value={custom.start} max={custom.end || undefined} invalid={!valid} onChange={event => setCustom(previous => ({ ...previous, start: event.target.value }))} /></Field>
          <Field label={t("loadComparison.endDate")} htmlFor={`${id}-end`}><Input id={`${id}-end`} type="date" value={custom.end} min={custom.start || undefined} invalid={!valid} onChange={event => setCustom(previous => ({ ...previous, end: event.target.value }))} /></Field>
        </> : <>
          <Button variant="ghost" onClick={() => shift(-1)} aria-label={t("loadComparison.previous")}>←</Button>
          <Field label={t("loadComparison.referenceDate")} htmlFor={`${id}-date`}><Input id={`${id}-date`} type="date" value={date} invalid={!valid} onChange={event => setDate(event.target.value)} /></Field>
          <Button variant="ghost" onClick={() => shift(1)} aria-label={t("loadComparison.next")}>→</Button>
        </>}
        {valid && <Text variant="bodySmall" tone="tertiary">{range.start} – {range.end}</Text>}
      </div>
      {!valid || result.state === "invalid" ? <Text as="p" role="alert" tone="danger">{t("loadComparison.invalidRange")}</Text> : result.state === "error" ? <div role="alert" className="plan-load-comparison__notice"><Text>{t("loadComparison.error")}</Text><Button variant="secondary" onClick={result.retry}>{t("loadComparison.retry")}</Button></div> : <>
        {(result.state === "loading" || result.state === "idle") && <Text as="p" role="status" variant="bodySmall">{t("loadComparison.loading")}</Text>}
        <div className="plan-load-comparison__metrics" aria-busy={!ready}>
          <Stat compact role="group" aria-label={t("loadComparison.planned")} label={t("loadComparison.planned")} value={number(summary?.plannedTss)} unit="TSS" />
          <Stat compact role="group" aria-label={t("loadComparison.actual")} label={t("loadComparison.actual")} value={future ? t("loadComparison.upcoming") : number(summary?.actualTss)} unit={future ? undefined : "TSS"} />
          <Stat compact role="group" aria-label={t("loadComparison.difference")} label={t("loadComparison.difference")} value={number(summary?.deltaTss, true)} unit="TSS" />
          <Stat compact role="group" aria-label={t("loadComparison.attainment")} label={<InfoTip label={t("loadComparison.attainment")} title={t("loadComparison.attainment")} content={t("loadComparison.formula")}>{t("loadComparison.attainment")}</InfoTip>} value={number(summary?.ratioPct)} unit={summary?.ratioPct == null ? undefined : "%"} />
        </div>
        <div className="plan-load-comparison__notes">
          {summary?.plannedTss === 0 && <Text as="p" variant="bodySmall">{t("loadComparison.noPlan")}</Text>}
          {result.state === "incomplete" && <div className="plan-load-comparison__notice"><Text as="p" variant="bodySmall" tone="warning" role="status">{t("loadComparison.incomplete")}</Text><Button variant="secondary" onClick={result.retry}>{t("loadComparison.retry")}</Button></div>}
          {result.state === "ready" && summary && summary.unknownCount > 0 && <Text as="p" variant="bodySmall" tone="warning" role="status">{t("loadComparison.unknownLoads", { count: summary.unknownCount })}</Text>}
          {summary?.estimated && <Text as="p" variant="caption" tone="tertiary">{t("loadComparison.estimated")}</Text>}
          {ongoing && <Text as="p" variant="caption" tone="tertiary">{t("loadComparison.ongoing", { date: today })}</Text>}
          <Text as="p" variant="caption" tone="tertiary">{t("loadComparison.basis")}</Text>
        </div>
        {ready && result.days.length > 1 && <details className="plan-load-comparison__details">
          <summary>{t("loadComparison.dailyDetails")}</summary>
          <div className="plan-load-comparison__table-scroll" tabIndex={0} role="region" aria-label={t("loadComparison.dailyDetails")}>
            <table className="plan-load-comparison__table">
              <caption>{t("loadComparison.tableCaption")}</caption>
              <thead><tr><th scope="col">{t("loadComparison.date")}</th><th scope="col">{t("loadComparison.planned")}</th><th scope="col">{t("loadComparison.actual")}</th><th scope="col">{t("loadComparison.difference")}</th><th scope="col">{t("loadComparison.attainment")}</th></tr></thead>
              <tbody>{result.days.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{number(row.plannedTss)}</td><td>{row.future ? t("loadComparison.upcoming") : <>{number(row.actualTss)}{row.estimated && <span aria-label={t("loadComparison.estimated")}> *</span>}</>}</td><td>{number(row.deltaTss, true)}</td><td>{row.ratioPct == null ? "—" : `${number(row.ratioPct)}%`}</td></tr>)}</tbody>
            </table>
          </div>
        </details>}
      </>}
    </Card>
  </section>;
}
