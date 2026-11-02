export const COACH_PAGES = ["condition", "today", "analysis", "plan", "goals"] as const;
export type EmbeddedCoachPage = typeof COACH_PAGES[number];

export function embeddedCoachPage(value: string | null): EmbeddedCoachPage | null {
  return COACH_PAGES.find(page => page === value) ?? null;
}

/** Translate shared coach destinations without leaving the authorized WebView tree. */
export function embeddedCoachDestination(currentPath: string, destination: string): string | null {
  const current = /^\/(ko|en)\/embed\/(fitness|plan)\/?$/.exec(currentPath);
  if (!current) return null;
  const target = new URL(destination, "https://embedded.invalid");
  if (target.origin !== "https://embedded.invalid") return null;
  const path = target.pathname.replace(/^\/(ko|en)(?=\/)/, "");
  const match = /^\/coach\/(condition|today|analysis|plan|goals)\/?$/.exec(path);
  const page = match?.[1] ?? (path === "/goal-setup" ? "goals" : path === "/plan" ? "plan" : path === "/fitness" ? "condition" : null);
  if (!page) return null;
  target.searchParams.set("page", page);
  return `${currentPath}?${target.searchParams}${target.hash}`;
}
