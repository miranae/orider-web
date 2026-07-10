export type PostDraftFeedbackType = "bug" | "feature" | "question" | "other";

export interface PostDraft {
  title: string;
  tags: string;
  contentHtml: string;
  feedbackType: PostDraftFeedbackType;
  isPrivate: boolean;
  updatedAt: number;
}

const KEY_PREFIX = "orider.boardDraft";

export function getPostDraftKey(userId: string, boardType: "free" | "inquiry") {
  return `${KEY_PREFIX}:${userId}:${boardType}`;
}

export function readPostDraft(key: string): PostDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PostDraft>;
    if (typeof parsed.title !== "string" || typeof parsed.contentHtml !== "string") return null;
    return {
      title: parsed.title,
      tags: typeof parsed.tags === "string" ? parsed.tags : "",
      contentHtml: parsed.contentHtml,
      feedbackType: isFeedbackType(parsed.feedbackType) ? parsed.feedbackType : "bug",
      isPrivate: parsed.isPrivate === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writePostDraft(key: string, draft: PostDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota or private-mode failures must not block writing.
  }
}

export function clearPostDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function isFeedbackType(value: unknown): value is PostDraftFeedbackType {
  return value === "bug" || value === "feature" || value === "question" || value === "other";
}
