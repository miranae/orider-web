import CoachDetailSection from "../../features/fitness/components/CoachDetailSection";
import PlanRecordEvidence, { type PlanRecordEntry } from "../../features/training/plan/PlanRecordEvidence";
import { isSportUiEnabled } from "../../config/sportFeatures";
import { Button, Input, Text } from "../../theme/components";
import SportIcon from "../common/SportIcon";
import GlossaryText from "../common/GlossaryText";
import { Activity as ActivityIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo, useEffect, useId, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { Upload } from "lucide-react";
import type { Activity } from "@shared/types";
import ImportActivityModal from "./ImportActivityModal";
import SportFilterTabs from "./SportFilterTabs";
import { getDiscipline, getDisciplineColor, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { isIndoorActivity } from "../../utils/indoorActivity";
import { planDayKey, planCalendarDate } from "@shared/training/planDate";
import { acceptedPhysicalActivities, estimateActivityTss, sumAcceptedActivityTss } from "../../utils/estimateTSS";
import "./MobileLogPage.css";
import { ICON_SIZE } from "../../theme/tokens/icon";

// DAY_NAMES — i18n via t("mobileLog.dayNames")

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

interface MobileLogPageProps {
  recentSummarySlot?: ReactNode;
  activities: Activity[];
  representativeCandidates?: Activity[];
  ftp?: number;
  plannedDates?: string[];
  plansByDate?: Record<string, PlanRecordEntry[]>;
  planState?: "loading" | "ready" | "error";
  onRetryPlan?: () => void;
  plannedSports?: Record<string, "bike" | "run" | "swim">;
  year: number;
  month: number;
  onChangeMonth: (delta: number) => void;
  loading?: boolean;
  aggregateUnavailable?: boolean;
}

function formatRecordedDuration(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor((value % 3600000) / 60000);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function MobileLogSkeleton() {
  return (
    <div aria-hidden="true" style={{ padding: "var(--space-4)", display: "grid", gap: "var(--space-3)" }}>
      <div style={{ height: 40, borderRadius: "var(--r-md)", background: "var(--bg-2)" }} />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: "1", borderRadius: "var(--r-sm)", background: i % 3 === 0 ? "var(--bg-3)" : "var(--bg-2)" }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 72, borderRadius: "var(--r-md)", background: "var(--bg-2)" }} />
        ))}
      </div>
    </div>
  );
}

export default function MobileLogPage({ recentSummarySlot, activities, representativeCandidates = activities, year, month, onChangeMonth, loading = false, aggregateUnavailable = false, ftp, planState = "ready", onRetryPlan, plansByDate = {}, plannedSports = {}, plannedDates = [] }: MobileLogPageProps) {
  const { t, i18n } = useTranslation("activity");
  const DAY_NAMES = (t("mobileLog.dayNames", { returnObjects: true }) as string[]) ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [importParams, setImportParams] = useSearchParams();
  const location = useLocation();
  const searchId = useId();
  const tab = importParams.get("view") === "activities" ? "activity" : "month";
  const setTab = (nextTab: "month" | "activity") => {
    const next = new URLSearchParams(importParams);
    if (nextTab === "activity") next.set("view", "activities"); else next.delete("view");
    setImportParams(next, { preventScrollReset: true });
  };
  const [importOpen, setImportOpen] = useState(importParams.get("import") === "1");
  useEffect(() => { if (importParams.get("import") === "1") setImportOpen(true); }, [importParams]);
  const closeImport = () => { setImportOpen(false); const next = new URLSearchParams(importParams); next.delete("import"); setImportParams(next, { replace: true }); };
  const requestedSport = importParams.get("sport");
  const sportFilter = requestedSport && isSportUiEnabled(requestedSport) && (requestedSport === "bike" || requestedSport === "run" || requestedSport === "swim") ? requestedSport : "all";
  const setSportFilter = (sport: string) => {
    const next = new URLSearchParams(importParams);
    next.set("sport", sport);
    next.delete("page"); next.delete("pageMonth"); next.delete("dayPage");
    setImportParams(next, { replace: true });
  };
  const monthScope = `${year}-${String(month + 1).padStart(2, "0")}`;
  const searchQuery = importParams.get("q") ?? "";
  const setSearch = (value: string) => {
    const next = new URLSearchParams(importParams);
    if (value) next.set("q", value); else next.delete("q");
    next.delete("page"); next.delete("pageMonth");
    setImportParams(next, { replace: true, preventScrollReset: true });
  };
  const setPage = (page: number, day = false) => {
    const next = new URLSearchParams(importParams);
    next.set(day ? "dayPage" : "page", String(page));
    if (!day) next.set("pageMonth", monthScope);
    setImportParams(next, { replace: day, state: location.state, preventScrollReset: true });
  };
  const requestedDay = importParams.get("day");
  const requestedDayTime = requestedDay ? Date.parse(`${requestedDay}T00:00:00Z`) : NaN;
  const selectedDay = requestedDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && Number.isFinite(requestedDayTime) && new Date(requestedDayTime).toISOString().slice(0, 10) === requestedDay ? requestedDay : null;
  const openDay = (date: string) => {
    const next = new URLSearchParams(importParams);
    next.set("day", date); next.set("detail", "record-day"); next.delete("dayPage");
    setImportParams(next, { state: { coachDetail: "record-day" }, preventScrollReset: true });
  };
  const navigate = useNavigate();

  // Sport filter
  const filteredActivities = useMemo(() => {
    if (sportFilter === "all") return activities;
    return activities.filter(a => getDiscipline(a.type) === sportFilter);
  }, [activities, sportFilter]);

  // Build calendar grid
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startDow = firstDay.getUTCDay();
  const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
  const calStart = new Date(Date.UTC(year, month, 1 + mondayOffset));
  const weeks: Date[][] = [];
  const cursor = new Date(calStart);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (w >= 4 && week.every((d) => d.getUTCMonth() !== month)) break;
    weeks.push(week);
  }

  // Map filtered activities by date key
  const actByDate = new Map<string, Activity[]>();
  for (const a of filteredActivities) {
    const key = planDayKey(a.startTime);
    if (!actByDate.has(key)) actByDate.set(key, []);
    actByDate.get(key)!.push(a);
  }

  const todayKey = planDayKey(Date.now());

  // Monthly totals (from filteredActivities)
  const monthActs = filteredActivities.filter((a) => {
    const d = planCalendarDate(a.startTime);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });

  const monthRepresentatives = useMemo(() => acceptedPhysicalActivities(representativeCandidates, ftp).filter((activity) => {
    const date = planCalendarDate(activity.startTime);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month
      && (sportFilter === "all" || getDiscipline(activity.type) === sportFilter);
  }), [representativeCandidates, ftp, year, month, sportFilter]);
  const activeDays = new Set(monthRepresentatives.map(a => planCalendarDate(a.startTime).getUTCDate())).size;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthTotals = {
    distanceKm: monthRepresentatives.reduce((sum, a) => sum + (Number.isFinite(a.summary.distance) && a.summary.distance > 0 ? a.summary.distance : 0), 0) / 1000,
    timeMs: monthRepresentatives.reduce((sum, a) => sum + (Number.isFinite(a.summary.ridingTimeMillis) ? a.summary.ridingTimeMillis : 0), 0),
    elevationM: Math.round(monthRepresentatives.reduce((sum, a) => sum + (Number.isFinite(a.summary.elevationGain) ? a.summary.elevationGain : 0), 0)),
    // 아는 값만 더하고, 추정치가 섞이면 라벨로 밝힌다. 모르면 null — 0 을 쓰지 않는다 (#2237).
    load: sumAcceptedActivityTss(monthRepresentatives, ftp),
  };

  const monthLabel = t("mobileLog.monthLabel", { year, month: month + 1 });
  const monthControls = (
    <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-2)" }}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" iconOnly data-testid="P1-0-1" aria-label={t("training:page.prevMonth")} onClick={() => onChangeMonth(-1)}><ChevronLeft size={ICON_SIZE.md} aria-hidden="true" /></Button>
        <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{monthLabel}</span>
        <Button variant="ghost" iconOnly data-testid="P1-0-1" aria-label={t("training:page.nextMonth")} onClick={() => onChangeMonth(1)}><ChevronRight size={ICON_SIZE.md} aria-hidden="true" /></Button>
      </div>
    </div>
  );
  const dayDetailActs = selectedDay ? actByDate.get(selectedDay) ?? [] : [];

  // Activities tab uses the selected month, matching the calendar and summary range.
  const recentActs = [...monthActs].sort((a, b) => b.startTime - a.startTime);
  const query = searchQuery.trim().toLocaleLowerCase(i18n.language);
  const matchingActs = query ? recentActs.filter(activity => `${activity.description ?? ""} ${activity.id} ${planDayKey(activity.startTime)}`.toLocaleLowerCase(i18n.language).includes(query)) : recentActs;
  const requestedPage = importParams.get("pageMonth") === monthScope ? Number(importParams.get("page")) : 1;
  const pageCount = Math.max(1, Math.ceil(matchingActs.length / 20));
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, pageCount);
  const visibleRecentActs = matchingActs.slice((page - 1) * 20, page * 20);
  const requestedDayPage = Number(importParams.get("dayPage"));
  const dayPages = Math.max(1, Math.ceil(dayDetailActs.length / 20));
  const dayPage = Math.min(Number.isSafeInteger(requestedDayPage) && requestedDayPage > 0 ? requestedDayPage : 1, dayPages);
  const visibleDayActs = dayDetailActs.slice((dayPage - 1) * 20, dayPage * 20);
  const pagination = (total: number, current: number, pages: number, day = false) => total > 0 && <nav className="mobile-log__pagination" aria-label={t(day ? "mobileLog.dayPages" : "mobileLog.recordPages")}>
    <Text as="p" variant="caption" role="status">{t("mobileLog.pageStatus", { from: (current - 1) * 20 + 1, to: Math.min(current * 20, total), total, page: current, pages })}</Text>
    {pages > 1 && <div><Button variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1, day)}>{t("mobileLog.previousPage")}</Button><Button variant="secondary" disabled={current >= pages} onClick={() => setPage(current + 1, day)}>{t("mobileLog.nextPage")}</Button></div>}
  </nav>;



  const activityRow = (a: Activity) => {
    const d = planCalendarDate(a.startTime);
    const discipline = getDiscipline(a.type);
    const dateStr = t("mobileLog.dateMonthDay", { month: d.getUTCMonth() + 1, day: d.getUTCDate() });
    const km = Number.isFinite(a.summary.distance) ? (a.summary.distance / 1000).toFixed(1) : null;
    const tmStr = formatRecordedDuration(a.summary.ridingTimeMillis);
    const pwVal = a.summary.averagePower ?? a.avgPower ?? null;
    const pw = pwVal ? `${Math.round(pwVal)}W` : "";
    return (
      <button key={a.id} type="button" className="mobile-log__activity" onClick={() => navigate(`/activity/${a.id}`)}>
        <span className="mobile-log__activity-head">
          <span className="mobile-log__activity-title"><span className="mobile-log__activity-dot" style={{ background: getDisciplineColor(discipline) }} aria-hidden="true" /><span className="mobile-log__activity-title-text">{a.description || (discipline ? t(getDisciplineLabelKey(discipline)) : t("mobileLog.defaultActivity"))}</span></span>
          <strong className="mobile-log__activity-distance">{km ?? "—"}{km !== null && <small>km</small>}</strong>
        </span>
        <span className="mobile-log__activity-meta">
          <span>{dateStr}</span><span aria-hidden="true">·</span><span>{tmStr}</span>
          {isIndoorActivity(a) && <><span aria-hidden="true">·</span><span>{t("common:sport.indoor")}</span></>}
          {pw && <span className="mobile-log__activity-power">{pw}</span>}
        </span>
      </button>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center sticky top-0 z-10"
        style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: "var(--space-2)" }}>
        <div className="flex flex-col">
          <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t("mobileLog.headerTitle")}</span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{monthLabel}</span>
        </div>
        <div style={{ flex: 1 }} />
        <Button data-testid="P1-0-2" variant="secondary" onClick={() => setImportOpen(true)} aria-label={t("mobileLog.importAria")} leadingIcon={<Upload size={ICON_SIZE.md} aria-hidden="true" />}>{t("mobileLog.importBtn")}</Button>
      </div>

      {/* 종목 필터 */}
      <SportFilterTabs value={sportFilter} onChange={setSportFilter} />

      {loading && <MobileLogSkeleton />}

      {/* Tabs */}
      <div className="flex" role="tablist" style={{ borderBottom: "1px solid var(--line-soft)", background: "var(--bg-1)" }}>
        {(["month", "activity"] as const).map((k) => {
          const label = k === "month" ? t("mobileLog.tabMonth") : t("mobileLog.tabActivity");
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              role="tab"
              aria-selected={active}
              className="flex-1 flex items-center justify-center relative"
              style={{ padding: "12px 0", fontSize: "var(--fs-sm)", fontWeight: 500, minHeight: 44,
                color: active ? "var(--ink-0)" : "var(--ink-3)", background: "none", border: "none", cursor: "pointer" }}>
              {label}
              {active && <div style={{ position: "absolute", bottom: 0, left: 16, right: 16, height: 2, background: "var(--lime)", borderRadius: "2px 2px 0 0" }} />}
            </button>
          );
        })}
      </div>

      {tab === "activity" && recentSummarySlot}

      {!loading && tab === "month" && (
        <div className="mobile-log__month-glance" aria-label={t("mobileLog.monthAtGlance")}>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceDistance")}</span>
            <strong>{aggregateUnavailable ? "–" : new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(monthTotals.distanceKm)}{!aggregateUnavailable && <small>km</small>}</strong>
          </div>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceSessions")}</span>
            <strong>{aggregateUnavailable ? "–" : monthRepresentatives.length}</strong>
          </div>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceTime")}</span>
            <strong>{aggregateUnavailable ? "–" : formatDuration(monthTotals.timeMs)}</strong>
          </div>
          <div className="mobile-log__glance-metric">
            <span><GlossaryText>{t("mobileLog.glanceTss")}</GlossaryText>{monthTotals.load.estimated && <sup aria-hidden="true">*</sup>}</span>
            <strong>{aggregateUnavailable ? "–" : monthTotals.load.value ?? "–"}</strong>
          </div>
          <div className="mobile-log__glance-note">{t("mobileLog.recordBasis")}</div>
          {!aggregateUnavailable && monthTotals.load.unknownCount > 0 && <div className="mobile-log__glance-note">{t("mobileLog.loadPartial", { count: monthTotals.load.unknownCount })}</div>}
          {!aggregateUnavailable && monthTotals.load.estimated && <div className="mobile-log__glance-note">* {t("stat.tssEstimatedIncluded")} {t("mobileLog.estimateBasis")}</div>}
        </div>
      )}

      {!loading && tab === "month" && (
        <>
          {/* Calendar */}
          <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
            {monthControls}

            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map((d, i) => (
                <div key={d} style={{
                  fontSize: "var(--fs-sm)", textAlign: "center", fontFamily: "var(--font-mono)",
                  color: i === 6 ? "var(--rose)" : i === 5 ? "var(--aqua)" : "var(--ink-4)",
                }}>{d}</div>
              ))}
              {weeks.flat().map((date, i) => {
                const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
                const dayActs = actByDate.get(key) ?? [];
                const isCurrentMonth = date.getUTCMonth() === month;
                const isToday = key === todayKey;
                const hasPlan = plannedDates.includes(key);

                const sports = new Set(dayActs.map(a => getDiscipline(a.type)));
                const dotColors: string[] = [];
                if (sports.has("bike")) dotColors.push(getDisciplineColor("bike"));
                if (sports.has("run")) dotColors.push(getDisciplineColor("run"));
                if (sports.has("swim")) dotColors.push(getDisciplineColor("swim"));

                return (
                  <button key={i} type="button" data-testid={hasPlan && dayActs.length === 0 ? "P1-2-2" : "P1-2-1"} className="mobile-log__calendar-day" disabled={dayActs.length === 0 && !hasPlan}
                    aria-label={dayActs.length > 0 ? t("mobileLog.dayActivitiesTitle", { month: date.getUTCMonth() + 1, day: date.getUTCDate(), count: dayActs.length }) : undefined}
                    onClick={() => {
                      if (hasPlan && !plansByDate[key]?.length) navigate(`/coach/plan?sport=${plannedSports[key] ?? "bike"}&date=${key}`);
                      else if (hasPlan || dayActs.length > 1) openDay(key);
                      else if (dayActs.length === 1) navigate(`/activity/${dayActs[0]!.id}`);
                    }}
                    style={{
                      appearance: "none", width: "100%", aspectRatio: "1", background: "var(--bg-2)",
                      borderRadius: "var(--r-sm)", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      fontSize: "var(--fs-sm)", fontFamily: "var(--font-mono)", fontWeight: dayActs.length > 0 || isToday ? 700 : 500,
                      color: isCurrentMonth ? dayActs.length > 0 || isToday ? "var(--ink-0)" : "var(--ink-2)" : "var(--ink-4)",
                      opacity: isCurrentMonth ? 1 : 0.45,
                      cursor: dayActs.length > 0 ? "pointer" : "default",
                      border: isToday ? "1.5px solid var(--lime)" : "1px solid transparent",
                      paddingBottom: dotColors.length > 0 ? 3 : 0,
                    }}>
                    {date.getUTCDate()}
                    {hasPlan && <span style={{ color: "var(--ink-3)" }}>{t("training:log.planLabel")}</span>}
                    {dotColors.length > 0 ? (
                  <div style={{ display: "flex", gap: "var(--space-1)", justifyContent: "center", marginTop: 'var(--space-1)', alignItems: "center" }}>
                        {dotColors.map((c, idx) => (
                          <div key={idx} className="mobile-log__day-dot" style={{ background: c }} />
                        ))}
                        {dayActs.length > 1 && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)", transform: "scale(0.82)", transformOrigin: "center" }}>{dayActs.length}</span>}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {recentActs.length > 0 && (
            <section className="mobile-log__recent-preview" aria-label={t("mobileLog.recentActivity")}>
              <div className="mobile-log__recent-heading">
                <span>{t("mobileLog.recentActivity")}</span>
                <button type="button" onClick={() => setTab("activity")}>{t("mobileLog.viewAll")} →</button>
              </div>
              {recentActs.slice(0, 2).map(activityRow)}
            </section>
          )}

          {/* 월간 요약 */}
          <div style={{ padding: "14px 16px 8px" }}>
            <Text variant="eyebrow">{t("mobileLog.monthlySummary")}</Text>
          </div>
          <div className="mobile-log__summary">
            {[
              [t("mobileLog.activeDays"), `${activeDays}/${daysInMonth}`],
              [t("mobileLog.totalElevation", { defaultValue: "상승고도" }), `${monthTotals.elevationM.toLocaleString()}m`],
            ].map(([label, value]) => (
              <div key={String(label)} className="mobile-log__summary-item">
                <div className="mobile-log__summary-label"><GlossaryText>{String(label)}</GlossaryText></div>
                <div className="mobile-log__summary-value">{aggregateUnavailable ? "–" : value}</div>
              </div>
            ))}
          </div>

          {/* Sport breakdown rows */}
          {!aggregateUnavailable && <div style={{ padding: "0 16px 12px" }}>
            {[
              { icon: <SportIcon sport="bike" size={ICON_SIZE.lg} />, label: t("mobileLog.sportBike"), color: getDisciplineColor("bike"), filter: (a: Activity) => getDiscipline(a.type) === "bike", unit: "km", divisor: 1000 },
              { icon: <SportIcon sport="run" size={ICON_SIZE.lg} />, label: t("mobileLog.sportRun"), color: getDisciplineColor("run"), filter: (a: Activity) => getDiscipline(a.type) === "run", unit: "km", divisor: 1000 },
              { icon: <SportIcon sport="swim" size={ICON_SIZE.lg} />, label: t("mobileLog.sportSwim"), color: getDisciplineColor("swim"), filter: (a: Activity) => getDiscipline(a.type) === "swim", unit: "m", divisor: 1 },
            ].filter(sport => isSportUiEnabled("swim") || sport.unit !== "m").map(sport => {
              const acts = monthRepresentatives.filter(sport.filter);
              if (acts.length === 0) return null;
              const dist = acts.reduce((s, a) => s + (Number.isFinite(a.summary.distance) ? a.summary.distance : 0) / sport.divisor, 0);
              return (
                <div key={sport.label} style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "var(--r-lg)", background: `color-mix(in oklch, ${sport.color} 14%, var(--bg-2))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-lg)" }}>{sport.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)" }}>{sport.label}</div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{t("mobileLog.sessionCount", { count: acts.length })}</div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-base)", fontWeight: 600, color: sport.color }}>{dist.toFixed(sport.unit === "m" ? 0 : 1)}<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginLeft: "var(--space-0-5)" }}>{sport.unit}</span></div>
                </div>
              );
            })}
          </div>}
        </>
      )}

      {!loading && tab === "activity" && (
        <>
          <div style={{ padding: "var(--space-3) var(--space-4) 0" }}>{monthControls}</div>
          <div className="mobile-log__finder"><label htmlFor={searchId}><Text variant="bodySmall">{t("mobileLog.searchMonth")}</Text></label><Input id={searchId} type="search" value={searchQuery} onChange={event => setSearch(event.target.value)} aria-describedby={`${searchId}-scope`} /><Text as="p" id={`${searchId}-scope`} variant="caption" tone="secondary">{t("mobileLog.searchScope", { month: monthLabel })}</Text></div>
          <section aria-label={t("mobileLog.tabActivity")}>
            {visibleRecentActs.map(activityRow)}
          </section>
          {pagination(matchingActs.length, page, pageCount)}
          {matchingActs.length === 0 && <div className="mobile-log__empty"><Text as="p" variant="bodySmall" role="status">{t(query ? "mobileLog.noMatching" : "mobileLog.emptyActivity")}</Text>{query && <Button variant="ghost" onClick={() => setSearch("")}>{t("mobileLog.clearSearch")}</Button>}</div>}
        </>
      )}

      <ImportActivityModal open={importOpen} onClose={closeImport} />

      {selectedDay && <CoachDetailSection id="record-day" requested={importParams.get("detail") == null} title={t("training:planRecords.dayTitle", { date: selectedDay })}>
        {loading ? <Text role="status">{t("common:button.loading")}</Text> : <>
          {planState !== "ready" && <div>
            <Text as="p" variant="bodySmall" role={planState === "error" ? "alert" : "status"}>{t(planState === "error" ? "training:planRecords.error" : "training:planRecords.loading")}</Text>
            {planState === "error" && onRetryPlan && <Button variant="secondary" onClick={onRetryPlan}>{t("common:button.retry")}</Button>}
          </div>}
          <PlanRecordEvidence date={selectedDay} plans={plansByDate[selectedDay] ?? []} />
              {visibleDayActs.map((a) => {
                const disc = getDiscipline(a.type);
                // 삼항 else 가 미지 종목을 자전거로 떨어뜨렸다 — 중립 아이콘까지 다루는 헬퍼로 대체.
                const icon = disc ? <SportIcon sport={disc} size={ICON_SIZE.lg} /> : <ActivityIcon size={ICON_SIZE.lg} aria-hidden="true" />;
                const color = getDisciplineColor(disc);
                const km = Number.isFinite(a.summary.distance) ? (a.summary.distance / 1000).toFixed(1) : null;
                const tmStr = formatRecordedDuration(a.summary.ridingTimeMillis);
                const { value: tss, estimated: tssEstimated } = estimateActivityTss(a, ftp);
                return (
                  <button type="button"
                    key={a.id}
                    onClick={() => navigate(`/activity/${a.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 'var(--space-3)',
                      padding: "var(--space-3) var(--space-4)",
                      borderBottom: "1px solid var(--line-soft)",
                      cursor: "pointer", width: "100%", background: "none", border: 0, textAlign: "left",
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: "var(--r-xl)", flexShrink: 0,
                      background: `color-mix(in oklch, ${color} 16%, var(--bg-2))`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "var(--fs-xl)",
                    }}>{icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.description || t("mobileLog.defaultActivity")}
                      </div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginTop: "var(--space-0-5)" }}>
                        {km !== null ? `${km}km` : "—"} · {tmStr}{tss == null ? "" : ` · ${Math.round(tss)} TSS${tssEstimated ? ` ${t("training:page.tssEstimated")}` : ""}`}
                      </div>
                      {location.state?.periodEvidence?.date === selectedDay && !aggregateUnavailable && <Text as="p" variant="caption" tone="secondary">{t(location.state.periodEvidence.activityIds?.includes(a.id) ? "training:loadComparison.representativeIncluded" : "training:loadComparison.representativeOriginal")}</Text>}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
          {pagination(dayDetailActs.length, dayPage, dayPages, true)}
          {!dayDetailActs.length && <Text as="p" variant="bodySmall" tone="secondary">{t("training:planRecords.noActivity")}</Text>}
        </>}
      </CoachDetailSection>}
    </div>
  );
}
