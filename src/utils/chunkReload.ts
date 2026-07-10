const RELOAD_KEY = "orider:chunk-reload-ts";
const RELOAD_WINDOW_MS = 10_000;

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function shouldReloadChunkOnce(): boolean {
  if (isBrowserOffline()) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

export function reloadWhenOnline(): void {
  if (typeof window === "undefined" || !isBrowserOffline()) return;
  window.addEventListener("online", () => window.location.reload(), { once: true });
}
