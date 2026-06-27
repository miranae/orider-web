import { Home, Activity, Map, Users, Settings, type LucideIcon } from "lucide-react";

/**
 * 웹 IA 단일 진실원 — "9 평면 → 5 허브" 재편 (이슈 #385, 설계 docs/design/ux-ia.md §2-2).
 *
 * 위계 없이 평면 나열되던 9개 기능을 5개 허브로 묶고, 각 허브 내부를 서브탭으로 깊이를 준다.
 * 데스크톱 TopNav · 모바일 MobileTabBar · Layout active 판정 · 허브 서브탭바(HubSubNav)가
 * 모두 이 설정 하나를 소비해 cross-device 일관성을 보장한다.
 *
 * 허브 구성:
 *  - 홈        : 대시보드(/)                                  — 단일, 서브탭 없음
 *  - 내 운동   : 피트니스(/fitness) · 계획(/plan) · 기록(/log)  — "내 데이터" 성격
 *  - 탐색      : 도전(/discover) · 세그먼트(/explore) · 리더보드(/leaderboard) · 코스(/courses)
 *               — '발견→처방→도전' 동선(#486). 데이터 출처가 아니라 사용자 의도로 서열화.
  *  - 커뮤니티  : 게시판(/board) · 그룹(/groups) · 이벤트(/events) · 친구(/friends) — "사람·소통"
 *  - 설정      : 프로필(/my) · 계정(/settings)
 *
 * 친구(/friends)는 시안 미명시였으나 "사람·소통" 동질성으로 커뮤니티 허브에 편입(이슈 #385 결정).
 * 기존 고아 경로였던 /friends·/social 진입점을 동시에 복구한다.
 */

export type HubKey = "home" | "train" | "explore" | "community" | "settings";

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
  /** 허브 진입 경로 (탭/메뉴 클릭 시 = 첫 서브) */
  to: string;
  /** 허브 내 서브탭 (길이 ≤1 이면 서브탭바 미표시) */
  subs: HubSub[];
  /** 이 경로가 이 허브에 속하는지 (active 판정 + 상세 경로 포함) */
  match: (path: string) => boolean;
}

export const HUBS: Hub[] = [
  {
    key: "home",
    labelKey: "nav.home",
    icon: Home,
    to: "/",
    subs: [],
    match: (p) => p === "/",
  },
  {
    key: "train",
    labelKey: "nav.train",
    icon: Activity,
    to: "/fitness",
    subs: [
      { labelKey: "nav.fitness", to: "/fitness" },
      { labelKey: "nav.plan", to: "/plan" },
      { labelKey: "nav.log", to: "/log" },
    ],
    match: (p) => p === "/fitness" || p === "/plan" || p === "/goal-setup" || p === "/log",
  },
  {
    key: "explore",
    labelKey: "nav.explore",
    icon: Map,
    to: "/discover",
    subs: [
      { labelKey: "nav.discover", to: "/discover" },
      { labelKey: "nav.segments", to: "/explore" },
      { labelKey: "nav.leaderboard", to: "/leaderboard" },
      { labelKey: "nav.courses", to: "/courses" },
    ],
    match: (p) =>
      p === "/discover" ||
      p === "/explore" ||
      p.startsWith("/segment/") ||
      p === "/leaderboard" ||
      p === "/courses" ||
      p.startsWith("/course/"),
  },
  {
    key: "community",
    labelKey: "nav.community",
    icon: Users,
    to: "/board",
    subs: [
      { labelKey: "nav.board", to: "/board" },
      { labelKey: "nav.creator", to: "/creator" },
      { labelKey: "nav.groups", to: "/groups" },
      { labelKey: "nav.events", to: "/events" },
      { labelKey: "nav.friends", to: "/friends" },
    ],
    match: (p) =>
      p === "/board" ||
      p.startsWith("/board/") ||
      p === "/creator" ||
      p === "/groups" ||
      p.startsWith("/group/") ||
      p === "/events" ||
      p.startsWith("/event/") ||
      p === "/friends" ||
      p === "/social",
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
    match: (p) => p === "/my" || p === "/settings",
  },
];

/** 경로 → 활성 허브 key (매칭 없으면 home 폴백). */
export function getActiveHub(path: string): HubKey {
  return HUBS.find((h) => h.match(path))?.key ?? "home";
}

/** 활성 허브 객체 (서브탭바 렌더용). */
export function getHub(key: HubKey): Hub {
  return HUBS.find((h) => h.key === key) ?? HUBS[0]!;
}

/**
 * 현재 경로가 어느 허브의 **서브 목적지(목록/허브 루트)** 인지 — 서브탭바 노출 여부 판정용.
 * 상세 경로(`/board/:id`·`/group/:id`·`/segment/:id` 등)나 흐름 경로(`/goal-setup`)에선 false 라
 * 서브탭바를 띄우지 않는다(상세 화면에 형제 허브 탭이 얹히는 군더더기 chrome 방지, #385 후속).
 */
export function isHubSubRoute(path: string): boolean {
  return HUBS.some((h) => h.subs.some((s) => s.to === path));
}
