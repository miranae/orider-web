import { lazy, Suspense, useState, useRef, useMemo, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Search, X, ChevronDown } from "lucide-react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { filterByDiscipline, getDiscipline, type Discipline } from "../utils/disciplineFilter";
import { StatBlock, SectionHeader, PageHeader, EmptyState } from "../components/redesign";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import RunEmptyState from "../components/dashboard/RunEmptyState";
import WeeklyRecapCard from "../components/dashboard/WeeklyRecapCard";
import CrossDisciplineLoadCard from "../components/dashboard/CrossDisciplineLoadCard";
import FirstSyncCelebration from "../components/dashboard/FirstSyncCelebration";
import ThresholdPaceNudge from "../components/dashboard/ThresholdPaceNudge";
import ShoeReplacementBadge from "../components/dashboard/ShoeReplacementBadge";
import { estimateRunnerLevel } from "../utils/runnerLevel";
import { latestShoeStatus } from "../utils/shoeStatus";
import { useRunHistory } from "../hooks/useRunHistory";
import { useRunRecords } from "../hooks/useRunRecords";
import { useUserFitness } from "../hooks/useUserFitness";
import { useFirstSyncCelebration } from "../hooks/useFirstSyncCelebration";
import { computeRunWeeklyRecap, isRecapVisible } from "../utils/runWeeklyRecap";
import { seoulWeekday } from "../utils/seoulWeek";
import ActivityCard from "../components/ActivityCard";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatDistance } from "../utils/units";
import { useActivities, useWeeklyStats, useActivitySearch, useMonthlyActivityDistance } from "../hooks/useActivities";
import type { ActivityFeedScope, DatePreset } from "../hooks/useActivities";
import { useFriends } from "../hooks/useFriends";
import { useFitnessTimeseries } from "../hooks/useFitnessTimeseries";
import { estimateActivityLoad, aggregateDailyLoad, calculateFitness } from "../utils/fitnessMetrics";
import type { ActivityLoadEntry } from "../utils/fitnessMetrics";
import { toLocalDate } from "../utils/dateUtils";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { isYearRecapSeason } from "../utils/yearRecapSeason";
import { useConsistencyStreak } from "../hooks/useConsistencyStreak";
import type { FitnessProjection } from "@shared/types/goal";
import MobileFeedPage from "../components/mobile/MobileFeedPage";
import AppInstallLinks from "../components/AppInstallLinks";
import ConsistencyStreakCard from "../components/training/ConsistencyStreakCard";
import { useMobile } from "../hooks/useMobile";
import { Button, Card, Chip, Text } from "../theme/components";
import type { Activity } from "@shared/types";

const TodaysWorkoutCard = lazy(() => import("../components/training/TodaysWorkoutCard"));

type FeedFilterIndex = 0 | 1 | 2;

export function filterFeedActivities(
  activities: Activity[],
  feedFilter: FeedFilterIndex,
  userId: string | null | undefined,
  friendIds: Set<string>,
): Activity[] {
  if (!userId || feedFilter === 0) return activities;
  if (feedFilter === 1) return activities.filter((activity) => friendIds.has(activity.userId));
  if (feedFilter === 2) return activities.filter((activity) => activity.userId === userId);
  return activities;
}

// ── 유틸리티 함수 ──

/** 밀리초 → "H:MM" 형식 */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

/** 숫자 콤마 포맷 */
function formatNum(n: number, locale: string): string {
  return n.toLocaleString(locale);
}

/** 초 → "M:SS" 형식 */
function secToMmss(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── 컴포넌트 ──

function FeedSkeleton() {
  return (
    <Card padding="none" style={{ overflow: "hidden", padding: "var(--space-3)" }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-3)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 12, width: 80, background: "var(--bg-3)", borderRadius: "var(--r-sm)", marginBottom: "var(--space-1-5)" }} />
          <div style={{ height: 10, width: 60, background: "var(--bg-2)", borderRadius: "var(--r-sm)" }} />
        </div>
      </div>
      <div style={{ height: 16, width: "70%", background: "var(--bg-3)", borderRadius: "var(--r-sm)", marginBottom: 'var(--space-3)' }} />
      <div style={{ height: 160, background: "var(--bg-2)", borderRadius: "var(--r-sm)" }} />
    </Card>
  );
}

/** 주간 TSS 막대 차트 — 호버 시 디자인 시스템 툴팁 표시 (기존 native title 대체). */
function WeeklyTssBars({
  weeks,
  tooltipFor,
}: {
  weeks: { week: string; tss: number }[];
  tooltipFor: (w: { week: string; tss: number }) => string;
}) {
  const maxTSS = Math.max(...weeks.map((w) => w.tss), 1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hover = hoverIdx != null ? weeks[hoverIdx] : null;
  // 양 끝 막대 툴팁이 카드 밖으로 잘리지 않도록 앵커 중심을 [12%, 88%] 로 클램프
  const anchorPct =
    hoverIdx != null
      ? Math.min(Math.max(((hoverIdx + 0.5) / weeks.length) * 100, 12), 88)
      : 0;

  return (
    <div style={{ position: "relative" }}>
      <div className="bar-track" style={{ height: 80 }} onPointerLeave={() => setHoverIdx(null)}>
        {weeks.map((w, i) => (
          <div
            key={i}
            className={`bar ${i === weeks.length - 1 ? "bar--current" : ""}`}
            style={{
              height: `${Math.round((w.tss / maxTSS) * 100)}%`,
              opacity: hoverIdx != null && hoverIdx !== i ? 0.5 : 1,
              cursor: "default",
            }}
            onPointerEnter={() => setHoverIdx(i)}
          />
        ))}
      </div>
      {hover && (
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
            padding: "var(--space-2) var(--space-3)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
            fontSize: "var(--fs-sm)",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            color: "var(--ink-0)",
          }}
        >
          {tooltipFor(hover)}
        </div>
      )}
    </div>
  );
}

// ── 메인 대시보드 ──

export default function DashboardPage() {
  const { t, i18n } = useTranslation("dashboard");
  const { t: tCommon } = useTranslation("common");
  const [feedFilter, setFeedFilter] = useState<FeedFilterIndex>(0);
  // 사이드바 푸터(약관/정책 링크) 접이식 — Layout 데스크톱 푸터를 메인화면에서 흡수 (#347 후속)
  const [footerOpen, setFooterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user, profile, loading: authLoading, signInWithGoogle } = useAuth();
  const { units } = useLocale();
  const { friends } = useFriends();
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.userId)), [friends]);
  const feedScope: ActivityFeedScope = (["all", "friends", "self"] as const)[feedFilter];
  const { activities, loading, loadMore, hasMore, loadingMore, totalCount } = useActivities(feedScope, [...friendIds]);
  const { weeklyStats, thisWeek } = useWeeklyStats();
  const monthlyActivityDistance = useMonthlyActivityDistance();
  const activitySearch = useActivitySearch();
  const { summary: consistencyStreak } = useConsistencyStreak(user?.uid);

  const [searchParams] = useSearchParams();
  const discipline: Discipline = (searchParams.get("sport") as Discipline) || "bike";

  // ── 러닝 탭 전용 데이터 (§3.0 / §3.4c / §3.7) ────────────────────────────
  // 8주 창 하나로 리캡(3주)과 러너 레벨(8주)을 함께 커버한다 — 쿼리 1회.
  const isRunTab = discipline === "run";
  const RUN_HISTORY_WEEKS = 8;
  const runHistory = useRunHistory(RUN_HISTORY_WEEKS, isRunTab && !!user);
  const { fitness: userFitness } = useUserFitness(isRunTab && !!user);
  // 창 길이·계정 생성일을 함께 넘긴다 — 창이 계정 수명을 못 덮으면 "첫 러닝" 축하를 하지 않는다.
  const firstSync = useFirstSyncCelebration(
    runHistory.runs,
    runHistory.loading,
    user?.uid ?? null,
    RUN_HISTORY_WEEKS * 7 * 86400000,
    profile?.createdAt,
  );

  const runRecap = useMemo(
    () => (isRunTab ? computeRunWeeklyRecap(runHistory.runs, Date.now()) : null),
    [isRunTab, runHistory.runs],
  );
  const showRecap = runRecap != null && isRecapVisible(Date.now(), seoulWeekday);

  // "최근 8주 러닝 없음" 과 "러닝 이력 자체가 없음" 은 다른 신호다. 둘을 같게 다루면 오래 쉬었다
  // 돌아온 러너에게 "첫 러닝이 도착하면 알려드릴게요" 온보딩이 뜨고 오늘의 워크아웃까지 사라진다.
  // 서버가 유지하는 거리별 기록(records/power.run)을 "달린 적 있음"의 근거로 쓴다.
  const { run: dashRunRecords, loading: recordsLoading } = useRunRecords(isRunTab && !!user);
  const hasEverRun = dashRunRecords != null && Object.keys(dashRunRecords).length > 0;
  const hasNoRuns =
    isRunTab &&
    !!user &&
    !runHistory.loading &&
    !recordsLoading &&
    runHistory.runs.length === 0 &&
    !hasEverRun;

  // 꾸준히 달리는데 임계 페이스가 없으면 목표 페이스·rTSS 해석이 전부 잠긴다 (§3.1).
  // 가끔 달리는 사람에게는 띄우지 않는다 — 잔소리가 되므로.
  const runnerLevel = useMemo(
    () =>
      isRunTab && !runHistory.loading
        ? estimateRunnerLevel(runHistory.runs, Date.now(), profile?.createdAt ?? null)
        : null,
    [isRunTab, runHistory.runs, runHistory.loading, profile?.createdAt],
  );
  // profile 이 도착하기 전에는 판단하지 않는다 — 이미 임계 페이스를 설정한 러너에게
  // 넛지가 깜빡 떴다 사라지는 플래시가 생긴다(firstSync 와 같은 프로필 레이스).
  const showThresholdNudge =
    profile != null && runnerLevel?.level === "regular" && !profile.thresholdPace && !hasNoRuns;

  // 신발 교체 임박 — 가장 최근 러닝의 gear 스냅샷에서 파생 (§3.6, 신규 구현 아님)
  const shoeStatus = useMemo(
    () => (isRunTab ? latestShoeStatus(runHistory.runs) : null),
    [isRunTab, runHistory.runs],
  );

  // 종목 필터 적용
  const sportFiltered = useMemo(() => filterByDiscipline(activities, discipline), [activities, discipline]);
  // 피드 필터 적용 (전체/친구/본인)
  const filteredActivities = useMemo(
    () => filterFeedActivities(sportFiltered, feedFilter, user?.uid, friendIds),
    [sportFiltered, feedFilter, user?.uid, friendIds],
  );

  const DATE_PRESETS: { label: string; value: DatePreset }[] = [
    { label: t("feed.datePreset.all"), value: "all" },
    { label: t("feed.datePreset.7d"), value: "7d" },
    { label: t("feed.datePreset.30d"), value: "30d" },
    { label: t("feed.datePreset.90d"), value: "90d" },
    { label: t("feed.datePreset.year"), value: "year" },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = searchInput.trim();
    if (kw) activitySearch.search(kw);
  };

  const handleSearchReset = () => {
    setSearchInput("");
    activitySearch.reset();
  };

  const userName = profile?.nickname || user?.displayName || t("header.defaultName");
  // 로그아웃 사용자(광고 유입 첫 인상) 에선 generic "안녕하세요, 라이더님" 대신
  // 가치 제안을 노출. 로그인 후엔 기존 인사말 유지.
  // authLoading 동안엔 익명 카피를 띄우지 않음 — 새로고침 첫 페인트에 로그인
  // 사용자가 익명 헤드라인을 깜빡 보는 현상(#234) 방지.
  const isAnon = !authLoading && !user;
  const heroTitle = isAnon
    ? t("header.anonTitle")
    : `${t("header.greetingPrefix")}${userName}${t("header.greetingSuffix")}`;
  const showYearRecapBanner = !!user && isYearRecapSeason();

  const thisWeekDistFormatted = formatDistance(thisWeek.distance, units);
  // KPI에선 숫자만 별도, 단위 별도로 표시
  const M_PER_MI = 1609.344;
  const thisWeekDistValue = units === 'imperial'
    ? (thisWeek.distance / M_PER_MI).toFixed(1)
    : (thisWeek.distance / 1000).toFixed(1);
  const distUnit = units === 'imperial' ? 'mi' : 'km';
  const thisWeekTimeStr = formatDuration(thisWeek.time);

  // CTL/ATL/TSB — 폴백용 클라 계산. 피드(useActivities)는 페이지네이션(20개)이라 42일 CTL
  // EMA 워밍업이 부족해 과소평가됨. 권위값은 아래 서버 projection 의 현재 포인트를 우선 사용.
  const clientFitness = useMemo(() => {
    if (activities.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    const userActivities = user ? activities.filter((a) => a.userId === user.uid) : [];
    if (userActivities.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    const disciplineFiltered = discipline === "tri"
      ? userActivities
      : filterByDiscipline(userActivities, discipline);
    if (disciplineFiltered.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
    const entries: ActivityLoadEntry[] = disciplineFiltered.map((a) => {
      const r = estimateActivityLoad({
        precomputedTss: (a as { tss?: number | null }).tss ?? a.summary.tss,
        avgPower: a.summary.averagePower ?? null,
        relativeEffort: a.summary.relativeEffort,
        ridingTimeMillis: a.summary.ridingTimeMillis,
        // tri(혼합)는 활동별로 종목 resolve, 그 외엔 필터된 종목 그대로. 서버 PMC factor 와 일치.
        discipline: discipline === "tri" ? getDiscipline((a as { sport?: string }).sport || a.type) : discipline,
      });
      return {
        date: toLocalDate(a.startTime),
        load: r.value,
        source: r.source,
      };
    });
    const today = toLocalDate(Date.now());
    const firstDate = entries[entries.length - 1]?.date ?? today;
    const daily = aggregateDailyLoad(entries, firstDate, today);
    const series = calculateFitness(daily);
    return series.length > 0 ? series[series.length - 1]! : { ctl: 0, atl: 0, tsb: 0 };
  }, [activities, user, discipline]);

  // 권위 CTL/ATL/TSB — 서버 projection_{종목} 의 "오늘(마지막 과거)" 포인트. 피트니스 페이지/
  // 서버와 동일 소스라 스냅샷이 일치한다. (computeCurrentFitness ~120일 시드 → 42일 EMA 정확.)
  const [projFitness, setProjFitness] = useState<{ ctl: number; atl: number; tsb: number } | null>(null);
  useEffect(() => {
    if (!user || discipline === "tri") { setProjFitness(null); return; }
    const ref = doc(firestore, "users", user.uid, "fitness", `projection_${discipline}`);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { setProjFitness(null); return; }
      const data = snap.data() as FitnessProjection;
      const now = Date.now();
      // series 는 과거→미래 정렬. date<=now 중 마지막(=현재) 포인트가 실측 CTL/ATL/TSB.
      let cur: FitnessProjection["series"][number] | null = null;
      for (const p of data.series ?? []) {
        if (p.date <= now) cur = p; else break;
      }
      setProjFitness(cur && Number.isFinite(cur.ctl) ? { ctl: cur.ctl, atl: cur.atl, tsb: cur.tsb } : null);
    }, (err) => logClientError("DashboardPage.projectionSubscription", err, { discipline }));
    return () => unsub();
  }, [user, discipline]);

  // 정본 시계열 — FitnessPage(PMC) 와 동일한 `timeseries_{종목}` doc 의 현재(마지막) 포인트.
  // 전체 라이프타임 EMA 라 워밍업 부족이 없다(클라 폴백·projection 과 달리).
  const { timeseries: snapshotTs } = useFitnessTimeseries(user?.uid, discipline);
  const tsFitness = useMemo(() => {
    const pts = snapshotTs?.points;
    if (!pts || pts.length === 0) return null;
    const last = pts[pts.length - 1]!;
    return Number.isFinite(last.ctl) ? { ctl: last.ctl, atl: last.atl, tsb: last.tsb } : null;
  }, [snapshotTs]);

  // 권위 우선순위: 정본 timeseries(피트니스 페이지와 동일) → 서버 projection → 클라 폴백.
  // projection_{종목} 은 목표 없는 신규 유저엔 빈 series sentinel 이라, 과거엔 클라 폴백
  // (페이지네이션 10건 → 42일 EMA 워밍업 부족, CTL 과소평가)으로 떨어져 스냅샷 CTL 이
  // PMC 와 20배 넘게 어긋났다. timeseries 를 최우선으로 둬 두 화면을 일치시킨다.
  const fitness = tsFitness ?? projFitness ?? clientFitness;

  // 종목별 임계값 KPI
  const thresholdKpi = (() => {
    if (discipline === "run") {
      const pace = profile?.thresholdPace;
      return {
        label: t("kpi.thresholdRunLabel"),
        value: pace ? secToMmss(pace) : "—",
        unit: pace ? t("kpi.thresholdRunUnit") : null,
        delta: null,
        deltaKind: "up" as const,
        sub: t("kpi.thresholdRunSub"),
      };
    }
    if (discipline === "swim") {
      const css = profile?.css;
      return {
        label: t("kpi.thresholdSwimLabel"),
        value: css ? secToMmss(css) : "—",
        unit: css ? t("kpi.thresholdSwimUnit") : null,
        delta: null,
        deltaKind: "up" as const,
        sub: t("kpi.thresholdSwimSub"),
      };
    }
    // bike (+ tri fallback)
    const ftp = profile?.ftp;
    return {
      label: t("kpi.thresholdBikeLabel"),
      value: ftp ? String(ftp) : "—",
      unit: ftp ? t("kpi.thresholdBikeUnit") : null,
      delta: null,
      deltaKind: "up" as const,
      sub: t("kpi.thresholdBikeSub"),
    };
  })();

  const KPI = [
    {
      label: t("kpi.weekDistance"),
      value: thisWeekDistValue,
      unit: distUnit,
      delta: null,
      deltaKind: "up" as const,
      sub: t("kpi.subRecent7d"),
    },
    {
      label: t("kpi.rides"),
      value: String(thisWeek.rides),
      unit: null,
      delta: null,
      deltaKind: "up" as const,
      sub: t("kpi.subRecent7d"),
    },
    {
      label: t("kpi.movingTime"),
      value: thisWeekTimeStr,
      unit: "h",
      delta: null,
      deltaKind: "up" as const,
      sub: t("kpi.subRecent7d"),
    },
    {
      label: t("kpi.elevation"),
      value: units === 'imperial' ? formatNum(Math.round(thisWeek.elevation / 0.3048), i18n.language) : formatNum(thisWeek.elevation, i18n.language),
      unit: units === 'imperial' ? 'ft' : 'm',
      delta: null,
      deltaKind: "up" as const,
      sub: t("kpi.subRecent7d"),
    },
    thresholdKpi,
    {
      label: t("kpi.fitness"),
      value: fitness.ctl > 0 ? fitness.ctl.toFixed(1) : "—",
      unit: "CTL",
      // delta 값에 "TSB" 라벨 prefix. 이전엔 "-84.4" 만 떠 사용자가 어느 지표인지
      // 즉시 알기 어려웠음 (옆 sub 의 "ATL 109.8" 와 혼동).
      delta: fitness.tsb !== 0 ? (fitness.tsb > 0 ? `TSB +${fitness.tsb.toFixed(1)}` : `TSB ${fitness.tsb.toFixed(1)}`) : null,
      deltaKind: (fitness.tsb >= 0 ? "up" : "down") as "up" | "down",
      sub: fitness.ctl > 0
        ? `${fitness.tsb >= 5 ? t("kpi.fitnessMaintain") : fitness.tsb <= -10 ? t("kpi.fitnessRecovery") : t("kpi.fitnessBuild")} · ${t("kpi.subAtl", { value: fitness.atl.toFixed(1) })}`
        : t("kpi.subInsufficient"),
    },
  ];

  const isMobile = useMobile();

  if (isMobile) {
    return (
      <MobileFeedPage
        activities={activities}
        loading={loading}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        recentWeeks={weeklyStats.map((ws) => ({
          label: ws.week,
          distance: ws.distance,
        }))}
        showYearRecapBanner={showYearRecapBanner}
        consistencyStreak={consistencyStreak}
        currentUserId={user?.uid ?? null}
        friendIds={[...friendIds]}
        feedScope={feedScope}
        onFeedScopeChange={(scope) => setFeedFilter(({ all: 0, friends: 1, self: 2 } as const)[scope])}
      />
    );
  }

  return (
    <div className="flex flex-col">
        {/* 페이지 헤더 */}
        <PageHeader
          eyebrow={new Date().toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          title={heroTitle}
          subtitle={
            isAnon ? (
              <span style={{ color: "var(--ink-2)" }}>{t("header.anonSubtitle")}</span>
            ) : (
              <span>
                {t("header.subtitleRecent")}
                <span style={{ color: "var(--lime)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                  {thisWeek.rides} · {thisWeekDistFormatted}
                </span>
                {t("header.subtitleSuffix")}
              </span>
            )
          }
          right={
            <>
              {/* 비로그인: 가치 제안 헤더에 실제 로그인 CTA 동반 (#234) —
                  TopNav 와 동일한 signInWithGoogle 트리거 재사용. */}
              {isAnon && (
                <Button onClick={signInWithGoogle} variant="primary" size="sm">
                  {t("header.anonCta")}
                </Button>
              )}
              <DisciplineTabs />
            </>
          }
        />

        {/* 러닝 데이터가 없으면 빈 대시보드 대신 첫 동기화 여정을 보여준다 (§3.0) */}
        {hasNoRuns && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <RunEmptyState stravaConnected={!!profile?.stravaConnected} />
          </div>
        )}

        {/* 오늘의 워크아웃은 실행 가능한 기본 행동이므로 러닝 정보 카드보다 먼저 둔다. */}
        {user && !hasNoRuns && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <Suspense fallback={null}>
              <TodaysWorkoutCard />
            </Suspense>
          </div>
        )}

        {/* 지난주 리캡 — 주 초반(월~수)에만. 변화가 헤드라인이다 (§3.4c) */}
        {isRunTab && showRecap && runRecap && !hasNoRuns && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <WeeklyRecapCard recap={runRecap} />
          </div>
        )}

        {/* 임계 페이스 설정 유도 — regular 러너에게만 (§3.1) */}
        {showThresholdNudge && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ThresholdPaceNudge visible />
          </div>
        )}

        {/* 신발 교체 임박 — 임박했을 때만 (§3.6) */}
        {isRunTab && !hasNoRuns && shoeStatus?.replacementDue && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ShoeReplacementBadge status={shoeStatus} />
          </div>
        )}

        {/* 통합 부하 기여 — 자전거를 병행하는 러너에게만 의미가 있다 (§3.7) */}
        {isRunTab && !hasNoRuns && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <CrossDisciplineLoadCard fitness={userFitness} discipline="run" />
          </div>
        )}

        {/* 첫 러닝 도착 축하 — aha moment 와 같은 릴리스 (§3.0.3) */}
        {firstSync.show && (
          <FirstSyncCelebration activityId={firstSync.activityId} onClose={firstSync.dismiss} />
        )}

        {consistencyStreak && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ConsistencyStreakCard summary={consistencyStreak} />
          </div>
        )}

        {showYearRecapBanner && (
          <Card
            padding="none"
            style={{
              marginTop: "var(--space-4)",
              borderColor: "var(--lime)",
              background: "linear-gradient(135deg, var(--bg-1), var(--bg-0))",
              overflow: "hidden",
            }}
          >
            <div className="flex items-center justify-between gap-4" style={{ padding: "var(--space-4) var(--space-5)" }}>
              <div>
                <Text variant="eyebrow" tone="secondary">{t("yearRecap.eyebrow")}</Text>
                <Text as="h2" variant="subtitle" weight={700} style={{ marginTop: "var(--space-1)", color: "var(--ink-0)" }}>
                  {t("yearRecap.title")}
                </Text>
                <Text variant="bodySmall" tone="tertiary" style={{ display: "block", marginTop: "var(--space-1)" }}>
                  {t("yearRecap.desc")}
                </Text>
              </div>
              <Link to="/year-recap" className="ds-btn ds-btn--primary ds-btn--sm" style={{ textDecoration: "none", flexShrink: 0 }}>
                <span className="ds-btn__label">{t("yearRecap.cta")}</span>
              </Link>
            </div>
          </Card>
        )}

        {/* KPI 스트립 */}
        <Card padding="none" style={{ marginTop: 'var(--space-4)', display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}>
          {KPI.map((s, i) => (
            <div key={i} style={{ padding: "18px 20px", borderRight: i < KPI.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
              <StatBlock {...s} />
            </div>
          ))}
        </Card>

        {/* 메인: 피드 + 사이드바 */}
        <div className="flex gap-5" style={{ marginTop: 'var(--space-5)' }}>
          {/* 피드 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* 헤더: 제목 + 카운트 + 필터 */}
            <div className="flex items-center gap-2" style={{ marginBottom: "var(--space-2)" }}>
              <h2 style={{ fontSize: "var(--fs-base)", fontWeight: 600, color: "var(--ink-0)" }}>{t("feed.title")}</h2>
              {totalCount > 0 && (
                /* 카운트 옆에 "건 · 전체 피드" 컨텍스트 부연 — 이전엔 "1,573" 만 떠 본인/전체 모호.
                   tooltip 은 실제 쿼리(본인 OR visibility==everyone)와 일치하게 "전체 공개 + 내 활동" 으로 표기 (#231). */
                <span
                  style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
                  title={feedScope === "all" ? t("feed.countTooltip") : t(`feed.filter.${feedScope}`)}
                >
                  {t("feed.countSuffix", { value: formatNum(totalCount, i18n.language) })}
                  <span style={{ fontFamily: "var(--font-sans)", color: "var(--ink-4)", marginLeft: 'var(--space-1)' }}>
                    {feedScope === "all" ? t("feed.feedScope") : t(`feed.filter.${feedScope}`)}
                  </span>
                </span>
              )}
              <div className="flex-1" />
              <div className="flex gap-0.5" style={{ background: "var(--bg-1)", padding: "var(--space-1)", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }}>
                {([t("feed.filter.all"), t("feed.filter.friends"), t("feed.filter.self")] as const).map((label, i) => (
                  <button
                    key={i}
                    onClick={() => setFeedFilter(i as FeedFilterIndex)}
                    style={{
                      padding: "5px 10px", fontSize: "var(--fs-xs)", borderRadius: "var(--r-sm)", border: "none", cursor: "pointer",
                      background: feedFilter === i ? "var(--bg-3)" : "transparent",
                      color: feedFilter === i ? "var(--ink-0)" : "var(--ink-3)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 검색 입력 */}
            <form onSubmit={handleSearch} style={{ marginBottom: "var(--space-3)" }}>
              <div className="flex gap-2 items-center">
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t("feed.search.placeholder")}
                    style={{
                      width: "100%", padding: "7px 10px 7px 30px",
                      background: "var(--bg-2)", border: "1px solid var(--line)",
                      borderRadius: "var(--r-md)", fontSize: "var(--fs-sm)", color: "var(--ink-1)",
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--lime)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}
                  />
                  {activitySearch.active && (
                    <button
                      type="button"
                      onClick={handleSearchReset}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 0, display: "flex" }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <Button type="submit" variant="secondary" size="sm">{t("feed.search.submit")}</Button>
              </div>

              {/* 날짜 프리셋 (검색 활성 시만 표시) */}
              {activitySearch.active && (
                <div className="flex gap-1" style={{ marginTop: 'var(--space-2)' }}>
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => activitySearch.setDatePreset(p.value)}
                      style={{
                        padding: "3px 9px", fontSize: "var(--fs-xs)", borderRadius: "var(--r-sm)", cursor: "pointer",
                        border: "1px solid " + (activitySearch.datePreset === p.value ? "var(--accent-soft-border)" : "var(--line-soft)"),
                        background: activitySearch.datePreset === p.value ? "var(--accent-soft-bg)" : "var(--bg-2)",
                        color: activitySearch.datePreset === p.value ? "var(--lime)" : "var(--ink-3)",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  {activitySearch.totalResults > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)", alignSelf: "center" }}>
                      {t("feed.search.resultsCount", { count: activitySearch.totalResults })}
                    </span>
                  )}
                </div>
              )}
            </form>

            {/* 피드 리스트 — 페이지 전체 스크롤에 맡김 (내부 스크롤 제거) */}
            <div style={{ paddingBottom: 'var(--space-5)' }}>
            {/* 검색 결과 */}
            {activitySearch.active && (
              <>
                {activitySearch.loading && (
                  <div className="flex flex-col gap-3.5">
                    <FeedSkeleton />
                    <FeedSkeleton />
                  </div>
                )}
                {!activitySearch.loading && activitySearch.results.length === 0 && (
                  <Card padding="none" style={{ padding: "var(--space-8)", textAlign: "center" }}>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("feed.search.emptyTitle")}</div>
                    <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("feed.search.emptyDescription")}</div>
                  </Card>
                )}
                {!activitySearch.loading && activitySearch.results.length > 0 && (
                  <div className="flex flex-col gap-3.5">
                    {activitySearch.results.map((activity, i) => (
                      <ActivityCard key={activity.id} activity={activity} priority={i === 0} />
                    ))}
                    {activitySearch.hasMore && (
                      <Button variant="secondary" onClick={activitySearch.loadMore} style={{ width: "100%" }}>
                        {t("feed.loadMore")}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 일반 피드 (검색 비활성 시) */}
            {!activitySearch.active && (
              <>
                {loading && (
                  <div className="flex flex-col gap-3.5">
                    <FeedSkeleton />
                    <FeedSkeleton />
                    <FeedSkeleton />
                  </div>
                )}

                {!loading && filteredActivities.length === 0 && (
                  <EmptyState
                    icon="🚴"
                    title={t("feed.empty.title")}
                    description={t("feed.empty.description")}
                    actions={[
                      { label: t("feed.empty.ctaConnectStrava"), variant: "primary", href: "/settings?section=connections" },
                    ]}
                  />
                )}

                {!loading && filteredActivities.length > 0 && (
                  <div className="flex flex-col gap-3.5">
                    {filteredActivities.map((activity, i) => (
                      <ActivityCard key={activity.id} activity={activity} priority={i === 0} />
                    ))}
                  </div>
                )}

                {!loading && hasMore && (
                  <Button variant="secondary"
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{ width: "100%" }}
                  >
                    {loadingMore ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1-5)" }}>
                        <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--line)", borderTopColor: "var(--lime)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                        {t("feed.loading")}
                      </span>
                    ) : t("feed.loadMore")}
                  </Button>
                )}
              </>
            )}
            </div>{/* 스크롤 영역 끝 */}
          </div>

          {/* 사이드바 */}
          <div className="hidden lg:flex w-[340px] flex-shrink-0 flex-col gap-4.5 sticky self-start top-0" style={{ paddingBottom: 'var(--space-5)' }}>
            {/* 주간 TSS 차트 — 실데이터 바인딩 */}
            {(() => {
              const avgTSS = weeklyStats.length
                ? Math.round(weeklyStats.reduce((s, w) => s + w.tss, 0) / weeklyStats.length)
                : 0;
              const peakTSS = Math.max(...weeklyStats.map((w) => w.tss), 0);
              const lastTwo = weeklyStats.slice(-2);
              const trendUp = lastTwo.length === 2 && lastTwo[1]!.tss >= lastTwo[0]!.tss;
              return (
                <Card padding="none" style={{ padding: "var(--space-4)" }}>
                  <SectionHeader title={t("sidebar.weeklyTss.title")} sub={t("sidebar.weeklyTss.sub")} right={<Chip>TSS</Chip>} />
                  <WeeklyTssBars
                    weeks={weeklyStats}
                    tooltipFor={(w) => t("sidebar.weeklyTss.barTooltip", { week: w.week, tss: w.tss })}
                  />
                  <div className="flex justify-between" style={{ marginTop: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                    {weeklyStats.length > 0 && (
                      <>
                        <span>{weeklyStats[0]!.week}</span>
                        <span>{weeklyStats[Math.floor(weeklyStats.length / 2)]?.week ?? ""}</span>
                        <span>{weeklyStats[weeklyStats.length - 1]!.week}</span>
                      </>
                    )}
                  </div>
                  <div className="flex justify-between" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: "1px solid var(--line-soft)" }}>
                    <div>
                      <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.weeklyTss.avgPerWeek")}</Text>
                      <div><Text variant="dataMedium">{avgTSS}</Text><Text variant="unit">TSS</Text></div>
                    </div>
                    <div>
                      <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.weeklyTss.peakWeek")}</Text>
                      <div><Text variant="dataMedium">{peakTSS}</Text><Text variant="unit">TSS</Text></div>
                    </div>
                    <div>
                      <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.weeklyTss.trend")}</Text>
                      <div style={{ color: trendUp ? "var(--lime)" : "var(--rose)", fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                        {trendUp ? t("sidebar.weeklyTss.trendUp") : t("sidebar.weeklyTss.trendDown")}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })()}

            {/* 월간 목표 — 운동 계획 기반 */}
            {(() => {
              const now = new Date();
              const monthLabel = t("sidebar.monthlyGoal.title", { month: now.getMonth() + 1 });
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const daysLeft = daysInMonth - now.getDate();
              const actualKm = Math.round(monthlyActivityDistance / 1000);
              // 월간 목표: 운동 계획이 있으면 주간 평균 × 4.3, 없으면 최근 4주 평균 × 1.1
              const weeklyAvgKm = weeklyStats.length > 0
                ? Math.round(weeklyStats.reduce((s, w) => s + w.distance, 0) / weeklyStats.length)
                : 0;
              const goalKm = weeklyAvgKm > 0 ? Math.round(weeklyAvgKm * 4.3) : 0;

              if (goalKm === 0) {
                return (
                  <a href="/goal-setup" style={{ textDecoration: "none" }}>
                    <Card padding="none" style={{ padding: "var(--space-4)", textAlign: "center" }}>
                      <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-1)' }}>{t("sidebar.monthlyGoal.setupTitle")}</div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("sidebar.monthlyGoal.setupHint")}</div>
                    </Card>
                  </a>
                );
              }

              const pct = Math.min(100, Math.round((actualKm / goalKm) * 100));
              const remaining = Math.max(0, goalKm - actualKm);
              const goalDistFormatted = formatDistance(goalKm * 1000, units);
              const actualDispNum = units === 'imperial' ? Math.round(actualKm * 1000 / M_PER_MI) : actualKm;
              return (
                <Card padding="none" style={{ padding: "var(--space-4)" }}>
                  {/* sub 에 "목표 N" 명시 — 이전엔 "N km" 만 있어 진행 N 과 목표 N 의 위계 혼동.
                      "목표" 접두사는 i18n 키화 (#235, 영어 로케일 한글 노출 방지). */}
                  <SectionHeader title={monthLabel} sub={`${t("sidebar.monthlyGoal.subPrefix")}${goalDistFormatted}`} />
                  <div className="flex items-baseline gap-1.5" style={{ marginBottom: "var(--space-2)" }}>
                    <Text variant="dataHero" style={{ fontSize: "var(--fs-3xl)" }}>{actualDispNum}</Text>
                    <Text variant="unit" style={{ fontSize: "var(--fs-sm)" }}>/ {goalDistFormatted} · {pct}%</Text>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden", marginBottom: "var(--space-2)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--lime)" }} />
                  </div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                    {t("sidebar.monthlyGoal.remainingPrefix")}<Text variant="mono" style={{ color: "var(--ink-1)" }}>{formatDistance(remaining * 1000, units)}</Text>{t("sidebar.monthlyGoal.remainingSuffix", { days: daysLeft })}
                  </div>
                </Card>
              );
            })()}

            {/* 피트니스 스냅샷 */}
            <Card padding="none" style={{ padding: "var(--space-4)" }}>
              <SectionHeader title={t("sidebar.fitness.title")} sub={t("sidebar.fitness.sub")} />
              {fitness.ctl === 0 ? (
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", padding: "8px 0" }}>{t("sidebar.fitness.insufficient")}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.fitness.ctl")}</Text>
                    <div><Text variant="dataMedium">{fitness.ctl.toFixed(1)}</Text></div>
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>{t("sidebar.fitness.ctlHint")}</div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.fitness.atl")}</Text>
                    <div><Text variant="dataMedium">{fitness.atl.toFixed(1)}</Text></div>
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>{t("sidebar.fitness.atlHint")}</div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.fitness.tsb")}</Text>
                    <div>
                      <Text variant="dataMedium" style={{ color: fitness.tsb >= 5 ? "var(--lime)" : fitness.tsb <= -10 ? "var(--rose)" : "var(--amber)" }}>
                        {fitness.tsb >= 0 ? `+${fitness.tsb.toFixed(1)}` : fitness.tsb.toFixed(1)}
                      </Text>
                    </div>
                    <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>{t("sidebar.fitness.tsbHint")}</div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1)" }}>{t("sidebar.fitness.recommend")}</Text>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-0)", fontWeight: 500, marginTop: "var(--space-1)" }}>
                      {fitness.tsb >= 5 ? t("sidebar.fitness.recoMaintain") : fitness.tsb <= -10 ? t("sidebar.fitness.recoRecovery") : t("sidebar.fitness.recoModerate")}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* 한국 자전거 커뮤니티 */}
            <Card padding="none" style={{ padding: 'var(--space-4)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("sidebar.community.title")}</Text>
              <div className="flex flex-col gap-2">
                {[
                  { name: "RIDING CLUB LARA", badge: "L", descKey: "lara", url: "https://cafe.naver.com/clublara" },
                  { name: "자출사", badge: "자", descKey: "jachulsa", url: "https://cafe.naver.com/bikecity" },
                  { name: "도싸", badge: "도", descKey: "dossa", url: "https://corearoadbike.com/" },
                  { name: "클리앙 자전거당", badge: "클", descKey: "clien", url: "https://www.clien.net/service/board/cm_bike" },
                  { name: "바이크셀", badge: "바", descKey: "bikesell", url: "https://bikesell.co.kr" },
                  { name: "더바이크", badge: "더", descKey: "thebike", url: "https://thebike.co.kr" },
                ].map((c) => (
                  <a
                    key={c.name}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3"
                    style={{ padding: "6px 8px", borderRadius: "var(--r-md)", textDecoration: "none", transition: "background .12s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex-shrink-0" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--bg-3)", color: "var(--lime)", display: "grid", placeItems: "center", fontSize: "var(--fs-xs)", fontWeight: 700 }}>
                      {c.badge}
                    </div>
                    <div className="min-w-0">
                      <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--ink-0)" }}>{c.name}</div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t(`home.communities.${c.descKey}`)}</div>
                    </div>
                  </a>
                ))}
              </div>
            </Card>

            {/* Orider 앱: 설치 버튼(App Store/Google Play)만 노출, 매뉴얼·약관은 더보기로 */}
            <Card padding="none" style={{ padding: 'var(--space-4)' }}>
              {/* 상단: 앱 설치 좌우 반반 (항상 노출) */}
              <AppInstallLinks
                compact
                appStoreLabel={t("sidebar.app.storeIos")}
                playStoreLabel={t("sidebar.app.storeAos")}
              />

              {/* 더보기 토글: 매뉴얼(iOS/Android/웹) + 약관/정책. 기본 접힘 */}
              <div className="h-px mt-3" style={{ background: "var(--line-soft)" }} />
              <button
                type="button"
                onClick={() => setFooterOpen((v) => !v)}
                aria-expanded={footerOpen}
                className="flex items-center gap-1 w-full pt-2.5 text-[length:var(--fs-xs)] transition-colors hover:opacity-80"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}
              >
                <span>{footerOpen ? tCommon("footer.collapse") : tCommon("footer.more")}</span>
                <ChevronDown size={14} style={{ transform: footerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {footerOpen && (
                <div className="pt-2.5">
                  {/* 매뉴얼: iOS | Android */}
                  <div className="grid grid-cols-2 gap-2">
                    <a href="/mobile/ios/manual/" className="flex items-center gap-2 p-2 min-w-0 rounded-[var(--r-md)]" style={{ background: "var(--bg-3)", textDecoration: "none" }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--ink-2)" }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      <span className="text-[length:var(--fs-xs)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{t("sidebar.app.manualIos")}</span>
                    </a>
                    <a href="/mobile/aos/manual/" className="flex items-center gap-2 p-2 min-w-0 rounded-[var(--r-md)]" style={{ background: "var(--bg-3)", textDecoration: "none" }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--ink-2)" }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      <span className="text-[length:var(--fs-xs)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{t("sidebar.app.manualAos")}</span>
                    </a>
                  </div>
                  {/* 웹 사용 매뉴얼 (full width) */}
                  <a href="/web-manual/" className="flex items-center gap-3 pt-2.5" style={{ textDecoration: "none" }}>
                    <div className="grid place-items-center shrink-0 w-8 h-8 rounded-[var(--r-md)]" style={{ background: "var(--bg-3)", color: "var(--ink-2)" }}>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("sidebar.app.manualWebTitle")}</div>
                      <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("sidebar.app.manualWebDesc")}</div>
                    </div>
                  </a>

                  {/* 약관/정책 + 저작권 */}
                  <div className="h-px mt-3" style={{ background: "var(--line-soft)" }} />
                  <div className="flex flex-col gap-2 pt-2.5 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                    <Link to="/feedback" className="transition-colors hover:opacity-80">{tCommon("footer.feedback")}</Link>
                    <Link to="/terms" className="transition-colors hover:opacity-80">{tCommon("footer.terms")}</Link>
                    <Link to="/privacy" className="transition-colors hover:opacity-80">{tCommon("footer.privacy")}</Link>
                    <Link to="/community" className="transition-colors hover:opacity-80">{tCommon("footer.community")}</Link>
                    <Link to="/board?type=inquiry" className="transition-colors hover:opacity-80">{tCommon("footer.contact")}</Link>
                    <div className="flex items-center gap-1.5 pt-1.5 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>
                      <span>&copy; 2026 Orider</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
                        Powered by Strava
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
  );
}
