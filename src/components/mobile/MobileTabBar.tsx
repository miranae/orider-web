import { NavLink, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { stripLangPrefix } from "../../i18n/detector";
import { HUBS, getActiveHub } from "../../config/navHubs";

const mobileTabFocusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lime)]";

// 모바일 5탭 = 5 허브 (이슈 #385). 데스크톱 nav 와 동일한 단일 진실원(config/navHubs.ts)을
// 공유해 cross-device 일관성 보장. active 는 허브 매칭(서브 경로 포함)으로 판정 — 예: /plan·/log
// 진입 시에도 "내 운동" 탭이 활성.
export default function MobileTabBar() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const { lang } = useParams();
  const path = stripLangPrefix(location.pathname);
  const activeHub = getActiveHub(path);

  const localized = (to: string) => `/${lang ?? 'ko'}${to === '/' ? '' : to}`;

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "var(--bg-1)",
        borderTop: "1px solid var(--line-soft)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <nav className="flex items-start pt-1.5" role="tablist" aria-label={t("nav.mainNavAria")} style={{ minHeight: 46 }}>
        {HUBS.map(({ key, to, icon: Icon, labelKey }) => {
          const label = t(labelKey);
          const active = activeHub === key;
          return (
            <NavLink
              key={key}
              to={localized(to)}
              role="tab"
              aria-selected={active}
              className={`flex flex-col items-center justify-start flex-1 gap-0.5 rounded-[var(--r-md)] pt-1 ${mobileTabFocusClass}`}
              style={{ color: active ? "var(--lime)" : "var(--ink-4)", minHeight: 44 }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
              <span className="text-[10px] font-medium" style={{ letterSpacing: "-0.01em" }}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
