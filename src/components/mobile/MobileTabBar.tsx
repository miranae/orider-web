import { NavLink, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PRIMARY_HUBS, type HubKey } from "../../config/navHubs";

const mobileTabFocusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lime)]";

// 모바일 5탭 = 5개 기본 허브. 데스크톱 nav 와 동일한 단일 진실원(config/navHubs.ts)을
// 공유해 cross-device 일관성 보장. active 는 허브 매칭(서브 경로 포함)으로 판정 — 예: /plan·/log
// 진입 시에도 "내 운동" 탭이 활성.
export default function MobileTabBar({
  active,
  friendRequestCount = 0,
}: {
  active: HubKey;
  friendRequestCount?: number;
}) {
  const { t } = useTranslation("common");
  const { lang } = useParams();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      setKeyboardOpen(window.innerHeight - viewport.height - viewport.offsetTop > 120);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  const localized = (to: string) => `/${lang ?? 'ko'}${to === '/' ? '' : to}`;

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "var(--bg-1)",
        borderTop: "1px solid var(--line-soft)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transform: keyboardOpen ? "translateY(110%)" : "translateY(0)",
        transition: "transform 160ms ease",
      }}
    >
      <nav className="flex items-start pt-1.5" role="tablist" aria-label={t("nav.mainNavAria")} style={{ minHeight: 46 }}>
        {PRIMARY_HUBS.map(({ key, to, icon: Icon, labelKey }) => {
          const label = t(labelKey);
          const isActive = active === key;
          return (
            <NavLink
              key={key}
              to={localized(to)}
              role="tab"
              aria-selected={isActive}
              className={`flex flex-col items-center justify-start flex-1 gap-0.5 rounded-[var(--r-md)] pt-1 ${mobileTabFocusClass}`}
              style={{ color: isActive ? "var(--lime)" : "var(--ink-4)", minHeight: 44 }}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} />
                {key === "community" && friendRequestCount > 0 && (
                  <span
                    className="absolute -right-2 -top-1 min-w-[18px] h-[18px] px-1 rounded-full text-[length:var(--fs-xs)] font-bold leading-none flex items-center justify-center"
                    style={{ background: "var(--color-error)", color: "var(--primary-fg)" }}
                  >
                    {friendRequestCount > 9 ? "9+" : friendRequestCount}
                  </span>
                )}
              </span>
              <span className="text-[length:var(--fs-xs)] font-medium" style={{ letterSpacing: "-0.01em" }}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
