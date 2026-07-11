import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../../constants/appStoreLinks";

export function preferredStoreText(language: string, userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  const ko = language.toLowerCase().startsWith("ko");
  if (/android/i.test(userAgent)) return `${ko ? "O-Rider 앱에서 열기·설치" : "Open or install the O-Rider app"}: ${ORIDER_PLAY_STORE_URL}`;
  if (/iphone|ipad|ipod/i.test(userAgent)) return `${ko ? "O-Rider 앱에서 열기·설치" : "Open or install the O-Rider app"}: ${ORIDER_APP_STORE_URL}`;
  return `${ko ? "O-Rider 앱" : "O-Rider app"}: ${ORIDER_APP_STORE_URL} · ${ORIDER_PLAY_STORE_URL}`;
}

export function buildOriderShareText(input: { body?: string; language: string; userAgent?: string }): string {
  const lines = input.body?.trim() ? [input.body.trim()] : [];
  const joined = lines.join("\n");
  if (!/\bO-Rider\b/i.test(joined)) lines.push("· O-Rider");
  const guidance = preferredStoreText(input.language, input.userAgent);
  const requiredUrls = [ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL].filter((url) => guidance.includes(url));
  const missingUrls = requiredUrls.filter((url) => !joined.includes(url));
  if (missingUrls.length === requiredUrls.length && missingUrls.length > 0) lines.push(guidance);
  else if (missingUrls.length > 0) {
    const ko = input.language.toLowerCase().startsWith("ko");
    lines.push(`${ko ? "O-Rider 앱" : "O-Rider app"}: ${missingUrls.join(" · ")}`);
  }
  return lines.join("\n");
}

export function buildOriderSharePayload(input: { title: string; body?: string; url: string; language: string; userAgent?: string }): ShareData {
  const body = input.body?.trim() === input.title.trim() ? undefined : input.body;
  return { title: input.title, text: buildOriderShareText({ ...input, body }), url: input.url };
}

export function sharePayloadForClipboard(payload: ShareData): string {
  // Clipboard has no separate title channel, so include it explicitly. Adjacent
  // identical lines are collapsed to match the native share sheet semantics.
  const lines = [payload.title, payload.text, payload.url]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return lines.filter((value, index) => index === 0 || value !== lines[index - 1]).join("\n");
}

export function isShareCancellation(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

export type ShareAttempt = "shared" | "copied" | "cancelled" | "failed";

export async function shareOrCopy(payload: ShareData, nav: Pick<Navigator, "share" | "clipboard"> = navigator): Promise<ShareAttempt> {
  if (typeof nav.share === "function") {
    try { await nav.share(payload); return "shared"; }
    catch (error) {
      if (isShareCancellation(error)) return "cancelled";
      return "failed";
    }
  }
  if (typeof nav.clipboard?.writeText !== "function") return "failed";
  try { await nav.clipboard.writeText(sharePayloadForClipboard(payload)); return "copied"; }
  catch { return "failed"; }
}
