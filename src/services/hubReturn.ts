import { isDetailRoute, resolveDetailHub, type HubKey } from "../config/navHubs";

/**
 * 기본 허브(홈·코치·클럽·탐색·게시판)마다 마지막으로 보던 화면을 기억한다. 다른 허브에서 하단 탭·상단 메뉴로
 * 돌아오면 허브 첫 화면 대신 그 화면(하위 탭·?sport 종목 포함)으로 열고, 스크롤은 useMainScrollPosition 이
 * 화면 URL 별로 되돌린다. 상세 화면은 기억하지 않는다 — 돌아오면 그 상세를 연 목록으로 간다.
 */
const lastByHub = new Map<HubKey, string>();
let owner: string | null = null;

/** 탭 복귀 이동에 붙이는 라우터 state. useMainScrollPosition 이 이 표시로 저장된 위치를 되돌린다. */
export const HUB_RETURN_STATE = { hubReturn: true } as const;

export function isHubReturnState(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as { hubReturn?: unknown }).hubReturn === true;
}

/** [path] 는 언어 접두사 없는 경로, [search] 는 `?` 포함 쿼리. 계정이 바뀌면 이전 계정의 화면은 버린다. */
export function rememberHubLocation(uid: string | null, path: string, search: string, state?: unknown) {
  if (owner !== uid) { lastByHub.clear(); owner = uid; }
  if (isDetailRoute(path)) return;
  lastByHub.set(resolveDetailHub(path, state), `${path}${search}`);
}

/** 다른 허브에서 [hub] 로 돌아갈 목적지. 기억한 화면이 없으면 허브 첫 화면이다. */
export function hubReturnTarget(hub: HubKey, fallback: string): string {
  return lastByHub.get(hub) ?? fallback;
}

export function resetHubLocationsForTest() {
  lastByHub.clear();
  owner = null;
}
