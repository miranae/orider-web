import { Home, Bot, Map, Users, MessageSquare, Settings, type LucideIcon } from "lucide-react";

/** 메뉴 IA 단일 진실원: 데스크톱·모바일의 기본 허브와 설정 유틸리티. */
export type HubKey = "home" | "coach" | "club" | "explore" | "community" | "settings";

export interface HubSub {
  /** i18n 키 (common 네임스페이스) */
  labelKey: string;
  /** lang prefix 없는 경로 — 소비처에서 로컬라이즈 */
  to: string;
}

export interface Hub {
  key: HubKey;
  labelKey: string;
  icon: LucideIcon;
  /** 허브 진입 경로 */
  to: string;
  /** 허브 내 서브탭 (길이 ≤1 이면 서브탭바 미표시) */
  subs: HubSub[];
  /** 이 경로가 이 허브에 속하는지 (상세 경로 포함) */
  match: (path: string) => boolean;
}

export const HUBS: Hub[] = [
  {
    key: "home",
    labelKey: "nav.home",
    icon: Home,
    to: "/",
    subs: [],
    match: (p) => p === "/" || p.startsWith("/activity/"),
  },
  {
    key: "coach",
    labelKey: "nav.coach",
    icon: Bot,
    to: "/fitness",
    subs: [
      { labelKey: "nav.fitness", to: "/fitness" },
      { labelKey: "nav.plan", to: "/plan" },
      { labelKey: "nav.goals", to: "/goal-setup" },
      { labelKey: "nav.chat", to: "/coach" },
    ],
    match: (p) =>
      p === "/fitness" || p === "/plan" || p === "/goal-setup" ||
      p === "/goal/climb" || p === "/coach" || p.startsWith("/coach/") ||
      p === "/log" || p === "/year-recap",
  },
  {
    key: "club",
    labelKey: "nav.clubs",
    icon: Users,
    to: "/groups",
    subs: [],
    match: (p) => p === "/groups" || p.startsWith("/group/"),
  },
  {
    key: "explore",
    labelKey: "nav.explore",
    icon: Map,
    to: "/courses",
    subs: [
      { labelKey: "nav.courses", to: "/courses" },
      { labelKey: "nav.segments", to: "/explore" },
      { labelKey: "nav.events", to: "/events" },
      { labelKey: "nav.discover", to: "/discover" },
    ],
    match: (p) =>
      p === "/courses" || p.startsWith("/course/") || p === "/explore" ||
      p.startsWith("/segment/") || p === "/leaderboard" || p === "/events" ||
      p.startsWith("/event/") || p.startsWith("/live/") || p === "/discover",
  },
  {
    key: "community",
    labelKey: "nav.community",
    icon: MessageSquare,
    to: "/board",
    subs: [
      { labelKey: "nav.board", to: "/board" },
      { labelKey: "nav.creator", to: "/creator" },
    ],
    match: (p) =>
      p === "/board" || p.startsWith("/board/") ||
      p === "/creator" || p.startsWith("/creator/"),
  },
  {
    key: "settings",
    labelKey: "nav.settings",
    icon: Settings,
    to: "/my",
    subs: [
      { labelKey: "nav.profile", to: "/my" },
      { labelKey: "nav.account", to: "/settings" },
    ],
    match: (p) =>
      p === "/my" || p === "/settings" || p === "/friends" ||
      p.startsWith("/friend/") || p.startsWith("/athlete/") ||
      p === "/social" || p === "/about",
  },
];

/** 데스크톱·모바일 기본 내비게이션에 노출되는 정확히 5개 허브. */
export const PRIMARY_HUBS: Hub[] = HUBS.filter((hub) => hub.key !== "settings");

/** 경로 → 활성 허브 key (매칭 없으면 home 폴백). */
export function getActiveHub(path: string): HubKey {
  return HUBS.find((h) => h.match(path))?.key ?? "home";
}

/** 활성 허브 객체 (서브탭바 렌더용). */
export function getHub(key: HubKey): Hub {
  return HUBS.find((h) => h.key === key) ?? HUBS[0]!;
}

/** 정확히 서브탭 목적지에서만 서브탭바를 노출한다. */
export function isHubSubRoute(path: string): boolean {
  return HUBS.some((h) => h.subs.some((s) => s.to === path));
}
