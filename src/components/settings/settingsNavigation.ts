import {
  Activity,
  Bot,
  Bike,
  KeyRound,
  Link2,
  Settings as SettingsIcon,
  Smartphone,
  User as UserIcon,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "account"
  | "training"
  | "equipment"
  | "connections"
  | "health_sources"
  | "ai_coach"
  | "developer"
  | "device"
  | "app";

export interface NavItemDef {
  id: SectionId;
  icon: LucideIcon;
  labelKey: string;
  hintKey: string;
}

export interface NavGroupDef {
  titleKey: string;
  items: NavItemDef[];
}

export const SECTION_IDS: SectionId[] = [
  "account",
  "training",
  "equipment",
  "connections",
  "health_sources",
  "ai_coach",
  "developer",
  "device",
  "app",
];

/** Desktop navigation and the mobile settings hub share this single vocabulary. */
export const NAV_GROUPS: NavGroupDef[] = [
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
      { id: "ai_coach", icon: Bot, labelKey: "nav.aiCoachLabel", hintKey: "nav.aiCoachHint" },
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
