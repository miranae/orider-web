import { embeddedCoachDestination } from "./coachNavigation";

/** 앱 탐색 탭 임베드의 서브탭. 웹 탐색 허브(navHubs.ts) 순서 + 마지막에 게시판. */
export const EXPLORE_PAGES = ["courses", "segments", "events", "challenges", "athletes", "recipes", "board"] as const;
export type EmbeddedExplorePage = typeof EXPLORE_PAGES[number];
export const DEFAULT_EXPLORE_PAGE: EmbeddedExplorePage = "courses";

export const EXPLORE_PAGE_LABEL_KEYS: Record<EmbeddedExplorePage, string> = {
  courses: "nav.courses",
  segments: "nav.segments",
  events: "nav.events",
  challenges: "nav.challenges",
  athletes: "nav.people",
  recipes: "nav.creator",
  board: "nav.board",
};

export function embeddedExplorePage(value: string | null): EmbeddedExplorePage | null {
  return EXPLORE_PAGES.find(page => page === value) ?? null;
}

/** 웹 경로(언어 접두 제외) → 탐색 임베드 서브탭. 목록 화면만 대응하고 상세는 앱으로 넘긴다. */
export function explorePageForWebPath(path: string): { page: EmbeddedExplorePage; section?: string } | null {
  const recipes = /^\/explore\/recipes(?:\/([A-Za-z0-9_-]{1,64}))?\/?$/.exec(path);
  if (recipes) return recipes[1] ? { page: "recipes", section: recipes[1] } : { page: "recipes" };
  const explore = /^\/explore\/(courses|segments|events|challenges|athletes)\/?$/.exec(path);
  if (explore) return { page: explore[1] as EmbeddedExplorePage };
  if (/^\/community\/board\/?$/.test(path)) return { page: "board" };
  return null;
}

/**
 * 클럽·탐색 임베드 안에서 같은 허브의 목록 화면으로 가는 링크를 임베드 URL 로 바꾼다.
 * 상세·다른 허브는 null — 기존처럼 `navigation.openNative` 로 앱에 넘긴다.
 */
export function embeddedHubDestination(currentPath: string, destination: string): string | null {
  const current = /^\/(ko|en)\/embed\/(clubs|explore)\/?$/.exec(currentPath);
  if (!current) return null;
  const target = new URL(destination, "https://embedded.invalid");
  if (target.origin !== "https://embedded.invalid") return null;
  const path = target.pathname.replace(/^\/(ko|en)(?=\/)/, "");
  const embedPath = `/${current[1]}/embed/${current[2]}`;
  if (current[2] === "clubs") {
    if (!/^\/clubs\/?$/.test(path)) return null;
    return `${embedPath}${target.search}${target.hash}`;
  }
  const explore = explorePageForWebPath(path);
  if (!explore) return null;
  // 게시판의 `page` 는 페이지 번호라 서브탭 값으로 덮어쓴다(번호는 첫 페이지로 돌아간다).
  target.searchParams.set("page", explore.page);
  if (explore.section) target.searchParams.set("section", explore.section);
  else target.searchParams.delete("section");
  return `${embedPath}?${target.searchParams}${target.hash}`;
}

/** 코치·허브 임베드가 자기 WebView 안에서 처리하는 목적지. 없으면 null(앱으로 넘김). */
export function embeddedInternalDestination(currentPath: string, destination: string): string | null {
  return embeddedCoachDestination(currentPath, destination) ?? embeddedHubDestination(currentPath, destination);
}

/** 검색 임베드가 폼 아래에 그리는 결과 목록. 활동(웹 홈 피드)은 없다 — 앱으로 넘긴다. */
export type EmbeddedSearchResult = "clubs" | Exclude<EmbeddedExplorePage, "events" | "challenges" | "recipes">;

/** MobileMenuSearch 가 이동하려는 웹 목록 경로 → 검색 임베드 결과 종류와 그 목록이 읽을 쿼리. */
export function searchResultForDestination(destination: string): { result: EmbeddedSearchResult; params: URLSearchParams } | null {
  const target = new URL(destination, "https://embedded.invalid");
  if (target.origin !== "https://embedded.invalid") return null;
  const path = target.pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
  const result: EmbeddedSearchResult | null = /^\/clubs\/?$/.test(path) ? "clubs"
    : /^\/explore\/courses\/?$/.test(path) ? "courses"
    : /^\/explore\/segments\/?$/.test(path) ? "segments"
    : /^\/explore\/athletes\/?$/.test(path) ? "athletes"
    : /^\/community\/board\/?$/.test(path) ? "board"
    : null;
  return result ? { result, params: target.searchParams } : null;
}
