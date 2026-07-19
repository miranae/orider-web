import { track } from "../../services/analytics";

type ConsentAction = "accepted" | "revoked";
import type { CoachActionCode, CoachResponseStatus } from "../../services/coachClient";
import type { CoachAnswerActionCode } from "../../services/coachV2Contract";

export function trackCoachConsent(action: ConsentAction, policyVersion: string, surface: "first_use" | "settings"): void {
  track(`ai_coach_consent_${action}`, { policyVersion, surface });
}

/** Privacy-safe feedback boundary for #550: raw question, answer, health data and requestId are not accepted. */
export function trackCoachFeedback(helpful: boolean, status: CoachResponseStatus): void {
  track("coach_feedback", { helpful, status });
}

type QuestionSource = "suggestion_1" | "suggestion_2" | "suggestion_3" | "free_text";

/** These functions intentionally accept no raw question, answer, evidence, requestId or health fields. */
export const coachAnalytics = {
  open: () => track("coach_open"),
  submit: (source: QuestionSource) => track("coach_question_submit", { source, capability: "p1" }),
  complete: (status: CoachResponseStatus, latencyMs: number, remaining: number) =>
    track("coach_response_complete", { status, latencyMs, remaining }),
  evidenceExpand: (status: CoachResponseStatus) => track("coach_evidence_expand", { status }),
  actionClick: (actionCode: CoachActionCode | CoachAnswerActionCode) => track("coach_action_click", { actionCode }),
  limitSeen: (remaining: number) => track("coach_limit_seen", { remaining }),
};
