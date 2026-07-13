import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { useMobile } from "../hooks/useMobile";
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
import { LocalizedLink } from "../components/LocalizedLink";
import { Text } from "../theme/components";
import { NAV_GROUPS, SECTION_IDS, type SectionId } from "../components/settings/settingsNavigation";

function parseSection(value: string | null): SectionId {
  return value && SECTION_IDS.includes(value as SectionId) ? (value as SectionId) : "account";
}

export default function SettingsPage() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const isMobile = useMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasRequestedSection = searchParams.has("section");
  const requestedSection = parseSection(searchParams.get("section"));
  const [section, setSectionState] = useState<SectionId>(requestedSection);
  const flatItems = NAV_GROUPS.flatMap((g) => g.items);
  const current = flatItems.find((i) => i.id === section);
  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.id === section));

  useEffect(() => {
    setSectionState(requestedSection);
  }, [requestedSection]);

  function setSection(next: SectionId) {
    setSectionState(next);
    setSearchParams(next === "account" ? {} : { section: next });
  }

  if (!user) {
    return (
      <div className="text-center py-12" style={{ color: "var(--ink-2)" }}>
        {t("loginRequired")}
      </div>
    );
  }
  if (isMobile && hasRequestedSection) {
    return (
      <div>
        <header className="mobile-settings-header">
          <LocalizedLink
            to="/settings"
            className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon-only"
            aria-label={t("nav.backToSettings")}
          >
            <ChevronLeft aria-hidden="true" />
          </LocalizedLink>
          <Text as="h1" variant="subtitle" weight={700}>
            {current && t(current.labelKey)}
          </Text>
        </header>
        <main className="mobile-settings-detail" style={{ padding: "var(--space-4)" }}>
          {section === "account" && <PaneAccount />}
          {section === "training" && <PaneTraining />}
          {section === "equipment" && <PaneEquipment />}
          {section === "connections" && <PaneConnections />}
          {section === "health_sources" && <PaneHealthSources />}
          {section === "developer" && <PaneDeveloper />}
          {section === "device" && <PaneDevice />}
          {section === "app" && <PaneApp />}
        </main>
      </div>
    );
  }
  if (isMobile) return <MobileSettingsPage />;

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
                  onClick={() => setSection(item.id)}
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

        {section === "account" && <PaneAccount />}
        {section === "training" && <PaneTraining />}
        {section === "equipment" && <PaneEquipment />}
        {section === "connections" && <PaneConnections />}
        {section === "health_sources" && <PaneHealthSources />}
        {section === "developer" && <PaneDeveloper />}
        {section === "device" && <PaneDevice />}
        {section === "app" && <PaneApp />}
      </main>
    </div>
  );
}
