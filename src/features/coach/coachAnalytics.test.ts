import { describe, expect, it, vi } from "vitest";
const track = vi.hoisted(() => vi.fn());
vi.mock("../../services/analytics", () => ({ track }));
import { trackCoachConsent, trackCoachFeedback } from "./coachAnalytics";

describe("AI Coach privacy-safe analytics", () => {
  it("only emits bounded consent and feedback metadata", () => {
    trackCoachConsent("accepted", "v1", "first_use");
    trackCoachFeedback(false, "insufficient_data");
    expect(track).toHaveBeenCalledWith("ai_coach_consent_accepted", {
      policyVersion: "v1", surface: "first_use",
    });
    expect(track).toHaveBeenCalledWith("coach_feedback", { helpful: false, status: "insufficient_data" });
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/question|answer|health|requestId|uid/i);
  });
});
