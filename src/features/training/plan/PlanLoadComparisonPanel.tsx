import { useLocation, useSearchParams } from "react-router-dom";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ICON_SIZE } from "../../../theme/tokens/icon";
import { useTranslation } from "react-i18next";
import type { PlanWeek } from "@shared/types/goal";
import { planCalendarDate, planDayKey } from "@shared/training/planDate";
import { Button, Card, Field, Input, Stat, Text, ToggleButton, ToggleControls } from "../../../theme/components";
import { usePlanPeriodComparison } from "./usePlanPeriodComparison";
import { getPlanLoadRangeBounds, type PlanLoadRange } from "./planLoadComparison";
import "./PlanLoadComparisonPanel.css";
import { Resolvable } from "../../../components/redesign";
import { loadThresholdHref } from "../../../services/focusTarget";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";

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
  /** 휴대폰: 한 줄로 접어 두고 누르면 펼친다. 기간 링크(#plan-load-comparison·loadPeriod)로 오면 펼친 채 연다. */
  collapsible?: boolean;
}

/** Compare prescribed load with all accepted activity load, independently of workout completion links. */
export default function PlanLoadComparison({ uid, discipline, weeks, selectedDate, ftp, enabled = true, collapsible = false }: PlanLoadComparisonProps) {
  const { t, i18n } = useTranslation("training");
  // 부하 미확인 문구를 누르면 종목의 부하 기준값 칸으로 간다 — 설정 화면은 웹에만 있다.
  const webResolve = useFirebaseServices().scope !== "embedded";
  const id = useId();
  const today = planDayKey(Date.now());
  const initialDate = selectedDate && validDate(selectedDate) ? selectedDate : today;
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState(() => !collapsible || location.hash === "#plan-load-comparison" || params.has("loadPeriod"));
  const requestedPeriod = params.get("loadPeriod");
  const period: Period = requestedPeriod === "day" || requestedPeriod === "month" || requestedPeriod === "range" ? requestedPeriod : "week";
  const date = params.get("loadDate") ?? initialDate;
  const custom = { start: params.get("loadStart") ?? initialDate, end: params.get("loadEnd") ?? initialDate };
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => next.set(key, value));
    setParams(next, { replace: true, preventScrollReset: true, state: location.state });
  };
  const setDate = (next: string) => update({ loadDate: next });
  const originParams = new URLSearchParams(params);
  originParams.set("loadPeriod", period);
  if (period === "range") { originParams.set("loadStart", custom.start); originParams.set("loadEnd", custom.end); }
  else originParams.set("loadDate", date);
  const dayLink = (day: string) => <LocalizedLink to={`/athlete/me/activities?sport=${discipline}&date=${day}&day=${day}&detail=record-day`} state={{ periodEvidence: result.state === "ready" ? { uid, date: day, discipline, row: result.days.find(row => row.date === day), activityIds: result.days.find(row => row.date === day)?.activityIds ?? [] } : undefined, periodReturn: { pathname: location.pathname, search: `?${originParams}`, hash: "#plan-load-comparison" } }}>{t("loadComparison.reviewDay", { date: day })}</LocalizedLink>;
  const range = useMemo(() => periodRange(period, date, custom), [period, date, custom]);
  const valid = getPlanLoadRangeBounds(range) !== null;
  const result = usePlanPeriodComparison({ uid, discipline, weeks, range, enabled: enabled && valid && expanded, ftp });
  const number = (value: number | null | undefined, signed = false) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto" }).format(value);
  const ready = valid && (result.state === "ready" || result.state === "incomplete");
  const summary = ready ? result.summary : null;
  const future = valid && range.start > today;
  const changePeriod = (next: Period) => {
    update({ loadPeriod: next, ...(next === "range" ? { loadStart: range.start, loadEnd: range.end } : {}) });
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
  if (collapsible && !expanded) return <section id="plan-load-comparison" className="plan-load-comparison plan-load-comparison--collapsed" aria-labelledby={`${id}-title`}>
    <button type="button" className="plan-load-comparison__toggle" aria-expanded={false} aria-controls={`${id}-body`} onClick={() => setExpanded(true)}>
      <Text as="h2" variant="bodyMedium" weight={600} id={`${id}-title`}>{t("loadComparison.title")}</Text>
      <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
    </button>
  </section>;
  return <section id="plan-load-comparison" className="plan-load-comparison" aria-labelledby={`${id}-title`}>
    <Card id={`${id}-body`}>
      <div className="plan-load-comparison__heading">
        {collapsible ? <button type="button" className="plan-load-comparison__toggle plan-load-comparison__toggle--open" aria-expanded={true} aria-controls={`${id}-body`} onClick={() => setExpanded(false)}>
          <Text as="h2" variant="title" id={`${id}-title`}>{t("loadComparison.title")}</Text>
          <ChevronDown size={ICON_SIZE.sm} aria-hidden="true" />
        </button> : <Text as="h2" variant="title" id={`${id}-title`}>{t("loadComparison.title")}</Text>}
        <ToggleControls aria-label={t("loadComparison.period")} style={{ marginBottom: 0 }}>
          {(["day", "week", "month", "range"] as const).map(value => <ToggleButton key={value} selected={period === value} onClick={() => changePeriod(value)}>{t(`loadComparison.${value}`)}</ToggleButton>)}
        </ToggleControls>
      </div>
      <div className="plan-load-comparison__controls">
        {period === "range" ? <>
          <Field label={t("loadComparison.startDate")} htmlFor={`${id}-start`}><Input id={`${id}-start`} type="date" value={custom.start} max={custom.end || undefined} invalid={!valid} onChange={event => update({ loadStart: event.target.value })} /></Field>
          <Field label={t("loadComparison.endDate")} htmlFor={`${id}-end`}><Input id={`${id}-end`} type="date" value={custom.end} min={custom.start || undefined} invalid={!valid} onChange={event => update({ loadEnd: event.target.value })} /></Field>
        </> : <div className="plan-load-comparison__stepper">
          {/* 이전 | 기준일 | 다음 을 칸으로 나눈다 — 한 줄 flex 에서는 iOS 날짜 칸이 글자에 맞춰 넓어지면 화살표와 겹쳤다. */}
          <Button variant="ghost" iconOnly onClick={() => shift(-1)} aria-label={t("loadComparison.previous")}>←</Button>
          <Input id={`${id}-date`} aria-label={t("loadComparison.referenceDate")} type="date" value={date} invalid={!valid} onChange={event => setDate(event.target.value)} />
          <Button variant="ghost" iconOnly onClick={() => shift(1)} aria-label={t("loadComparison.next")}>→</Button>
        </div>}
        {valid && <Text variant="bodySmall" tone="tertiary">{range.start} – {range.end}</Text>}
      </div>
      {!valid || result.state === "invalid" ? <Text as="p" role="alert" tone="danger">{t("loadComparison.invalidRange")}</Text> : result.state === "error" ? <div role="alert" className="plan-load-comparison__notice"><Text>{t("loadComparison.error")}</Text><Button size="sm" variant="secondary" onClick={result.retry}>{t("loadComparison.retry")}</Button></div> : <>
        {(result.state === "loading" || result.state === "idle") && <Text as="p" role="status" variant="bodySmall">{t("loadComparison.loading")}</Text>}
        <div className="plan-load-comparison__metrics" aria-busy={!ready}>
          <Stat compact role="group" aria-label={t("loadComparison.planned")} label={t("loadComparison.planned")} value={number(summary?.plannedTss)} unit="TSS" />
          <Stat compact role="group" aria-label={t("loadComparison.actual")} label={t("loadComparison.actual")} value={future ? t("loadComparison.upcoming") : number(summary?.actualTss)} unit={future ? undefined : "TSS"} />
          <Stat compact role="group" aria-label={t("loadComparison.difference")} label={t("loadComparison.difference")} value={number(summary?.deltaTss, true)} unit="TSS" />
          <Stat compact role="group" aria-label={t("loadComparison.attainment")} label={t("loadComparison.attainment")} value={number(summary?.ratioPct)} unit={summary?.ratioPct == null ? undefined : "%"} />
        </div>
        <div className="plan-load-comparison__notes">
          {result.parentWeeksPending && <div className="plan-load-comparison__notice"><Text as="p" variant="bodySmall" role="status">{t("loadComparison.parentWeekPending")}</Text><Button size="sm" variant="secondary" onClick={result.retryParentWeeks}>{t("loadComparison.retry")}</Button></div>}
          {result.state === "incomplete" && <div className="plan-load-comparison__notice"><Text as="p" variant="bodySmall" tone="warning" role="status">{t("loadComparison.incomplete")}</Text><Button size="sm" variant="secondary" onClick={result.retry}>{t("loadComparison.retry")}</Button></div>}
          {result.state === "ready" && summary && summary.unknownCount > 0 && <Text as="p" variant="bodySmall" tone="warning" role="status"><Resolvable resolve={webResolve ? { to: loadThresholdHref(discipline) } : undefined}>{t("loadComparison.unknownLoads", { count: summary.unknownCount })}</Resolvable></Text>}
          {summary?.estimated && <Text as="p" variant="caption" tone="tertiary">{t("loadComparison.estimated")}</Text>}
          {ready && result.days.length === 1 && dayLink(result.days[0]!.date)}
        </div>
        {/* 계획 대비 기록은 합계·차이·달성률만 둔다. 기간 설명·비교 근거·일별 비교 표는 두지 않는다. */}
      </>}
    </Card>
  </section>;
}
