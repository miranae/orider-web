import type { ReactNode } from "react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import { Bell, Settings, LogIn, LogOut, User, Users, Bike, Activity, Trophy, Menu, X } from "lucide-react";
import iconSvg from "../../assets/icon.svg";
import { useAuth } from "../../contexts/AuthContext";
import { isSignInCancelled } from "../../utils/signInCancelled";
import { useToast } from "../../contexts/ToastContext";
import { LanguageToggle } from "../i18n/LanguageToggle";
import type { Notification } from "@shared/types";
import { Button } from "../../theme/components";
import { PRIMARY_HUBS, type HubKey } from "../../config/navHubs";
import MobileMenuSearch from "./MobileMenuSearch";
import "./TopNav.css";
import { timeAgo } from "../../utils/timeAgo";
import { ICON_SIZE } from "../../theme/tokens/icon";

const navFocusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]";
const navIconButtonClass = `flex items-center justify-center ${navFocusClass}`;
const mobileMenuItemClass = `rounded-[var(--r-md)] ${navFocusClass}`;

// 데스크톱 메뉴와 모바일 하단 탭은 config/navHubs.ts 의 기본 허브를 공유한다.
interface TopNavProps {
  active: HubKey;
  notifications?: Notification[];
  notificationStatus?: ReactNode;
  onNotificationsOpen?: () => void;
  unreadCount?: number;
  friendRequestCount?: number;
  onMarkAllRead?: () => void;
  onNotificationClick?: (notification: Notification) => void;
  onMobileNotifClick?: () => void;
}

export default function TopNav({ active, notifications = [], unreadCount = 0, friendRequestCount = 0, onMarkAllRead, onNotificationClick, onMobileNotifClick, notificationStatus, onNotificationsOpen }: TopNavProps) {
  const { t } = useTranslation('common');
  const { user, profile, signIn, logout } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const NAV_ITEMS = useMemo(
    () => PRIMARY_HUBS.map(({ key, labelKey, to }) => ({ key, label: t(labelKey), to })),
    [t]
  );
  const settingsActive = active === "settings";
  const accountItems = [
    { to: "/athlete/me", labelKey: "nav.my", icon: User },
    { to: "/athlete/me/activities", labelKey: "nav.log", icon: Activity },
    { to: "/athlete/me/records", labelKey: "nav.records", icon: Trophy },
    { to: "/athlete/me/friends", labelKey: "nav.friends", icon: Users },
    { to: "/athlete/me/gear", labelKey: "nav.equipment", icon: Bike },
    { to: "/settings/account", labelKey: "nav.settings", icon: Settings },
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signInPending, setSignInPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileHistoryPushedRef = useRef(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const handleSignInWithGoogle = useCallback(async () => {
    if (signInPending) return;
    setSignInPending(true);
    try {
      await signIn();
    } catch (err) {
      if (!isSignInCancelled(err)) showToast(t("auth.loginFailed"), "error");
    } finally {
      setSignInPending(false);
    }
  }, [showToast, signInPending, signIn, t]);

  // 아바타 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeProfile = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.querySelector("button")?.focus();
    };
    const closeOnBack = () => { setMenuOpen(false); menuRef.current?.querySelector("button")?.focus(); };
    document.addEventListener("keydown", closeProfile);
    window.addEventListener("popstate", closeOnBack);
    return () => {
      document.removeEventListener("keydown", closeProfile);
      window.removeEventListener("popstate", closeOnBack);
    };
  }, [menuOpen]);

  // 알림 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    const closeNotification = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNotifOpen(false);
      notifRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("keydown", closeNotification);
    return () => document.removeEventListener("keydown", closeNotification);
  }, [notifOpen]);

  const stripMobileMenuHistoryState = useCallback(() => {
    const state = window.history.state;
    if (!state || typeof state !== "object" || !("oriderMobileMenu" in state)) return;
    const { oriderMobileMenu: _oriderMobileMenu, ...rest } = state as Record<string, unknown>;
    window.history.replaceState(rest, "", window.location.href);
  }, []);

  const openMobileMenu = useCallback(() => {
    if (mobileOpen) return;
    setMenuOpen(false);
    setNotifOpen(false);
    const state = window.history.state;
    window.history.pushState(
      { ...(state && typeof state === "object" ? state : {}), oriderMobileMenu: true },
      "",
      window.location.href
    );
    mobileHistoryPushedRef.current = true;
    setMobileOpen(true);
  }, [mobileOpen]);

  const closeMobileMenu = useCallback(() => {
    mobileTriggerRef.current?.focus();
    if (mobileHistoryPushedRef.current && window.history.state?.oriderMobileMenu) {
      mobileHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    setMobileOpen(false);
  }, []);

  const closeMobileMenuForNavigation = useCallback(() => {
    mobileHistoryPushedRef.current = false;
    stripMobileMenuHistoryState();
    setMobileOpen(false);
  }, [stripMobileMenuHistoryState]);

  useEffect(() => {
    closeMobileMenuForNavigation();
    setMenuOpen(false);
  }, [location.pathname, location.search, closeMobileMenuForNavigation]);

  // 공용 검색 메뉴 열릴 때 스크롤 잠금 + 브라우저 뒤로가기 연동
  useEffect(() => {
    const handlePopState = () => {
      mobileHistoryPushedRef.current = false;
      setMobileOpen(false);
      mobileTriggerRef.current?.focus();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMobileMenu(); }
      if (event.key === "Tab") {
        const targets = mobilePanelRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input,select,[tabindex="0"]');
        const first = targets?.[0];
        const last = targets?.[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); mobileTriggerRef.current?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); mobileTriggerRef.current?.focus(); }
        else if (document.activeElement === mobileTriggerRef.current && event.shiftKey) { event.preventDefault(); last?.focus(); }
      }
    };
    if (mobileOpen) {
      window.addEventListener("popstate", handlePopState);
      document.addEventListener("keydown", handleKey);
      mobilePanelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("keydown", handleKey);
      if (mobileOpen && mobilePanelRef.current?.contains(document.activeElement)) mobileTriggerRef.current?.focus();
      document.body.style.overflow = '';
    };
  }, [mobileOpen, closeMobileMenu]);

  const nickname = profile?.nickname || user?.displayName || "";
  const avatarInitials = nickname ? nickname.slice(0, 2) : "";
  const photoURL = user?.photoURL || profile?.photoURL;

  const dropdownItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)', fontSize: "var(--fs-xs)", color: 'var(--ink-1)',
    borderRadius: 'var(--r-md)', textDecoration: 'none',
  };

  return (
    <>
      <nav data-testid="X1-1" className="top-nav gap-2 lg:gap-6"
        style={{
          position: 'sticky',
          top: "var(--impersonation-banner-height, 0px)",
          zIndex: 50,
          backgroundColor: 'var(--bg-1)',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* 로고 */}
        <Link
          to="/"
          className={`flex items-center gap-2 rounded-[var(--r-sm)] ds-tap-target ${navFocusClass}`}
          style={{ textDecoration: 'none', flexShrink: 0 }}
        >
          <img src={iconSvg} alt="Orider" style={{ width: 24, height: 24, borderRadius: "var(--r-sm)", flexShrink: 0 }} />
          <span
            style={{
              fontWeight: 700,
              fontSize: "var(--fs-sm)",
              letterSpacing: '0.04em',
              color: 'var(--ink-0)',
            }}
          >
            O<span style={{ color: 'var(--ink-3)' }}>·</span>RIDER
          </span>
        </Link>

        {/* 데스크톱 네비게이션 링크 (1024px 이상) */}
        <div className="hidden lg:flex items-center" style={{ gap: 'var(--space-1)', flex: 1 }}>
          {NAV_ITEMS.map(({ key, label, to }) => {
            const isActive = active === key;
            return (
              <Link
                key={key}
                to={to}
                aria-current={isActive ? 'page' : undefined}
                className={navFocusClass}
                style={{
                  position: 'relative',
                  padding: '0 10px',
                  height: 52,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: "var(--fs-sm)",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--ink-0)' : 'var(--ink-3)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 10,
                      right: 10,
                      height: 2,
                      backgroundColor: 'var(--lime)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* flex spacer for mobile */}
        <div className="flex lg:hidden" style={{ flex: 1 }} />

        {/* 우측: 검색 + 아이콘 + 인증 */}
        <div className="flex items-center" style={{ gap: 'var(--space-2)', flexShrink: 0 }}>
          {user ? (
            <>
              {/* 모바일 알림 벨 → 바텀시트 */}
              {onMobileNotifClick && (
                <button
                  className={`lg:hidden ${navIconButtonClass}`}
                  data-testid="X1-4" aria-label={t('topnav.notifications')}
                  onClick={() => { closeMobileMenuForNavigation(); setMenuOpen(false); onMobileNotifClick(); }}
                  style={{ width: 44, height: 44, borderRadius: "var(--r-md)", border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", position: "relative" }}
                >
                  <Bell size={ICON_SIZE.lg} />
                  {unreadCount > 0 && (
                    <div style={{ position: "absolute", top: 10, right: 10, width: 7, height: 7, background: "var(--color-error)", borderRadius: "50%", border: "1.5px solid var(--bg-1)" }} />
                  )}
                </button>
              )}

              {/* 데스크톱 알림 벨 + 드롭다운 */}
              <div ref={notifRef} className="hidden lg:block" style={{ position: 'relative' }}>
                <button
                  onClick={() => { closeMobileMenuForNavigation(); if (!notifOpen) onNotificationsOpen?.(); setNotifOpen(!notifOpen); setMenuOpen(false); }}
                  className={navFocusClass}
                  data-testid="X1-4" aria-label={t('topnav.notifications')}
                  style={{
                    width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: "var(--r-md)", border: 'none', background: 'transparent',
                    cursor: 'pointer', color: 'var(--ink-3)', position: 'relative',
                  }}
                >
                  <Bell size={ICON_SIZE.lg} />
                  {unreadCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        minWidth: 14,
                        height: 14,
                        borderRadius: "9999px",
                        backgroundColor: 'var(--color-error)',
                        color: 'var(--ink-0)',
                        fontSize: "var(--fs-xs)",
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingInline: 3,
                        lineHeight: 1,
                      }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    style={{
                      position: 'absolute', top: 38, right: 0, width: 320,
                      background: 'var(--bg-1)', border: '1px solid var(--line-soft)',
                      borderRadius: 'var(--r-lg)', zIndex: 100, overflow: 'hidden',
                    }}
                  >
                    {/* 헤더 */}
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderBottom: '1px solid var(--line-soft)',
                      }}
                    >
                      <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: 'var(--ink-0)' }}>{t('topnav.notifications')}</span>
                      {onMarkAllRead && notifications.length > 0 && (
                        <button
                          onClick={() => { onMarkAllRead(); }}
                          style={{
                            fontSize: "var(--fs-xs)", color: 'var(--ink-3)', background: 'none',
                            border: 'none', cursor: 'pointer', padding: 0,
                          }}
                        >
                          {t('button.markAllRead')}
                        </button>
                      )}
                    </div>

                    {/* 알림 목록 */}
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {notificationStatus}
                      {notifications.length === 0 && !notificationStatus ? (
                        <div style={{ padding: 'var(--space-6) var(--space-3)', textAlign: 'center', fontSize: "var(--fs-sm)", color: 'var(--ink-4)' }}>
                          {t('label.noNotifications')}
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              onNotificationClick?.(n);
                              setNotifOpen(false);
                            }}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: "var(--space-2)",
                              width: '100%',
                              padding: '10px 12px',
                              backgroundColor: n.read ? 'transparent' : 'var(--bg-2)',
                              border: 'none',
                              borderBottom: '1px solid var(--line-soft)',
                              cursor: onNotificationClick ? 'pointer' : 'default',
                              textAlign: 'left',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-2)')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = n.read ? 'transparent' : 'var(--bg-2)')}
                          >
                            {/* 아이콘 */}
                            <div
                              style={{
                                width: 28, height: 28, borderRadius: '50%',
                                backgroundColor: 'var(--bg-3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, overflow: 'hidden',
                              }}
                            >
                              {n.fromProfileImage ? (
                                <img src={n.fromProfileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <User size={ICON_SIZE.sm} style={{ color: 'var(--ink-3)' }} />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: 'var(--ink-1)', lineHeight: 1.4 }}>{n.access === "unavailable" || n.type === "unavailable" ? t("notif.unavailable") : n.message}</p>
                              <p style={{ margin: '3px 0 0', fontSize: "var(--fs-xs)", color: 'var(--ink-4)' }}>{timeAgo(n.createdAt, t)}</p>
                            </div>
                            {!n.read && (
                              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-brand-bike)', flexShrink: 0, marginTop: 'var(--space-1)' }} />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 아바타 + 드롭다운 */}
              <div data-testid="X1-5" ref={menuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => {
                    setNotifOpen(false);
                    closeMobileMenuForNavigation();
                    setMenuOpen(!menuOpen);
                  }}
                  className={navFocusClass}
                  aria-label={t('label.profile')}
                  aria-expanded={menuOpen}
                  aria-current={settingsActive ? 'page' : undefined}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: 'none', background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0, position: 'relative',
                    outline: settingsActive ? 'var(--space-0-5) solid var(--lime)' : undefined,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="top-nav-avatar"
                    style={{
                      borderRadius: '50%',
                      border: '1px solid var(--line)',
                      background: 'var(--bg-3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                      fontSize: "var(--fs-xs)", fontWeight: 600, color: 'var(--ink-0)',
                    }}
                  >
                    {photoURL ? (
                      <img src={photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      avatarInitials || <User size={ICON_SIZE.sm} />
                    )}
                  </span>
                  {friendRequestCount > 0 && (
                    <span
                      aria-label={t("nav.friendRequests", { count: friendRequestCount })}
                      className="absolute right-0 top-0 rounded-full px-1 text-[length:var(--fs-2xs)] font-bold"
                      style={{ background: "var(--color-error)", color: "var(--primary-fg)" }}
                    >
                      {friendRequestCount > 9 ? "9+" : friendRequestCount}
                    </span>
                  )}
                </button>

                {menuOpen && (
                  <div
                    style={{
                      position: 'absolute', top: 46, right: 0, width: 200,
                      background: 'var(--bg-1)', border: '1px solid var(--line-soft)',
                      borderRadius: 'var(--r-lg)', padding: "var(--space-1-5)", zIndex: 100,
                    }}
                  >
                    <div style={{ padding: '8px 10px', fontSize: "var(--fs-sm)", fontWeight: 600, color: 'var(--ink-0)', borderBottom: '1px solid var(--line-soft)', marginBottom: 'var(--space-1)' }}>
                      {nickname || t('label.rider')}
                    </div>
                    {accountItems.map(({ to, labelKey, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setMenuOpen(false)}
                        className={mobileMenuItemClass}
                        style={dropdownItemStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Icon size={ICON_SIZE.sm} /> {t(labelKey)}
                      </Link>
                    ))}
                    <button
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className={mobileMenuItemClass}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
                        padding: '8px 10px', fontSize: "var(--fs-xs)", color: 'var(--rose)',
                        borderRadius: 'var(--r-md)', background: 'none', border: 'none', cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <LogOut size={ICON_SIZE.sm} /> {t('button.logout')}
                    </button>
                  </div>
                )}
              </div>

            </>
          ) : (
            <>
              {/* 비로그인: Google 로그인 버튼 (데스크톱) */}
              <div data-testid="X1-5" className="hidden lg:block">
                <Button
                  onClick={handleSignInWithGoogle} variant="primary" size="sm"
                  disabled={signInPending}
                  style={{ gap: "var(--space-1-5)" }}
                >
                  <LogIn size={ICON_SIZE.sm} /> {signInPending ? t('auth.loginLoading') : t('auth.loginValue')}
                </Button>
              </div>

            </>
          )}
        </div>
        <button ref={mobileTriggerRef} className={`mobile-menu-trigger ${navIconButtonClass}`}
          aria-label={mobileOpen ? t('button.close') : t('button.more')} aria-expanded={mobileOpen} aria-controls="mobile-navigation"
          onClick={mobileOpen ? closeMobileMenu : openMobileMenu}>
          {mobileOpen ? <X size={ICON_SIZE.lg} /> : <Menu size={ICON_SIZE.lg} />}
        </button>
      </nav>

      {/* 검색·필터와 보조 동작은 모든 화면에서 같은 메뉴를 사용한다. */}
      {mobileOpen && (
        <div id="mobile-navigation" ref={mobilePanelRef} role="navigation" aria-label={t('button.more')}
          className="mobile-navigation" data-testid="X1-5">
          <MobileMenuSearch key={user?.uid ?? "guest"} onNavigate={closeMobileMenuForNavigation} />
          <div className="mobile-navigation-section lg:hidden">
            {NAV_ITEMS.map(({ key, label, to }) => <Link key={key} to={to} aria-current={active === key ? 'page' : undefined}
              className={`mobile-navigation-link ${navFocusClass}`} onClick={closeMobileMenuForNavigation}>{label}</Link>)}
          </div>
          <div className="mobile-navigation-section hidden lg:block">
            <Link to="/settings/account" className={`mobile-navigation-link ${navFocusClass}`} onClick={closeMobileMenuForNavigation}>
              <Settings size={ICON_SIZE.md} /> {t("nav.settings")}
            </Link>
            {user && <details className="navigation-create">
              <summary className={`mobile-navigation-link ${navFocusClass}`}>{t("nav.create")}</summary>
              {([
                ["course", "/course/create"], ["segment", "/segment/create"], ["event", "/event/create"],
                ["club", "/clubs?new=1"], ["post", "/community/board/write"],
                ["import", "/athlete/me/activities?import=1"], ["goal", "/coach/goals?new=1"],
              ] as [string, string][]).map(([key, to]) => <Link key={key} to={to}
                className={`mobile-navigation-link ${navFocusClass}`} onClick={closeMobileMenuForNavigation}>{t(`nav.create.${key}`)}</Link>)}
            </details>}
          </div>
          {!user && <div className="mobile-navigation-section"><Button onClick={() => { void handleSignInWithGoogle(); closeMobileMenuForNavigation(); }} disabled={signInPending}>
            <LogIn size={ICON_SIZE.sm} /> {signInPending ? t('auth.loginLoading') : t('auth.loginValue')}
          </Button></div>}
            {/* 언어 선택 */}
            <div className="mobile-navigation-language">
              <p>{t('topnav.language')}</p>
              <LanguageToggle variant="menu" />
            </div>

            {/* 법적 링크 (모바일 — 데스크톱 푸터 대체. 약관/개인정보 접근성 보장) */}
            <div className="mobile-navigation-legal">
              <Link to="/about" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('nav.aboutOrider')}</Link>
              <Link to="/explore/recipes" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('nav.developerDocs')}</Link>
              <Link to="/terms" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.terms')}</Link>
              <Link to="/privacy" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.privacy')}</Link>
              <Link to="/policies/community" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.community')}</Link>
              <Link to="/feedback" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.feedback')}</Link>
              <Link to="/community/board?type=inquiry" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.contact')}</Link>
              <span style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-4)', width: '100%', marginTop: 'var(--space-1)' }}>&copy; 2026 Orider</span>
            </div>
        </div>
      )}
    </>
  );
}
