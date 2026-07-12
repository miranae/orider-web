import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";

export type ActivitySocialErrorKind =
  | "auth"
  | "app_check"
  | "access"
  | "missing"
  | "rate_limited"
  | "invalid"
  | "unknown";

export class ActivitySocialMutationError extends Error {
  constructor(readonly kind: ActivitySocialErrorKind, readonly cause: unknown) {
    super(`Activity social mutation failed: ${kind}`);
    this.name = "ActivitySocialMutationError";
  }
}

export function classifyActivitySocialError(error: unknown): ActivitySocialErrorKind {
  if (!(error instanceof FirebaseError)) return "unknown";
  const message = error.message.toLowerCase();
  if (message.includes("app check") || message.includes("appcheck")) return "app_check";
  if (error.code === "functions/unauthenticated") return "auth";
  if (error.code === "functions/permission-denied" || error.code === "functions/failed-precondition") return "access";
  if (error.code === "functions/not-found") return "missing";
  if (error.code === "functions/resource-exhausted") return "rate_limited";
  if (error.code === "functions/invalid-argument") return "invalid";
  return "unknown";
}

type CallableName = "setActivityKudos" | "postActivityComment" | "editActivityComment" | "deleteActivityComment";
type Invoke = <TInput, TOutput>(name: CallableName, payload: TInput) => Promise<TOutput>;

const invokeCallable: Invoke = async <TInput, TOutput>(name: CallableName, payload: TInput): Promise<TOutput> => {
  try {
    await ensureAppCheckReady();
    const callable = httpsCallable<TInput, TOutput>(functions, name);
    return (await callable(payload)).data;
  } catch (error) {
    throw new ActivitySocialMutationError(classifyActivitySocialError(error), error);
  }
};

export function createActivitySocialMutationClient(invoke: Invoke = invokeCallable) {
  return {
    setKudos: (activityId: string, enabled: boolean) =>
      invoke<{ activityId: string; enabled: boolean }, { enabled: boolean }>("setActivityKudos", { activityId, enabled }),
    postComment: (activityId: string, text: string, parentId: string | null = null) =>
      invoke<{ activityId: string; text: string; parentId: string | null }, { commentId: string }>(
        "postActivityComment", { activityId, text, parentId },
      ),
    editComment: (activityId: string, commentId: string, text: string) =>
      invoke<{ activityId: string; commentId: string; text: string }, { commentId: string; text: string }>(
        "editActivityComment", { activityId, commentId, text },
      ),
    deleteComment: (activityId: string, commentId: string) =>
      invoke<{ activityId: string; commentId: string }, { deleted: boolean }>(
        "deleteActivityComment", { activityId, commentId },
      ),
  };
}

export const activitySocialMutations = createActivitySocialMutationClient();

export function activitySocialErrorMessageKey(error: unknown): string {
  const kind = error instanceof ActivitySocialMutationError ? error.kind : classifyActivitySocialError(error);
  return `socialErrors.${kind}`;
}
