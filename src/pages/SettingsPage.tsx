import { Suspense } from "react";
import { lazyWithRetry as lazy } from "../utils/lazyWithRetry";
import LoadingSkeleton from "../components/redesign/states/LoadingSkeleton";
import SignInRequired from "../components/SignInRequired";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { useMobile } from "../hooks/useMobile";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import MobileSettingsPage from "../components/mobile/MobileSettingsPage";
import "../components/settings/settings.css";

const PaneThresholds = lazy(() => import("../components/settings/PaneThresholds").then(module => ({ default: module.PaneThresholds })));
const PaneAccount = lazy(() => import("../components/settings/PaneAccount").then(module => ({ default: module.PaneAccount })));
const PaneEquipment = lazy(() => import("../components/settings/PaneEquipment").then(module => ({ default: module.PaneEquipment })));
const PaneConnections = lazy(() => import("../components/settings/PaneConnections").then(module => ({ default: module.PaneConnections })));
const PaneHealthSources = lazy(() => import("../components/settings/PaneHealthSources").then(module => ({ default: module.PaneHealthSources })));
const PaneDevice = lazy(() => import("../components/settings/PaneDevice").then(module => ({ default: module.PaneDevice })));
const PaneApp = lazy(() => import("../components/settings/PaneApp").then(module => ({ default: module.PaneApp })));
const PaneDeveloper = lazy(() => import("../components/settings/PaneDeveloper").then(module => ({ default: module.PaneDeveloper })));
import { LocalizedLink } from "../components/LocalizedLink";
import { LegacySettingsRedirect } from "../components/routing/LegacyRedirect";
import { Text } from "../theme/components";
import { NAV_GROUPS, settingsTabPath, type SectionId } from "../components/settings/settingsNavigation";
import { ICON_SIZE } from "../theme/tokens/icon";

function SettingsPanes({ section, discipline }: { section: SectionId; discipline: "bike" | "run" | "swim" | "tri" }) {
  const { t } = useTranslation("settings");
  return (
    <Suspense fallback={<LoadingSkeleton kind="card" />} key={section}>
      {section === "training" && <section id="thresholds"><PaneThresholds discipline={discipline} /><LocalizedLink to="/settings/device" className="ds-tap-target">{t("training.deviceStatus")}</LocalizedLink></section>}
      {section === "account" && <PaneAccount />}
      {section === "gear" && <PaneEquipment />}
      {section === "device" && <><PaneDevice /><PaneEquipment part="device" /></>}
      {section === "connections" && <><PaneConnections /><PaneHealthSources /></>}
      {section === "developer" && <PaneDeveloper />}
      {section === "display" && <PaneApp part="display" />}
      {section === "data" && <PaneApp part="data" />}
    </Suspense>
  );
}

/**
 * 설정 — 탭은 하위 경로(/settings/<tab>, gear 는 /athlete/me/gear).
 * tab 이 없으면 옛 /settings 진입: 모바일 카테고리 허브(section 없음)이거나 새 경로로 리디렉션.
 */
export default function SettingsPage({ tab }: { tab?: SectionId }) {
  const { t } = useTranslation("settings");
  const { user, loading: authLoading } = useAuth();
  const isMobile = useMobile();
  const navigate = useLocalizedNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const selectedSport = searchParams.get("sport");
  const discipline = selectedSport === "run" || selectedSport === "swim" || selectedSport === "tri" ? selectedSport : "bike";
  if (tab === "gear" && searchParams.get("panel") === "data-pages") return <Navigate to={{ pathname: location.pathname.replace(/athlete\/me\/gear$/, "settings/device"), search: location.search, hash: location.hash }} replace />;

  if (!tab && !(isMobile && !searchParams.has("section"))) return <LegacySettingsRedirect />;

  if (authLoading) return <LoadingSkeleton kind="card" />;

  if (!user || tab === "training" && user.isAnonymous) {
    return (
      <div data-testid={tab === "gear" ? "P4.guest" : "S.guest"}><SignInRequired description={t("loginRequired")} /></div>
    );
  }
  if (!tab) return <MobileSettingsPage />;

  const section = tab;
  const flatItems = NAV_GROUPS.flatMap((g) => g.items);
  const current = flatItems.find((i) => i.id === section);
  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.id === section));

  if (isMobile) {
    return (
      <div>
        <header className="mobile-settings-header">
          <LocalizedLink
            to={section === "gear" ? "/athlete/me" : "/settings"}
            className="mobile-settings-back ds-tap-target"
            aria-label={t(section === "gear" ? "nav.backToProfile" : "nav.backToSettings")}
          >
            <ChevronLeft size={ICON_SIZE.lg} aria-hidden="true" />
          </LocalizedLink>
          <Text as="h1" variant="subtitle" className="mobile-settings-title">
            {section === "gear" ? t("nav.equipmentLabel") : current && t(current.labelKey)}
          </Text>
        </header>
        <main className="mobile-settings-detail" style={{ padding: "var(--space-4) 0" }}>
          <SettingsPanes section={section} discipline={discipline} />
        </main>
      </div>
    );
  }

  if (section === "gear") return <main className="space-y-4"><Text as="h1" variant="pageTitle">{t("nav.equipmentLabel")}</Text><SettingsPanes section={section} discipline={discipline} /></main>;

  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <h1>{t("nav.pageTitle")}</h1>
        </div>
        {NAV_GROUPS.map((g) => (
          <div key={g.titleKey} className="settings-navgroup">
            <div className="settings-navgroup-title">{t(g.titleKey)}</div>
            {g.items.map((item) => {
              const Ic = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(settingsTabPath(item.id))}
                  className={"settings-navitem" + (active ? " is-active" : "")}
                >
                  <Ic size={ICON_SIZE.md} />
                  <span className="settings-navitem-text">
                    <span className="settings-navitem-label">{t(item.labelKey)}</span>
                    <span className="settings-navitem-hint">{t(item.hintKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <main className="settings-main">
        <div className="settings-content-header">
          {currentGroup && <Text as="div" variant="eyebrow">{t(currentGroup.titleKey)}</Text>}
          <h2>{current && t(current.labelKey)}</h2>
          <p>{current && t(current.hintKey)}</p>
        </div>

        <SettingsPanes section={section} discipline={discipline} />
      </main>
    </div>
  );
}
