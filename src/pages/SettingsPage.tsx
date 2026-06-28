import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  User as UserIcon,
  Zap,
  Bike,
  Link2,
  Activity,
  Smartphone,
  Settings as SettingsIcon,
  KeyRound,
} from "lucide-react";

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

type SectionId =
  | "account"
  | "training"
  | "equipment"
  | "connections"
  | "health_sources"
  | "developer"
  | "device"
  | "app";

const SECTION_IDS: SectionId[] = ["account", "training", "equipment", "connections", "health_sources", "developer", "device", "app"];

function parseSection(value: string | null): SectionId {
  return value && SECTION_IDS.includes(value as SectionId) ? (value as SectionId) : "account";
}

interface NavItemDef {
  id: SectionId;
  icon: typeof UserIcon;
  labelKey: string;
  hintKey: string;
}

interface NavGroupDef {
  titleKey: string;
  items: NavItemDef[];
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    titleKey: "nav.groupMe",
    items: [
      { id: "account", icon: UserIcon, labelKey: "nav.accountLabel", hintKey: "nav.accountHint" },
      { id: "training", icon: Zap, labelKey: "nav.trainingLabel", hintKey: "nav.trainingHint" },
      { id: "equipment", icon: Bike, labelKey: "nav.equipmentLabel", hintKey: "nav.equipmentHint" },
    ],
  },
  {
    titleKey: "nav.groupConnections",
    items: [
      { id: "connections", icon: Link2, labelKey: "nav.connectionsLabel", hintKey: "nav.connectionsHint" },
      { id: "health_sources", icon: Activity, labelKey: "nav.healthSourcesLabel", hintKey: "nav.healthSourcesHint" },
      { id: "developer", icon: KeyRound, labelKey: "nav.developerLabel", hintKey: "nav.developerHint" },
      { id: "device", icon: Smartphone, labelKey: "nav.deviceLabel", hintKey: "nav.deviceHint" },
    ],
  },
  {
    titleKey: "nav.groupApp",
    items: [
      { id: "app", icon: SettingsIcon, labelKey: "nav.appLabel", hintKey: "nav.appHint" },
    ],
  },
];

export default function SettingsPage() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const isMobile = useMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = parseSection(searchParams.get("section"));
  const [section, setSectionState] = useState<SectionId>(requestedSection);

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
  if (isMobile && section === "developer") {
    return (
      <div>
        <div
          className="sticky top-0 z-10 flex items-center gap-2"
          style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px" }}
        >
          <LocalizedLink to="/settings" className="flex items-center" style={{ marginLeft: -4, padding: "4px 8px 4px 0", minHeight: 44 }}>
            <ChevronLeft size={22} style={{ color: "var(--ink-1)" }} />
          </LocalizedLink>
          <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>
            {t("nav.developerLabel")}
          </span>
        </div>
        <main style={{ padding: "var(--space-4)" }}>
          <PaneDeveloper />
        </main>
      </div>
    );
  }
  if (isMobile) return <MobileSettingsPage />;

  const flatItems = NAV_GROUPS.flatMap((g) => g.items);
  const current = flatItems.find((i) => i.id === section);
  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.id === section));

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
