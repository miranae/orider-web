import { useNotificationInbox } from "../hooks/useNotificationInbox";
import { NotificationInboxStatus } from "./notifications/NotificationInboxStatus";
import { useMainScrollPosition } from "../hooks/useMainScrollPosition";
import { Suspense, useState, useEffect, useRef } from "react";
import GlossaryProvider from "./common/GlossaryProvider";
import "../pages/coach/CoachSurface.css";
import FooterNavigation from "./FooterNavigation";
import { Outlet, useLocation } from "react-router-dom";
import { lazyWithRetry as lazy } from "../utils/lazyWithRetry";
import { stripLangPrefix } from "../i18n/detector";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import {
  collection, onSnapshot,
} from "firebase/firestore";
import { firestore, auth } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Notification } from "@shared/types";
// ExplorePage / CoursesPage 는 mapbox-gl(1.7MB) 정적 의존성이라 lazy 로 분리.
// `/` (홈) 진입 시 vendor-mapbox chunk 가 entry preload 되는 문제 해소.
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const ExplorePage = lazy(() => import("../pages/ExplorePage"));
const CoursesPage = lazy(() => import("../pages/CoursesPage"));
import { TopNav } from "./redesign";
import MobileTabBar from "./mobile/MobileTabBar";
import HubSubNav from "./HubSubNav";
import { resolveDetailHub, isHubSubRoute } from "../config/navHubs";
import { sanitizeInternalReturnPath } from "../utils/internalReturnPath";
import { recordRouteRedirect } from "../services/routeLoopTelemetry";
// 네비 IA는 5개 기본 허브와 설정 유틸리티 허브를 config/navHubs.ts 에서 공유한다.
const NotifSheet = lazy(() => import("./mobile/NotifSheet"));

export function shouldBypassOnboardingRedirect(path: string): boolean {
  return (
    path === "/onboarding" ||
    path === "/settings" ||
    path.startsWith("/settings/") ||
    path === "/strava/callback" ||
    path === "/auth/social/callback" ||
    path === "/migrate" ||
    path === "/terms" ||
    path === "/privacy" ||
    path === "/account-deletion" ||
    path === "/partnership" ||
    path.startsWith("/partnership/") ||
    path === "/community" ||
    path.startsWith("/policies/") ||
    path === "/strava-terms"
  );
}

export function buildOnboardingRedirectTarget(pathname: string, search = "", hash = ""): string {
  const path = stripLangPrefix(pathname);
  if (path === "/") return "/onboarding";
  const returnTo = `${path}${search}${hash}`;
  return `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;
}

export function notificationTarget(notification: Notification): string | null {
  if (notification.access === "unavailable" || notification.type === "unavailable") return null;
  if (notification.activityId) return `/activity/${encodeURIComponent(notification.activityId)}${notification.type === "comment" && notification.commentId ? `?comment=${encodeURIComponent(notification.commentId)}` : ""}`;
  if (notification.segmentId) return `/segment/${encodeURIComponent(notification.segmentId)}`;
  if (notification.type === "friend_request") return "/athlete/me/friends?tab=requests";
  if (notification.type === "friend_accept") {
    const uid = notification.fromUserId;
    return typeof uid === "string" && uid.trim() && uid !== "." && uid !== ".." && !uid.includes("/") && !uid.includes("\\")
      && !Array.from(uid).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
      ? `/athlete/${encodeURIComponent(uid)}` : "/athlete/me/friends";
  }
  if (notification.type === "group_invite" || notification.type === "group_request_approved") return notification.groupId ? `/club/${encodeURIComponent(notification.groupId)}` : "/clubs";
  if (notification.type === "group_request_rejected") return "/clubs";
  if (notification.eventId) return `/event/${encodeURIComponent(notification.eventId)}`;
  if (notification.type === "coach_prescription") return notification.threadId ? `/coach/chat/${encodeURIComponent(notification.threadId)}` : "/coach/chat";
  return notification.deepLink ? sanitizeInternalReturnPath(notification.deepLink) : null;
}

function DashboardShell() {
  return (
    <div className="site-shell grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_320px] md:py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <div className="mb-3 h-5 w-44 rounded-[var(--r-sm)]" style={{ background: "var(--bg-3)" }} />
          <div className="h-3 w-64 max-w-full rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-[var(--r-lg)] border" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }} />
          ))}
        </div>
        <div className="h-72 rounded-[var(--r-lg)] border" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }} />
      </section>
      <aside className="hidden space-y-4 md:block">
        <div className="h-40 rounded-[var(--r-lg)] border" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }} />
        <div className="h-64 rounded-[var(--r-lg)] border" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }} />
      </aside>
    </div>
  );
}

export default function Layout() {
  const [notifOpen, setNotifOpen] = useState(false);
  const inbox = useNotificationInbox();
  const notifications = inbox.items;
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const path = stripLangPrefix(location.pathname);
  const activeNav = resolveDetailHub(path, location.state);
  const mainRef = useRef<HTMLElement>(null);
  useMainScrollPosition(mainRef, user);
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  // 온보딩 리다이렉트: step이 설정됐지만 "done"이 아닌 신규 유저
  useEffect(() => {
    if (
      user && !user.isAnonymous &&
      profile?.onboardingStep &&
      profile.onboardingStep !== "done" &&
      !shouldBypassOnboardingRedirect(path)
    ) {
      recordRouteRedirect({
        fromPath: path,
        toPath: "/onboarding",
        reason: "onboarding_required",
        onboardingStep: profile.onboardingStep,
      });
      navigate(buildOnboardingRedirectTarget(location.pathname, location.search, location.hash), { replace: true });
    }
  }, [user, profile?.onboardingStep, path, navigate, location.pathname, location.search, location.hash]);

  // Map 컴포넌트는 내부적으로 ResizeObserver를 사용하여 자동 리사이즈됨


  useEffect(() => {
    if (!user) {
      setFriendRequestCount(0);
      return;
    }
    return onSnapshot(
      collection(firestore, "friend_requests", user.uid, "items"),
      (snap) => setFriendRequestCount(snap.size),
      () => setFriendRequestCount(0),
    );
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => { void inbox.markRead(notifications.filter(item => !item.read).map(item => item.id)); };
  const handleNotificationClick = (notification: Notification) => {
    if (!user || user.isAnonymous || auth.currentUser?.uid !== user.uid || !notifications.some(item => item.id === notification.id)) return;
    const target = notificationTarget(notification);
    // Destination readiness must not wait for an offline/read-receipt write.
    if (target) navigate(target);
    if (!notification.read) void inbox.markRead([notification.id]);
  };
  const notificationStatus = <NotificationInboxStatus empty={!notifications.length} loading={inbox.loading} failed={inbox.failed} hasMore={inbox.hasMore}
    onRetry={() => void inbox.refresh()} onMore={() => void inbox.more()} />;

  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: 'var(--bg-0)', color: 'var(--ink-1)' }}>
      <TopNav
        active={activeNav}
        notifications={notifications}
        notificationStatus={notificationStatus}
        unreadCount={unreadCount}
        friendRequestCount={friendRequestCount}
        onMarkAllRead={handleMarkAllRead}
        onNotificationClick={(notification) => { void handleNotificationClick(notification); }}
        onMobileNotifClick={() => { if (!notifOpen) void inbox.refresh(); setNotifOpen(!notifOpen); }}
        onNotificationsOpen={() => void inbox.refresh()}
      />

      {/* 대시보드: 데스크톱/모바일 모두 페이지 전체 스크롤 (워크아웃·KPI 포함) */}
      {path === "/" && (
        <main ref={mainRef} tabIndex={-1} className="site-main flex-1 overflow-x-hidden overflow-y-auto relative z-0 pb-[calc(54px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <div className="site-shell md:px-6 md:py-6" data-page-shell="home">
            <Suspense fallback={<DashboardShell />}>
              <DashboardPage />
            </Suspense>
          </div>
        </main>
      )}

      {/* 다른 페이지: main 영역 내부 스크롤 */}
      {path !== "/" && (
        <main ref={mainRef} tabIndex={-1} className="site-main flex-1 overflow-x-hidden overflow-y-auto relative z-0 pb-[calc(54px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <div className={`site-shell site-shell--padded py-6 animate-page-in${path.startsWith("/coach/") ? " coach-surface" : ""}`} data-page-shell="content">
            {isHubSubRoute(path) && <HubSubNav hubKey={activeNav} />}
            <Suspense fallback={<div style={{ height: 200 }} />}>
              {path === "/explore/segments" && <ExplorePage />}
              {path === "/explore/courses" && <CoursesPage />}
            </Suspense>
            {(path.startsWith("/coach/") || path === "/clubs" || path.startsWith("/club/")) ? <GlossaryProvider scopeKey={`${location.pathname}${location.search}`}><Outlet /></GlossaryProvider> : <Outlet />}
          </div>
        </main>
      )}

      {/* Common desktop footer; mobile legal links remain in the utility menu. */}
      <footer data-testid={path === "/" ? "H-F" : undefined}
        className="hidden lg:block flex-shrink-0 border-t"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-1)' }}
      >
        <div className="site-shell site-shell--padded py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
          <span className="flex items-center gap-2">&copy; 2026 Orider <span className="inline-block px-1.5 py-0.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] font-medium" style={{ background: 'var(--amber)', color: 'var(--bg-0)', opacity: 0.85 }}>Beta</span><span className="flex items-center gap-1" style={{ color: 'var(--ink-3)' }}><svg className="w-3 h-3 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>Powered by Strava</span></span>
          <div data-testid={path === "/" ? "H-F-1" : undefined}><FooterNavigation /></div>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <MobileTabBar active={activeNav} />

      {/* Mobile notification bottom sheet */}
      {notifOpen && (
        <Suspense fallback={null}>
          <NotifSheet
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            notifications={notifications}
            notificationStatus={notificationStatus}
            onMarkAllRead={handleMarkAllRead}
            onNotificationClick={(notification) => { void handleNotificationClick(notification); }}
          />
        </Suspense>
      )}
    </div>
  );
}
