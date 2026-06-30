import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { lazyTimed, beginNavigation } from "./services/routeTiming";

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
import { LocaleRoot } from "./components/i18n/LocaleRoot";
import { LocaleRedirect } from "./components/i18n/LocaleRedirect";
import { firestore } from "./services/firebase";

const ActivityPage = lazyTimed("ActivityPage", () => import("./pages/ActivityPage"));
const ActivityUploadPage = lazyTimed("ActivityUploadPage", () => import("./pages/activity/ActivityUploadPage"));
const ActivityEditPage = lazyTimed("ActivityEditPage", () => import("./pages/activity/ActivityEditPage"));
const GroupsPage = lazyTimed("GroupsPage", () => import("./pages/group/GroupsPage"));
const GroupDashboardPage = lazyTimed("GroupDashboardPage", () => import("./pages/group/GroupDashboardPage"));
const GroupRidesPage = lazyTimed("GroupRidesPage", () => import("./pages/group/GroupRidesPage"));
const GroupRidePage = lazyTimed("GroupRidePage", () => import("./pages/group/GroupRidePage"));
const GroupMembersPage = lazyTimed("GroupMembersPage", () => import("./pages/group/GroupMembersPage"));
const GroupLeaderboardPage = lazyTimed("GroupLeaderboardPage", () => import("./pages/group/GroupLeaderboardPage"));
const GroupSettingsPage = lazyTimed("GroupSettingsPage", () => import("./pages/group/GroupSettingsPage"));
const SegmentPage = lazyTimed("SegmentPage", () => import("./pages/SegmentPage"));
const AthletePage = lazyTimed("AthletePage", () => import("./pages/AthletePage"));
const StravaCallbackPage = lazyTimed("StravaCallbackPage", () => import("./pages/StravaCallbackPage"));
const SettingsPage = lazyTimed("SettingsPage", () => import("./pages/SettingsPage"));
const FriendsPage = lazyTimed("FriendsPage", () => import("./pages/FriendsPage"));
const MigrationPage = lazyTimed("MigrationPage", () => import("./pages/MigrationPage"));
const FriendInvitePage = lazyTimed("FriendInvitePage", () => import("./pages/FriendInvitePage"));
const TermsPage = lazyTimed("TermsPage", () => import("./pages/TermsPage"));
const PrivacyPage = lazyTimed("PrivacyPage", () => import("./pages/PrivacyPage"));
const CommunityGuidelinesPage = lazyTimed("CommunityGuidelinesPage", () => import("./pages/CommunityGuidelinesPage"));
const BoardPage = lazyTimed("BoardPage", () => import("./pages/BoardPage"));
const PostDetailPage = lazyTimed("PostDetailPage", () => import("./pages/PostDetailPage"));
const CreatePostPage = lazyTimed("CreatePostPage", () => import("./pages/CreatePostPage"));
const CreatorHubPage = lazyTimed("CreatorHubPage", () => import("./pages/CreatorHubPage"));
const StravaTermsPage = lazyTimed("StravaTermsPage", () => import("./pages/StravaTermsPage"));
const CreateSegmentPage = lazyTimed("CreateSegmentPage", () => import("./pages/CreateSegmentPage"));
const CoursePage = lazyTimed("CoursePage", () => import("./pages/CoursePage"));
const CreateCoursePage = lazyTimed("CreateCoursePage", () => import("./pages/CreateCoursePage"));
const CourseEditPage = lazyTimed("CourseEditPage", () => import("./pages/course/CourseEditPage"));
const LeaderboardPage = lazyTimed("LeaderboardPage", () => import("./pages/LeaderboardPage"));
const DiscoverPage = lazyTimed("DiscoverPage", () => import("./pages/DiscoverPage"));
const EventsPage = lazyTimed("EventsPage", () => import("./pages/EventsPage"));
const EventCreatePage = lazyTimed("EventCreatePage", () => import("./pages/EventCreatePage"));
const EventDetailPage = lazyTimed("EventDetailPage", () => import("./pages/event/EventDetailPage"));
const EventDashboardPage = lazyTimed("EventDashboardPage", () => import("./pages/event/EventDashboardPage"));
const EventLivePage = lazyTimed("EventLivePage", () => import("./pages/event/EventLivePage"));
const EventResultsPage = lazyTimed("EventResultsPage", () => import("./pages/event/EventResultsPage"));
const EventRegisterPage = lazyTimed("EventRegisterPage", () => import("./pages/event/EventRegisterPage"));
const EventEditPage = lazyTimed("EventEditPage", () => import("./pages/event/EventEditPage"));
const EventParticipantsPage = lazyTimed("EventParticipantsPage", () => import("./pages/event/EventParticipantsPage"));
const FitnessPage = lazyTimed("FitnessPage", () => import("./pages/FitnessPage"));
const LabPage = lazyTimed("LabPage", () => import("./pages/LabPage"));
const GoalSetupPage = lazyTimed("GoalSetupPage", () => import("./pages/GoalSetupPage"));
const PlanPage = lazyTimed("PlanPage", () => import("./pages/PlanPage"));
const TrainingLogPage = lazyTimed("TrainingLogPage", () => import("./pages/TrainingLogPage"));
const SocialPage = lazyTimed("SocialPage", () => import("./pages/SocialPage"));
const MyPage = lazyTimed("MyPage", () => import("./pages/MyPage"));
const OnboardingPage = lazyTimed("OnboardingPage", () => import("./pages/OnboardingPage"));

const LoadingSpinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--ink-3)" }}>
    <div style={{ width: 32, height: 32, border: "3px solid var(--line-soft)", borderTopColor: "var(--lime)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
  </div>
);

function StaticAboutRedirect() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = i18n.language.startsWith("en") ? "en" : "ko";
    window.location.assign(`/${lang}/about/index.html`);
  }, [i18n.language]);

  return <LoadingSpinner />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/:lang" element={<LocaleRoot />}>
        <Route path="live/:eventId" element={<EventLivePage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route element={<Layout />}>
          <Route index element={null} />
          <Route path="activity/upload" element={<ActivityUploadPage />} />
          <Route path="activity/:activityId" element={<ActivityPage />} />
          <Route path="activity/:activityId/edit" element={<ActivityEditPage />} />
          <Route path="fitness" element={<FitnessPage />} />
          <Route path="lab" element={<LabPage />} />
          <Route path="goal-setup" element={<GoalSetupPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="log" element={<TrainingLogPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="group/:groupId" element={<GroupDashboardPage />} />
          <Route path="group/:groupId/rides" element={<GroupRidesPage />} />
          <Route path="group/:groupId/ride/:rideId" element={<GroupRidePage />} />
          <Route path="group/:groupId/leaderboard" element={<GroupLeaderboardPage />} />
          <Route path="group/:groupId/members" element={<GroupMembersPage />} />
          <Route path="group/:groupId/settings" element={<GroupSettingsPage />} />
          <Route path="segment/create" element={<CreateSegmentPage />} />
          <Route path="segment/:segmentId" element={<SegmentPage />} />
          {/* Layout에서 직접 렌더 — element={null} 유지 필수 (변경 시 이중 렌더) */}
          <Route path="courses" element={null} />
          <Route path="course/create" element={<CreateCoursePage />} />
          <Route path="course/:courseId/edit" element={<CourseEditPage />} />
          <Route path="course/:courseId" element={<CoursePage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="athlete/:userId" element={<AthletePage />} />
          {/* Layout에서 직접 렌더 — element={null} 유지 필수 (변경 시 이중 렌더) */}
          <Route path="explore" element={null} />
          <Route path="strava/callback" element={<StravaCallbackPage />} />
          <Route path="friend/:code" element={<FriendInvitePage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="social" element={<SocialPage />} />
          <Route path="my" element={<MyPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="migrate" element={<MigrationPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="board/write" element={<CreatePostPage />} />
          <Route path="board/:postId" element={<PostDetailPage />} />
          <Route path="creator" element={<CreatorHubPage />} />
          {/* 상대 경로 — /:lang 프리픽스 보존 */}
          <Route path="feedback" element={<Navigate to="board?type=inquiry" replace />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="community" element={<CommunityGuidelinesPage />} />
          <Route path="about" element={<StaticAboutRedirect />} />
          <Route path="strava-terms" element={<StravaTermsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="event/create" element={<EventCreatePage />} />
          {/* Event detail page route */}
          <Route path="event/:eventId" element={<EventDetailPage />} />
          <Route path="event/:eventId/dashboard" element={<EventDashboardPage />} />
          <Route path="event/:eventId/results" element={<EventResultsPage />} />
          <Route path="event/:eventId/register" element={<EventRegisterPage />} />
          <Route path="event/:eventId/edit" element={<EventEditPage />} />
          <Route path="event/:eventId/participants" element={<EventParticipantsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<LocaleRedirect />} />
    </Routes>
  );
}

export default function App() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const { user, profile } = useAuth();

  // 라우트 로드 타이밍 시작점 — **렌더 단계**에서 navStart/pending 을 세팅한다(effect 아님).
  // 캐시된 청크 재방문 시 자식 RouteProbe 의 layout effect 가 부모 effect 보다 먼저 실행되므로,
  // beginNavigation 을 effect 에 두면 재방문 route_load 가 드롭된다(리뷰 #319). location.key 로
  // 멱등 가드 → StrictMode 이중 렌더·suspend 재렌더에도 1회만 적용.
  const navKeyRef = useRef<string | null>(null);
  if (navKeyRef.current !== location.key) {
    navKeyRef.current = location.key;
    beginNavigation(location.pathname, location.key);
  }

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
    <ErrorBoundary
      fallback={({ error }) => (
        <div role="alert" aria-live="assertive" className="max-w-md mx-auto px-4 py-16 text-center">
          <h2 className="text-[length:var(--fs-xl)] font-bold mb-2" style={{ color: 'var(--ink-0)' }}>{t("error.boundaryTitle")}</h2>
          <p className="text-[length:var(--fs-sm)] mb-4" style={{ color: 'var(--ink-3)' }}>
            {error?.toString() || t("error.unknownError")}
          </p>
          <button
            onClick={() => window.location.reload()}
            aria-label={t("error.reloadAriaLabel")}
            className="px-4 py-2 bg-[var(--lime)] text-[var(--bg-0)] rounded-[var(--r-lg)] hover:opacity-90"
          >
            {t("error.reload")}
          </button>
        </div>
      )}
    >
      <QueryClientProvider client={queryClient}>
        <LocaleProvider userId={user?.uid ?? null}>
          <Suspense fallback={<LoadingSpinner />}>
            <AppRoutes />
          </Suspense>
        </LocaleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
