import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { lazyTimed, beginNavigation } from "./services/routeTiming";
import { useRouteVisitTelemetry } from "./hooks/useRouteVisitTelemetry";
import OfflineBanner from "./components/OfflineBanner";
import { AppErrorFallback } from "./components/AppErrorFallback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5분 캐시
      retry: 1,
    },
  },
});
import { track, setAnalyticsUserId, setAnalyticsUserProperties } from "./services/analytics";
import { isoWeek, activityCountBucket30d } from "./utils/cohort";
import Layout from "./components/Layout";
import { LocaleProvider } from "./contexts/LocaleContext";
import { useAuth } from "./contexts/AuthContext";
import { useToast } from "./contexts/ToastContext";
import { didHandoffFail } from "./services/appHandoff";
import { takeImpersonationFailure } from "./services/impersonation";
import { LocaleRoot } from "./components/i18n/LocaleRoot";
import { LocaleRedirect } from "./components/i18n/LocaleRedirect";
import { LegacyRedirect } from "./components/routing/LegacyRedirect";
import { firestore } from "./services/firebase";

const ActivityPage = lazyTimed("ActivityPage", () => import("./pages/ActivityPage"));
const ActivityEditPage = lazyTimed("ActivityEditPage", () => import("./pages/activity/ActivityEditPage"));
const GroupsPage = lazyTimed("GroupsPage", () => import("./pages/group/GroupsPage"));
const GroupDashboardPage = lazyTimed("GroupDashboardPage", () => import("./pages/group/GroupDashboardPage"));
const GroupRidesPage = lazyTimed("GroupRidesPage", () => import("./pages/group/GroupRidesPage"));
const GroupRidePage = lazyTimed("GroupRidePage", () => import("./pages/group/GroupRidePage"));
const GroupMembersPage = lazyTimed("GroupMembersPage", () => import("./pages/group/GroupMembersPage"));
const GroupInvitePage = lazyTimed("GroupInvitePage", () => import("./pages/group/GroupInvitePage"));
const GroupLeaderboardPage = lazyTimed("GroupLeaderboardPage", () => import("./pages/group/GroupLeaderboardPage"));
const GroupSettingsPage = lazyTimed("GroupSettingsPage", () => import("./pages/group/GroupSettingsPage"));
const SegmentPage = lazyTimed("SegmentPage", () => import("./pages/SegmentPage"));
const AthletePage = lazyTimed("AthletePage", () => import("./pages/AthletePage"));
const AthleteMePage = lazyTimed("AthleteMePage", () => import("./pages/AthleteMePage"));
const StravaCallbackPage = lazyTimed("StravaCallbackPage", () => import("./pages/StravaCallbackPage"));
const SettingsPage = lazyTimed("SettingsPage", () => import("./pages/SettingsPage"));
const FriendsPage = lazyTimed("FriendsPage", () => import("./pages/FriendsPage"));
const MigrationPage = lazyTimed("MigrationPage", () => import("./pages/MigrationPage"));
const FriendInvitePage = lazyTimed("FriendInvitePage", () => import("./pages/FriendInvitePage"));
const TermsPage = lazyTimed("TermsPage", () => import("./pages/TermsPage"));
const PrivacyPage = lazyTimed("PrivacyPage", () => import("./pages/PrivacyPage"));
const AiCoachPolicyPage = lazyTimed("AiCoachPolicyPage", () => import("./pages/AiCoachPolicyPage"));
const CoachHistoryPage = lazyTimed("CoachHistoryPage", () => import("./pages/CoachHistoryPage"));
const CommunityGuidelinesPage = lazyTimed("CommunityGuidelinesPage", () => import("./pages/CommunityGuidelinesPage"));
const BoardPage = lazyTimed("BoardPage", () => import("./pages/BoardPage"));
const PostDetailPage = lazyTimed("PostDetailPage", () => import("./pages/PostDetailPage"));
const CreatePostPage = lazyTimed("CreatePostPage", () => import("./pages/CreatePostPage"));
const CreatorHubPage = lazyTimed("CreatorHubPage", () => import("./pages/CreatorHubPage"));
const AboutPage = lazyTimed("AboutPage", () => import("./pages/AboutPage"));
const StravaTermsPage = lazyTimed("StravaTermsPage", () => import("./pages/StravaTermsPage"));
const CreateSegmentPage = lazyTimed("CreateSegmentPage", () => import("./pages/CreateSegmentPage"));
const CoursePage = lazyTimed("CoursePage", () => import("./pages/CoursePage"));
const CreateCoursePage = lazyTimed("CreateCoursePage", () => import("./pages/CreateCoursePage"));
const CourseEditPage = lazyTimed("CourseEditPage", () => import("./pages/course/CourseEditPage"));
const LeaderboardPage = lazyTimed("LeaderboardPage", () => import("./pages/LeaderboardPage"));
const DiscoverPage = lazyTimed("DiscoverPage", () => import("./pages/DiscoverPage"));
const EventsPage = lazyTimed("EventsPage", () => import("./pages/EventsPage"));
const EventCreatePage = lazyTimed("EventCreatePage", () => import("./pages/EventCreatePage"));
const EventOrganizerPage = lazyTimed("EventOrganizerPage", () => import("./pages/EventOrganizerPage"));
const EventDetailPage = lazyTimed("EventDetailPage", () => import("./pages/event/EventDetailPage"));
const EventDashboardPage = lazyTimed("EventDashboardPage", () => import("./pages/event/EventDashboardPage"));
const EventLivePage = lazyTimed("EventLivePage", () => import("./pages/event/EventLivePage"));
const EventResultsPage = lazyTimed("EventResultsPage", () => import("./pages/event/EventResultsPage"));
const EventRegisterPage = lazyTimed("EventRegisterPage", () => import("./pages/event/EventRegisterPage"));
const EventEditPage = lazyTimed("EventEditPage", () => import("./pages/event/EventEditPage"));
const EventParticipantsPage = lazyTimed("EventParticipantsPage", () => import("./pages/event/EventParticipantsPage"));
const FitnessPage = lazyTimed("FitnessPage", () => import("./pages/FitnessPage"));
const LabPage = lazyTimed("LabPage", () => import("./pages/LabPage"));
const ClimbGoalSetupPage = lazyTimed("ClimbGoalSetupPage", () => import("./pages/ClimbGoalSetupPage"));
const GoalSetupPage = lazyTimed("GoalSetupPage", () => import("./pages/GoalSetupPage"));
const PlanPage = lazyTimed("PlanPage", () => import("./pages/PlanPage"));
const TrainingLogPage = lazyTimed("TrainingLogPage", () => import("./pages/TrainingLogPage"));
const VirtualPowerToolPage = lazyTimed("VirtualPowerToolPage", () => import("./pages/tools/VirtualPowerToolPage"));
const YearRecapPage = lazyTimed("YearRecapPage", () => import("./pages/YearRecapPage"));
const OnboardingPage = lazyTimed("OnboardingPage", () => import("./pages/OnboardingPage"));
const NotFoundPage = lazyTimed("NotFoundPage", () => import("./pages/NotFoundPage"));
const EmbeddedBootstrapRoot = lazyTimed(
  "EmbeddedBootstrapRoot",
  () => import("./embedded/EmbeddedBootstrapRoot"),
);

const LoadingSpinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "var(--ink-3)" }}>
    <div style={{ width: 32, height: 32, border: "3px solid var(--line-soft)", borderTopColor: "var(--lime)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
  </div>
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/:lang" element={<LocaleRoot />}>
        <Route path="live/:eventId" element={<EventLivePage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="embed/activity/:activityId/analysis" element={<EmbeddedBootstrapRoot surfaceKind="activity-analysis" />} />
        <Route path="embed/fitness" element={<EmbeddedBootstrapRoot surfaceKind="fitness" />} />
        <Route path="embed/plan" element={<EmbeddedBootstrapRoot surfaceKind="plan" />} />
        <Route element={<Layout />}>
          <Route index element={null} />
          <Route path="activity/:activityId" element={<ActivityPage />} />
          <Route path="activity/:activityId/edit" element={<ActivityEditPage />} />
          {/* 코치 — 정적(condition·plan·goals·chat)이 옛 coach/:threadId 보다 먼저 매칭 */}
          <Route path="coach/condition" element={<FitnessPage />} />
          <Route path="coach/plan" element={<PlanPage />} />
          <Route path="coach/goals" element={<GoalSetupPage />} />
          <Route path="coach/chat" element={<CoachHistoryPage />} />
          <Route path="coach/chat/:threadId" element={<CoachHistoryPage />} />
          <Route path="lab" element={<LabPage />} />
          <Route path="goal/climb" element={<ClimbGoalSetupPage />} />
          <Route path="goal-setup" element={<GoalSetupPage />} />
          {/* 내 선수 프로필 — athlete/me 는 :userId 보다 먼저 */}
          <Route path="athlete/me" element={<AthleteMePage />} />
          <Route path="athlete/me/activities" element={<TrainingLogPage />} />
          <Route path="athlete/me/records" element={<YearRecapPage />} />
          <Route path="athlete/me/friends" element={<FriendsPage />} />
          <Route path="athlete/me/gear" element={<SettingsPage tab="gear" />} />
          <Route path="athlete/:userId" element={<AthletePage />} />
          {/* 설정 탭 = 하위 경로. 옛 /settings?section= 은 SettingsPage(tab 없음)가 리디렉션 */}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/account" element={<SettingsPage tab="account" />} />
          <Route path="settings/connections" element={<SettingsPage tab="connections" />} />
          <Route path="settings/data" element={<SettingsPage tab="data" />} />
          <Route path="settings/display" element={<SettingsPage tab="display" />} />
          <Route path="settings/developer" element={<SettingsPage tab="developer" />} />
          <Route path="settings/training" element={<SettingsPage tab="training" />} />
          <Route path="settings/*" element={<LegacyRedirect to="/settings/account" />} />
          {/* 클럽 — club/join 정적이 club/:groupId 보다 먼저. 발급 정본은 group/join/:code */}
          <Route path="clubs" element={<GroupsPage />} />
          <Route path="club/join" element={<NotFoundPage />} />
          <Route path="club/join/:code" element={<GroupInvitePage />} />
          <Route path="club/:groupId" element={<GroupDashboardPage />} />
          <Route path="club/:groupId/rides" element={<GroupRidesPage />} />
          <Route path="club/:groupId/rides/:rideId" element={<GroupRidePage />} />
          <Route path="club/:groupId/leaderboard" element={<GroupLeaderboardPage />} />
          <Route path="club/:groupId/members" element={<GroupMembersPage />} />
          <Route path="club/:groupId/settings" element={<GroupSettingsPage />} />
          <Route path="group/join/:code" element={<GroupInvitePage />} />
          <Route path="segment/create" element={<CreateSegmentPage />} />
          <Route path="segment/:segmentId" element={<SegmentPage />} />
          {/* 탐색 — explore/courses·explore/segments 는 Layout에서 직접 렌더: element={null} 유지 필수 (변경 시 이중 렌더) */}
          <Route path="explore/courses" element={null} />
          <Route path="explore/segments" element={null} />
          <Route path="explore/segments/leaderboard" element={<LeaderboardPage />} />
          <Route path="explore/events" element={<EventsPage />} />
          <Route path="explore/events/organize" element={<EventOrganizerPage />} />
          <Route path="explore/challenges" element={<DiscoverPage />} />
          <Route path="explore/clubs" element={<LegacyRedirect to="/clubs" />} />
          <Route path="course/create" element={<CreateCoursePage />} />
          <Route path="course/:courseId/edit" element={<CourseEditPage />} />
          <Route path="course/:courseId" element={<CoursePage />} />
          <Route path="strava/callback" element={<StravaCallbackPage />} />
          <Route path="friend/:code" element={<FriendInvitePage />} />
          <Route path="migrate" element={<MigrationPage />} />
          {/* 커뮤니티 — board/write 정적이 board/:postId 보다 먼저 */}
          <Route path="community/board" element={<BoardPage />} />
          <Route path="community/board/write" element={<CreatePostPage />} />
          <Route path="community/board/:postId" element={<PostDetailPage />} />
          <Route path="community/recipes" element={<CreatorHubPage />} />
          <Route path="community/recipes/:section" element={<CreatorHubPage />} />
          <Route path="tools/virtual-power" element={<VirtualPowerToolPage />} />
          {/* 상대 경로 — /:lang 프리픽스 보존 */}
          <Route path="feedback" element={<Navigate to="../community/board?type=inquiry" replace />} />
          <Route path="feedback/board" element={<Navigate to="../community/board?type=inquiry" replace />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="policies/ai-coach" element={<AiCoachPolicyPage />} />
          <Route path="policies/community" element={<CommunityGuidelinesPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="strava-terms" element={<StravaTermsPage />} />
          <Route path="event/create" element={<EventCreatePage />} />
          {/* Event detail page route */}
          <Route path="event/:eventId" element={<EventDetailPage />} />
          <Route path="event/:eventId/host" element={<EventDashboardPage />} />
          <Route path="event/:eventId/host/edit" element={<EventEditPage />} />
          <Route path="event/:eventId/host/participants" element={<EventParticipantsPage />} />
          <Route path="event/:eventId/results" element={<EventResultsPage />} />
          <Route path="event/:eventId/register" element={<EventRegisterPage />} />
          {/* 옛 경로 → 새 경로 영구 리디렉션(외부 유입·푸시·북마크용). params 치환 + search·hash 보존 */}
          <Route path="fitness" element={<LegacyRedirect to="/coach/condition" />} />
          <Route path="coach" element={<LegacyRedirect to="/coach/chat" />} />
          <Route path="coach/:threadId" element={<LegacyRedirect to="/coach/chat/:threadId" />} />
          <Route path="plan" element={<LegacyRedirect to="/coach/plan" />} />
          <Route path="my" element={<LegacyRedirect to="/athlete/me" />} />
          <Route path="log" element={<LegacyRedirect to="/athlete/me/activities" />} />
          <Route path="year-recap" element={<LegacyRedirect to="/athlete/me/records" />} />
          <Route path="friends" element={<LegacyRedirect to="/athlete/me/friends" />} />
          <Route path="social" element={<LegacyRedirect to="/athlete/me/friends" />} />
          <Route path="groups" element={<LegacyRedirect to="/clubs" />} />
          <Route path="group/:groupId" element={<LegacyRedirect to="/club/:groupId" />} />
          <Route path="group/:groupId/rides" element={<LegacyRedirect to="/club/:groupId/rides" />} />
          <Route path="group/:groupId/ride/:rideId" element={<LegacyRedirect to="/club/:groupId/rides/:rideId" />} />
          <Route path="group/:groupId/leaderboard" element={<LegacyRedirect to="/club/:groupId/leaderboard" />} />
          <Route path="group/:groupId/members" element={<LegacyRedirect to="/club/:groupId/members" />} />
          <Route path="group/:groupId/settings" element={<LegacyRedirect to="/club/:groupId/settings" />} />
          <Route path="courses" element={<LegacyRedirect to="/explore/courses" />} />
          <Route path="explore" element={<LegacyRedirect to="/explore/segments" />} />
          <Route path="discover" element={<LegacyRedirect to="/explore/challenges" />} />
          <Route path="leaderboard" element={<LegacyRedirect to="/explore/segments/leaderboard" />} />
          <Route path="events" element={<LegacyRedirect to="/explore/events" />} />
          <Route path="events/organize" element={<LegacyRedirect to="/explore/events/organize" />} />
          <Route path="event/:eventId/dashboard" element={<LegacyRedirect to="/event/:eventId/host" />} />
          <Route path="event/:eventId/edit" element={<LegacyRedirect to="/event/:eventId/host/edit" />} />
          <Route path="event/:eventId/participants" element={<LegacyRedirect to="/event/:eventId/host/participants" />} />
          <Route path="board" element={<LegacyRedirect to="/community/board" />} />
          <Route path="board/write" element={<LegacyRedirect to="/community/board/write" />} />
          <Route path="board/:postId" element={<LegacyRedirect to="/community/board/:postId" />} />
          <Route path="creator" element={<LegacyRedirect to="/community/recipes" />} />
          <Route path="creator/:section" element={<LegacyRedirect to="/community/recipes/:section" />} />
          <Route path="community" element={<LegacyRedirect to="/policies/community" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={<LocaleRedirect />} />
    </Routes>
  );
}

function StandardApp() {
  const location = useLocation();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { t: tAuth } = useTranslation("auth");

  // 앱→웹 로그인 인계가 실패(만료/재사용/타임아웃)했으면 마운트 직후 1회 안내 —
  // 앱에서 넘어온 사용자가 이유 없이 비로그인 화면을 보는 무음 실패 방지(리뷰 MINOR).
  useEffect(() => {
    if (didHandoffFail()) showToast(tAuth("appHandoffFailed"), "error");
  }, [showToast, tAuth]);

  // 위임 로그인이 중단됐으면 마운트 직후 1회 안내 — 관리자가 전환된 줄 알고
  // 기존(자기) 계정을 만지는 상황을 막는다.
  useEffect(() => {
    const failure = takeImpersonationFailure();
    if (failure) showToast(failure, "error");
  }, [showToast]);

  // 라우트 로드 타이밍 시작점 — **렌더 단계**에서 navStart/pending 을 세팅한다(effect 아님).
  // 캐시된 청크 재방문 시 자식 RouteProbe 의 layout effect 가 부모 effect 보다 먼저 실행되므로,
  // beginNavigation 을 effect 에 두면 재방문 route_load 가 드롭된다(리뷰 #319). location.key 로
  // 멱등 가드 → StrictMode 이중 렌더·suspend 재렌더에도 1회만 적용.
  const navKeyRef = useRef<string | null>(null);
  if (navKeyRef.current !== location.key) {
    navKeyRef.current = location.key;
    beginNavigation(location.pathname, location.key);
  }

  useRouteVisitTelemetry();

  useEffect(() => {
    track("page_view", {
      page_path: location.pathname,
      page_title: document.title,
    });
  }, [location]);

  // userId 동기화 (로그아웃 시 null로 초기화 → 동일 디바이스 새 유저로 카운트)
  useEffect(() => {
    setAnalyticsUserId(user?.uid ?? null);
  }, [user?.uid]);

  // 코호트 분석용 user properties — profile 변경 시 갱신.
  // signup_cohort_week 와 preferred_sport 는 profile 의존이라 같이 묶음.
  useEffect(() => {
    if (!profile) return;
    // 미선택 사용자를 "bike" 로 잘못 cohort 부여하지 않기 위해 기본값은 "unknown".
    // 사용자가 DisciplineTabs 한 번이라도 누르면 localStorage 에 실제 값 저장됨.
    const preferredSport = localStorage.getItem("orider.sport.preferred") ?? "unknown";
    setAnalyticsUserProperties({
      strava_connected: profile.stravaConnected ? "true" : "false",
      has_ftp: profile.ftp ? "true" : "false",
      has_lthr: profile.lthr ? "true" : "false",
      has_css: profile.css ? "true" : "false",
      signup_cohort_week: profile.createdAt ? isoWeek(profile.createdAt) : "unknown",
      preferred_sport: preferredSport,
    });
  }, [
    profile?.stravaConnected,
    profile?.ftp,
    profile?.lthr,
    profile?.css,
    profile?.createdAt,
  ]);

  // activity_count_30d — Firestore count 1회 (세션당). cohort 분석:
  // "활동 많은 유저 vs 적은 유저" retention 비교. 비용: read 1회 (getCountFromServer).
  // since 를 day-bucket 으로 truncate — 같은 날 여러 마운트가 다른 ms 쿼리로 갈리지 않음.
  // 키 이름은 24자 이내 (GA4 user_property name 제한) — 이전 키 activity_count_30d_bucket(25자)
  // 는 FA SDK 가 24자에서 자동 truncate 해서 분석에서 매칭 실패했음.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let idleId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        if (cancelled) return;
        const DAY_MS = 24 * 60 * 60 * 1000;
        const since = Math.floor((Date.now() - 30 * DAY_MS) / DAY_MS) * DAY_MS;
        const q = query(
          collection(firestore, "activities"),
          where("userId", "==", user.uid),
          where("deletedAt", "==", null),
          where("startTime", ">=", since),
        );
        const snap = await getCountFromServer(q);
        if (cancelled) return;
        setAnalyticsUserProperties({
          activity_count_30d: activityCountBucket30d(snap.data().count),
        });
      } catch {
        // 비치명 — 카운트 실패해도 다른 property 영향 없음
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = (window as Window).requestIdleCallback?.(() => { void run(); }, { timeout: 5000 }) ?? null;
    } else {
      timerId = setTimeout(() => { void run(); }, 1500);
    }

    return () => {
      cancelled = true;
      if (idleId != null) (window as Window).cancelIdleCallback?.(idleId);
      if (timerId != null) clearTimeout(timerId);
    };
  }, [user?.uid]);

  return (
    <>
      <OfflineBanner />
      <ErrorBoundary fallback={({ error, reset }) => <AppErrorFallback error={error} reset={reset} />}>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider userId={user?.uid ?? null} profile={profile}>
            <Suspense fallback={<LoadingSpinner />}>
              <AppRoutes />
            </Suspense>
          </LocaleProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </>
  );
}

export function isEmbeddedRoutePath(pathname: string): boolean {
  return /^\/[^/]+\/embed\/(?:activity\/[^/]+\/analysis|fitness|plan)\/?$/.test(pathname);
}

export default function App() {
  const location = useLocation();

  if (isEmbeddedRoutePath(location.pathname)) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <AppRoutes />
      </Suspense>
    );
  }

  return <StandardApp />;
}
