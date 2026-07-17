import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { PaneAiCoach } from "./PaneAiCoach";
import { DialogProvider } from "../../contexts/DialogContext";

const mocks = vi.hoisted(() => ({ get: vi.fn(), accept: vi.fn(), revoke: vi.fn(), track: vi.fn() }));
vi.mock("../../services/coachConsentClient", () => ({
  getCoachConsentPolicy: mocks.get,
  acceptCoachConsent: mocks.accept,
  revokeCoachConsent: mocks.revoke,
}));
vi.mock("../../features/coach/coachAnalytics", () => ({ trackCoachConsent: mocks.track }));

const current = {
  policyVersion: "v1", title: "AI Coach", purpose: "답변", dataCategories: ["user_question"],
  retention: "원문 로그 없음", privacyPolicyUrl: "/privacy", policyDocumentUrl: "/policies/ai-coach",
  processor: { name: "External LLM", service: "Claude", privacyPolicyUrl: "https://example.com/privacy" },
  internationalProcessing: { recipient: "External LLM", country: "미국", purpose: "답변",
    dataCategories: ["user_question"], timingAndMethod: "API", retention: "없음" },
  withdrawal: { method: "설정", apiPath: "/v1/coach/consent", effect: "즉시 차단" },
  changeSummary: null,
  consent: { currentPolicyVersion: "v1", storedPolicyVersion: "v1", current: true, stale: false,
    consented: true, revoked: false, active: true, consentedAt: "2026-07-18", revokedAt: null,
    revision: "2026-07-18", state: "current" },
};

describe("PaneAiCoach", () => {
  it("shows the authoritative status and revokes before clearing the coach session", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(current);
    mocks.revoke.mockResolvedValue({ ...current, consent: { ...current.consent, active: false, revoked: true, revokedAt: "2026-07-18", state: "revoked" } });
    const reset = vi.fn();
    window.addEventListener("orider:coach-consent-revoked", reset);
    renderWithProviders(<DialogProvider><PaneAiCoach /></DialogProvider>, { authenticated: true });
    await waitFor(() => expect(screen.getByText("동의함")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "동의 철회" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "동의 철회" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce());
    expect(reset).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith("revoked", "v1", "settings");
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/question|health|draft|requestId/i);
    window.removeEventListener("orider:coach-consent-revoked", reset);
  });

  it("does not clear the coach session when revoke response remains active", async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(current);
    mocks.revoke.mockResolvedValue(current);
    const reset = vi.fn();
    window.addEventListener("orider:coach-consent-revoked", reset);
    renderWithProviders(<DialogProvider><PaneAiCoach /></DialogProvider>, { authenticated: true });
    await user.click(await screen.findByRole("button", { name: "동의 철회" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "동의 철회" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalled());
    expect(reset).not.toHaveBeenCalled();
    window.removeEventListener("orider:coach-consent-revoked", reset);
  });
});
