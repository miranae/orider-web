import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { Search, Bell, Settings, LogIn, LogOut, User, Menu, X } from "lucide-react";
import iconSvg from "../../assets/icon.svg";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import { LanguageToggle } from "../i18n/LanguageToggle";
import type { Notification } from "@shared/types";
import { Button, Text } from "../../theme/components";
import { HUBS, type HubKey } from "../../config/navHubs";
import { timeAgo } from "../../utils/timeAgo";

const navFocusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]";
const navFocusWithinClass = "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--lime)]";
const navIconButtonClass = `flex items-center justify-center ${navFocusClass}`;
const mobileMenuItemClass = `rounded-[var(--r-md)] ${navFocusClass}`;

// 네비 IA(5 허브)는 단일 진실원 config/navHubs.ts 가 보유 (이슈 #385). 데스크톱 nav 행은
// 허브만 노출하고, 모바일 슬라이드 메뉴는 허브+서브를 펼쳐 9개 목적지를 모두 발견 가능하게 한다.
interface TopNavProps {
  active: HubKey;
  notifications?: Notification[];
  unreadCount?: number;
  friendRequestCount?: number;
  onMarkAllRead?: () => void;
  onNotificationClick?: (notification: Notification) => void;
  onMobileNotifClick?: () => void;
}

export default function TopNav({ active, notifications = [], unreadCount = 0, friendRequestCount = 0, onMarkAllRead, onNotificationClick, onMobileNotifClick }: TopNavProps) {
  const { t } = useTranslation('common');
  const { user, profile, signInWithGoogle, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const NAV_ITEMS = useMemo(
    () => HUBS.map(({ key, labelKey, to }) => ({ key, label: t(labelKey), to })),
    [t]
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [signInPending, setSignInPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileHistoryPushedRef = useRef(false);

  const { results } = useGlobalSearch(searchQuery);

  const handleSignInWithGoogle = useCallback(async () => {
    if (signInPending) return;
    setSignInPending(true);
    try {
      await signInWithGoogle();
    } catch {
      showToast(t("auth.loginFailed"), "error");
    } finally {
      setSignInPending(false);
    }
  }, [showToast, signInPending, signInWithGoogle, t]);

  // 검색 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  // 아바타 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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

  const stripMobileMenuHistoryState = useCallback(() => {
    const state = window.history.state;
    if (!state || typeof state !== "object" || !("oriderMobileMenu" in state)) return;
    const { oriderMobileMenu: _oriderMobileMenu, ...rest } = state as Record<string, unknown>;
    window.history.replaceState(rest, "", window.location.href);
  }, []);

  const openMobileMenu = useCallback(() => {
    if (mobileOpen) return;
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

  // 모바일 메뉴 열릴 때 스크롤 잠금 + 브라우저 뒤로가기 연동
  useEffect(() => {
    const handlePopState = () => {
      mobileHistoryPushedRef.current = false;
      setMobileOpen(false);
    };
    if (mobileOpen) window.addEventListener("popstate", handlePopState);
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const nickname = profile?.nickname || user?.displayName || "";
  const avatarInitials = nickname ? nickname.slice(0, 2) : "";
  const photoURL = user?.photoURL || profile?.photoURL;

  const dropdownItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '8px 10px', fontSize: "var(--fs-xs)", color: 'var(--ink-1)',
    borderRadius: 'var(--r-md)', textDecoration: 'none',
  };

  return (
    <>
      <nav
        style={{
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: 'var(--bg-1)',
          borderBottom: '1px solid var(--line-soft)',
          display: 'flex',
          alignItems: 'center',
          paddingInline: 'var(--space-5)',
          gap: 'var(--space-6)',
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
                {key === "community" && friendRequestCount > 0 && (
                  <span
                    aria-label={t("nav.friendRequests", { count: friendRequestCount })}
                    style={{
                      minWidth: 16,
                      height: 16,
                      borderRadius: "var(--r-xl)",
                      backgroundColor: "var(--color-error)",
                      color: "var(--primary-fg)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--fs-2xs)",
                      fontWeight: 700,
                      marginLeft: 5,
                      paddingInline: "var(--space-1)",
                    }}
                  >
                    {friendRequestCount > 9 ? "9+" : friendRequestCount}
                  </span>
                )}
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
          {/* 검색 박스 (데스크톱만) */}
          <div
            ref={searchRef}
            className="hidden lg:block"
            style={{ position: 'relative', width: 220 }}
          >
            <div
              className={navFocusWithinClass}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 30,
                borderRadius: "var(--r-md)",
                border: '1px solid var(--line-soft)',
                backgroundColor: 'var(--bg-2)',
                paddingInline: 10,
                gap: "var(--space-1-5)",
              }}
            >
              <Search size={13} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
              <input
                placeholder={t('topnav.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(""); }
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    navigate(`/discover?q=${encodeURIComponent(searchQuery.trim())}`);
                    setSearchOpen(false);
                    setSearchQuery("");
                  }
                }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: "var(--fs-sm)",
                  color: 'var(--ink-0)',
                }}
              />
            </div>

            {searchOpen && searchQuery.trim() && (
              <div style={{
                position: 'absolute', top: 38, left: 0, right: 0,
                background: 'var(--bg-1)', border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-lg)', padding: "var(--space-1-5)", zIndex: 100,
                maxHeight: 400, overflowY: 'auto',
              }}>
                {/* 활동 결과 */}
                {results.activities.length > 0 && (
                  <>
                    <Text as="div" variant="eyebrow" style={{ padding: '6px 10px' }}>{t('topnav.activities')}</Text>
                    {results.activities.map(a => (
                      <Link key={a.id} to={`/activity/${a.id}`}
                        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        style={{ display: 'flex', alignItems: 'center', gap: "var(--space-2)", padding: '8px 10px', borderRadius: 'var(--r-md)', textDecoration: 'none', fontSize: "var(--fs-xs)", color: 'var(--ink-1)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>📍</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description || t('label.ride')}</div>
                          <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)' }}>{(a.summary.distance / 1000).toFixed(1)} km</div>
                        </div>
                      </Link>
                    ))}
                  </>
                )}
                {/* 코스 결과 */}
                {results.courses.length > 0 && (
                  <>
                    <Text as="div" variant="eyebrow" style={{ padding: '6px 10px', marginTop: results.activities.length > 0 ? 4 : 0 }}>{t('nav.courses')}</Text>
                    {results.courses.map(c => (
                      <Link key={c.id} to={`/course/${c.id}`}
                        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        style={{ display: 'flex', alignItems: 'center', gap: "var(--space-2)", padding: '8px 10px', borderRadius: 'var(--r-md)', textDecoration: 'none', fontSize: "var(--fs-xs)", color: 'var(--ink-1)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>🗺️</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: 'var(--ink-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                          <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)' }}>{(c.distance / 1000).toFixed(1)} km · {c.regions?.join(', ') || ''}</div>
                        </div>
                      </Link>
                    ))}
                  </>
                )}
                {/* 결과 없음 */}
                {results.activities.length === 0 && results.courses.length === 0 && (
                  <div style={{ padding: '16px 10px', textAlign: 'center', fontSize: "var(--fs-xs)", color: 'var(--ink-3)' }}>
                    {t('label.searchEmpty', { query: searchQuery })}
                  </div>
                )}
              </div>
            )}
          </div>

          {user ? (
            <>
              {/* 모바일 알림 벨 → 바텀시트 */}
              {onMobileNotifClick && (
                <button
                  className={`lg:hidden ${navIconButtonClass}`}
                  aria-label={t('topnav.notifications')}
                  onClick={onMobileNotifClick}
                  style={{ width: 44, height: 44, borderRadius: "var(--r-md)", border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", position: "relative" }}
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <div style={{ position: "absolute", top: 10, right: 10, width: 7, height: 7, background: "var(--color-error)", borderRadius: "50%", border: "1.5px solid var(--bg-1)" }} />
                  )}
                </button>
              )}

              {/* 데스크톱 알림 벨 + 드롭다운 */}
              <div ref={notifRef} className="hidden lg:block" style={{ position: 'relative' }}>
                <button
                  onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false); }}
                  className={navFocusClass}
                  aria-label={t('topnav.notifications')}
                  style={{
                    width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: "var(--r-md)", border: 'none', background: 'transparent',
                    cursor: 'pointer', color: 'var(--ink-3)', position: 'relative',
                  }}
                >
                  <Bell size={16} />
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
                      {notifications.length === 0 ? (
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
                                <User size={14} style={{ color: 'var(--ink-3)' }} />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: 'var(--ink-1)', lineHeight: 1.4 }}>{n.message}</p>
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

              {/* 언어 토글 (데스크톱만) */}
              <div className="hidden lg:flex items-center">
                <LanguageToggle variant="header" />
              </div>

              {/* 설정 (데스크톱만) */}
              <Link
                to="/settings"
                className={`hidden lg:flex ${navFocusClass}`}
                aria-label={t('label.settings')}
                style={{
                  width: 44, height: 44,
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: "var(--r-md)", color: 'var(--ink-3)',
                }}
              >
                <Settings size={16} />
              </Link>

              {/* 아바타 + 드롭다운 */}
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false); }}
                  className={navFocusClass}
                  aria-label={t('label.profile')}
                  style={{
                    width: 44, height: 44, borderRadius: '50%',
                    border: 'none', background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
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
                      avatarInitials || <User size={14} />
                    )}
                  </span>
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
                    <Link
                      to={`/athlete/${user.uid}`}
                      onClick={() => setMenuOpen(false)}
                      className={mobileMenuItemClass}
                      style={dropdownItemStyle}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <User size={14} /> {t('label.profile')}
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className={mobileMenuItemClass}
                      style={dropdownItemStyle}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Settings size={14} /> {t('label.settings')}
                    </Link>
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
                      <LogOut size={14} /> {t('button.logout')}
                    </button>
                  </div>
                )}
              </div>

              {/* 모바일 햄버거 버튼 */}
              <button
                className={`lg:hidden ${navIconButtonClass}`}
                aria-label={t('button.more')}
                onClick={openMobileMenu}
                style={{
                  width: 44, height: 44,
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: "var(--r-md)", border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--ink-3)',
                }}
              >
                <Menu size={18} />
              </button>
            </>
          ) : (
            <>
              {/* 언어 토글 (데스크톱, 비로그인) */}
              <div className="hidden lg:flex items-center">
                <LanguageToggle variant="header" />
              </div>

              {/* 비로그인: Google 로그인 버튼 (데스크톱) */}
              <Button
                onClick={handleSignInWithGoogle} variant="primary" size="sm" className="hidden lg:flex"
                disabled={signInPending}
                style={{ gap: "var(--space-1-5)" }}
              >
                <LogIn size={14} /> {signInPending ? t('auth.loginLoading') : t('auth.loginValue')}
              </Button>

              {/* 비로그인: 모바일 햄버거 */}
              <button
                className={`lg:hidden ${navIconButtonClass}`}
                aria-label={t('button.more')}
                onClick={openMobileMenu}
                style={{
                  width: 44, height: 44,
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: "var(--r-md)", border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--ink-3)',
                }}
              >
                <Menu size={18} />
              </button>
            </>
          )}
        </div>
      </nav>

      {/* 모바일 슬라이드 메뉴 오버레이 */}
      {mobileOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex',
          }}
          onClick={closeMobileMenu}
        >
          {/* backdrop */}
          <div style={{ flex: 1, backgroundColor: 'color-mix(in oklch, var(--ink-1) 50%, transparent)' }} />

          {/* 슬라이드 패널 */}
          <div
            style={{
              width: 280,
              height: '100%',
              backgroundColor: 'var(--bg-1)',
              borderLeft: '1px solid var(--line-soft)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 패널 헤더 */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderBottom: '1px solid var(--line-soft)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: 'var(--ink-0)', letterSpacing: '0.04em' }}>
                O<span style={{ color: 'var(--ink-3)' }}>·</span>RIDER
              </span>
              <button
                className={navIconButtonClass}
                aria-label={t('button.close')}
                onClick={closeMobileMenu}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: "var(--r-md)", border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--ink-3)',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* 유저 정보 (로그인 시) */}
            {user && (
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: "var(--space-2)" }}>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: '1px solid var(--line)',
                    background: 'var(--bg-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontSize: "var(--fs-sm)", fontWeight: 600, color: 'var(--ink-0)', flexShrink: 0,
                  }}
                >
                  {photoURL ? (
                    <img src={photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    avatarInitials || <User size={16} />
                  )}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 600, color: 'var(--ink-0)' }}>{nickname || t('label.rider')}</p>
                  <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: 'var(--ink-4)' }}>{user.email}</p>
                </div>
              </div>
            )}

            {/* 네비게이션 링크 — 허브별 섹션 + 서브 펼침 (9개 목적지 모두 발견 가능) */}
            <div style={{ padding: 'var(--space-2)' }}>
              {HUBS.map((hub) => {
                const hubActive = active === hub.key;
                // 단일 허브(홈) — 서브 없이 바로 링크
                if (hub.subs.length === 0) {
                  return (
                    <Link
                      key={hub.key}
                      to={hub.to}
                      onClick={closeMobileMenuForNavigation}
                      aria-current={hubActive ? 'page' : undefined}
                      className={mobileMenuItemClass}
                      style={{
                        display: 'flex', alignItems: 'center',
                        padding: '10px 12px', fontSize: "var(--fs-sm)",
                        fontWeight: hubActive ? 600 : 400,
                        color: hubActive ? 'var(--lime)' : 'var(--ink-1)',
                        borderRadius: 'var(--r-md)', textDecoration: 'none',
                        backgroundColor: hubActive ? 'var(--bg-2)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (!hubActive) e.currentTarget.style.backgroundColor = 'var(--bg-2)'; }}
                      onMouseLeave={e => { if (!hubActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {t(hub.labelKey)}
                    </Link>
                  );
                }
                return (
                  <div key={hub.key} style={{ marginBottom: 'var(--space-1)' }}>
                    <div style={{
                      padding: '10px 12px 4px', fontSize: "var(--fs-xs)", fontWeight: 600,
                      letterSpacing: '0.04em',
                      color: hubActive ? 'var(--lime)' : 'var(--ink-3)',
                    }}>
                      {t(hub.labelKey)}
                    </div>
                    {hub.subs.map((s) => (
                      <Link
                        key={s.to}
                        to={s.to}
                        onClick={closeMobileMenuForNavigation}
                        className={mobileMenuItemClass}
                        style={{
                          display: 'flex', alignItems: 'center',
                          padding: '9px 12px 9px 22px', fontSize: "var(--fs-sm)",
                          color: 'var(--ink-1)', borderRadius: 'var(--r-md)', textDecoration: 'none',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-2)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {t(s.labelKey)}
                          {s.to === "/friends" && friendRequestCount > 0 && (
                            <span
                              aria-label={t("nav.friendRequests", { count: friendRequestCount })}
                              style={{
                                minWidth: 16,
                                height: 16,
                                borderRadius: "var(--r-xl)",
                                backgroundColor: "var(--color-error)",
                                color: "var(--primary-fg)",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "var(--fs-2xs)",
                                fontWeight: 700,
                                marginLeft: "auto",
                                paddingInline: "var(--space-1)",
                              }}
                            >
                              {friendRequestCount > 9 ? "9+" : friendRequestCount}
                            </span>
                          )}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* 하단: 계정 */}
            <div style={{ marginTop: 'auto', padding: 'var(--space-2)', borderTop: '1px solid var(--line-soft)' }}>
              {user ? (
                <>
                  <Link
                    to={`/athlete/${user.uid}`}
                    onClick={closeMobileMenuForNavigation}
                    className={mobileMenuItemClass}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      padding: '10px 12px', fontSize: "var(--fs-sm)", color: 'var(--ink-1)',
                      borderRadius: 'var(--r-md)', textDecoration: 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <User size={15} /> {t('label.profile')}
                  </Link>
                  <Link
                    to="/settings"
                    onClick={closeMobileMenuForNavigation}
                    className={mobileMenuItemClass}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      padding: '10px 12px', fontSize: "var(--fs-sm)", color: 'var(--ink-1)',
                      borderRadius: 'var(--r-md)', textDecoration: 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Settings size={15} /> {t('label.settings')}
                  </Link>
                  <button
                    className={mobileMenuItemClass}
                    onClick={() => { logout(); closeMobileMenuForNavigation(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
                      padding: '10px 12px', fontSize: "var(--fs-sm)", color: 'var(--rose)',
                      borderRadius: 'var(--r-md)', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <LogOut size={15} /> {t('button.logout')}
                  </button>
                </>
              ) : (
                <button
                  className={mobileMenuItemClass}
                  onClick={() => { void handleSignInWithGoogle(); closeMobileMenuForNavigation(); }}
                  disabled={signInPending}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                    width: '100%', padding: '10px 12px', fontSize: "var(--fs-sm)",
                    backgroundColor: 'var(--lime)', color: 'var(--primary-fg)',
                    borderRadius: 'var(--r-md)', border: 'none', cursor: signInPending ? 'wait' : 'pointer', fontWeight: 600,
                  }}
                >
                  <LogIn size={15} /> {signInPending ? t('auth.loginLoading') : t('auth.loginValue')}
                </button>
              )}
            </div>

            {/* 언어 선택 */}
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', marginBottom: 'var(--space-2)', fontWeight: 500 }}>{t('topnav.language')}</div>
              <LanguageToggle variant="menu" />
            </div>

            {/* 법적 링크 (모바일 — 데스크톱 푸터 대체. 약관/개인정보 접근성 보장) */}
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--line-soft)', display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
              <Link to="/terms" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.terms')}</Link>
              <Link to="/privacy" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.privacy')}</Link>
              <Link to="/community" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.community')}</Link>
              <Link to="/feedback" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.feedback')}</Link>
              <Link to="/board?type=inquiry" onClick={closeMobileMenuForNavigation} style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', textDecoration: 'none' }}>{t('footer.contact')}</Link>
              <span style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-4)', width: '100%', marginTop: 'var(--space-1)' }}>&copy; 2026 Orider</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
