import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { useMobile } from "../hooks/useMobile";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import MobileSettingsPage from "../components/mobile/MobileSettingsPage";
import "../components/settings/settings.css";

import { PaneAccount } from "../components/settings/PaneAccount";
import { PaneTraining } from "../components/settings/PaneTraining";
import { PaneEquipment } from "../components/settings/PaneEquipment";
import { PaneConnections } from "../components/settings/PaneConnections";
import { PaneHealthSources } from "../components/settings/PaneHealthSources";
import { PaneDevice } from "../components/settings/PaneDevice";
import { PaneApp } from "../components/settings/PaneApp";
import { PaneDeveloper } from "../components/settings/PaneDeveloper";
import { PaneAiCoach } from "../components/settings/PaneAiCoach";
import { LocalizedLink } from "../components/LocalizedLink";
import { LegacySettingsRedirect } from "../components/routing/LegacyRedirect";
import { Text, buttonClass } from "../theme/components";
import { NAV_GROUPS, settingsTabPath, type SectionId } from "../components/settings/settingsNavigation";

function SettingsPanes({ section }: { section: SectionId }) {
  return (
    <>
      {section === "account" && <><PaneAccount /><PaneAiCoach /></>}
      {section === "training" && <PaneTraining />}
      {section === "gear" && <><PaneEquipment /><PaneDevice /></>}
      {section === "connections" && <><PaneConnections /><PaneHealthSources /></>}
      {section === "developer" && <PaneDeveloper />}
      {section === "display" && <PaneApp part="display" />}
      {section === "data" && <PaneApp part="data" />}
    </>
  );
}

/**
 * 설정 — 탭은 하위 경로(/settings/<tab>, gear 는 /athlete/me/gear).
 * tab 이 없으면 옛 /settings 진입: 모바일 카테고리 허브(section 없음)이거나 새 경로로 리디렉션.
 */
export default function SettingsPage({ tab }: { tab?: SectionId }) {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const isMobile = useMobile();
  const navigate = useLocalizedNavigate();
  const [searchParams] = useSearchParams();

  if (!tab && !(isMobile && !searchParams.has("section"))) return <LegacySettingsRedirect />;

  if (!user) {
    return (
      <div className="text-center py-12" style={{ color: "var(--ink-2)" }}>
        {t("loginRequired")}
      </div>
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
            to="/settings"
            className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })}
            aria-label={t("nav.backToSettings")}
          >
            <ChevronLeft aria-hidden="true" />
          </LocalizedLink>
          <Text as="h1" variant="subtitle" weight={700}>
            {current && t(current.labelKey)}
          </Text>
        </header>
        <main className="mobile-settings-detail" style={{ padding: "var(--space-4)" }}>
          <SettingsPanes section={section} />
        </main>
      </div>
    );
  }

  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <Text as="div" variant="eyebrow">SETTINGS</Text>
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
                  onClick={() => navigate(settingsTabPath(item.id))}
                  className={"settings-navitem" + (active ? " is-active" : "")}
                >
                  <Ic size={15} />
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

        <SettingsPanes section={section} />
      </main>
    </div>
  );
}
