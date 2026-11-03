/** 앱 코치 상단 탭 — 웹 코치 상단 탭(컨디션·계획/기록·목표·분석)과 같은 구성·순서(2026-11-03). */
export const COACH_PAGES = ["condition", "plan", "goals", "analysis"] as const;
/**
 * 상단 탭에는 없고 다른 탭 안에서 여는 하위 페이지 → 상단에서 강조할 탭.
 * 오늘·활동 기록은 웹처럼 "계획/기록" 안의 하위 탭(오늘 훈련·훈련 계획·활동 기록·수행 확인)으로만 고른다 — 상단에도
 * 오늘·계획을 따로 두면 같은 화면이 상단·하위에 겹쳐 보였다. 활동 기록(`/athlete/me/activities`)도 코치 임베드 안에서 연다.
 */
export const COACH_SUBPAGES = { today: "plan", records: "plan" } as const;
export type EmbeddedCoachPage = typeof COACH_PAGES[number] | keyof typeof COACH_SUBPAGES;

export function embeddedCoachPage(value: string | null): EmbeddedCoachPage | null {
  if (value != null && value in COACH_SUBPAGES) return value as keyof typeof COACH_SUBPAGES;
  return COACH_PAGES.find(page => page === value) ?? null;
}

/** 상단 코치 탭에서 강조할 탭 — 하위 페이지는 자기가 속한 탭을 강조한다. */
export function coachTabForPage(page: EmbeddedCoachPage): typeof COACH_PAGES[number] {
  return page in COACH_SUBPAGES ? COACH_SUBPAGES[page as keyof typeof COACH_SUBPAGES] : page as typeof COACH_PAGES[number];
}

/** Translate shared coach destinations without leaving the authorized WebView tree. */
export function embeddedCoachDestination(currentPath: string, destination: string): string | null {
  const current = /^\/(ko|en)\/embed\/(fitness|plan)\/?$/.exec(currentPath);
  if (!current) return null;
  const target = new URL(destination, "https://embedded.invalid");
  if (target.origin !== "https://embedded.invalid") return null;
  const path = target.pathname.replace(/^\/(ko|en)(?=\/)/, "");
  const match = /^\/coach\/(condition|today|analysis|plan|goals)\/?$/.exec(path);
  const page = match?.[1] ?? (path === "/goal-setup" ? "goals" : path === "/plan" ? "plan" : path === "/fitness" ? "condition"
    : path === "/athlete/me/activities" ? "records" : null);
  if (!page) return null;
  target.searchParams.set("page", page);
  return `${currentPath}?${target.searchParams}${target.hash}`;
}
