import { SUPPORTED_LANGS } from "../i18n/detector";

export type InviteShareResult = "shared" | "copied" | "cancelled" | "error";

export function buildFriendInviteUrl(origin: string, language: string, friendCode: string): string {
  const lang = SUPPORTED_LANGS.includes(language as "ko" | "en") ? language : "ko";
  return `${origin.replace(/\/$/, "")}/${lang}/friend/${encodeURIComponent(friendCode)}`;
}

export async function shareFriendInvite(payload: ShareData, nav: Pick<Navigator, "share" | "clipboard"> = navigator): Promise<InviteShareResult> {
  if (typeof nav.share === "function") {
    try { await nav.share(payload); return "shared"; }
    catch (error) {
      if ((error as { name?: unknown } | null)?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await nav.clipboard.writeText([payload.text, payload.url].filter(Boolean).join("\n"));
    return "copied";
  } catch { return "error"; }
}
