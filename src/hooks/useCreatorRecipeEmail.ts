import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";

export interface CreatorEmailQuota {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
  cooldownMs: number;
  nextAllowedAtByRecipe: Record<string, number>;
  mode: "standard" | "test";
}

interface CreatorEmailResponse {
  sent: boolean;
  recipeId: string;
  email: string;
  quota: CreatorEmailQuota;
}

interface CreatorEmailActions {
  emailed: string;
  emailLogin: string;
  emailFailed: string;
  emailQuotaExceeded: string;
  emailCooldown: string;
}

interface UseCreatorRecipeEmailParams {
  user: unknown;
  language: string;
  actions: CreatorEmailActions;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  signInWithGoogle: () => Promise<void>;
}

function firebaseErrorDetails(err: unknown): Record<string, unknown> {
  if (!(err instanceof FirebaseError)) return {};
  const customData = err.customData as Record<string, unknown> | undefined;
  const details = customData?.details;
  return details && typeof details === "object" ? details as Record<string, unknown> : {};
}

export function formatCreatorEmailQuotaLabel(template: string, quota: CreatorEmailQuota | null) {
  if (!quota) return null;
  return template
    .replace("{{used}}", String(quota.used))
    .replace("{{limit}}", String(quota.limit));
}

export function useCreatorRecipeEmail({
  user,
  language,
  actions,
  showToast,
  signInWithGoogle,
}: UseCreatorRecipeEmailParams) {
  const [emailSendingId, setEmailSendingId] = useState<string | null>(null);
  const [emailSentItemIds, setEmailSentItemIds] = useState<Set<string>>(() => new Set());
  const [emailFailedItemIds, setEmailFailedItemIds] = useState<Set<string>>(() => new Set());
  const [emailQuota, setEmailQuota] = useState<CreatorEmailQuota | null>(null);
  const [quotaNow, setQuotaNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) {
      setEmailQuota(null);
      return;
    }
    let cancelled = false;
    const loadQuota = async () => {
      try {
        const fn = httpsCallable<void, CreatorEmailQuota>(functions, "getCreatorRecipeEmailQuota", { timeout: 15_000 });
        const result = await fn();
        if (!cancelled) setEmailQuota(result.data);
      } catch {
        if (!cancelled) setEmailQuota(null);
      }
    };
    void loadQuota();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!emailQuota) return;
    const timer = window.setInterval(() => setQuotaNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [emailQuota]);

  const handleEmailRecipe = async (itemId: string) => {
    if (!user) {
      showToast(actions.emailLogin, "info");
      await signInWithGoogle();
      return;
    }
    setEmailSendingId(itemId);
    try {
      const fn = httpsCallable<{ recipeId: string; lang: string; deliveryMode: "manual" }, CreatorEmailResponse>(
        functions,
        "sendCreatorRecipeEmail",
        { timeout: 60_000 },
      );
      const result = await fn({ recipeId: itemId, lang: language.startsWith("en") ? "en" : "ko", deliveryMode: "manual" });
      setEmailQuota(result.data.quota);
      setEmailFailedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setEmailSentItemIds((prev) => new Set(prev).add(itemId));
      showToast(actions.emailed);
    } catch (err) {
      setEmailFailedItemIds((prev) => new Set(prev).add(itemId));
      const details = firebaseErrorDetails(err);
      const isResourceExhausted = err instanceof FirebaseError && err.code === "functions/resource-exhausted";
      const message = isResourceExhausted && details.reason === "cooldown"
        ? actions.emailCooldown
        : isResourceExhausted
          ? actions.emailQuotaExceeded
          : actions.emailFailed;
      showToast(message, "error");
    } finally {
      setEmailSendingId(null);
    }
  };

  return {
    emailFailedItemIds,
    emailQuota,
    emailSendingId,
    emailSentItemIds,
    handleEmailRecipe,
    quotaNow,
  };
}
