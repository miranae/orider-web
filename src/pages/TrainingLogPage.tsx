import PlanPeriodReturn from "../features/training/plan/PlanPeriodReturn";
import { LocalizedLink } from "../components/LocalizedLink";
import { presentPlanRecord } from "../features/training/plan/planRecordPresentation";
import { usePlanRecordOverlay } from "../features/training/plan/usePlanRecordOverlay";
import "./TrainingLogPage.css";
import PlanRecordNavigation from "../features/training/plan/PlanRecordNavigation";
import PlanRecordEvidence, { type PlanRecordEntry } from "../features/training/plan/PlanRecordEvidence";
import CoachDetailSection from "../features/fitness/components/CoachDetailSection";
import { isSportUiEnabled } from "../config/sportFeatures";
import { useActivityRepresentatives, withActivityRepresentatives } from "../hooks/useActivityRepresentatives";
import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useLocation, useSearchParams } from "react-router-dom";
import GlossaryText from "../components/common/GlossaryText";
import { Upload } from "lucide-react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import { useMobile } from "../hooks/useMobile";
import MobileLogPage from "../components/mobile/MobileLogPage";
import RecentActivitySummary from "../components/activity/RecentActivitySummary";
import ImportActivityModal from "../components/mobile/ImportActivityModal";
import { getDiscipline } from "../utils/disciplineFilter";
import { acceptedPhysicalActivities, estimateActivityTss, sumAcceptedActivityTss } from "../utils/estimateTSS";
import { planDayKey, planCalendarDate, planMonthBounds } from "@shared/training/planDate";
import { buttonClass, Button, Card, Text, ToggleControls, ToggleButton } from "../theme/components";
import { ErrorState } from "../components/redesign";
import GuestValuePreview from "../components/guest/GuestValuePreview";
import { ICON_SIZE } from "../theme/tokens/icon";

const LOG_WEEK_GRID_COLUMNS = "repeat(7, minmax(72px, 1fr)) 60px";
const LOG_CALENDAR_CARD_STYLE: CSSProperties = {
  padding: 0,
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

// ── 날짜 유틸 ─────────────────────────────────────────────────────────

const msToDateKey = planDayKey;
const dateToKey = (date: Date) => date.toISOString().slice(0, 10);
const finiteMetric = (value: number) => Number.isFinite(value) ? value : 0;

/** 월 캐시 키 "YYYY-MM" */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

// ── 거리 기반 색상 ────────────────────────────────────────────────────

function distColor(km: number): string {
  if (km >= 100) return "var(--rose)";
  if (km >= 60) return "var(--amber)";
  if (km >= 30) return "var(--lime)";
  return "var(--aqua)";
}

/** 종목별 CSS 변수 색상 */
function sportColor(type?: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("swim")) return "var(--lime)";
  if (t.includes("run") || t.includes("walk") || t.includes("hike")) return "var(--amber)";
  return "var(--aqua)"; // bike + default
}

/** 수영은 m 단위, 그 외는 km */
function formatActivityDist(a: Activity): string {
  if (!Number.isFinite(a.summary.distance)) return "—";
  const km = a.summary.distance / 1000;
  if ((a.type || "").toLowerCase().includes("swim")) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

// ── 월 캘린더 생성 ────────────────────────────────────────────────────

interface CalCell {
  date: Date;
  isCurrentMonth: boolean;
}

function getMonthCalendar(year: number, month: number): CalCell[][] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startDow = firstDay.getUTCDay(); // 0=Sun
  const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
  const calStart = new Date(Date.UTC(year, month, 1 + mondayOffset));

  const weeks: CalCell[][] = [];
  const current = new Date(calStart);
  for (let w = 0; w < 6; w++) {
    const week: CalCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        date: new Date(current),
        isCurrentMonth: current.getUTCMonth() === month,
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    // 뒤쪽 빈 주 건너뜀
    if (w >= 3 && week.every((c) => !c.isCurrentMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

// ── LogDayCell (월간 컴팩트) ──────────────────────────────────────────

interface LogDayCellProps {
  activities: Activity[];
  loadActivities: Activity[];
  plans: PlanGhost[];
  isToday: boolean;
  isCurrentMonth: boolean;
  dayNum: number;
  dateKey: string;
  todayKey: string;
  ftp?: number;
}

type PlanGhost = PlanRecordEntry;

export function LogDayCell({ activities, plans, isToday, isCurrentMonth, dayNum, dateKey, todayKey, ftp }: LogDayCellProps) {
  const navigate = useNavigate();
  const { t } = useTranslation("training");
  const [calendarParams, setCalendarParams] = useSearchParams();
  const expanded = calendarParams.get("calendarDay") === dateKey;
  const setDayPage = (page: number) => {
    const next = new URLSearchParams(calendarParams);
    next.set("calendarDay", dateKey); next.set("calendarPage", String(page));
    setCalendarParams(next, { preventScrollReset: true });
  };
  const toggleExpanded = () => {
    const next = new URLSearchParams(calendarParams);
    if (expanded) { next.delete("calendarDay"); next.delete("calendarPage"); }
    else { next.set("calendarDay", dateKey); next.set("calendarPage", "1"); }
    setCalendarParams(next, { preventScrollReset: true });
  };
  const hasAct = activities.length > 0;
  const single = activities.length === 1;


  // 활동 정렬 — 시작 시각 빠른 순
  const sorted = [...activities].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const requestedPage = Number(calendarParams.get("calendarPage"));
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, pages);
  const visible = expanded ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted.slice(0, 2);
  const hiddenCount = sorted.length - 2;

  const fmtTime = (ts: number) => {
    if (!ts) return "";
    const d = planCalendarDate(ts);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };

  return (
    <div
      className="training-log-day"
      style={{
        minHeight: "calc(var(--space-8) * 2)",
        padding: "var(--space-2)",
        background: "var(--bg-1)",
        border: `1px solid ${isToday ? "var(--lime)" : "var(--line-soft)"}`,
        opacity: isCurrentMonth ? 1 : 0.2,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        position: "relative",
      }}
    >
      {/* 날짜 숫자 + 다중 활동 인디케이터 */}
      <div className="flex items-center" style={{ gap: 'var(--space-1)' }}>
        <span
          style={{
            fontSize: "var(--fs-sm)", fontFamily: "var(--font-mono)",
            color: isToday ? "var(--lime)" : "var(--ink-3)",
            fontWeight: isToday ? 700 : 600, lineHeight: 1.2,
          }}
        >
          {dayNum}
        </span>
        {!single && hasAct && (
          <span
            aria-label={t("log.activitiesCount", { count: activities.length })}
            style={{
              fontSize: "var(--fs-xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-3)",
              lineHeight: 1,
              padding: "1px 4px",
              borderRadius: "var(--r-sm)",
              background: "var(--bg-3)",
            }}
          >
            ×{activities.length}
          </span>
        )}
      </div>

      {/* 활동 목록 — 각 행이 개별 클릭 영역 */}
      {plans.map((plan, index) => {
        const color = sportColor(plan.workout);
        const presentation = presentPlanRecord(plan, { date: dateKey, today: todayKey });
        return (
          <button
            type="button"
            data-testid="P1-2-2" onClick={() => {
              const next = new URLSearchParams(calendarParams);
              next.set("day", dateKey); next.set("detail", "record-day");
              setCalendarParams(next, { preventScrollReset: true });
            }}
            key={`${plan.workout}-${index}`}
            aria-label={`${t("log.planLabel")} · ${plan.plannedTSS} TSS · ${plan.plannedDurationMin}m`}
            className="training-log-day-plan"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "var(--space-1)",
              borderRadius: "var(--r-sm)",
              border: `1px dashed ${color}`,
              color,
              opacity: hasAct ? 0.55 : 0.82,
              background: "color-mix(in oklch, currentColor 7%, transparent)",
            }}
          >
            <span style={{ fontSize: "var(--fs-xs)", lineHeight: 1.2 }}>{t("log.planLabel")}</span>
            <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", lineHeight: 1.2 }}>
              {plan.plannedTSS} TSS
            </span>
            <span data-plan-outcome={presentation.outcome} style={{ fontSize: "var(--fs-xs)" }}>{t(`planRecords.state.${presentation.outcome}`)}</span>
          </button>
        );
      })}
      {visible.map((a) => {
        const color = sportColor(a.type);
        const { value: tss, estimated: tssEstimated } = estimateActivityTss(a, ftp);
        return (
          <button
            key={a.id}
            type="button"
            aria-label={`${a.description || a.type || formatActivityDist(a)} · ${fmtTime(a.startTime)} · ${formatActivityDist(a)}${tss == null ? "" : ` · ${tss} TSS${tssEstimated ? ` ${t("page.tssEstimated")}` : ""}`}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/activity/${a.id}`);
            }}
            className="training-log-day-activity"
            style={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr)",
              alignItems: "center",
              gap: "var(--space-1)",
              color,
              padding: "var(--space-1) var(--space-0-5)",
              borderRadius: "var(--r-sm)",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (!single) e.currentTarget.style.background = "var(--bg-3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span aria-hidden="true" style={{ width: "var(--space-1-5)", height: "var(--space-1-5)", borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-sm)", fontFamily: "var(--font-mono)", color: "var(--ink-0)", lineHeight: 1.2 }}>
              {formatActivityDist(a)}
            </span>
            {/* 모르면 대시 — 0 을 "부하 없음" 확정값처럼 보여주지 않는다 (#2237). */}
            <span className="training-log-day-load" style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
              {tss == null ? "–" : tss} TSS
              {tssEstimated && <span style={{ marginLeft: "var(--space-0-5)", color: "var(--ink-4)" }}>{t("page.tssEstimated")}</span>}
            </span>
          </button>
        );
      })}
      {expanded && sorted.length > 0 && <nav aria-label={t("activity:mobileLog.dayPages")} style={{ display: "grid", gap: "var(--space-1)" }}>
        <Text as="p" variant="caption" role="status">{t("activity:mobileLog.pageStatus", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, sorted.length), total: sorted.length, page, pages })}</Text>
        {pages > 1 && <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setDayPage(page - 1)}>{t("activity:mobileLog.previousPage")}</Button>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setDayPage(page + 1)}>{t("activity:mobileLog.nextPage")}</Button>
        </div>}
      </nav>}
      {hiddenCount > 0 && <button type="button" aria-expanded={expanded} onClick={toggleExpanded}
        style={{ alignSelf: "flex-start", minHeight: 24, padding: "0 var(--space-1)", border: 0, background: "none", color: "var(--accent)", fontSize: "var(--fs-xs)", fontWeight: 600, cursor: "pointer" }}>
        {t(expanded ? "log.hideExtraActivities" : "log.showExtraActivities", { count: hiddenCount })}
      </button>}
    </div>
  );
}

// ── MiniBarChart (월간 일별 거리) ─────────────────────────────────────

interface MiniBarChartProps {
  values: number[];
  labels: string[];
  /** 툴팁 단위 (예: "km"). 막대 호버 시 `라벨 · 값 단위` 표시. */
  unit?: string;
}

function MiniBarChart({ values, labels, unit = "" }: MiniBarChartProps) {
  const maxVal = Math.max(...values, 1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const anchorPct =
    hoverIdx != null ? Math.min(Math.max(((hoverIdx + 0.5) / values.length) * 100, 8), 92) : 0;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-0-5)", height: 48 }} onPointerLeave={() => setHoverIdx(null)}>
      {values.map((v, i) => (
        <div
          key={i}
          onPointerEnter={() => setHoverIdx(i)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-0-5)",
            height: "100%",
            justifyContent: "flex-end",
            opacity: hoverIdx != null && hoverIdx !== i ? 0.5 : 1,
            transition: "opacity 0.12s",
            cursor: "default",
          }}
        >
          <div
            style={{
              width: "100%",
              height: `${Math.max((v / maxVal) * 34, v > 0 ? 3 : 0)}px`,
              background: v > 0 ? distColor(v) : "var(--bg-3)",
              borderRadius: "2px 2px 0 0",
              transition: "height 0.2s",
            }}
          />
          <div
            style={{
              fontSize: "var(--fs-2xs)",
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1,
            }}
          >
            {labels[i]}
          </div>
        </div>
      ))}
      </div>
      {hoverIdx != null && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: `${anchorPct}%`,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "var(--space-1) var(--space-2)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
            fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            color: "var(--ink-0)",
          }}
        >
          <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{labels[hoverIdx]}</span>
          {" · "}
          {values[hoverIdx]!.toFixed(1)}{unit ? ` ${unit}` : ""}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function TrainingLogPage() {
  const { state: comparisonState } = useLocation();
  const { t, i18n } = useTranslation("training");
  const { t: tCommon } = useTranslation("common");
  const { user, profile } = useAuth();
  const ftp = profile?.ftp ?? undefined;
  const [importParams, setImportParams] = useSearchParams();
  const requestedSport = importParams.get("sport");
  const today = planCalendarDate(Date.now());
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth(),
  });

  // A result belongs to both its owner/source and the request generation that started it.
  const monthScopeRef = useRef({ uid: user?.uid, firestore, epoch: 0, active: true, requested: new Set<string>() });
  if (monthScopeRef.current.uid !== user?.uid || monthScopeRef.current.firestore !== firestore) {
    monthScopeRef.current = { uid: user?.uid, firestore, epoch: 0, active: true, requested: new Set() };
  }
  const monthScope = monthScopeRef.current;
  const [monthCache, setMonthCache] = useState(() => ({ scope: monthScope, activities: new Map<string, Activity[]>(), loaded: new Set<string>(), failed: new Set<string>() }));
  // Gate the first render too: effects have not cleared the previous owner's state yet.
  const activitiesByMonth = useMemo(() => monthCache.scope === monthScope ? monthCache.activities : new Map<string, Activity[]>(), [monthCache, monthScope]);
  const loadedMonths = monthCache.scope === monthScope ? monthCache.loaded : new Set<string>();
  const failedMonths = monthCache.scope === monthScope ? monthCache.failed : new Set<string>();
  useEffect(() => {
    monthScope.active = true;
    monthScope.requested.clear();
    setMonthCache({ scope: monthScope, activities: new Map(), loaded: new Set(), failed: new Set() });
    return () => { monthScope.active = false; monthScope.epoch += 1; };
  }, [monthScope]);

  // 월 경계 양쪽 하루의 대표 후보만 함께 읽는다. 월당 한 쿼리와 재방문 캐시는 유지한다.
  const loadMonth = useCallback(
    async (year: number, month: number) => {
      if (!user) return;
      const scope = monthScopeRef.current;
      const epoch = scope.epoch;
      const current = () => scope.active && monthScopeRef.current === scope && scope.epoch === epoch;
      if (scope.uid !== user.uid || scope.firestore !== firestore || !current()) return;
      const key = monthKey(year, month);
      if (scope.requested.has(key)) return;
      scope.requested.add(key);
      setMonthCache(prev => {
        if (prev.scope !== scope) return prev;
        const failed = new Set(prev.failed); failed.delete(key);
        return { ...prev, failed };
      });
      try {
        const { start, end } = planMonthBounds(year, month);
        const q = query(
          collection(firestore, "activities"),
          where("deletedAt", "==", null),
          where("userId", "==", user.uid),
          where("startTime", ">=", start - 86400000),
          where("startTime", "<=", end + 86400000),
          orderBy("startTime", "desc"),
        );
        const snap = await getDocs(q);
        if (!current()) return;
        const acts = snap.docs.map((d) => {
          const activity = { id: d.id, ...d.data() } as Activity;
          // 렌더링용 빈 요약은 측정값 0을 만들지 않는다. 누락 부하는 unknown으로 남는다.
          return { ...activity, summary: activity.summary ?? {} as Activity["summary"] };
        });
        setMonthCache(prev => prev.scope === scope && current() ? { ...prev, activities: new Map(prev.activities).set(key, acts), loaded: new Set(prev.loaded).add(key) } : prev);
      } catch (err) {
        if (!current()) return;
        scope.requested.delete(key); // 실패 시 재시도 허용
        setMonthCache(prev => prev.scope === scope && current() ? { ...prev, loaded: new Set(prev.loaded).add(key), failed: new Set(prev.failed).add(key) } : prev);
        logClientError("TrainingLogPage.loadActivities", err, { key });
      }
    },
    [user, firestore],
  );

  // 선택 월 변경 시 해당 월 + 직전 월(이전 탐색·모바일 최근 탭 대비) 로드
  useEffect(() => {
    if (!user) return;
    const { year, month } = selectedMonth;
    const prev = month - 1 < 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
    loadMonth(year, month);
    loadMonth(prev.year, prev.month);
  }, [user, selectedMonth, loadMonth]);


  const requestedDate = importParams.get("day") ?? importParams.get("date");
  useEffect(() => {
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    const date = new Date(`${requestedDate}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || dateToKey(date) !== requestedDate) return;
    setSelectedMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  }, [requestedDate]);
  const sportFilter = requestedSport && isSportUiEnabled(requestedSport) && (requestedSport === "bike" || requestedSport === "run" || requestedSport === "swim") ? requestedSport : "all";
  useEffect(() => {
    if (requestedSport == null || requestedSport === sportFilter) return;
    const next = new URLSearchParams(importParams);
    next.set("sport", sportFilter);
    setImportParams(next, { replace: true });
  }, [requestedSport, sportFilter, importParams, setImportParams]);
  const planOverlay = usePlanRecordOverlay(user?.uid, sportFilter);
  const planByMonth = planOverlay.plans;
  const setSportFilter = (sport: string) => {
    const next = new URLSearchParams(importParams);
    next.set("sport", sport);
    setImportParams(next, { replace: true });
  };

  const visiblePlans = useMemo(() => new Map([...planByMonth].flatMap(([date, plans]) => {
    const matching = sportFilter === "all" ? plans : plans.filter((plan) => plan.discipline === sportFilter);
    return matching.length ? [[date, matching] as const] : [];
  })), [planByMonth, sportFilter]);

  // 인접 월 후보가 겹치므로 원본 ID당 한 번만 자식/모바일 뷰에 전달한다.
  const activities = useMemo(() => {
    const all = new Map<string, Activity>();
    for (const arr of activitiesByMonth.values()) for (const activity of arr) all.set(activity.id, activity);
    return [...all.values()];
  }, [activitiesByMonth]);

  // 선택 월이 아직 안 들어왔으면 로딩 표시 — 캐시된 월 재방문은 즉시 (스피너 없음)
  const selectedMonthKey = monthKey(selectedMonth.year, selectedMonth.month);
  const selectedMonthCandidates = useMemo(() => activitiesByMonth.get(selectedMonthKey) ?? [], [activitiesByMonth, selectedMonthKey]);
  const representativeState = useActivityRepresentatives(selectedMonthCandidates, user?.uid, activities);
  const monthCandidates = useMemo(() => withActivityRepresentatives(
    activitiesByMonth.get(selectedMonthKey) ?? [], representativeState.representatives, user?.uid ?? "",
  ), [activitiesByMonth, selectedMonthKey, representativeState.representatives, user?.uid]);
  const loading = user ? !loadedMonths.has(selectedMonthKey) || representativeState.loading : false;
  const loadError = failedMonths.has(selectedMonthKey) || representativeState.error;
  const retryMonth = () => {
    representativeState.retry();
    monthScope.requested.delete(selectedMonthKey);
    setMonthCache(prev => {
      if (prev.scope !== monthScope) return prev;
      const loaded = new Set(prev.loaded), failed = new Set(prev.failed);
      loaded.delete(selectedMonthKey); failed.delete(selectedMonthKey);
      return { ...prev, loaded, failed };
    });
    void loadMonth(selectedMonth.year, selectedMonth.month);
  };

  const todayKey = useMemo(() => msToDateKey(Date.now()), []);

  // 본인 활동만 + 월 범위 필터
  const { monthStart, monthEnd } = useMemo(() => ({
    monthStart: planMonthBounds(selectedMonth.year, selectedMonth.month).start,
    monthEnd: planMonthBounds(selectedMonth.year, selectedMonth.month).end,
  }), [selectedMonth.year, selectedMonth.month]);


  const monthActivities = useMemo(
    () => activities.filter((a) => a.startTime >= monthStart && a.startTime <= monthEnd && (!user || a.userId === user.uid)
      && (sportFilter === "all" || getDiscipline(a.type) === sportFilter)),
    [activities, monthStart, monthEnd, user, sportFilter],
  );

  // 선택 월의 고정 후보에서 대표를 골라 다른 월 방문으로 합계가 변하지 않게 한다.
  const monthLoadActivities = useMemo(() => acceptedPhysicalActivities(
    monthCandidates.filter((a) => !user || a.userId === user.uid), ftp,
  ).filter((a) => a.startTime >= monthStart && a.startTime <= monthEnd
    && (sportFilter === "all" || getDiscipline(a.type) === sportFilter)),
  [monthCandidates, user, ftp, monthStart, monthEnd, sportFilter]);
  const loadByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of monthLoadActivities) {
      const key = msToDateKey(activity.startTime);
      const members = map.get(key) ?? [];
      members.push(activity);
      map.set(key, members);
    }
    return map;
  }, [monthLoadActivities]);

  // 원본 기록 목록은 유지하고 합계만 실주행 대표로 계산한다.
  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of monthActivities) {
      const key = msToDateKey(activity.startTime);
      map.set(key, [...(map.get(key) ?? []), activity]);
    }
    return map;
  }, [monthActivities]);

  // 캘린더 그리드
  const calendar = useMemo(
    () => getMonthCalendar(selectedMonth.year, selectedMonth.month),
    [selectedMonth],
  );

  // KPI
  const kpi = useMemo(() => {
    const totalDist = monthLoadActivities.reduce((s, a) => s + finiteMetric(a.summary.distance), 0);
    const totalTime = monthLoadActivities.reduce((s, a) => s + finiteMetric(a.summary.ridingTimeMillis), 0);
    const totalElev = monthLoadActivities.reduce((s, a) => s + finiteMetric(a.summary.elevationGain), 0);
    const totalLoad = sumAcceptedActivityTss(monthLoadActivities, ftp);
    return {
      dist: totalDist / 1000,
      time: totalTime,
      elev: Math.round(totalElev),
      count: monthLoadActivities.length,
      tss: totalLoad.value,
      tssEstimated: totalLoad.estimated,
      tssUnknownCount: totalLoad.unknownCount,
    };
  }, [monthLoadActivities, ftp]);

  // 월간 일별 바 차트 데이터 (1일~말일)
  const daysInMonth = new Date(Date.UTC(selectedMonth.year, selectedMonth.month + 1, 0)).getUTCDate();
  const barValues = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const key = dateToKey(new Date(Date.UTC(selectedMonth.year, selectedMonth.month, i + 1)));
        const acts = loadByDay.get(key) ?? [];
        return acts.reduce((s, a) => s + finiteMetric(a.summary.distance) / 1000, 0);
      }),
    [loadByDay, daysInMonth, selectedMonth],
  );
  const barLabels = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth],
  );

  // 네비게이션
  const isThisMonth =
    selectedMonth.year === today.getUTCFullYear() && selectedMonth.month === today.getUTCMonth();

  const changeMonth = (year: number, month: number, day = 1) => {
    const next = new URLSearchParams(importParams);
    next.delete("day");
    next.delete("detail");
    next.set("date", dateToKey(new Date(Date.UTC(year, month, day))));
    setSelectedMonth({ year, month });
    setImportParams(next);
  };
  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(selectedMonth.year, selectedMonth.month + delta, 1));
    changeMonth(next.getUTCFullYear(), next.getUTCMonth());
  };
  const goPrevMonth = () => shiftMonth(-1);
  const goNextMonth = () => shiftMonth(1);

  const selectedMonthPrefix = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}-`;
  const validRequestedDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    && Number.isFinite(Date.parse(`${requestedDate}T00:00:00Z`))
    && dateToKey(new Date(`${requestedDate}T00:00:00Z`)) === requestedDate;
  const recordDate = validRequestedDate && requestedDate.startsWith(selectedMonthPrefix)
    ? requestedDate : `${selectedMonthPrefix}01`;

  const monthLabel = t("log.monthLabel", { year: selectedMonth.year, month: selectedMonth.month + 1 });

  const [importOpen, setImportOpen] = useState(importParams.get("import") === "1");
  useEffect(() => { if (importParams.get("import") === "1") setImportOpen(true); }, [importParams]);
  const closeImport = () => { setImportOpen(false); const next = new URLSearchParams(importParams); next.delete("import"); setImportParams(next, { replace: true }); };

  const isMobile = useMobile();
  const [isNarrowLayout, setIsNarrowLayout] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setIsNarrowLayout(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  const fitnessReturn = comparisonState?.fitnessPeriodReturn;
  const safeFitnessReturn = fitnessReturn?.uid === user?.uid && typeof fitnessReturn?.pathname === "string" && /^\/(?:ko\/|en\/)?coach\/(?:analysis|condition)$/.test(fitnessReturn.pathname) && typeof fitnessReturn.search === "string" && typeof fitnessReturn.hash === "string" ? fitnessReturn : null;
  const fitnessPeriodReturnLink = safeFitnessReturn && <LocalizedLink to={safeFitnessReturn}>{t("fitness:periodLoad.return")}</LocalizedLink>;
  const planRecordHeader = <>{!(isMobile || isNarrowLayout) && fitnessPeriodReturnLink}<PlanPeriodReturn />
    <PlanRecordNavigation date={recordDate} />
    <div style={{ marginBottom: "var(--space-3)" }}>
      <Text as="p" variant="caption" tone="secondary" role={planOverlay.state === "error" ? "alert" : planOverlay.state === "loading" ? "status" : undefined}>{t(planOverlay.state === "error" ? "planRecords.error" : planOverlay.state === "loading" ? "planRecords.loading" : planOverlay.plans.size ? "planRecords.scope" : "planRecords.empty")}</Text>
      {planOverlay.state === "error" && <Button variant="secondary" size="sm" onClick={planOverlay.retry}>{tCommon("button.retry")}</Button>}
    </div>
  </>;

  if (!user) {
    return <GuestValuePreview kind="log" lang={i18n.language} />;
  }

  if (isMobile || isNarrowLayout) {
    if (failedMonths.has(selectedMonthKey)) {
      return (
        <div style={{ padding: "var(--space-4)" }}>
          {planRecordHeader}
          <ErrorState title={tCommon("error.title")} onRetry={retryMonth} />
        </div>
      );
    }
    return (
      <>
      {planRecordHeader}
      {representativeState.error && <ErrorState title={tCommon("error.title")} onRetry={representativeState.retry} compact />}
      <MobileLogPage
        periodReturnSlot={fitnessPeriodReturnLink}
        recentSummarySlot={isMobile && !user.isAnonymous ? <RecentActivitySummary key={user.uid} sport={sportFilter} /> : undefined}
        plannedDates={[...visiblePlans.keys()]}
        plansByDate={Object.fromEntries(visiblePlans)}
        planState={planOverlay.state}
        onRetryPlan={planOverlay.retry}
        plannedSports={Object.fromEntries([...visiblePlans].map(([date, plans]) => [date, plans[0]?.discipline ?? "bike"]))}
        ftp={ftp}
        activities={activities}
        representativeCandidates={monthCandidates}
        year={selectedMonth.year}
        month={selectedMonth.month}
        loading={!loadedMonths.has(selectedMonthKey)}
        aggregateUnavailable={representativeState.loading || representativeState.error}
        onChangeMonth={shiftMonth}
      />
      </>
    );
  }

  return (
    <div className="training-log-page">
      {planRecordHeader}

      {/* ── 헤더 ───────────────────────────────────────────────── */}
      <header data-testid="P1-1" className="training-log-header">
        <div className="training-log-heading">
          <Text as="h1" variant="title" style={{ margin: 0 }}>{t("page.logTitle")}</Text>
          <Text as="span" variant="caption" tone="secondary">{t("page.logActivities", { count: kpi.count })}</Text>
        </div>
        <ToggleControls aria-label={tCommon("discipline.selectAria")}>
          {["all", "bike", "run", "swim"].filter(isSportUiEnabled).map(sport => <ToggleButton key={sport} selected={sportFilter === sport} onClick={() => setSportFilter(sport)}>{tCommon(sport === "all" ? "label.all" : `sportFilter.${sport}`)}</ToggleButton>)}
        </ToggleControls>
        <div className="training-log-notes">
          <Text as="p" variant="caption" tone="secondary">{t("log.recordBasis")}</Text>
          {kpi.tssEstimated && <Text as="p" variant="caption" tone="secondary">{t("log.estimateBasis")}</Text>}
        </div>
        <div data-testid="P1-1-1" className="training-log-metrics">
          {[
            { label: t("page.logTotalDistance"), value: `${kpi.dist.toFixed(1)}`, unit: "km", color: "var(--aqua)" },
            { label: t("page.logTotalTime"), value: formatDuration(kpi.time), unit: null, color: "var(--ink-0)" },
            { label: t("page.logTotalElevation"), value: `${kpi.elev}`, unit: "m", color: "var(--amber)" },
            // 추정치가 섞였으면 밝힌다 — 서버 사전계산값과 구분되지 않으면 안 된다 (#2237).
            { label: t("page.logTotalTSS"), value: kpi.tss == null ? "–" : `${kpi.tss}`, unit: kpi.tssUnknownCount > 0 ? t("log.loadPartial", { count: kpi.tssUnknownCount }) : kpi.tssEstimated ? t("page.tssEstimatedIncluded") : null, color: "var(--rose)" },
            { label: t("page.logActivityCount"), value: `${kpi.count}`, unit: t("page.logActivityUnit"), color: "var(--lime)" },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="training-log-metric">
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}><GlossaryText>{label}</GlossaryText></Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)" }}>
                <Text variant="dataLarge" style={{ color }}>{loading || loadError ? "–" : value}</Text>
                {!loading && !loadError && unit && <Text variant="unit">{unit}</Text>}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* ── 바디 ───────────────────────────────────────────────────── */}
      <div data-testid="P1-0" className="training-log-body">

        {/* 월 네비게이션 */}
        <div className="training-log-month-nav">
          <Button variant="ghost" size="sm" data-testid="P1-0-1" onClick={goPrevMonth}>
            {t("page.prevMonth")}
          </Button>
          <span
            style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              color: "var(--ink-0)",
              fontFamily: "var(--font-mono)",
              flex: 1,
              textAlign: "center",
            }}
          >
            {monthLabel}
          </span>
          <Button variant="ghost" size="sm"
            onClick={goNextMonth}
            disabled={isThisMonth}
            style={{ opacity: isThisMonth ? 0.4 : 1 }}
          >
            {t("page.nextMonth")}
          </Button>
          <Button variant="outline" size="sm" leadingIcon={<Upload size={ICON_SIZE.md} aria-hidden="true" />} onClick={() => setImportOpen(true)}>{t("page.import")}</Button>
          {!isThisMonth && (
            <Button variant="ghost" size="sm"
              onClick={() =>
                changeMonth(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
              }
            >
              {t("page.currentMonth")}
            </Button>
          )}
        </div>

        {requestedDate && validRequestedDate && (visiblePlans.has(requestedDate) || importParams.has("day") || importParams.get("detail") === "record-day") && <CoachDetailSection id="record-day" requested={importParams.get("detail") == null} title={t("planRecords.dayTitle", { date: requestedDate })}>
          <PlanRecordEvidence date={requestedDate} plans={visiblePlans.get(requestedDate) ?? []} />
          {loading ? <Text role="status">{tCommon("button.loading")}</Text> : loadError ? <ErrorState title={tCommon("error.title")} onRetry={retryMonth} compact /> : <>
            {(byDay.get(requestedDate) ?? []).map(activity => {
              const load = estimateActivityTss(activity, ftp);
              return <div key={activity.id}><LocalizedLink to={`/activity/${encodeURIComponent(activity.id)}`} className={buttonClass({ variant: "ghost", size: "sm" })}>{t("today.viewActivity")} · {new Date(activity.startTime).toLocaleTimeString(i18n.language)} · {load.value == null ? "—" : load.value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} TSS{load.estimated ? ` · ${t("page.tssEstimated")}` : ""}</LocalizedLink>{typeof comparisonState?.periodEvidence?.uid === "string" && comparisonState.periodEvidence.uid === user?.uid && comparisonState.periodEvidence.date === requestedDate && <Text as="p" variant="caption" tone="secondary">{t(comparisonState.periodEvidence.activityIds?.includes(activity.id) ? "loadComparison.representativeIncluded" : "loadComparison.representativeOriginal")}</Text>}</div>;
            })}
            {!byDay.get(requestedDate)?.length && <Text as="p">{t("planRecords.noActivity")}</Text>}
          </>}
        </CoachDetailSection>}

        {/* 캘린더 그리드 */}
        <Card data-testid="P1-2" padding="none" className="training-log-calendar" style={LOG_CALENDAR_CARD_STYLE}>
          {/* 요일 헤더 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: LOG_WEEK_GRID_COLUMNS,
              padding: "var(--space-2)",
              borderBottom: "1px solid var(--line-soft)",
              background: "var(--bg-2)",
              gap: "var(--space-1)",
            }}
          >
            {(t("log.dayNames", { returnObjects: true }) as string[]).map((d, i) => (
              <Text
                key={d} as="div" variant="eyebrow"
                style={{
                  textAlign: "center",
                  color: i >= 5 ? "var(--ink-2)" : "var(--ink-3)",
                }}
              >
                {d}
              </Text>
            ))}
            <Text as="div" variant="eyebrow" style={{ textAlign: "center" }}><GlossaryText>{t("page.weekTSSLabel")}</GlossaryText></Text>
          </div>

          {/* 주별 행 */}
          <div style={{ padding: "var(--space-2)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {loadError
              ? (
                  <div style={{ padding: "var(--space-4)" }}>
                    <ErrorState title={tCommon("error.title")} onRetry={retryMonth} compact />
                  </div>
                )
              : loading
              ? Array.from({ length: 5 }).map((_, wi) => (
                  <div
                    key={wi}
                    style={{
                      display: "grid",
                      gridTemplateColumns: LOG_WEEK_GRID_COLUMNS,
                      gap: "var(--space-1)",
                    }}
                  >
                    {Array.from({ length: 7 }).map((__, di) => (
                      <div
                        key={di}
                        style={{
                          height: 56,
                          background: "var(--bg-2)",
                          borderRadius: "var(--r-sm)",
                          opacity: 0.3,
                        }}
                      />
                    ))}
                  </div>
                ))
              : calendar.map((week) => {
                  // 주간 TSS 합계
                  const weekLoad = sumAcceptedActivityTss(
                    week.flatMap((cell) => loadByDay.get(dateToKey(cell.date)) ?? []), ftp,
                  );
                  return (
                  <div
                    key={dateToKey(week[0]!.date)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: LOG_WEEK_GRID_COLUMNS,
                      gap: "var(--space-1)",
                      alignItems: "stretch",
                    }}
                  >
                    {week.map((cell) => {
                      const key = dateToKey(cell.date);
                      const acts = byDay.get(key) ?? [];
                      const plans = visiblePlans.get(key) ?? [];
                      const isToday = key === todayKey;
                      return (
                        <LogDayCell
                          ftp={ftp}
                          key={key}
                          activities={acts}
                          loadActivities={loadByDay.get(key) ?? []}
                          plans={plans}
                          isToday={isToday}
                          isCurrentMonth={cell.isCurrentMonth}
                          dayNum={cell.date.getUTCDate()}
                          dateKey={key}
                          todayKey={todayKey}
                        />
                      );
                    })}
                    {/* 주간 TSS */}
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: (weekLoad.value ?? 0) > 0 ? "var(--ink-1)" : "var(--ink-4)",
                      borderLeft: "1px solid var(--line-soft)", paddingLeft: "var(--space-1)", minWidth: 0, overflowWrap: "anywhere",
                    }}>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: "var(--space-0-5)" }}><GlossaryText>TSS</GlossaryText></div>
                      <div>{weekLoad.value == null ? "–" : weekLoad.value}{weekLoad.estimated ? t("page.tssEstimated") : ""}</div>
                      {weekLoad.unknownCount > 0 && <Text variant="caption">{t("log.loadPartial", { count: weekLoad.unknownCount })}</Text>}
                    </div>
                  </div>
                  );
                })}
          </div>
        </Card>

        {/* 월간 일별 거리 바 */}
        {!loading && !loadError && <Card padding="none" className="training-log-distance-chart" style={{ padding: "var(--space-4)" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("page.monthlyBarTitle")}</Text>
          <MiniBarChart values={barValues} labels={barLabels} unit="km" />
          <div
            style={{
              marginTop: "var(--space-1-5)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--fs-xs)",
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {barValues.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                {v > 0 ? v.toFixed(0) : ""}
              </div>
            ))}
          </div>
        </Card>}

      </div>
      <ImportActivityModal open={importOpen} onClose={closeImport} />
    </div>
  );
}
