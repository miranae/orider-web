export interface CreatorRecipeErrorFeedback {
  message: string;
  retryable: boolean;
  retryAt: number | null;
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
  const ko = language.startsWith("ko");
  const retryAt = typeof details.retryAt === "number" && Number.isFinite(details.retryAt) && details.retryAt > 0 ? details.retryAt : null;
  const feedback = (message: string, retryable = true): CreatorRecipeErrorFeedback => ({ message, retryable, retryAt });
  switch (details.reason) {
    case "recipe-read-minute-limit": return feedback(ko ? "짧은 시간에 레시피 조회 요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요." : "Too many recipe reads in a short time. Please wait before trying again.");
    case "recipe-read-daily-limit": return feedback(ko ? "오늘의 레시피 조회 한도를 모두 사용했습니다. 내일 다시 시도해 주세요." : "You have reached today's recipe read limit. Please try again tomorrow.", false);
    case "recipe-activity-limit": return { message: ko ? "처리 가능한 활동 수를 넘어 결과를 생성하지 않았습니다. 정확한 합계를 위해 일부 기록만으로 결과를 만들지 않았습니다. 지원팀에 문의해 주세요." : "The activity count exceeds the processing limit, so no result was generated. We did not use a partial set of records to produce incomplete totals. Please contact support.", retryable: false, retryAt: null };
    case "daily-limit": return feedback(purpose === "diary" ? (ko ? "오늘의 AI 일기 생성 한도를 모두 사용했습니다. 내일 다시 생성할 수 있습니다." : "You have used today's AI diary generation limit. You can generate again tomorrow.") : (ko ? "오늘의 레시피 이메일 발송 한도를 모두 사용했습니다. 내일 다시 발송할 수 있습니다." : "You have used today's recipe email limit. You can send again tomorrow."), false);
    case "cooldown": return feedback(ko ? "같은 레시피는 1분 뒤 다시 보낼 수 있습니다." : "You can resend the same recipe after 1 minute.");
    case "invalid-photo-url":
    case "unsupported-photo-host":
    case "unsupported-photo-format":
    case "photo-too-large":
    case "empty-photo":
    case "photo-encoding-failed": return feedback(ko ? "선택한 사진을 공유 이미지로 준비할 수 없습니다. 다른 사진을 선택하거나 사진 포함을 해제해 주세요." : "The selected photo cannot be prepared for sharing. Choose another photo or turn off photo inclusion.", false);
    case "photo-download-failed": return feedback(ko ? "선택한 사진을 불러오지 못했습니다. 잠시 후 다시 시도하거나 다른 사진을 선택해 주세요." : "The selected photo could not be downloaded. Try again shortly or choose another photo.");
    default: return null;
  }
}
