import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { ChevronLeft, Upload } from "lucide-react";
import type { Activity } from "@shared/types";
import ImportActivityModal from "./ImportActivityModal";
import SportFilterTabs from "./SportFilterTabs";
import { getDiscipline, getDisciplineColor } from "../../utils/disciplineFilter";

// DAY_NAMES — i18n via t("mobileLog.dayNames")

interface MobileLogPageProps {
  activities: Activity[];
  year: number;
  month: number;
  onChangeMonth: (delta: number) => void;
}

export default function MobileLogPage({ activities, year, month, onChangeMonth }: MobileLogPageProps) {
  const { t } = useTranslation("activity");
  const DAY_NAMES = (t("mobileLog.dayNames", { returnObjects: true }) as string[]) ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [tab, setTab] = useState<"month" | "activity">("month");
  const [importOpen, setImportOpen] = useState(false);
  const [sportFilter, setSportFilter] = useState("all");
  const [dayDetailActs, setDayDetailActs] = useState<Activity[] | null>(null);
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

  const monthLabel = t("mobileLog.monthLabel", { year, month: month + 1 });

  // Recent activities for "활동" tab
  const recentActs = [...filteredActivities].sort((a, b) => b.startTime - a.startTime).slice(0, 20);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center sticky top-0 z-10"
        style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: "var(--space-2)" }}>
        <div className="cursor-pointer flex items-center" style={{ marginLeft: -4, padding: "4px 8px 4px 0", minHeight: 44 }}
          onClick={() => navigate("/my")}>
          <ChevronLeft size={22} style={{ color: "var(--ink-1)" }} />
        </div>
        <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t("mobileLog.headerTitle")}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setImportOpen(true)} aria-label={t("mobileLog.importAria")}
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

      {tab === "month" && (
        <>
          {/* Calendar */}
          <div style={{ padding: 'var(--space-4)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)' }}>
              <div className="flex items-center gap-3">
                <button onClick={() => onChangeMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>◀</button>
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{monthLabel}</span>
                <button onClick={() => onChangeMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>▶</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map((d, i) => (
                <div key={d} style={{
                  fontSize: "var(--fs-xs)", textAlign: "center", fontFamily: "var(--font-mono)",
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
                  <div key={i}
                    onClick={() => {
                      if (dayActs.length === 1) {
                        navigate(`/activity/${dayActs[0]!.id}`);
                      } else if (dayActs.length > 1) {
                        setDayDetailActs(dayActs);
                      }
                    }}
                    style={{
                      aspectRatio: "1", background: "var(--bg-2)",
                      borderRadius: "var(--r-sm)", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", fontWeight: 500,
                      color: isCurrentMonth ? "var(--ink-3)" : "var(--ink-4)",
                      opacity: isCurrentMonth ? 1 : 0.2,
                      cursor: dayActs.length > 0 ? "pointer" : "default",
                      border: isToday ? "1.5px solid var(--lime)" : "none",
                      paddingBottom: dotColors.length > 0 ? 3 : 0,
                    }}>
                    {date.getDate()}
                    {dotColors.length > 0 ? (
                      <div style={{ display: "flex", gap: "var(--space-1)", justifyContent: "center", marginTop: 'var(--space-1)' }}>
                        {dotColors.map((c, idx) => (
                          <div key={idx} style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 월간 요약 */}
          <div style={{ padding: "14px 16px 8px" }}>
            <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>{t("mobileLog.monthlySummary")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5" style={{ padding: "0 16px 12px" }}>
            <div style={{ background: "var(--bg-1)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: 'var(--space-3)' }}>
              <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: "var(--space-1)" }}>{t("mobileLog.activeDays")}</div>
              <div><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xl)", fontWeight: 600, color: "var(--ink-0)" }}>{activeDays}</span><span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginLeft: "var(--space-0-5)" }}>/{daysInMonth}</span></div>
            </div>
            <div style={{ background: "var(--bg-1)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: 'var(--space-3)' }}>
              <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: "var(--space-1)" }}>{t("mobileLog.totalSessions")}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xl)", fontWeight: 600, color: "var(--ink-0)" }}>{monthActs.length}</div>
            </div>
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

      {tab === "activity" && (
        <>
          {recentActs.map((a) => {
            const d = new Date(a.startTime);
            const dateStr = t("mobileLog.dateMonthDay", { month: d.getMonth() + 1, day: d.getDate() });
            const km = (a.summary.distance / 1000).toFixed(1);
            const h = Math.floor(a.summary.ridingTimeMillis / 3600000);
            const m = Math.floor((a.summary.ridingTimeMillis % 3600000) / 60000);
            const tmStr = `${h}:${String(m).padStart(2, "0")}`;
            const pwVal = a.summary.averagePower ?? a.avgPower ?? null;
            const pw = pwVal ? `${Math.round(pwVal)}W` : "";
            return (
              <div key={a.id} onClick={() => navigate(`/activity/${a.id}`)}
                style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: "var(--space-1-5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.description || t("mobileLog.defaultActivity")}
                </div>
                <div className="flex items-center gap-3" style={{ fontSize: "var(--fs-xs)" }}>
                  <span style={{ color: "var(--ink-4)" }}>{dateStr}</span>
                  <span style={{ color: "var(--ink-3)" }}>·</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{km}km</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{tmStr}</span>
                  {pw && <span style={{ fontFamily: "var(--font-mono)", color: "var(--lime)" }}>{pw}</span>}
                </div>
              </div>
            );
          })}
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
          <div
            onClick={() => setDayDetailActs(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 998,
              background: "color-mix(in srgb, var(--bg-0) 45%, transparent)",
            }}
          />
          {/* 시트 */}
          <div
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
                const icon = disc === "run" ? "🏃" : disc === "swim" ? "🏊" : "🚴";
                const color = getDisciplineColor(disc);
                const km = (a.summary.distance / 1000).toFixed(1);
                const h = Math.floor(a.summary.ridingTimeMillis / 3600000);
                const m = Math.floor((a.summary.ridingTimeMillis % 3600000) / 60000);
                const tmStr = `${h}:${String(m).padStart(2, "0")}`;
                const tss = a.summary.tss ? `${Math.round(a.summary.tss)} TSS` : "";
                return (
                  <div
                    key={a.id}
                    onClick={() => { setDayDetailActs(null); navigate(`/activity/${a.id}`); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 'var(--space-3)',
                      padding: "var(--space-3) var(--space-4)",
                      borderBottom: "1px solid var(--line-soft)",
                      cursor: "pointer",
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
                        {km}km · {tmStr}{tss ? ` · ${tss}` : ""}
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
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
