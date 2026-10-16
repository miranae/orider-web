import WeeklyTssBars from "../components/dashboard/WeeklyTrainingLoadBars";
export { default as WeeklyTssBars } from "../components/dashboard/WeeklyTrainingLoadBars";
export type { WeeklyTssBar } from "../components/dashboard/WeeklyTrainingLoadBars";
import GlossaryText from "../components/common/GlossaryText";
import InfoTip from "../components/InfoTip";
import { GlossaryProvider } from "../components/common/GlossaryProvider";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";
import { useState, useRef, useMemo } from "react";
import { Search, X } from "lucide-react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { filterByDiscipline, type Discipline } from "../utils/disciplineFilter";
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
import { useToast } from "../contexts/ToastContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatTrainingLoad } from "../utils/trainingLoadDisplay";
import { formatDistance, formatElev } from "../utils/units";
import { useActivities, useWeeklyStats, useActivitySearch } from "../hooks/useActivities";
import type { ActivityFeedScope, DatePreset } from "../hooks/useActivities";
import { useFriends } from "../hooks/useFriends";
import { logClientError } from "../services/errorLogger";
import { isYearRecapSeason } from "../utils/yearRecapSeason";
import { useCanonicalHomeSummary } from "../hooks/useCanonicalHomeSummary";
import { useCanonicalFitnessSummary } from "../hooks/useCanonicalFitnessSummary";
import { canonicalKpiPresentation, canonicalKpiSource, canonicalWeekTotals } from "../features/home/canonicalKpiSource";
import { useDashboardPreferences } from "../hooks/useDashboardPreferences";
import { selectStoredDashboardFitness } from "../features/home/storedDashboardFitness";
import HomeTodayStrip from "../components/dashboard/HomeTodayStrip";
import MobileFeedPage from "../components/mobile/MobileFeedPage";
import { useMobile } from "../hooks/useMobile";
import { Button, Card, Chip, Input, Text, buttonClass } from "../theme/components";
import type { Activity } from "@shared/types";
import "./DashboardPage.css";

type FeedFilterIndex = 0 | 1 | 2;

export const KOREAN_CYCLING_COMMUNITIES = [
  { name: "RIDING CLUB LARA", badge: "L", descKey: "lara", url: "https://cafe.naver.com/clublara", logo: "/images/communities/riding-club-lara.webp" },
  { name: "자출사", badge: "자", descKey: "jachulsa", url: "https://cafe.naver.com/bikecity", logo: "/images/communities/jachulsa.webp" },
  { name: "도싸", badge: "도", descKey: "dossa", url: "https://corearoadbike.com/", logo: "/images/communities/dossa.webp", logoBg: "white" },
  { name: "클리앙 자전거당", badge: "클", descKey: "clien", url: "https://www.clien.net/service/board/cm_bike", logo: "/images/communities/clien.webp", logoBg: "white" },
  { name: "바이크셀", badge: "바", descKey: "bikesell", url: "https://bikesell.co.kr", logo: "/images/communities/bikesell.webp", logoBg: "white" },
  { name: "더바이크", badge: "더", descKey: "thebike", url: "https://thebike.co.kr", logo: "/images/communities/thebike.webp", logoBg: "black" },
] as const;

export function CommunityLogo({
  name,
  badge,
  logo,
  logoBg,
}: {
  name: string;
  badge: string;
  logo: string;
  logoBg?: string;
}) {
  const [failed, setFailed] = useState(false);
  const loggedFailure = useRef(false);

  const handleError = () => {
    if (!loggedFailure.current) {
      loggedFailure.current = true;
      logClientError(
        "DashboardPage.communityLogoLoad",
        new Error(`Failed to load community logo: ${logo}`),
        { communityName: name, logo },
      );
    }
    setFailed(true);
  };

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: "var(--r-sm)",
        background: logoBg || "var(--bg-3)",
      }}
    >
      {failed ? (
        <span
          style={{
            width: "100%",
            height: "100%",
            color: "var(--lime)",
            display: "grid",
            placeItems: "center",
            fontSize: "var(--fs-xs)",
            fontWeight: 700,
          }}
        >
          {badge}
        </span>
      ) : (
        <img
          src={logo}
          alt=""
          onError={handleError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: logoBg ? "contain" : "cover",
            padding: logoBg ? 2 : 0,
          }}
        />
      )}
    </div>
  );
}

export function normalizeDashboardDiscipline(value: string | null): Discipline | null {
  if (value === "bike" || value === "run" || value === "swim" || value === "tri") {
    return value;
  }
  return null;
}

export function dashboardPlanDiscipline(value: string | null): Exclude<Discipline, "tri"> | undefined {
  const discipline = normalizeDashboardDiscipline(value);
  return discipline && discipline !== "tri" ? discipline : undefined;
}

export function filterFeedActivities(
  activities: Activity[],
  feedFilter: FeedFilterIndex,
  userId: string | null | undefined,
  friendIds: Set<string>,
): Activity[] {
  if (!userId || feedFilter === 0) return activities;
  if (feedFilter === 1) return activities.filter((activity) => activity.userId === userId || friendIds.has(activity.userId));
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

export default function DashboardPage() {
  return <GlossaryProvider><DashboardContent /></GlossaryProvider>;
}

function DashboardContent() {
  const { t, i18n } = useTranslation("dashboard");
  // 사이드바 푸터(약관/정책 링크) 접이식 — Layout 데스크톱 푸터를 메인화면에서 흡수 (#347 후속)
  const [searchInput, setSearchInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { user, profile, loading: authLoading, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [signInPending, setSignInPending] = useState(false);
  const handleGuestSignIn = async () => {
    if (signInPending) return;
    setSignInPending(true);
    try {
      await signInWithGoogle();
    } catch {
      showToast(t("header.signInFailed"), "error");
    } finally {
      setSignInPending(false);
    }
  };
  const { preferences: dashboardPreferences, update: updateDashboardPreferences } = useDashboardPreferences(
    user?.uid ?? null,
    authLoading,
  );
  const { units } = useLocale();
  const isMobile = useMobile(1024);
  const { friends } = useFriends();
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.userId)), [friends]);
  const feedScope: ActivityFeedScope = user ? dashboardPreferences.feedScope : "all";
  const feedFilter = ({ all: 0, friends: 1, self: 2 } as const)[feedScope];
  const { activities, loading, loadMore, hasMore, loadingMore, totalCount, error: feedError, retry: retryFeed } = useActivities(feedScope, [...friendIds]);
  // 정본(서버 집계) 홈 요약 — `homeSummary` 서버 전환 판정 AND 빌드 플래그 뒤에 있다.
  // 꺼져 있으면(오늘의 기본값) 아래 KPI 는 useWeeklyStats 의 클라 집계를 그대로 그린다.
  const canonicalHome = useCanonicalHomeSummary();
  const canonicalFitness = useCanonicalFitnessSummary();
  const activitySearch = useActivitySearch(friendIds);

  const [searchParams, setSearchParams] = useSearchParams();
  const sportParam = searchParams.get("sport");
  const parsedDiscipline = normalizeDashboardDiscipline(sportParam);
  const requestedDiscipline = parsedDiscipline === "swim" ? "bike" : parsedDiscipline;
  const mobileSportFilter = requestedDiscipline === "tri" ? "all" : requestedDiscipline ?? (dashboardPreferences.sportFilter === "swim" ? "bike" : dashboardPreferences.sportFilter);
  const discipline: Discipline = isMobile ? (mobileSportFilter === "all" ? "tri" : mobileSportFilter) : requestedDiscipline ?? "bike";
  const selectedDiscipline = isMobile ? mobileSportFilter : discipline;
  const runStats = useWeeklyStats({
    includeMonthlyDistance: true,
    discipline: selectedDiscipline === "run" ? "run" : undefined,
    recent7DayDiscipline: selectedDiscipline === "all" ? undefined : selectedDiscipline,
  });
  const { weeklyStats, thisWeek, recent7DayDistances, recent7DayCount, monthlyActivityDistance } = runStats;
  // ── 러닝 탭 전용 데이터 (§3.0 / §3.4c / §3.7) ────────────────────────────
  // 8주 창 하나로 리캡(3주)과 러너 레벨(8주)을 함께 커버한다 — 쿼리 1회.
  const isRunTab = discipline === "run";
  const isRunningJourneyActive = isMobile ? mobileSportFilter === "run" : isRunTab;
  const showOwnerRunningSummary = isRunningJourneyActive && !!user && !user.isAnonymous && !authLoading;
  const showOwnerRunningJourney = showOwnerRunningSummary;
  const RUN_HISTORY_WEEKS = 8;
  const runHistory = useRunHistory(RUN_HISTORY_WEEKS, showOwnerRunningSummary);
  const { fitness: userFitness } = useUserFitness(showOwnerRunningJourney || (!!user && !user.isAnonymous && !canonicalFitness.enabled));
  // 창 길이·계정 생성일을 함께 넘긴다 — 창이 계정 수명을 못 덮으면 "첫 러닝" 축하를 하지 않는다.
  const firstSync = useFirstSyncCelebration(
    runHistory.runs,
    runHistory.loading || !runHistory.available,
    showOwnerRunningJourney ? user?.uid ?? null : null,
    RUN_HISTORY_WEEKS * 7 * 86400000,
    profile?.createdAt,
  );

  const runRecap = useMemo(
    () => (showOwnerRunningSummary && !runHistory.loading && runHistory.available ? computeRunWeeklyRecap(runHistory.runs, Date.now()) : null),
    [showOwnerRunningSummary, runHistory.runs, runHistory.loading, runHistory.available],
  );
  const showRecap = runRecap != null && isRecapVisible(Date.now(), seoulWeekday);

  // "최근 8주 러닝 없음" 과 "러닝 이력 자체가 없음" 은 다른 신호다. 둘을 같게 다루면 오래 쉬었다
  // 돌아온 러너에게 "첫 러닝이 도착하면 알려드릴게요" 온보딩이 뜨고 오늘의 워크아웃까지 사라진다.
  // 서버가 유지하는 거리별 기록(records/power.run)을 "달린 적 있음"의 근거로 쓴다.
  const { run: dashRunRecords, loading: recordsLoading } = useRunRecords(showOwnerRunningJourney);
  const hasEverRun = dashRunRecords != null && Object.keys(dashRunRecords).length > 0;
  const hasNoRuns =
    showOwnerRunningJourney &&
    !!user &&
    !runHistory.loading &&
    runHistory.available &&
    !recordsLoading &&
    runHistory.runs.length === 0 &&
    !hasEverRun;

  // 꾸준히 달리는데 임계 페이스가 없으면 목표 페이스·rTSS 해석이 전부 잠긴다 (§3.1).
  // 가끔 달리는 사람에게는 띄우지 않는다 — 잔소리가 되므로.
  const runnerLevel = useMemo(
    () =>
      showOwnerRunningJourney && !runHistory.loading && runHistory.available
        ? estimateRunnerLevel(runHistory.runs, Date.now(), profile?.createdAt ?? null)
        : null,
    [showOwnerRunningJourney, runHistory.runs, runHistory.loading, runHistory.available, profile?.createdAt],
  );
  // profile 이 도착하기 전에는 판단하지 않는다 — 이미 임계 페이스를 설정한 러너에게
  // 넛지가 깜빡 떴다 사라지는 플래시가 생긴다(firstSync 와 같은 프로필 레이스).
  const showThresholdNudge =
    showOwnerRunningJourney && profile != null && runnerLevel?.level === "regular" && !profile.thresholdPace && !hasNoRuns;

  // 신발 교체 임박 — 가장 최근 러닝의 gear 스냅샷에서 파생 (§3.6, 신규 구현 아님)
  const shoeStatus = useMemo(
    () => (showOwnerRunningJourney ? latestShoeStatus(runHistory.runs) : null),
    [showOwnerRunningJourney, runHistory.runs],
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
  const showYearRecapBanner = !!user && selectedDiscipline !== "run" && isYearRecapSeason();

  /**
   * 모바일 피드의 7일 스파크라인은 **일자별 거리 배열**이다. 정본 봉투의 `calendar` 는
   * 일자별 합계를 담지만 이 화면이 쓰는 배열 모양·기준일 규칙과 1:1 이 아니라, 지어낸 매핑
   * 대신 두 값 모두 클라 집계로 남긴다 (#2237). 같은 출처끼리 묶어 둬야 막대와 개수가
   * 서로 어긋나지 않는다.
   */
  const mobileWeeklySummary = { activityCount: recent7DayCount, distances: recent7DayDistances, available: runStats.recent7DayCoverage === "ready" };

  const weekSource = canonicalKpiSource(canonicalHome.enabled, canonicalHome.display, canonicalHome.totals);
  /**
   * 최근 7일 숫자의 출처. 전환이 켜지고 값이 손에 있을 때만 서버 값이고, 그 밖에는
   * 오늘과 똑같은 클라 집계다. **미계산·실패는 여기로 오지 않는다** — 그 경우
   * `weekSource.kind === "state"` 라 아래에서 숫자 자체를 그리지 않는다.
   */
  const sportSpecificWeek = !canonicalHome.enabled && (selectedDiscipline === "bike" || selectedDiscipline === "run");
  const weekTotals = sportSpecificWeek ? thisWeek : weekSource.kind === "server"
    ? canonicalWeekTotals(weekSource.values)
    : thisWeek;
  const weekPresentation = canonicalKpiPresentation(weekSource, {
    value: t("kpi.subRecent7d"),
    pending: t("canonical.pending"),
    failed: t("canonical.failed"),
    empty: t("canonical.empty"),
    staleChip: t("canonical.staleChip"),
  });
  /** false 면 KPI 칸은 숫자 대신 "—" 와 상태 문구다. 0 도, 클라 집계도 아니다. */
  const showWeekNumbers = sportSpecificWeek ? runStats.recent7DayCoverage === "ready" : weekPresentation.showNumbers;
  const weekSub = sportSpecificWeek && runStats.recent7DayCoverage !== "ready"
    ? selectedDiscipline === "run" ? t("kpi.runUnavailable") : t(runStats.recent7DayCoverage === "loading" ? "canonical.pending" : "canonical.failed")
    : weekPresentation.sub;
  const weekChip = sportSpecificWeek ? null : weekPresentation.chip;

  // KPI에선 숫자만 별도, 단위 별도로 표시
  const M_PER_MI = 1609.344;
  const thisWeekDistValue = units === 'imperial'
    ? (weekTotals.distance / M_PER_MI).toFixed(1)
    : (weekTotals.distance / 1000).toFixed(1);
  const distUnit = units === 'imperial' ? 'mi' : 'km';

  // 현재 Fitness는 서버가 게시한 동일 revision의 스냅샷만 소비한다.
  // 페이지네이션 피드로 EMA를 다시 시작하거나 목표 예측을 현재값으로 사용하지 않는다.
  const storedFitness = selectStoredDashboardFitness(userFitness, discipline);

  // 종목별 임계값 KPI
  const thresholdKpi = (() => {
    if (discipline === "run") {
      const pace = profile?.thresholdPace;
      return {
        label: t("kpi.thresholdRunLabel"),
        value: pace ? secToMmss(pace) : "—",
        unit: pace ? t("kpi.thresholdRunUnit") : null,
      };
    }
    // bike (+ tri fallback)
    const ftp = profile?.ftp;
    return {
      label: t("kpi.thresholdBikeLabel"),
      value: ftp ? String(ftp) : "—",
      unit: ftp ? t("kpi.thresholdBikeUnit") : null,
    };
  })();

  // 최근 7일 네 칸. 전환이 켜졌는데 값이 없는 상태면 숫자 자리에 "—" 와 상태 문구가 온다.
  const weekKpi = (label: string, value: string, unit: string | null) => ({
    label,
    value: showWeekNumbers ? value : "—",
    unit: showWeekNumbers ? unit : null,
    delta: null,
    deltaKind: "up" as const,
    // 네 지표의 공통 기간은 그룹 제목으로 올린다. 계산 대기/실패 등 상태 문구는 유지한다.
    sub: showWeekNumbers ? undefined : weekSub,
    chip: weekChip,
  });

  const fitnessSource = canonicalKpiSource(
    canonicalFitness.enabled, canonicalFitness.display, canonicalFitness.values,
  );
  // 서버 값이 손에 있을 때만 갈아탄다. 상태(계산중·실패·없음)면 숫자를 그리지 않는다 —
  // 클라 계산으로 조용히 되돌아가면 사용자는 서버가 멈춘 것을 영영 모른다.
  const kpiFitness = fitnessSource.kind === "server"
    ? discipline === "tri" ? fitnessSource.values : fitnessSource.values.breakdown[discipline]
    : storedFitness;
  const fitnessPresentation = canonicalKpiPresentation(fitnessSource, {
    // 값이 보일 때의 서브 문구는 아래에서 CTL/TSB 로 다시 만든다 — 여기서는 자리만 채운다.
    value: "",
    pending: t("canonical.pending"),
    failed: t("canonical.failed"),
    empty: t("canonical.empty"),
    staleChip: t("canonical.staleChip"),
  });
  // 서버 값이 없거나 CTL이 0이면 숫자 대신 상태를 표시한다.
  const showFitnessNumbers = fitnessPresentation.showNumbers && kpiFitness !== null && kpiFitness.ctl > 0;
  const conditionSummary = <div className="flex flex-col items-start gap-1">
    <Text as="p" variant="bodyMedium" tone="secondary">{!fitnessPresentation.showNumbers
      ? fitnessPresentation.sub
      : showFitnessNumbers
        ? t(kpiFitness!.tsb >= 5 ? "kpi.fitnessMaintain" : kpiFitness!.tsb <= -10 ? "kpi.fitnessRecovery" : "kpi.fitnessBuild")
        : t("kpi.subInsufficient")}</Text>
    {fitnessPresentation.chip && <Chip>{fitnessPresentation.chip}</Chip>}
  </div>;

  const KPI = [
    weekKpi(t("kpi.weekDistance"), thisWeekDistValue, distUnit),
    weekKpi(t(canonicalHome.enabled ? "kpi.activities" : isRunTab ? "kpi.runs" : "kpi.rides"), String(weekTotals.rides), null),
    weekKpi(t("kpi.movingTime"), t("weeklySummary.durationHourMin", { h: Math.floor(weekTotals.time / 3600000), m: Math.floor(weekTotals.time / 60000) % 60 }), null),
    weekKpi(
      t("kpi.elevation"),
      units === 'imperial'
        ? formatNum(Math.round(weekTotals.elevation / 0.3048), i18n.language)
        : formatNum(weekTotals.elevation, i18n.language),
      units === 'imperial' ? 'ft' : 'm',
    ),
  ];

  const runningJourney = showOwnerRunningJourney ? <div data-testid="dashboard-running-journey">
        {/* 러닝 데이터가 없으면 빈 대시보드 대신 첫 동기화 여정을 보여준다 (§3.0) */}
        {hasNoRuns && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <RunEmptyState stravaConnected={!!profile?.stravaConnected} />
          </div>
        )}
        {/* 임계 페이스 설정 유도 — regular 러너에게만 (§3.1) */}
        {showThresholdNudge && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ThresholdPaceNudge visible />
          </div>
        )}

        {/* 신발 교체 임박 — 임박했을 때만 (§3.6) */}
        {showOwnerRunningJourney && !hasNoRuns && shoeStatus?.replacementDue && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ShoeReplacementBadge status={shoeStatus} />
          </div>
        )}

        {/* 첫 러닝 도착 축하 — aha moment 와 같은 릴리스 (§3.0.3) */}
        {firstSync.show && (
          <FirstSyncCelebration activityId={firstSync.activityId} onClose={firstSync.dismiss} />
        )}

  </div> : null;

  const todayStrip = user && !user.isAnonymous ? <HomeTodayStrip discipline={discipline === "tri" ? "bike" : discipline} conditionDiscipline={discipline} weeklyDiscipline={canonicalHome.enabled ? "tri" : discipline}
    fitness={showFitnessNumbers ? kpiFitness : null} conditionSummary={conditionSummary} thresholdSummary={<Text as="p" variant="caption" tone="tertiary"><GlossaryText>{`${thresholdKpi.label} · ${thresholdKpi.value}${thresholdKpi.unit ? ` ${thresholdKpi.unit}` : ""}`}</GlossaryText></Text>} mobile={isMobile}
    monthlyFlowPercent={runStats.monthlyFlowPercent}
    secondaryDetails={showOwnerRunningJourney && !hasNoRuns ? <CrossDisciplineLoadCard fitness={userFitness} discipline="run" /> : null}
    runningRecap={showRecap && runRecap && !hasNoRuns ? <WeeklyRecapCard recap={runRecap} /> : null}
    monthlyKm={monthlyActivityDistance / 1000}
    weeklyAverageKm={weeklyStats.length ? weeklyStats.reduce((sum, week) => sum + week.distance, 0) / weeklyStats.length : 0}
    weeklySummary={<>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">{[
        [t("kpi.weekDistance"), formatDistance(weekTotals.distance, units)],
        [t("kpi.activities"), t("feed.countSuffix", { value: weekTotals.rides })],
        [t("kpi.movingTime"), t("weeklySummary.durationHourMin", { h: Math.floor(weekTotals.time / 3600000), m: Math.floor(weekTotals.time / 60000) % 60 })],
        [t("kpi.elevation"), formatElev(weekTotals.elevation, units)],
      ].map(([label, value]) => <div key={label}><Text as="dt" variant="caption" tone="tertiary"><GlossaryText>{label}</GlossaryText></Text><Text as="dd" variant="dataSmall" mono>{showWeekNumbers ? value : "—"}</Text></div>)}</dl>
      {!showWeekNumbers && <Text as="p" variant="caption" tone="tertiary">{weekSub}</Text>}
      {weekChip && <Chip>{weekChip}</Chip>}
    </>}
    weeklyDetails={isMobile ? null : <>            {user && isRunTab && (() => {
              const weeks = weeklyStats.slice(-8);
              const ready = runStats.coverage === "ready";
              const partial = runStats.coverage === "partial";
              const knownDistances = ready ? weeks.map(week => week.distance).filter(value => Number.isFinite(value) && value >= 0) : [];
              const currentDistance = weeks[weeks.length - 1]?.distance;
              const summary = [
                knownDistances.length ? knownDistances.reduce((sum, value) => sum + value, 0) / knownDistances.length : null,
                knownDistances.length ? Math.max(...knownDistances) : null,
                typeof currentDistance === "number" && Number.isFinite(currentDistance) && (ready ? currentDistance >= 0 : partial && currentDistance > 0) ? currentDistance : null,
              ];
              return <Card padding="none" style={{ padding: "var(--space-4)" }} data-testid="run-weekly-activity">
                <SectionHeader title={t("sidebar.runWeekly.title")} sub={[t("sidebar.runWeekly.sub"), partial ? t("sidebar.weeklyTss.partial") : null].filter(Boolean).join(" · ")} />
                {!ready && !partial && <Text as="p" variant="caption">{t("kpi.runUnavailable")}</Text>}
                <WeeklyTssBars metric="distance" coverage={ready ? "ready" : partial ? "partial" : "unavailable"} showTrainingLoad={false}
                  distanceFormatter={distance => formatDistance(distance * 1000, units)}
                  weeks={weeks.map(week => ({ ...week, tss: null, tssUnknownCount: week.tssUnknownCount ?? 0 }))}
                  tooltipFor={() => ""} />
                <dl className="grid grid-cols-3 gap-2" style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--line-soft)", textAlign: "center" }}>
                  {["avgPerWeek", "peakWeek", "thisWeek"].map((key, index) => <div key={key}>
                    <Text as="dt" variant="caption">{t(`sidebar.weeklyTss.${key}`)}</Text>
                    <Text as="dd" variant="dataSmall" mono>{summary[index] === null ? "—" : `${formatDistance(summary[index]! * 1000, units)}${partial ? "+" : ""}`}</Text>
                  </div>)}
                </dl>
              </Card>;
            })()}
            {/* 주간 이동거리 차트 — TSS는 보조 점수 */}
            {user && !isRunTab && (() => {
              const distanceReady = runStats.coverage === "ready";
              const knownDistances = distanceReady ? weeklyStats.map(week => week.distance).filter(value => Number.isFinite(value) && value >= 0) : [];
              const avgDistance = knownDistances.length ? Math.round(knownDistances.reduce((sum, value) => sum + value, 0) / knownDistances.length) : null;
              const peakDistance = knownDistances.length ? Math.max(...knownDistances) : null;
              const currentWeek = weeklyStats[weeklyStats.length - 1];
              const currentDistance = currentWeek && Number.isFinite(currentWeek.distance) && (distanceReady ? currentWeek.distance >= 0 : runStats.coverage === "partial" && currentWeek.distance > 0) ? `${currentWeek.distance}${distanceReady ? "" : "+"}` : null;
              const knownTssWeeks = distanceReady ? weeklyStats.filter((week): week is typeof week & { tss: number } => week.tss != null) : [];
              const avgTss = knownTssWeeks.length ? Math.round(knownTssWeeks.reduce((sum, week) => sum + week.tss, 0) / knownTssWeeks.length) : null;
              const peakTss = knownTssWeeks.length ? Math.max(...knownTssWeeks.map(week => week.tss)) : null;
              const peakWeeks = knownTssWeeks.filter(week => week.tss === peakTss);
              const loadValue = (value: number | null, included: typeof weeklyStats) => value === null ? "—" : `${included.some(week => week.tssEstimated) ? "≈" : ""}${value}${runStats.coverage === "partial" || included.some(week => week.tssUnknownCount) ? "+" : ""}`;
              const scope = currentWeek?.loadEvidence?.scope;
              const chartSub = [t("sidebar.weeklyTss.sub"), scope ? t(`sidebar.weeklyTss.scope.${scope}`) : null, runStats.coverage === "partial" ? t("sidebar.weeklyTss.partial") : null].filter(Boolean).join(" · ");
              return (
                <Card padding="none" style={{ padding: "var(--space-4)" }}>
                  <SectionHeader title={t("sidebar.weeklyTss.distanceTitle")} sub={chartSub} />
                  <WeeklyTssBars metric="distance" coverage={distanceReady ? "ready" : runStats.coverage === "partial" ? "partial" : "unavailable"}
                    weeks={weeklyStats.map((w) => ({ week: w.week, tss: distanceReady || runStats.coverage === "partial" && (w.tss ?? 0) > 0 ? w.tss ?? null : null, tssEstimated: w.tssEstimated, tssUnknownCount: (w.tssUnknownCount ?? 0) + (runStats.coverage === "partial" ? 1 : 0), loadEvidence: w.loadEvidence, distance: w.distance }))}
                    tooltipFor={(w) => `${w.week}: ${formatTrainingLoad(w, t)}`}
                  />
                  <table aria-label={t("sidebar.weeklyTss.summary")} style={{ width: "100%", tableLayout: "fixed", marginTop: "var(--space-3)", borderTop: "1px solid var(--line-soft)", borderCollapse: "separate", borderSpacing: "0 var(--space-2)" }}>
                    <thead><tr>
                      <th scope="col" style={{ width: "28%" }}><span className="sr-only">{t("sidebar.weeklyTss.metric")}</span></th>
                      {["avgPerWeek", "peakWeek", "thisWeek"].map(key => <th key={key} scope="col"><Text variant="caption" weight={400}>{t(`sidebar.weeklyTss.${key}`)}</Text></th>)}
                    </tr></thead>
                    <tbody>
                      <tr>
                        <th scope="row" style={{ textAlign: "left" }}><Text variant="caption" weight={400}><InfoTip title={t("sidebar.weeklyTss.distanceHelpTitle")} content={t("sidebar.weeklyTss.distanceHelp")} label={t("sidebar.weeklyTss.distanceRow")} termId="weekly-distance-summary">{t("sidebar.weeklyTss.distanceRow")}</InfoTip></Text></th>
                        {[avgDistance, peakDistance, currentDistance].map((value, index) => <td key={index} style={{ textAlign: "center" }}><Text variant="dataSmall" mono>{value ?? "—"}</Text></td>)}
                      </tr>
                      <tr>
                        <th scope="row" style={{ textAlign: "left" }}><Text variant="caption" tone="tertiary" weight={400}><InfoTip title={t("sidebar.weeklyTss.summaryHelpTitle")} content={t("sidebar.weeklyTss.summaryHelp", { count: knownTssWeeks.length })} label={t("sidebar.weeklyTss.loadRow")} termId="weekly-load-summary">{t("sidebar.weeklyTss.loadRow")}</InfoTip></Text></th>
                        {[loadValue(avgTss, knownTssWeeks), loadValue(peakTss, peakWeeks), loadValue(distanceReady || runStats.coverage === "partial" && (currentWeek?.tss ?? 0) > 0 ? currentWeek?.tss ?? null : null, currentWeek ? [currentWeek] : [])].map((value, index) => <td key={index} style={{ textAlign: "center" }}><Text variant="bodySmall" mono tone="tertiary">{value}</Text></td>)}
                      </tr>
                    </tbody>
                  </table>
                </Card>
              );
            })()}

            {user && isRunTab && <Card padding="none" style={{ padding: "var(--space-4)" }} data-testid="run-monthly-distance">
              <SectionHeader title={t("sidebar.runMonth.title", { month: new Date(Date.now() + 9 * 3600000).getUTCMonth() + 1, monthName: new Date().toLocaleDateString(i18n.language, { month: "long", timeZone: "Asia/Seoul" }) })} sub={t("sidebar.runMonth.sub")} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {runStats.coverage !== "ready" ? <Text variant="caption">{t("kpi.runUnavailable")}</Text>
                  : <Text variant="dataMedium" mono>{formatDistance(monthlyActivityDistance, units)}</Text>}
                <Link to="/coach/plan?sport=run" className={buttonClass({ size: "sm", variant: "outline" })}>{t("sidebar.runMonth.plan")}</Link>
              </div>
            </Card>}
</>}
    guidance={showYearRecapBanner ? <Link to="/athlete/me/records">{t("todayStrip.recap")}</Link> : !profile?.stravaConnected ? <Link to="/settings/connections">{t("feed.empty.ctaConnectStrava")}</Link> : null}
  /> : null;

  if (isMobile) {
    return (
      <MobileFeedPage
        todayStrip={todayStrip}
        activitySearch={activitySearch}
        runningJourney={runningJourney}
        activities={activities}
        loading={loading}
        error={feedError}
        onRetry={retryFeed}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        showYearRecapBanner={showYearRecapBanner}
        weeklySummary={mobileWeeklySummary}
        runSummary={mobileSportFilter === "run" && user && !user.isAnonymous ? {
          count: String(thisWeek.rides), distance: formatDistance(thisWeek.distance, units),
          time: formatDuration(thisWeek.time), elevation: formatElev(thisWeek.elevation, units),
          available: runStats.recent7DayCoverage === "ready",
        } : undefined}
        currentUserId={user?.uid ?? null}
        friendIds={[...friendIds]}
        feedScope={feedScope}
        onFeedScopeChange={(scope) => updateDashboardPreferences({ feedScope: scope })}
        sportFilter={mobileSportFilter}
        onSportFilterChange={(sportFilter) => {
          if (sportFilter === "swim") return;
          updateDashboardPreferences({ sportFilter });
          if (requestedDiscipline) {
            const next = new URLSearchParams(searchParams);
            if (sportFilter === "all") next.delete("sport");
            else next.set("sport", sportFilter);
            setSearchParams(next);
          }
        }}
        datePreset={dashboardPreferences.datePreset}
        onDatePresetChange={(datePreset) => updateDashboardPreferences({ datePreset })}
      />
    );
  }

  return (
    <div className="dashboard-home flex flex-col">
        {/* 페이지 헤더 */}
        <PageHeader
          eyebrow={new Date().toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          title={heroTitle}
          subtitle={isAnon ? <span style={{ color: "var(--ink-2)" }}><GlossaryText>{t("header.anonSubtitle")}</GlossaryText></span> : undefined}
          right={
            <>
              {/* 비로그인: 가치 제안 헤더에 실제 로그인 CTA 동반 (#234) —
                  TopNav 와 동일한 signInWithGoogle 트리거 재사용. */}
              {isAnon && (
                <Button onClick={() => { void handleGuestSignIn(); }} loading={signInPending} variant="primary" size="sm">
                  {t("header.anonCta")}
                </Button>
              )}
              <div data-testid="H-0"><div data-testid="H-0-1"><DisciplineTabs value={discipline} disabledKeys={["swim"]} /></div></div>
            </>
          }
        />

        {runningJourney}

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
                  <GlossaryText>{t("yearRecap.desc")}</GlossaryText>
                </Text>
              </div>
              <Link to="/athlete/me/records" className={buttonClass({ variant: "primary", size: "sm" })} style={{ textDecoration: "none", flexShrink: 0 }}>
                {t("yearRecap.cta")}
              </Link>
            </div>
          </Card>
        )}

        {/* 최근 7일 활동 요약 — 컨디션은 사이드바에서 확인한다. */}
        {user && (
          <div className="dashboard-kpi-overview grid gap-3" style={{ marginTop: "var(--space-2)" }}>
            <Card padding="none" style={{ overflow: "hidden" }}>
              <div className="flex items-center justify-between gap-3" style={{ padding: "var(--space-2) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}>
                <Text as="h2" variant="eyebrow" tone="secondary">{t(canonicalHome.enabled ? "kpi.weekGroup" : isRunTab ? "kpi.runWeekGroup" : "kpi.weekGroup")}</Text>
                <Link className={buttonClass({ variant: "ghost", size: "sm" })} to={`/athlete/me/activities?sport=${canonicalHome.enabled || discipline === "tri" ? "all" : discipline}`}>{t("todayStrip.week")}</Link>
              </div>
              <div className="dashboard-kpi-week grid">
                {KPI.map((stat) => (
                  <div key={stat.label} style={{ minWidth: 0, padding: "var(--space-3) var(--space-4)" }}>
                    <StatBlock {...stat} />
                  </div>
                ))}
              </div>
            </Card>

          </div>
        )}

        {/* 메인: 피드 + 사이드바 */}
        <div className="flex gap-5" style={{ marginTop: 'var(--space-3)' }}>
          {/* 피드 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* 헤더: 제목 + 카운트 + 필터 */}
            <div className="flex items-center gap-2" style={{ marginBottom: "var(--space-2)" }}>
              <h2 style={{ fontSize: "var(--fs-base)", fontWeight: 600, color: "var(--ink-0)" }}>{t("feed.title")}</h2>
              {totalCount > 0 && (
                /* 카운트 옆에 "건 · 전체 피드" 컨텍스트 부연 — 이전엔 "1,573" 만 떠 본인/전체 모호.
                   tooltip 은 실제 쿼리(본인 OR visibility==everyone)와 일치하게 "전체 공개 + 내 활동" 으로 표기 (#231). */
                <span
                  style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
                  title={feedScope === "all" ? t("feed.countTooltip") : t(`feed.filter.${feedScope}`)}
                >
                  {t("feed.countSuffix", { value: formatNum(totalCount, i18n.language) })}
                  <span style={{ fontFamily: "var(--font-sans)", color: "var(--ink-3)", marginLeft: 'var(--space-1)' }}>
                    {feedScope === "all" ? t("feed.feedScope") : t(`feed.filter.${feedScope}`)}
                  </span>
                </span>
              )}
              <div className="flex-1" />
              {user && <div data-testid="H1-1" className="flex gap-0.5" style={{ background: "var(--bg-1)", padding: "var(--space-1)", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }}>
                {([t("feed.filter.all"), t("feed.filter.friends"), t("feed.filter.self")] as const).map((label, i) => (
                  <button data-testid="H1-1-1"
                    key={i}
                    onClick={() => updateDashboardPreferences({ feedScope: (["all", "friends", "self"] as const)[i] })}
                    aria-pressed={feedFilter === i}
                    style={{
                      padding: "5px 10px", fontSize: "var(--fs-xs)", borderRadius: "var(--r-sm)", border: "none", cursor: "pointer",
                      background: feedFilter === i ? "var(--bg-3)" : "transparent",
                      color: feedFilter === i ? "var(--ink-0)" : "var(--ink-3)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>}
            </div>

            {/* 검색 입력 */}
            <form onSubmit={handleSearch} style={{ marginBottom: "var(--space-3)" }}>
              <div className="flex gap-2 items-center">
                <div data-testid="H-0-2" style={{ flex: 1, minWidth: 0, position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }} />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t("feed.search.placeholder")}
                    aria-label={t("feed.search.placeholder")}
                    style={{
                      width: "100%", height: "var(--dim-button-height)", minHeight: "var(--dim-button-height)",
                      paddingInlineStart: "calc(var(--space-4) * 2)", paddingInlineEnd: "var(--space-8)",
                      boxSizing: "border-box",
                    }}
                  />
                  {activitySearch.active && (
                    <Button type="button" variant="ghost" iconOnly dense
                      aria-label={t("feed.search.reset")}
                      onClick={handleSearchReset}
                      style={{ position: "absolute", right: "var(--space-0-5)", top: "50%", transform: "translateY(-50%)", color: "var(--ink-2)" }}
                    >
                      <X size={16} aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <Button type="submit" variant="secondary" style={{ height: "var(--dim-button-height)", minHeight: "var(--dim-button-height)" }}>{t("feed.search.submit")}</Button>
              </div>

              {/* 날짜 프리셋 (검색 활성 시만 표시) */}
              {activitySearch.active && (
                <div className="flex gap-1" style={{ marginTop: 'var(--space-2)' }}>
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => activitySearch.setDatePreset(p.value)}
                      aria-pressed={activitySearch.datePreset === p.value}
                      style={{
                        padding: "3px 9px", fontSize: "var(--fs-xs)", borderRadius: "var(--r-sm)", cursor: "pointer",
                        border: "1px solid " + (activitySearch.datePreset === p.value ? "var(--accent-soft-border)" : "var(--line-soft)"),
                        background: activitySearch.datePreset === p.value ? "var(--accent-soft-bg)" : "var(--bg-2)",
                        color: activitySearch.datePreset === p.value ? "var(--ink-1)" : "var(--ink-2)",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  {activitySearch.totalResults > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)", alignSelf: "center" }}>
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
                  <div data-testid="H1-2" className="flex flex-col gap-3.5">
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
                  <div data-testid="H1-2" className="flex flex-col gap-3.5">
                    {activitySearch.results.map((activity, i) => (
                      <div key={activity.id} data-testid="H1-2-1"><ActivityCard activity={activity} priority={i === 0} homeLabels /></div>
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
                  <div data-testid="H1-2" className="flex flex-col gap-3.5">
                    <FeedSkeleton />
                    <FeedSkeleton />
                    <FeedSkeleton />
                  </div>
                )}

                {!loading && feedError && (
                  <EmptyState
                    icon="⚠️"
                    title={activities.length > 0 ? t("feed.partialError.title") : t("feed.error.title")}
                    description={activities.length > 0 ? t("feed.partialError.description") : t("feed.error.description")}
                    actions={[{ label: activities.length > 0 ? t("feed.partialError.retry") : t("feed.error.retry"), variant: "primary", onClick: retryFeed }]}
                  />
                )}

                {!loading && !feedError && filteredActivities.length === 0 && (
                  <EmptyState
                    icon="🚴"
                    title={activities.length > 0 ? t("feed.noMatches.title") : t("feed.empty.title")}
                    description={activities.length > 0 ? t("feed.noMatches.description") : t("feed.empty.description")}
                    actions={activities.length > 0 ? [] : user ? [
                      { label: "Google Play", variant: "primary", href: ORIDER_PLAY_STORE_URL },
                      { label: "App Store", variant: "secondary", href: ORIDER_APP_STORE_URL },
                      { label: t("todayStrip.importHistory"), variant: "secondary", href: "/athlete/me/activities?import=1" },
                    ] : [{ label: signInPending ? t("header.signingIn") : t("header.anonCta"), variant: "primary", onClick: () => { void handleGuestSignIn(); } }]}
                  />
                )}

                {!loading && filteredActivities.length > 0 && (
                  <div data-testid="H1-2" className="flex flex-col gap-3.5">
                    {filteredActivities.map((activity, i) => (
                      <div key={activity.id} data-testid="H1-2-1"><ActivityCard activity={activity} priority={i === 0} homeLabels /></div>
                    ))}
                  </div>
                )}

                {!loading && !feedError && hasMore && (
                  <Button variant="secondary"
                    data-testid="H1-2-3" onClick={loadMore}
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

          <aside className="hidden lg:block w-[340px] flex-shrink-0">
            <div className="space-y-3">
              {todayStrip}
            {/* 한국 자전거 커뮤니티 */}
            {!isRunTab && <Card padding="none" style={{ padding: 'var(--space-4)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("sidebar.community.title")}</Text>
              <div className="flex flex-col gap-2">
                {KOREAN_CYCLING_COMMUNITIES.map((c) => (
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
                    <CommunityLogo {...c} />
                    <div className="min-w-0">
                      <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--ink-0)" }}>{c.name}</div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t(`home.communities.${c.descKey}`)}</div>
                    </div>
                  </a>
                ))}
              </div>
            </Card>}


            </div>
          </aside>
        </div>
      </div>
  );
}
