import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { Upload } from "lucide-react";
import type { Activity } from "@shared/types";
import ImportActivityModal from "./ImportActivityModal";
import SportFilterTabs from "./SportFilterTabs";
import { getDiscipline, getDisciplineColor, getDisciplineIcon, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { estimateActivityTss, sumActivityTss } from "../../utils/estimateTSS";
import "./MobileLogPage.css";

// DAY_NAMES — i18n via t("mobileLog.dayNames")

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

interface MobileLogPageProps {
  activities: Activity[];
  year: number;
  month: number;
  onChangeMonth: (delta: number) => void;
  loading?: boolean;
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

export default function MobileLogPage({ activities, year, month, onChangeMonth, loading = false }: MobileLogPageProps) {
  const { t, i18n } = useTranslation("activity");
  const DAY_NAMES = (t("mobileLog.dayNames", { returnObjects: true }) as string[]) ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [tab, setTab] = useState<"month" | "activity">("month");
  const [importOpen, setImportOpen] = useState(false);
  const [sportFilter, setSportFilter] = useState("all");
  const [activityLimit, setActivityLimit] = useState(20);
  const [dayDetailActs, setDayDetailActs] = useState<Activity[] | null>(null);
  const daySheetRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Sport filter
  const filteredActivities = useMemo(() => {
    if (sportFilter === "all") return activities;
    return activities.filter(a => getDiscipline(a.type) === sportFilter);
  }, [activities, sportFilter]);

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
  const calStart = new Date(year, month, 1 + mondayOffset);
  const weeks: Date[][] = [];
  const cursor = new Date(calStart);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (w >= 4 && week.every((d) => d.getMonth() !== month)) break;
    weeks.push(week);
  }

  // Map filtered activities by date key
  const actByDate = new Map<string, Activity[]>();
  for (const a of filteredActivities) {
    const d = new Date(a.startTime);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (!actByDate.has(key)) actByDate.set(key, []);
    actByDate.get(key)!.push(a);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  // Monthly totals (from filteredActivities)
  const monthActs = filteredActivities.filter((a) => {
    const d = new Date(a.startTime);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const activeDays = new Set(monthActs.map(a => new Date(a.startTime).getDate())).size;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthTotals = {
    distanceKm: monthActs.reduce((sum, a) => sum + (Number.isFinite(a.summary.distance) && a.summary.distance > 0 ? a.summary.distance : 0), 0) / 1000,
    timeMs: monthActs.reduce((sum, a) => sum + (a.summary.ridingTimeMillis ?? 0), 0),
    elevationM: Math.round(monthActs.reduce((sum, a) => sum + (a.summary.elevationGain ?? 0), 0)),
    // 아는 값만 더하고, 추정치가 섞이면 라벨로 밝힌다. 모르면 null — 0 을 쓰지 않는다 (#2237).
    load: sumActivityTss(monthActs),
  };

  const monthLabel = t("mobileLog.monthLabel", { year, month: month + 1 });

  // Activities tab uses the selected month, matching the calendar and summary range.
  const recentActs = [...monthActs].sort((a, b) => b.startTime - a.startTime);
  const visibleRecentActs = recentActs.slice(0, activityLimit);

  useEffect(() => {
    if (!dayDetailActs) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(daySheetRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    focusable()[0]?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDayDetailActs(null);
      } else if (event.key === "Tab") {
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (event.shiftKey && (document.activeElement === first || !daySheetRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !daySheetRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => {
      window.removeEventListener("keydown", handleKeys);
      previousFocus?.focus();
    };
  }, [dayDetailActs]);

  const activityRow = (a: Activity) => {
    const d = new Date(a.startTime);
    const discipline = getDiscipline(a.type);
    const dateStr = t("mobileLog.dateMonthDay", { month: d.getMonth() + 1, day: d.getDate() });
    const km = (a.summary.distance / 1000).toFixed(1);
    const h = Math.floor(a.summary.ridingTimeMillis / 3600000);
    const m = Math.floor((a.summary.ridingTimeMillis % 3600000) / 60000);
    const tmStr = `${h}:${String(m).padStart(2, "0")}`;
    const pwVal = a.summary.averagePower ?? a.avgPower ?? null;
    const pw = pwVal ? `${Math.round(pwVal)}W` : "";
    return (
      <button key={a.id} type="button" className="mobile-log__activity" onClick={() => navigate(`/activity/${a.id}`)}>
        <span className="mobile-log__activity-head">
          <span className="mobile-log__activity-title"><span className="mobile-log__activity-dot" style={{ background: getDisciplineColor(discipline) }} aria-hidden="true" /><span className="mobile-log__activity-title-text">{a.description || (discipline ? t(getDisciplineLabelKey(discipline)) : t("mobileLog.defaultActivity"))}</span></span>
          <strong className="mobile-log__activity-distance">{km}<small>km</small></strong>
        </span>
        <span className="mobile-log__activity-meta">
          <span>{dateStr}</span><span aria-hidden="true">·</span><span>{tmStr}</span>
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
        <button type="button" onClick={() => setImportOpen(true)} aria-label={t("mobileLog.importAria")}
          style={{
            display: "flex", alignItems: "center", gap: 'var(--space-1)',
            padding: "5px 10px", background: "var(--bg-2)",
            border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)",
            fontSize: "var(--fs-xs)", fontWeight: 500, color: "var(--ink-2)", cursor: "pointer",
          }}>
          <Upload size={13} />
          {t("mobileLog.importBtn")}
        </button>
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

      {!loading && tab === "month" && (
        <div className="mobile-log__month-glance" aria-label={t("mobileLog.monthAtGlance")}>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceDistance")}</span>
            <strong>{new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(monthTotals.distanceKm)}<small>km</small></strong>
          </div>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceSessions")}</span>
            <strong>{monthActs.length}</strong>
          </div>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceTime")}</span>
            <strong>{formatDuration(monthTotals.timeMs)}</strong>
          </div>
          <div className="mobile-log__glance-metric">
            <span>{t("mobileLog.glanceTss")}{monthTotals.load.estimated && <sup aria-hidden="true">*</sup>}</span>
            <strong>{monthTotals.load.value ?? "–"}</strong>
          </div>
          {monthTotals.load.estimated && <div className="mobile-log__glance-note">* {t("stat.tssEstimatedIncluded")}</div>}
        </div>
      )}

      {!loading && tab === "month" && (
        <>
          {/* Calendar */}
          <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)' }}>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={t("training:page.prevMonth")} onClick={() => onChangeMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>◀</button>
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{monthLabel}</span>
                <button type="button" aria-label={t("training:page.nextMonth")} onClick={() => onChangeMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>▶</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map((d, i) => (
                <div key={d} style={{
                  fontSize: "var(--fs-sm)", textAlign: "center", fontFamily: "var(--font-mono)",
                  color: i === 6 ? "var(--rose)" : i === 5 ? "var(--aqua)" : "var(--ink-4)",
                }}>{d}</div>
              ))}
              {weeks.flat().map((date, i) => {
                const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
                const dayActs = actByDate.get(key) ?? [];
                const isCurrentMonth = date.getMonth() === month;
                const isToday = key === todayKey;

                const sports = new Set(dayActs.map(a => getDiscipline(a.type)));
                const dotColors: string[] = [];
                if (sports.has("bike")) dotColors.push(getDisciplineColor("bike"));
                if (sports.has("run")) dotColors.push(getDisciplineColor("run"));
                if (sports.has("swim")) dotColors.push(getDisciplineColor("swim"));

                return (
                  <button key={i} type="button" className="mobile-log__calendar-day" disabled={dayActs.length === 0}
                    aria-label={dayActs.length > 0 ? t("mobileLog.dayActivitiesTitle", { month: date.getMonth() + 1, day: date.getDate(), count: dayActs.length }) : undefined}
                    onClick={() => {
                      if (dayActs.length === 1) {
                        navigate(`/activity/${dayActs[0]!.id}`);
                      } else if (dayActs.length > 1) {
                        setDayDetailActs(dayActs);
                      }
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
                    {date.getDate()}
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
            <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>{t("mobileLog.monthlySummary")}</span>
          </div>
          <div className="mobile-log__summary">
            {[
              [t("mobileLog.activeDays"), `${activeDays}/${daysInMonth}`],
              [t("mobileLog.totalSessions"), monthActs.length],
              [t("mobileLog.totalTime", { defaultValue: "총 시간" }), formatDuration(monthTotals.timeMs)],
              [
                monthTotals.load.estimated
                  ? `${t("mobileLog.totalTss", { defaultValue: "총 TSS" })} · ${t("stat.tssEstimatedIncluded")}`
                  : t("mobileLog.totalTss", { defaultValue: "총 TSS" }),
                monthTotals.load.value ?? "–",
              ],
              [t("mobileLog.totalElevation", { defaultValue: "상승고도" }), `${monthTotals.elevationM.toLocaleString()}m`],
            ].map(([label, value]) => (
              <div key={String(label)} className="mobile-log__summary-item">
                <div className="mobile-log__summary-label">{label}</div>
                <div className="mobile-log__summary-value">{value}</div>
              </div>
            ))}
          </div>

          {/* Sport breakdown rows */}
          <div style={{ padding: "0 16px 12px" }}>
            {[
              { icon: "🚴", label: t("mobileLog.sportBike"), color: getDisciplineColor("bike"), filter: (a: Activity) => getDiscipline(a.type) === "bike", unit: "km", divisor: 1000 },
              { icon: "🏃", label: t("mobileLog.sportRun"), color: getDisciplineColor("run"), filter: (a: Activity) => getDiscipline(a.type) === "run", unit: "km", divisor: 1000 },
              { icon: "🏊", label: t("mobileLog.sportSwim"), color: getDisciplineColor("swim"), filter: (a: Activity) => getDiscipline(a.type) === "swim", unit: "m", divisor: 1 },
            ].map(sport => {
              const acts = monthActs.filter(sport.filter);
              if (acts.length === 0) return null;
              const dist = acts.reduce((s, a) => s + a.summary.distance / sport.divisor, 0);
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
          </div>
        </>
      )}

      {!loading && tab === "activity" && (
        <>
          {visibleRecentActs.map(activityRow)}
          {recentActs.length > visibleRecentActs.length && (
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              <button
                type="button"
                onClick={() => setActivityLimit((limit) => limit + 20)}
                style={{ width: "100%", minHeight: 44, borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)", background: "var(--bg-2)", color: "var(--ink-1)", fontSize: "var(--fs-sm)", fontWeight: 600 }}
              >
                {t("mobileLog.loadMore", { defaultValue: "더 보기" })}
              </button>
            </div>
          )}
          {recentActs.length === 0 && (
            <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)", fontSize: "var(--fs-sm)" }}>
              {t("mobileLog.emptyActivity")}
            </div>
          )}
        </>
      )}

      <div style={{ height: 80 }} />
      <ImportActivityModal open={importOpen} onClose={() => setImportOpen(false)} />

      {/* 하루 여러 활동 바텀시트 */}
      {dayDetailActs && (
        <>
          {/* 오버레이 */}
          <button type="button" aria-label={t("mobileLog.close")}
            onClick={() => setDayDetailActs(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 998,
              background: "color-mix(in srgb, var(--bg-0) 45%, transparent)",
              border: 0,
            }}
          />
          {/* 시트 */}
          <div ref={daySheetRef} role="dialog" aria-modal="true" aria-label={t("mobileLog.dayActivitiesTitle", { month: new Date(dayDetailActs[0]!.startTime).getMonth() + 1, day: new Date(dayDetailActs[0]!.startTime).getDate(), count: dayDetailActs.length })}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
              background: "var(--bg-1)",
              borderRadius: "16px 16px 0 0",
              boxShadow: "0 -4px 24px color-mix(in srgb, var(--bg-0) 30%, transparent)",
              paddingBottom: "env(safe-area-inset-bottom, 16px)",
            }}
          >
            {/* 핸들 */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 40, height: 4, borderRadius: "var(--r-xs)", background: "var(--line)" }} />
            </div>
            {/* 제목 */}
            <div style={{ padding: "var(--space-2) var(--space-4) var(--space-3)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
              {(() => {
                const d = new Date(dayDetailActs[0]!.startTime);
                return t("mobileLog.dayActivitiesTitle", { month: d.getMonth() + 1, day: d.getDate(), count: dayDetailActs.length });
              })()}
            </div>
            {/* 활동 목록 */}
            <div style={{ overflowY: "auto", maxHeight: "60vh" }}>
              {dayDetailActs.map((a) => {
                const disc = getDiscipline(a.type);
                // 삼항 else 가 미지 종목을 자전거로 떨어뜨렸다 — 중립 아이콘까지 다루는 헬퍼로 대체.
                const icon = getDisciplineIcon(disc);
                const color = getDisciplineColor(disc);
                const km = (a.summary.distance / 1000).toFixed(1);
                const h = Math.floor(a.summary.ridingTimeMillis / 3600000);
                const m = Math.floor((a.summary.ridingTimeMillis % 3600000) / 60000);
                const tmStr = `${h}:${String(m).padStart(2, "0")}`;
                const { value: tss, estimated: tssEstimated } = estimateActivityTss(a);
                return (
                  <button type="button"
                    key={a.id}
                    onClick={() => { setDayDetailActs(null); navigate(`/activity/${a.id}`); }}
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
                        {km}km · {tmStr}{tss == null ? "" : ` · ${Math.round(tss)} TSS${tssEstimated ? ` ${t("training:page.tssEstimated")}` : ""}`}
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
            </div>
            {/* 닫기 버튼 */}
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              <button
                onClick={() => setDayDetailActs(null)}
                style={{
                  width: "100%", padding: "var(--space-3)", borderRadius: "var(--r-xl)",
                  background: "var(--bg-2)", border: "1px solid var(--line-soft)",
                  fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-2)", cursor: "pointer",
                }}
              >
                {t("mobileLog.close")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
