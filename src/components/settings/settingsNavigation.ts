import {
  Bike,
  Database,
  KeyRound,
  Link2,
  Settings as SettingsIcon,
  User as UserIcon,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** 설정 탭 = 하위 경로. gear 만 /athlete/me/gear 에 산다. */
export type SectionId =
  | "account"
  | "connections"
  | "data"
  | "display"
  | "developer"
  | "training"
  | "gear";

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
  "gear",
  "connections",
  "developer",
  "display",
  "data",
];

/** 탭 → lang 접두 없는 경로. */
export function settingsTabPath(id: SectionId): string {
  return id === "gear" ? "/athlete/me/gear" : `/settings/${id}`;
}

/** Desktop navigation and the mobile settings hub share this single vocabulary. */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    titleKey: "nav.groupMe",
    items: [
      { id: "account", icon: UserIcon, labelKey: "nav.accountLabel", hintKey: "nav.accountHint" },
      { id: "training", icon: Zap, labelKey: "nav.trainingLabel", hintKey: "nav.trainingHint" },
      { id: "gear", icon: Bike, labelKey: "nav.equipmentLabel", hintKey: "nav.equipmentHint" },
    ],
  },
  {
    titleKey: "nav.groupConnections",
    items: [
      { id: "connections", icon: Link2, labelKey: "nav.connectionsLabel", hintKey: "nav.connectionsHint" },
      { id: "developer", icon: KeyRound, labelKey: "nav.developerLabel", hintKey: "nav.developerHint" },
    ],
  },
  {
    titleKey: "nav.groupApp",
    items: [
      { id: "display", icon: SettingsIcon, labelKey: "nav.displayLabel", hintKey: "nav.displayHint" },
      { id: "data", icon: Database, labelKey: "nav.dataLabel", hintKey: "nav.dataHint" },
    ],
  },
];
