import "./TrainingLogPage.css";
import { isSportUiEnabled } from "../config/sportFeatures";
import { useActivityRepresentatives, withActivityRepresentatives } from "../hooks/useActivityRepresentatives";
import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useSearchParams } from "react-router-dom";
import GlossaryText from "../components/common/GlossaryText";
import { Upload } from "lucide-react";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import type { PlanDay, PlanWeek } from "@shared/types/goal";
import { useMobile } from "../hooks/useMobile";
import MobileLogPage from "../components/mobile/MobileLogPage";
import RecentActivitySummary from "../components/activity/RecentActivitySummary";
import ImportActivityModal from "../components/mobile/ImportActivityModal";
import { getDiscipline } from "../utils/disciplineFilter";
import { acceptedPhysicalActivities, estimateActivityTss, sumAcceptedActivityTss } from "../utils/estimateTSS";
import { planDayKey, planCalendarDate, planMonthBounds } from "@shared/training/planDate";
import { Button, Card, Text, ToggleControls, ToggleButton } from "../theme/components";
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

interface PlanGhost {
  discipline: "bike" | "run" | "swim";
  workout: PlanDay["workout"];
  plannedTSS: number;
  plannedDurationMin: number;
}

function effectivePlanTSS(day: PlanDay): number {
  return day.adjustedTSS ?? day.plannedTSS ?? 0;
}

function effectivePlanDuration(day: PlanDay): number {
  return day.adjustedDurationMin ?? day.plannedDurationMin ?? 0;
}

function LogDayCell({ activities, loadActivities, plans, isToday, isCurrentMonth, dayNum, dateKey, todayKey, ftp }: LogDayCellProps) {
  const navigate = useNavigate();
  const { t } = useTranslation("training");
  const [expanded, setExpanded] = useState(false);
  const hasAct = activities.length > 0;
  const hasPlan = plans.length > 0;
  const single = activities.length === 1;
  const plannedTSS = plans.reduce((sum, plan) => sum + plan.plannedTSS, 0);
  // 계획 대비 달성 비교용 내부 수치 — 아는 값만 더한다(모르는 활동은 0 으로 세지 않는다).
  const actualLoad = sumAcceptedActivityTss(loadActivities, ftp);
  const actualTSS = actualLoad.value;
  const adherence =
    !hasPlan ? null :
    hasAct ? (actualLoad.unknownCount > 0 || actualTSS === null ? "unknown"
      : actualLoad.estimated ? "estimated" : actualTSS >= plannedTSS * 0.8 ? "hit" : "under") :
    dateKey < todayKey ? "missed" : "planned";
  const adherenceLabel = adherence === "hit" ? "✓" : adherence === "under" ? "△" : adherence === "missed" ? "!" : adherence === "unknown" ? "?" : adherence === "estimated" ? "~" : "";

  // 활동 정렬 — 시작 시각 빠른 순
  const sorted = [...activities].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  const visible = expanded ? sorted : sorted.slice(0, 2);
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
        return (
          <button
            type="button"
            data-testid="P1-2-2" onClick={() => navigate(`/coach/plan?sport=${plan.discipline}&date=${dateKey}`)}
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
            {index === 0 && adherenceLabel && (
              <span aria-label={adherence === "unknown" ? t("log.loadUnknown") : adherence === "estimated" ? t("page.tssEstimated") : undefined} style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {adherenceLabel}
              </span>
            )}
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
      {hiddenCount > 0 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
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
  const { t, i18n } = useTranslation("training");
  const { t: tCommon } = useTranslation("common");
  const { user, profile } = useAuth();
  const ftp = profile?.ftp ?? undefined;
  const today = planCalendarDate(Date.now());
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth(),
  });

  // 월별 캐시 — 본 적 있는 달은 재요청하지 않는다 (Firestore 읽기 절감 + 즉시 표시)
  const [activitiesByMonth, setActivitiesByMonth] = useState<Map<string, Activity[]>>(new Map());
  const [planByMonth, setPlanByMonth] = useState<Map<string, PlanGhost[]>>(new Map());
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [failedMonths, setFailedMonths] = useState<Set<string>>(new Set());
  const requestedMonths = useRef<Set<string>>(new Set()); // 진행 중 + 완료 가드 (중복 페치 방지)

  // 유저 전환 시 캐시 리셋
  useEffect(() => {
    requestedMonths.current = new Set();
    setActivitiesByMonth(new Map());
    setPlanByMonth(new Map());
    setLoadedMonths(new Set());
    setFailedMonths(new Set());
  }, [user?.uid]);

  // 월 경계 양쪽 하루의 대표 후보만 함께 읽는다. 월당 한 쿼리와 재방문 캐시는 유지한다.
  const loadMonth = useCallback(
    async (year: number, month: number) => {
      if (!user) return;
      const key = monthKey(year, month);
      if (requestedMonths.current.has(key)) return; // 이미 로드했거나 진행 중
      requestedMonths.current.add(key);
      setFailedMonths((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
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
        const acts = snap.docs.map((d) => {
          const activity = { id: d.id, ...d.data() } as Activity;
          // 렌더링용 빈 요약은 측정값 0을 만들지 않는다. 누락 부하는 unknown으로 남는다.
          return { ...activity, summary: activity.summary ?? {} as Activity["summary"] };
        });
        setActivitiesByMonth((prev) => new Map(prev).set(key, acts));
        setLoadedMonths((prev) => new Set(prev).add(key));
      } catch (err) {
        requestedMonths.current.delete(key); // 실패 시 재시도 허용
        setLoadedMonths((prev) => new Set(prev).add(key));
        setFailedMonths((prev) => new Set(prev).add(key));
        logClientError("TrainingLogPage.loadActivities", err, { key });
      }
    },
    [user],
  );

  // 선택 월 변경 시 해당 월 + 직전 월(이전 탐색·모바일 최근 탭 대비) 로드
  useEffect(() => {
    if (!user) return;
    const { year, month } = selectedMonth;
    const prev = month - 1 < 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
    loadMonth(year, month);
    loadMonth(prev.year, prev.month);
  }, [user, selectedMonth, loadMonth]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    async function loadPlan() {
      try {
        const goalSnap = await getDocs(
          query(
            collection(firestore, "goals"),
            where("userId", "==", uid),
            where("status", "==", "active"),
            limit(1),
          ),
        );
        if (cancelled || goalSnap.empty) {
          if (!cancelled) setPlanByMonth(new Map());
          return;
        }

        const goalId = goalSnap.docs[0]!.id;
        const goalSport = goalSnap.docs[0]!.data().discipline;
        const discipline = goalSport === "run" || goalSport === "swim" ? goalSport : "bike";
        const planSnap = await getDocs(
          query(collection(firestore, "goals", goalId, "plan"), orderBy("weekNumber")),
        );
        if (cancelled) return;

        const next = new Map<string, PlanGhost[]>();
        for (const docSnap of planSnap.docs) {
          const week = { id: docSnap.id, ...docSnap.data() } as PlanWeek;
          for (const day of week.days ?? []) {
            if (day.workout === "rest" || day.skipped) continue;
            const key = msToDateKey(day.date);
            const plannedTSS = Math.round(effectivePlanTSS(day));
            if (plannedTSS <= 0) continue;
            const plans = next.get(key) ?? [];
            plans.push({
              discipline,
              workout: day.workout,
              plannedTSS,
              plannedDurationMin: Math.round(effectivePlanDuration(day)),
            });
            next.set(key, plans);
          }
        }
        setPlanByMonth(next);
      } catch (err) {
        setPlanByMonth(new Map());
        logClientError("TrainingLogPage.loadPlanOverlay", err, {});
      }
    }
    void loadPlan();
    return () => { cancelled = true; };
  }, [user]);

  const [importParams, setImportParams] = useSearchParams();
  const requestedSport = importParams.get("sport");
  const sportFilter = requestedSport && isSportUiEnabled(requestedSport) && (requestedSport === "bike" || requestedSport === "run" || requestedSport === "swim") ? requestedSport : "all";
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
    requestedMonths.current.delete(selectedMonthKey);
    setLoadedMonths((prev) => {
      const next = new Set(prev);
      next.delete(selectedMonthKey);
      return next;
    });
    setFailedMonths((prev) => {
      const next = new Set(prev);
      next.delete(selectedMonthKey);
      return next;
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

  const goPrevMonth = () => {
    setSelectedMonth((prev) => {
      const m = prev.month - 1;
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
    });
  };

  const goNextMonth = () => {
    setSelectedMonth((prev) => {
      const m = prev.month + 1;
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
    });
  };

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

  if (!user) {
    return <GuestValuePreview kind="log" lang={i18n.language} />;
  }

  if (isMobile || isNarrowLayout) {
    if (failedMonths.has(selectedMonthKey)) {
      return (
        <div style={{ padding: "var(--space-4)" }}>
          <ErrorState title={tCommon("error.title")} onRetry={retryMonth} />
        </div>
      );
    }
    return (
      <>
      {representativeState.error && <ErrorState title={tCommon("error.title")} onRetry={representativeState.retry} compact />}
      <MobileLogPage
        recentSummarySlot={isMobile && !user.isAnonymous ? <RecentActivitySummary key={user.uid} sport={sportFilter} /> : undefined}
        plannedDates={[...visiblePlans.keys()]}
        plannedSports={Object.fromEntries([...visiblePlans].map(([date, plans]) => [date, plans[0]?.discipline ?? "bike"]))}
        ftp={ftp}
        activities={activities}
        representativeCandidates={monthCandidates}
        year={selectedMonth.year}
        month={selectedMonth.month}
        loading={!loadedMonths.has(selectedMonthKey)}
        aggregateUnavailable={representativeState.loading || representativeState.error}
        onChangeMonth={(delta) => {
          setSelectedMonth((prev) => {
            let m = prev.month + delta;
            let y = prev.year;
            if (m < 0) { m = 11; y--; }
            if (m > 11) { m = 0; y++; }
            return { year: y, month: m };
          });
        }}
      />
      </>
    );
  }

  return (
    <div className="training-log-page">

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
                setSelectedMonth({ year: today.getUTCFullYear(), month: today.getUTCMonth() })
              }
            >
              {t("page.currentMonth")}
            </Button>
          )}
        </div>

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
