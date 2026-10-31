import WeeklyTssBars from "../components/dashboard/WeeklyTrainingLoadBars";
export { default as WeeklyTssBars } from "../components/dashboard/WeeklyTrainingLoadBars";
export type { WeeklyTssBar } from "../components/dashboard/WeeklyTrainingLoadBars";
import GlossaryText from "../components/common/GlossaryText";
import InfoTip from "../components/InfoTip";
import { GlossaryProvider } from "../components/common/GlossaryProvider";
import { useState, useRef, useMemo, useEffect } from "react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { type Discipline } from "../utils/disciplineFilter";
import { SectionHeader } from "../components/redesign";
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
import Avatar from "../components/Avatar";
import ProfileSocialStats from "../components/profile/ProfileSocialStats";
import { ChevronRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { isSignInCancelled } from "../utils/signInCancelled";
import { useToast } from "../contexts/ToastContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatTrainingLoad } from "../utils/trainingLoadDisplay";
import { formatDistance } from "../utils/units";
import { useActivities, useWeeklyStats, useActivitySearch } from "../hooks/useActivities";
import type { ActivityFeedScope } from "../hooks/useActivities";
import { useFriends } from "../hooks/useFriends";
import { logClientError } from "../services/errorLogger";
import { isYearRecapSeason } from "../utils/yearRecapSeason";
import { useCanonicalHomeSummary } from "../hooks/useCanonicalHomeSummary";
import { useCanonicalFitnessSummary } from "../hooks/useCanonicalFitnessSummary";
import { canonicalKpiPresentation, canonicalKpiSource, canonicalWeekTotals } from "../features/home/canonicalKpiSource";
import { useDashboardPreferences } from "../hooks/useDashboardPreferences";
import { selectStoredDashboardFitness } from "../features/home/storedDashboardFitness";
import HomeTodayStrip from "../components/dashboard/DeferredHomeTodayStrip";
import MobileFeedPage from "../components/mobile/MobileFeedPage";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED } from "../config/activitySubscriptions";
import { useActivitySubscriptions } from "../hooks/useActivitySubscriptions";
import { useMobile } from "../hooks/useMobile";
import { isSportUiEnabled } from "../config/sportFeatures";
import { Button, Card, Chip, Text, buttonClass } from "../theme/components";
import type { Activity } from "@shared/types";
import "./DashboardPage.css";
import { ICON_SIZE } from "../theme/tokens/icon";

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

export default function DashboardPage() {
  return <GlossaryProvider><DashboardContent /></GlossaryProvider>;
}

function DashboardContent() {
  const { t, i18n } = useTranslation("dashboard");
  const { user, profile, loading: authLoading, signIn } = useAuth();
  const { showToast } = useToast();
  const [signInPending, setSignInPending] = useState(false);
  const handleGuestSignIn = async () => {
    if (signInPending) return;
    setSignInPending(true);
    try {
      await signIn();
    } catch (err) {
      if (!isSignInCancelled(err)) showToast(t("header.signInFailed"), "error");
    } finally {
      setSignInPending(false);
    }
  };
  const { preferences: dashboardPreferences } = useDashboardPreferences(
    user?.uid ?? null,
    authLoading,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const feedLocation = useLocation();
  const scopeParam = searchParams.get("scope");
  const dateParam = searchParams.get("date");
  const mobileDatePreset = dateParam === "all" || dateParam === "7d" || dateParam === "30d" || dateParam === "90d" || dateParam === "year" ? dateParam : dashboardPreferences.datePreset;
  const { units } = useLocale();
  const isMobile = useMobile(1024);
  const { friends } = useFriends();
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.userId)), [friends]);
  const requestedFeedScope: ActivityFeedScope = user && !user.isAnonymous ? (scopeParam === "all" || scopeParam === "friends" || scopeParam === "self" || scopeParam === "following" ? scopeParam : dashboardPreferences.feedScope) : "all";
  const feedScope = requestedFeedScope === "following" && !ACTIVITY_SUBSCRIPTIONS_ENABLED ? "all" : requestedFeedScope;
  const sportParam = searchParams.get("sport");
  const parsedDiscipline = normalizeDashboardDiscipline(sportParam);
  const requestedDiscipline = sportParam === "all" ? "tri" : parsedDiscipline === "swim" ? "bike" : parsedDiscipline;
  const requestedSportFilter = sportParam === "all" || parsedDiscipline === "tri" ? "all" : parsedDiscipline ?? dashboardPreferences.sportFilter;
  const mobileSportFilter = isSportUiEnabled(requestedSportFilter) ? requestedSportFilter : "all";
  const discipline: Discipline = isMobile ? (mobileSportFilter === "all" ? "tri" : mobileSportFilter) : requestedDiscipline ?? "bike";
  // 피드 종목: 모바일은 저장된 필터, 데스크톱은 종목 탭(전체 탭은 필터 없음). 서버 쿼리와 화면 판정이 같은 값을 쓴다.
  const feedSportFilter = isMobile ? mobileSportFilter : discipline === "tri" ? "all" : discipline;
  const subscriptions = useActivitySubscriptions(feedScope === "following");
  const { activities, loading: activitiesLoading, loadMore, hasMore, loadingMore, error: activitiesError, retry: retryActivities, hasUnfilteredActivity } = useActivities(feedScope, [...friendIds], {
    navigationKey: `${feedLocation.key}:${feedLocation.search}`,
    feedFilters: { sport: feedSportFilter, datePreset: mobileDatePreset },
    enabled: feedScope !== "following" || subscriptions.ready,
    subscriptionIds: subscriptions.ids,
    subscriptionKey: subscriptions.key,
  });
  const loading = activitiesLoading || feedScope === "following" && subscriptions.loading;
  const feedError = activitiesError || feedScope === "following" && subscriptions.error;
  const retryFeed = () => { if (feedScope === "following" && subscriptions.error) subscriptions.retry(); else retryActivities(); };
  // 정본(서버 집계) 홈 요약 — `homeSummary` 서버 전환 판정 AND 빌드 플래그 뒤에 있다.
  // 꺼져 있으면(오늘의 기본값) 아래 KPI 는 useWeeklyStats 의 클라 집계를 그대로 그린다.
  const canonicalHome = useCanonicalHomeSummary(!isMobile);
  const canonicalFitness = useCanonicalFitnessSummary("homeSummary", !isMobile);
  const searchState = useActivitySearch(friendIds, feedScope === "following" ? subscriptions : undefined, `${feedLocation.key}:${feedLocation.search}`);
  const activitySearch = { ...searchState,
    loading: searchState.loading || feedScope === "following" && subscriptions.loading,
    error: searchState.error || feedScope === "following" && subscriptions.error,
    retry: feedScope === "following" && subscriptions.error ? subscriptions.retry : searchState.retry,
  };

  const queryParam = searchParams.get("q")?.trim() ?? "";
  const { search: searchActivities, reset: resetActivitySearch } = activitySearch;
  useEffect(() => {
    if (queryParam) searchActivities(queryParam, mobileDatePreset);
    else resetActivitySearch();
  }, [queryParam, mobileDatePreset, searchActivities, resetActivitySearch]);
  const selectedDiscipline = isMobile ? mobileSportFilter : discipline;
  const runStats = useWeeklyStats({
    enabled: !isMobile,
    includeMonthlyDistance: !isMobile,
    discipline: selectedDiscipline === "run" ? "run" : undefined,
    recent7DayDiscipline: selectedDiscipline === "all" ? undefined : selectedDiscipline,
  });
  const { weeklyStats, thisWeek, monthlyActivityDistance } = runStats;
  // ── 러닝 탭 전용 데이터 (§3.0 / §3.4c / §3.7) ────────────────────────────
  // 8주 창 하나로 리캡(3주)과 러너 레벨(8주)을 함께 커버한다 — 쿼리 1회.
  const isRunTab = discipline === "run";
  const isRunningJourneyActive = isMobile ? mobileSportFilter === "run" : isRunTab;
  const showOwnerRunningSummary = isRunningJourneyActive && !!user && !user.isAnonymous && !authLoading;
  const showOwnerRunningJourney = showOwnerRunningSummary;
  const RUN_HISTORY_WEEKS = 8;
  const runHistory = useRunHistory(RUN_HISTORY_WEEKS, showOwnerRunningSummary);
  const { fitness: userFitness } = useUserFitness(!isMobile && (showOwnerRunningJourney || (!!user && !user.isAnonymous && !canonicalFitness.enabled)));
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

  const userName = profile?.nickname || user?.displayName || t("header.defaultName");
  // 로그아웃 사용자(광고 유입 첫 인상) 에선 generic "안녕하세요, 라이더님" 대신
  // 가치 제안을 노출. 로그인 후엔 기존 인사말 유지.
  // authLoading 동안엔 익명 카피를 띄우지 않음 — 새로고침 첫 페인트에 로그인
  // 사용자가 익명 헤드라인을 깜빡 보는 현상(#234) 방지.
  const showYearRecapBanner = !!user && !user.isAnonymous && selectedDiscipline !== "run" && isYearRecapSeason();

  /**
   * 모바일 피드의 7일 스파크라인은 **일자별 거리 배열**이다. 정본 봉투의 `calendar` 는
   * 일자별 합계를 담지만 이 화면이 쓰는 배열 모양·기준일 규칙과 1:1 이 아니라, 지어낸 매핑
   * 대신 두 값 모두 클라 집계로 남긴다 (#2237). 같은 출처끼리 묶어 둬야 막대와 개수가
   * 서로 어긋나지 않는다.
   */

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

  const runningJourney = showOwnerRunningJourney ? <div className="desktop-dashboard-journey" data-testid="dashboard-running-journey">
        {/* 러닝 데이터가 없으면 빈 대시보드 대신 첫 동기화 여정을 보여준다 (§3.0) */}
        {hasNoRuns && (
          <div>
            <RunEmptyState stravaConnected={!!profile?.stravaConnected} />
          </div>
        )}
        {/* 임계 페이스 설정 유도 — regular 러너에게만 (§3.1) */}
        {showThresholdNudge && (
          <div>
            <ThresholdPaceNudge visible />
          </div>
        )}

        {/* 신발 교체 임박 — 임박했을 때만 (§3.6) */}
        {showOwnerRunningJourney && !hasNoRuns && shoeStatus?.replacementDue && (
          <div>
            <ShoeReplacementBadge status={shoeStatus} />
          </div>
        )}

        {/* 첫 러닝 도착 축하 — aha moment 와 같은 릴리스 (§3.0.3) */}
        {firstSync.show && (
          <FirstSyncCelebration activityId={firstSync.activityId} onClose={firstSync.dismiss} />
        )}

  </div> : null;

  const todayStrip = !isMobile && user && !user.isAnonymous ? <HomeTodayStrip discipline={discipline === "tri" ? "bike" : discipline} conditionDiscipline={discipline}
    fitness={showFitnessNumbers ? kpiFitness : null} conditionSummary={conditionSummary} thresholdSummary={<Text as="p" variant="caption" tone="tertiary"><GlossaryText>{`${thresholdKpi.label} · ${thresholdKpi.value}${thresholdKpi.unit ? ` ${thresholdKpi.unit}` : ""}`}</GlossaryText></Text>} mobile={isMobile}
    monthlyFlowPercent={runStats.monthlyFlowPercent}
    secondaryDetails={showOwnerRunningJourney && !hasNoRuns ? <CrossDisciplineLoadCard fitness={userFitness} discipline="run" /> : null}
    runningRecap={showRecap && runRecap && !hasNoRuns ? <WeeklyRecapCard recap={runRecap} /> : null}
    monthlyKm={monthlyActivityDistance / 1000}
    weeklyAverageKm={weeklyStats.length ? weeklyStats.reduce((sum, week) => sum + week.distance, 0) / weeklyStats.length : 0}
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
                <dl className="desktop-dashboard-summary">
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
                  <dl className="desktop-dashboard-summary" aria-label={t("sidebar.weeklyTss.summary")}>
                    {["avgPerWeek", "peakWeek", "thisWeek"].map((key, index) => {
                      const distance = [avgDistance, peakDistance, currentDistance][index];
                      const load = [loadValue(avgTss, knownTssWeeks), loadValue(peakTss, peakWeeks), loadValue(distanceReady || runStats.coverage === "partial" && (currentWeek?.tss ?? 0) > 0 ? currentWeek?.tss ?? null : null, currentWeek ? [currentWeek] : [])][index];
                      return <div key={key}>
                        <Text as="dt" variant="caption">{t(`sidebar.weeklyTss.${key}`)}</Text>
                        <dd>
                          <div><Text variant="caption" tone="tertiary"><InfoTip title={t("sidebar.weeklyTss.distanceHelpTitle")} content={t("sidebar.weeklyTss.distanceHelp")} label={t("sidebar.weeklyTss.distanceRow")} termId="weekly-distance-summary">{t("sidebar.weeklyTss.distanceRow")}</InfoTip></Text><Text variant="dataSmall" mono>{distance ?? "—"}</Text></div>
                          <div><Text variant="caption" tone="tertiary"><InfoTip title={t("sidebar.weeklyTss.summaryHelpTitle")} content={t("sidebar.weeklyTss.summaryHelp", { count: knownTssWeeks.length })} label={t("sidebar.weeklyTss.loadRow")} termId="weekly-load-summary">{t("sidebar.weeklyTss.loadRow")}</InfoTip></Text><Text variant="bodySmall" mono tone="tertiary">{load}</Text></div>
                        </dd>
                      </div>;
                    })}
                  </dl>
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

  const activityFeed = <MobileFeedPage
    activitySearch={activitySearch}
    runningJourney={isMobile ? runningJourney : undefined}
    activities={activities}
    loading={loading}
    error={feedError}
    onRetry={retryFeed}
    hasMore={hasMore}
    loadingMore={loadingMore}
    onLoadMore={loadMore}
    showYearRecapBanner={isMobile && showYearRecapBanner}
    currentUserId={user?.uid ?? null}
    friendIds={[...friendIds]}
    subscriptionIds={subscriptions.ids}
    unavailableMessage={feedScope === "following" && subscriptions.unavailable ? t("feed.subscriptionsUnavailable") : undefined}
    feedScope={feedScope}
    sportFilter={feedSportFilter}
    datePreset={mobileDatePreset}
    hasUnfilteredActivity={hasUnfilteredActivity}
  />;
  if (isMobile) return activityFeed;

  return <div className="desktop-dashboard">
    <div className="desktop-dashboard-layout">
      <aside className="desktop-dashboard-left" aria-label={t("header.defaultName")}>
    <div className="desktop-dashboard-tabs" data-testid="H-0"><div data-testid="H-0-1"><DisciplineTabs value={discipline} disabledKeys={isSportUiEnabled("swim") ? ["swim"] : []} onChange={next => setSearchParams(previous => {
      const params = new URLSearchParams(previous);
      params.set("sport", next === "tri" ? "all" : next);
      return params;
    })} /></div></div>
        <Card className="desktop-dashboard-identity">
          {user && !user.isAnonymous ? <>
            <Link to="/athlete/me" className="desktop-dashboard-profile"><Avatar name={userName} imageUrl={profile?.photoURL || user.photoURL} size="xl" /><Text as="h2" variant="subtitle" weight={600}>{userName}</Text></Link>
            <ProfileSocialStats />
            <Link to={`/athlete/me/activities?sport=${canonicalHome.enabled || discipline === "tri" ? "all" : discipline}`} className="desktop-dashboard-profile-link"><span>{t("todayStrip.week")}</span><ChevronRight size={ICON_SIZE.md} aria-hidden="true" /></Link>
          </> : <>
            <Text as="h2" variant="subtitle" weight={600}>{t("header.anonTitle")}</Text>
            <Text as="p" variant="bodySmall" tone="secondary">{t("header.anonSubtitle")}</Text>
            <Button variant="primary" size="sm" onClick={() => { void handleGuestSignIn(); }} loading={signInPending}>{t("header.anonCta")}</Button>
          </>}
        </Card>
        {user && <Card className="desktop-dashboard-week">
          <SectionHeader title={t(canonicalHome.enabled ? "kpi.weekGroup" : isRunTab ? "kpi.runWeekGroup" : "kpi.weekGroup")} />
          <dl className="dashboard-kpi-week">{KPI.map(stat => <div key={stat.label}>
            <dt><Text variant="caption" tone="tertiary"><GlossaryText>{stat.label}</GlossaryText></Text></dt>
            <dd><Text variant="dataSmall" weight={600}>{stat.value}</Text>{stat.unit && <Text variant="caption" tone="secondary"> {stat.unit}</Text>}</dd>
          </div>)}</dl>
          {!showWeekNumbers && <Text as="p" variant="caption" tone="secondary" className="mt-3">{weekSub}</Text>}
          {weekChip && <Chip>{weekChip}</Chip>}
        </Card>}
        {runningJourney}
        {showYearRecapBanner && <Card><Link to="/athlete/me/records">{t("yearRecap.title")}</Link></Card>}
      </aside>
      <section className="desktop-dashboard-feed" aria-label={t("feed.title")}>
        {activityFeed}
      </section>
      <aside className="desktop-dashboard-right">
        {todayStrip}
        {!isRunTab && <Card padding="card" className="desktop-dashboard-community">
          <Text as="h2" variant="eyebrow">{t("sidebar.community.title")}</Text>
          <div className="desktop-dashboard-community-list">{KOREAN_CYCLING_COMMUNITIES.map(community => <a key={community.name} href={community.url} target="_blank" rel="noopener noreferrer">
            <CommunityLogo {...community} />
            <span><strong>{community.name}</strong><Text as="span" variant="caption" tone="tertiary">{t(`home.communities.${community.descKey}`)}</Text></span>
          </a>)}</div>
        </Card>}
      </aside>
    </div>
  </div>;
}
