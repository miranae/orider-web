export const COACH_PAGES = ["condition", "today", "analysis", "plan", "goals"] as const;
/**
 * 상단 코치 탭에는 없고 다른 탭 안에서 여는 하위 페이지 → 상단에서 강조할 탭.
 * 오늘 탭의 "활동 기록·수행 확인"(`/athlete/me/activities`)을 앱 밖 웹으로 보내지 않고 코치 임베드 안에서 연다(2026-11-03).
 */
export const COACH_SUBPAGES = { records: "today" } as const;
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
