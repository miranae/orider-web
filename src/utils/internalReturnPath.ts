const LOCALIZED_PREFIX = /^\/(?:ko|en)(?=\/|$)/;
const hasUnsafeCharacter = (value: string) => [...value].some((char) => char === "\\" || char.charCodeAt(0) < 32);

/** Accept only safe same-origin app paths and reject onboarding handoff loops. */
export function sanitizeInternalReturnPath(value: string | null | undefined, fallback = "/"): string {
  fallback = fallback === "/" ? "/" : sanitizeInternalReturnPath(fallback);
  if (!value || !value.startsWith("/") || value.startsWith("//") || hasUnsafeCharacter(value)) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return fallback; }
  if (decoded.startsWith("//") || hasUnsafeCharacter(decoded)) return fallback;

  let parsed: URL;
  try { parsed = new URL(value, "https://orider.invalid"); } catch { return fallback; }
  if (parsed.origin !== "https://orider.invalid" || parsed.pathname.startsWith("//")) return fallback;
  const appPath = parsed.pathname.replace(LOCALIZED_PREFIX, "") || "/";
  if (appPath.startsWith("//")) return fallback;
  if (appPath === "/onboarding" || appPath.startsWith("/onboarding/")) return fallback;
  if ((appPath === "/friends" || appPath === "/athlete/me/friends") && parsed.searchParams.get("source") === "onboarding") return fallback;
  if ((appPath === "/goal-setup" || appPath === "/coach/goals") && parsed.searchParams.has("returnTo")) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Preserve the safe handoff query while attaching the goal created in the selected sport. */
export function goalCreatedPath(params: URLSearchParams, sport: "bike" | "run" | "swim", goalId: string): string {
  const fallback = `/coach/plan?sport=${sport}`;
  const path = params.get("source") === "onboarding" ? fallback : sanitizeInternalReturnPath(params.get("returnTo"), fallback);
  const url = new URL(path, "https://orider.invalid");
  if (["/coach/plan", "/plan"].includes(url.pathname.replace(LOCALIZED_PREFIX, ""))) url.searchParams.set("sport", sport);
  url.searchParams.set("goalId", goalId);
  return `${url.pathname}${url.search}${url.hash}`;
}
