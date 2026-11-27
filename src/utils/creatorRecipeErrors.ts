import { standaloneText } from "../i18n/standaloneText";
export interface CreatorRecipeErrorFeedback {
  message: string;
  retryable: boolean;
  retryAt: number | null;
  /** 문구를 누르면 갈 해결 화면. 사용자가 풀 수 있는 사유에만 있다. */
  resolveTo?: string;
}

/** 지원팀 문의 = 게시판 문의 탭. */
const SUPPORT_INQUIRY_PATH = "/community/board?type=inquiry";
/** 기록할 활동이 없을 때 = 활동 가져오기 창. */
const IMPORT_ACTIVITIES_PATH = "/athlete/me/activities?import=1";

/** 알려진 실패 사유 → 해결 화면. 「지원팀에 문의」는 문의 게시판, 「활동이 없습니다」는 활동 가져오기. */
export function creatorRecipeErrorResolveTo(error: unknown): string | undefined {
  const reason = creatorRecipeErrorDetails(error).reason;
  if (reason === "recipe-activity-limit") return SUPPORT_INQUIRY_PATH;
  if (reason === "no-activities") return IMPORT_ACTIVITIES_PATH;
  return undefined;
}

export function creatorRecipeErrorDetails(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return {};
  const value = error as { details?: unknown; customData?: { details?: unknown } };
  const details = value.details ?? value.customData?.details;
  return details && typeof details === "object" ? details as Record<string, unknown> : {};
}

/** Only recognized structured reasons become UI copy; server messages never do. */
export function creatorRecipeErrorFeedback(error: unknown, language: string, purpose: "preview" | "email" | "diary" = "preview"): CreatorRecipeErrorFeedback | null {
  const details = creatorRecipeErrorDetails(error);
  const retryAt = typeof details.retryAt === "number" && Number.isFinite(details.retryAt) && details.retryAt > 0 ? details.retryAt : null;
  const feedback = (message: string, retryable = true): CreatorRecipeErrorFeedback => ({ message, retryable, retryAt });
  switch (details.reason) {
    case "recipe-read-minute-limit": return feedback(standaloneText(language, "recipe_error_too_many_recipe_reads_in_a"));
    case "recipe-read-daily-limit": return feedback(standaloneText(language, "recipe_error_you_have_reached_today_s_recipe"), false);
    case "recipe-activity-limit": return { message: standaloneText(language, "recipe_error_the_activity_count_exceeds_the_processing"), retryable: false, retryAt: null, resolveTo: SUPPORT_INQUIRY_PATH };
    case "daily-limit": return feedback(purpose === "diary" ? (standaloneText(language, "recipe_error_you_have_used_today_s_ai")) : (standaloneText(language, "recipe_error_you_have_used_today_s_recipe")), false);
    case "cooldown": return feedback(standaloneText(language, "recipe_error_you_can_resend_the_same_recipe"));
    case "invalid-photo-url":
    case "unsupported-photo-host":
    case "unsupported-photo-format":
    case "photo-too-large":
    case "empty-photo":
    case "photo-encoding-failed": return feedback(standaloneText(language, "recipe_error_the_selected_photo_cannot_be_prepared"), false);
    case "photo-download-failed": return feedback(standaloneText(language, "recipe_error_the_selected_photo_could_not_be"));
    default: return null;
  }
}
