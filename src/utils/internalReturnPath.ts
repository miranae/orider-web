const LOCALIZED_PREFIX = /^\/(?:ko|en)(?=\/|$)/;
const hasUnsafeCharacter = (value: string) => [...value].some((char) => char === "\\" || char.charCodeAt(0) < 32);

/** Accept only safe same-origin app paths and reject onboarding handoff loops. */
export function sanitizeInternalReturnPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || hasUnsafeCharacter(value)) return fallback;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return fallback; }
  if (decoded.startsWith("//") || hasUnsafeCharacter(decoded)) return fallback;

  let parsed: URL;
  try { parsed = new URL(value, "https://orider.invalid"); } catch { return fallback; }
  if (parsed.origin !== "https://orider.invalid") return fallback;
  const appPath = parsed.pathname.replace(LOCALIZED_PREFIX, "") || "/";
  if (appPath === "/onboarding" || appPath.startsWith("/onboarding/")) return fallback;
  if (appPath === "/friends" && parsed.searchParams.get("source") === "onboarding") return fallback;
  if (appPath === "/goal-setup" && parsed.searchParams.has("returnTo")) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
