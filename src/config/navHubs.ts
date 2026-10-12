import { Home, Activity, Map, Users, UsersRound, Settings, type LucideIcon } from "lucide-react";

/**
 * 웹 IA 단일 진실원 — 운동 SNS 공유 5개 허브와 유틸리티(설정) 허브.
 *
 * 데스크톱 TopNav · 모바일 MobileTabBar · Layout active 판정 · 허브 서브탭바(HubSubNav)가
 * 모두 이 설정 하나를 소비해 cross-device 일관성을 보장한다.
 *
 * 허브 구성 (SNS 기획 P0 — 개인 운동과 동호회를 같은 위계의 주 메뉴로):
 *  - 소식      : 대시보드(/) — 나·친구 / 현재 동호회 / 전체 공개 관계 범위는 화면 안에서 선택
 *  - 내 운동   : 기록(/log) · 훈련(/fitness) · 목표·계획(/plan) · 코치(/coach)
 *  - 동호회    : 내 동호회(/groups) · 모임·참가(/events) — 그룹 상세는 GroupSubNav 가 맥락 표시
 *  - 탐색      : 도전(/discover) · 세그먼트(/explore) · 리더보드(/leaderboard) · 코스(/courses)
 *  - 사람·교류 : 친구(/friends) · 게시판(/board)
 *  - 설정      : 프로필(/my) · 계정(/settings) · 개발자(/creator) · 소개(/about) — 기본 탭이 아닌 유틸리티
 *
 * 관계 범위 전환·메뉴 이동은 표시 문맥일 뿐 활동 공개 범위나 그룹/이벤트 권한을 바꾸지 않는다.
 */

export type HubKey = "feed" | "train" | "club" | "explore" | "people" | "settings";

export interface ActiveHubContext {
  /** 현재 로그인 사용자. 비로그인 상태는 null. */
  viewerUid?: string | null;
  /** 활동 상세가 로드한 실제 소유자. 아직 로드되지 않았으면 null. */
  activityOwnerId?: string | null;
}

/** `/activity/:activityId` 상세 경로의 활동 ID. 편집 등 하위 경로는 제외한다. */
export function getActivityIdFromDetailPath(path: string): string | null {
  const match = /^\/activity\/([^/]+)\/?$/.exec(path);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

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
    key: "feed",
    labelKey: "nav.feed",
    icon: Home,
    to: "/",
    subs: [],
    match: (p) => p === "/",
  },
  {
    key: "train",
    labelKey: "nav.train",
    icon: Activity,
    to: "/log",
    subs: [
      { labelKey: "nav.records", to: "/log" },
      { labelKey: "nav.training", to: "/fitness" },
      { labelKey: "nav.goalsPlans", to: "/plan" },
      { labelKey: "nav.coachTab", to: "/coach" },
    ],
    match: (p) =>
      p === "/fitness" ||
      p.startsWith("/activity/") ||
      p === "/plan" ||
      p === "/goal-setup" ||
      p === "/log" ||
      p === "/coach" ||
      p.startsWith("/coach/") ||
      p === "/goal/climb" ||
      p === "/year-recap",
  },
  {
    key: "club",
    labelKey: "nav.club",
    icon: UsersRound,
    to: "/groups",
    subs: [
      { labelKey: "nav.myClubs", to: "/groups" },
      { labelKey: "nav.meetings", to: "/events" },
    ],
    match: (p) => p === "/groups" || p.startsWith("/group/") || p === "/events" || p.startsWith("/event/"),
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
      p === "/segment/create" ||
      p.startsWith("/segment/") ||
      p === "/leaderboard" ||
      p === "/courses" ||
      p.startsWith("/course/"),
  },
  {
    key: "people",
    labelKey: "nav.people",
    icon: Users,
    to: "/friends",
    subs: [
      { labelKey: "nav.friends", to: "/friends" },
      { labelKey: "nav.board", to: "/board" },
    ],
    match: (p) =>
      p === "/friends" || p.startsWith("/friend/") || p.startsWith("/athlete/") ||
      p === "/social" || p === "/board" || p.startsWith("/board/") || p === "/community",
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
    match: (p) => p === "/my" || p === "/settings" || p === "/creator" || p.startsWith("/creator/") || p === "/about",
  },
];

/**
 * 유틸리티 진입(헤더·사용자 메뉴·모바일 메뉴). 설정 허브 active 판정에는 속하지만 서브탭은 아니다 —
 * 공개 페이지(/about, /creator)에 로그인 전용 프로필·계정 탭이 붙지 않게 분리한다.
 */
export const UTILITY_LINKS: HubSub[] = [
  { labelKey: "nav.coach", to: "/coach" },
  { labelKey: "nav.developer", to: "/creator" },
  { labelKey: "nav.about", to: "/about" },
];

/** 데스크톱·모바일 기본 내비게이션에 노출되는 정확히 5개 허브. */
export const PRIMARY_HUBS: Hub[] = HUBS.filter((hub) => hub.key !== "settings");

/** 경로와 상세 화면 문맥 → 활성 허브 key (매칭 없으면 feed 폴백). */
export function getActiveHub(path: string, context: ActiveHubContext = {}): HubKey {
  // 활동 상세는 경로만으로 "내 운동"인지 판단할 수 없다. 소유자가 확인된 본인 활동만
  // 내 운동으로 표시하고, 타인 활동과 로딩 중인 직접 진입은 홈 피드 문맥을 유지한다.
  if (getActivityIdFromDetailPath(path) !== null) {
    return context.viewerUid != null && context.viewerUid === context.activityOwnerId
      ? "train"
      : "feed";
  }
  return HUBS.find((h) => h.match(path))?.key ?? "feed";
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
