import { track } from "../../services/analytics";

type ConsentAction = "accepted" | "revoked";
type CoachResponseStatus = "ok" | "insufficient_data" | "stale" | "unsupported" | "quota_exceeded" | "budget_blocked" | "fallback";

export function trackCoachConsent(action: ConsentAction, policyVersion: string, surface: "first_use" | "settings"): void {
  track(`ai_coach_consent_${action}`, { policyVersion, surface });
}

/** Privacy-safe feedback boundary for #550: raw question, answer, health data and requestId are not accepted. */
export function trackCoachFeedback(helpful: boolean, status: CoachResponseStatus): void {
  track("ai_coach_feedback", { helpful, status });
}
