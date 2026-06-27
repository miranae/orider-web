import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { Upload } from "lucide-react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Activity } from "@shared/types";
import { useMobile } from "../hooks/useMobile";
import MobileLogPage from "../components/mobile/MobileLogPage";
import ImportActivityModal from "../components/mobile/ImportActivityModal";
import { estimateTSS } from "../utils/estimateTSS";
import { getSportIcon } from "../utils/sportType";
import { Button, Card, Text } from "../theme/components";

// ── 날짜 유틸 ─────────────────────────────────────────────────────────

function msToDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dateToKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const mondayOffset = startDow === 0 ? -6 : 1 - startDow;
  const calStart = new Date(year, month, 1 + mondayOffset);

  const weeks: CalCell[][] = [];
  const current = new Date(calStart);
  for (let w = 0; w < 6; w++) {
    const week: CalCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        date: new Date(current),
        isCurrentMonth: current.getMonth() === month,
      });
      current.setDate(current.getDate() + 1);
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
  isToday: boolean;
  isCurrentMonth: boolean;
  dayNum: number;
}

function LogDayCell({ activities, isToday, isCurrentMonth, dayNum }: LogDayCellProps) {
  const navigate = useNavigate();
  const { t } = useTranslation("training");
  const hasAct = activities.length > 0;
  const single = activities.length === 1;

  // 활동 정렬 — 시작 시각 빠른 순
  const sorted = [...activities].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  const fmtTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const handleCellClick = () => {
    if (!single) return; // 다중 활동은 행 단위 선택만 허용
    const first = sorted[0];
    if (first) navigate(`/activity/${first.id}`);
  };

  return (
    <div
      onClick={hasAct ? handleCellClick : undefined}
      style={{
        minHeight: 66,
        padding: "5px 6px",
        borderRadius: 4,
        background: "var(--bg-2)",
        border: `1px solid ${isToday ? "var(--lime)" : "var(--line-soft)"}`,
        opacity: isCurrentMonth ? 1 : 0.2,
        cursor: single ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        position: "relative",
      }}
      onMouseEnter={(e) => { if (single) e.currentTarget.style.background = "var(--bg-3)"; }}
      onMouseLeave={(e) => { if (single) e.currentTarget.style.background = "var(--bg-2)"; }}
    >
      {/* 날짜 숫자 + 다중 활동 인디케이터 */}
      <div className="flex items-center" style={{ gap: 'var(--space-1)' }}>
        <span
          style={{
            fontSize: 12, fontFamily: "var(--font-mono)",
            color: isToday ? "var(--lime)" : "var(--ink-3)",
            fontWeight: isToday ? 700 : 400, lineHeight: 1,
          }}
        >
          {dayNum}
        </span>
        {!single && hasAct && (
          <span
            aria-label={t("log.activitiesCount", { count: activities.length })}
            title={t("log.activitiesCountTitle", { count: activities.length })}
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "var(--ink-3)",
              lineHeight: 1,
              padding: "1px 4px",
              borderRadius: 3,
              background: "var(--bg-3)",
            }}
          >
            ×{activities.length}
          </span>
        )}
      </div>

      {/* 활동 목록 — 각 행이 개별 클릭 영역 */}
      {sorted.map((a) => {
        const icon = getSportIcon(a.type);
        const color = sportColor(a.type);
        const tss = Math.round(estimateTSS(a));
        return (
          <button
            key={a.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/activity/${a.id}`);
            }}
            title={`${fmtTime(a.startTime)} · ${formatActivityDist(a)}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              color,
              padding: "1px 2px",
              borderRadius: 3,
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
            <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-0)", lineHeight: 1 }}>
              {formatActivityDist(a)}
            </span>
            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-3)", lineHeight: 1, marginLeft: "auto" }}>
              {tss}
            </span>
          </button>
        );
      })}
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
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }} onPointerLeave={() => setHoverIdx(null)}>
      {values.map((v, i) => (
        <div
          key={i}
          onPointerEnter={() => setHoverIdx(i)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
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
              fontSize: 8,
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
  const { t } = useTranslation("training");
  const { user } = useAuth();
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  // 월별 캐시 — 본 적 있는 달은 재요청하지 않는다 (Firestore 읽기 절감 + 즉시 표시)
  const [activitiesByMonth, setActivitiesByMonth] = useState<Map<string, Activity[]>>(new Map());
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const requestedMonths = useRef<Set<string>>(new Set()); // 진행 중 + 완료 가드 (중복 페치 방지)

  // 유저 전환 시 캐시 리셋
  useEffect(() => {
    requestedMonths.current = new Set();
    setActivitiesByMonth(new Map());
    setLoadedMonths(new Set());
  }, [user?.uid]);

  // 선택 월 범위만 로드 — 전체 이력 대신 캘린더가 보여주는 한 달치만 (startTime 인덱스 사용)
  const loadMonth = useCallback(
    async (year: number, month: number) => {
      if (!user) return;
      const key = monthKey(year, month);
      if (requestedMonths.current.has(key)) return; // 이미 로드했거나 진행 중
      requestedMonths.current.add(key);
      try {
        const start = new Date(year, month, 1).getTime();
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
        const q = query(
          collection(firestore, "activities"),
          where("deletedAt", "==", null),
          where("userId", "==", user.uid),
          where("startTime", ">=", start),
          where("startTime", "<=", end),
          orderBy("startTime", "desc"),
        );
        const snap = await getDocs(q);
        const acts = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.summary != null);
        setActivitiesByMonth((prev) => new Map(prev).set(key, acts));
        setLoadedMonths((prev) => new Set(prev).add(key));
      } catch (err) {
        requestedMonths.current.delete(key); // 실패 시 재시도 허용
        console.error("[TrainingLogPage] 활동 로드 실패:", err);
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

  // 캐시된 모든 월 활동 평탄화 (자식/모바일 뷰가 소비) — 월 범위는 서로 겹치지 않음
  const activities = useMemo(() => {
    const all: Activity[] = [];
    for (const arr of activitiesByMonth.values()) all.push(...arr);
    return all;
  }, [activitiesByMonth]);

  // 선택 월이 아직 안 들어왔으면 로딩 표시 — 캐시된 월 재방문은 즉시 (스피너 없음)
  const loading = user ? !loadedMonths.has(monthKey(selectedMonth.year, selectedMonth.month)) : false;

  const todayKey = useMemo(() => msToDateKey(Date.now()), []);

  // 본인 활동만 + 월 범위 필터
  const { monthStart, monthEnd } = useMemo(() => ({
    monthStart: new Date(selectedMonth.year, selectedMonth.month, 1).getTime(),
    monthEnd: new Date(selectedMonth.year, selectedMonth.month + 1, 0, 23, 59, 59).getTime(),
  }), [selectedMonth.year, selectedMonth.month]);


  const monthActivities = useMemo(
    () => activities.filter((a) => a.startTime >= monthStart && a.startTime <= monthEnd && (!user || a.userId === user.uid)),
    [activities, monthStart, monthEnd, user],
  );

  // 날짜별 그룹핑
  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const act of monthActivities) {
      const key = msToDateKey(act.startTime);
      const arr = map.get(key) ?? [];
      arr.push(act);
      map.set(key, arr);
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
    const totalDist = monthActivities.reduce((s, a) => s + a.summary.distance, 0);
    const totalTime = monthActivities.reduce((s, a) => s + a.summary.ridingTimeMillis, 0);
    const totalElev = monthActivities.reduce((s, a) => s + a.summary.elevationGain, 0);
    const totalTSS = Math.round(monthActivities.reduce((s, a) => s + estimateTSS(a), 0));
    return {
      dist: totalDist / 1000,
      time: totalTime,
      elev: Math.round(totalElev),
      count: monthActivities.length,
      tss: totalTSS,
    };
  }, [monthActivities]);

  // 월간 일별 바 차트 데이터 (1일~말일)
  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  const barValues = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const key = dateToKey(new Date(selectedMonth.year, selectedMonth.month, i + 1));
        const acts = byDay.get(key) ?? [];
        return acts.reduce((s, a) => s + a.summary.distance / 1000, 0);
      }),
    [byDay, daysInMonth, selectedMonth],
  );
  const barLabels = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth],
  );

  // 네비게이션
  const isThisMonth =
    selectedMonth.year === today.getFullYear() && selectedMonth.month === today.getMonth();

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

  const [importOpen, setImportOpen] = useState(false);

  const isMobile = useMobile();

  if (isMobile) {
    return (
      <MobileLogPage
        activities={activities}
        year={selectedMonth.year}
        month={selectedMonth.month}
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
    );
  }

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", paddingBottom: 'var(--space-8)' }}>

      {/* ── 헤더 ───────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--line-soft)", padding: "20px 0 16px" }}>
        <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("page.logTitle")} · {t("page.logActivities", { count: kpi.count })}</Text>
        <Card padding="none" style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {[
            { label: t("page.logTotalDistance"), value: `${kpi.dist.toFixed(1)}`, unit: "km", color: "var(--aqua)" },
            { label: t("page.logTotalTime"), value: formatDuration(kpi.time), unit: null, color: "var(--ink-0)" },
            { label: t("page.logTotalElevation"), value: `${kpi.elev}`, unit: "m", color: "var(--amber)" },
            { label: t("page.logTotalTSS"), value: `${kpi.tss}`, unit: null, color: "var(--rose)" },
            { label: t("page.logActivityCount"), value: `${kpi.count}`, unit: t("page.logActivityUnit"), color: "var(--lime)" },
          ].map(({ label, value, unit, color }, i) => (
            <div key={label} style={{ padding: "14px 16px", borderRight: i < 4 ? "1px solid var(--line-soft)" : "none" }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{label}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <Text variant="dataLarge" style={{ color }}>{value}</Text>
                {unit && <Text variant="unit">{unit}</Text>}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ── 바디 ───────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 0 0" }}>

        {/* 월 네비게이션 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 'var(--space-3)',
            marginBottom: 14,
          }}
        >
          <Button variant="secondary" size="sm" onClick={goPrevMonth}>
            {t("page.prevMonth")}
          </Button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-0)",
              fontFamily: "var(--font-mono)",
              flex: 1,
              textAlign: "center",
            }}
          >
            {monthLabel}
          </span>
          <Button variant="secondary" size="sm"
            onClick={goNextMonth}
            disabled={isThisMonth}
            style={{ opacity: isThisMonth ? 0.4 : 1 }}
          >
            {t("page.nextMonth")}
          </Button>
          <button onClick={() => setImportOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", background: "var(--bg-2)",
              border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)",
              fontSize: 12, fontWeight: 500, color: "var(--ink-2)", cursor: "pointer",
            }}>
            <Upload size={14} />
            {t("page.import")}
          </button>
          {!isThisMonth && (
            <Button variant="secondary" size="sm"
              onClick={() =>
                setSelectedMonth({ year: today.getFullYear(), month: today.getMonth() })
              }
            >
              {t("page.currentMonth")}
            </Button>
          )}
        </div>

        {/* 캘린더 그리드 */}
        <Card padding="none" style={{ padding: 0, overflow: "hidden" }}>
          {/* 요일 헤더 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr) 60px",
              padding: "8px 10px",
              borderBottom: "1px solid var(--line-soft)",
              background: "var(--bg-2)",
              gap: 3,
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
            <Text as="div" variant="eyebrow" style={{ textAlign: "center" }}>{t("page.weekTSSLabel")}</Text>
          </div>

          {/* 주별 행 */}
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
            {loading
              ? Array.from({ length: 5 }).map((_, wi) => (
                  <div
                    key={wi}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                      gap: 3,
                    }}
                  >
                    {Array.from({ length: 7 }).map((__, di) => (
                      <div
                        key={di}
                        style={{
                          height: 56,
                          background: "var(--bg-2)",
                          borderRadius: 4,
                          opacity: 0.3,
                        }}
                      />
                    ))}
                  </div>
                ))
              : calendar.map((week, wi) => {
                  // 주간 TSS 합계
                  const weekTSS = week.reduce((s, cell) => {
                    const acts = byDay.get(dateToKey(cell.date)) ?? [];
                    return s + acts.reduce((ts, a) => ts + estimateTSS(a), 0);
                  }, 0);
                  return (
                  <div
                    key={wi}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr) 60px",
                      gap: 3,
                      alignItems: "stretch",
                    }}
                  >
                    {week.map((cell, di) => {
                      const key = dateToKey(cell.date);
                      const acts = byDay.get(key) ?? [];
                      const isToday = key === todayKey;
                      return (
                        <LogDayCell
                          key={di}
                          activities={acts}
                          isToday={isToday}
                          isCurrentMonth={cell.isCurrentMonth}
                          dayNum={cell.date.getDate()}
                        />
                      );
                    })}
                    {/* 주간 TSS */}
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontFamily: "var(--font-mono)", color: weekTSS > 0 ? "var(--ink-1)" : "var(--ink-4)",
                      borderLeft: "1px solid var(--line-soft)", paddingLeft: 6,
                    }}>
                      <div style={{ fontSize: 9, color: "var(--ink-3)", marginBottom: 2 }}>TSS</div>
                      <div>{Math.round(weekTSS)}</div>
                    </div>
                  </div>
                  );
                })}
          </div>
        </Card>

        {/* 월간 일별 거리 바 */}
        <Card padding="none" style={{ marginTop: 14, padding: "14px 16px" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 10 }}>{t("page.monthlyBarTitle")}</Text>
          <MiniBarChart values={barValues} labels={barLabels} unit="km" />
          <div
            style={{
              marginTop: 6,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 9,
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
        </Card>

      </div>
      <ImportActivityModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
