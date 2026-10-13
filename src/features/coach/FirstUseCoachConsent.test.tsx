import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FirstUseCoachConsent } from "./FirstUseCoachConsent";
import type { CoachConsentPolicy } from "../../services/coachConsentClient";

const mocks = vi.hoisted(() => ({ accept: vi.fn(), track: vi.fn() }));
vi.mock("../../services/coachConsentClient", () => ({ acceptCoachConsent: mocks.accept }));
vi.mock("./coachAnalytics", () => ({ trackCoachConsent: mocks.track }));

const policy = {
  policyVersion: "v1", title: "AI Coach", purpose: "답변", dataCategories: ["user_question"], retention: "없음",
  privacyPolicyUrl: "/privacy", policyDocumentUrl: "/policies/ai-coach",
  processor: { name: "LLM", service: "model", privacyPolicyUrl: "https://example.com" },
  internationalProcessing: { recipient: "LLM", country: "US", purpose: "답변", dataCategories: ["user_question"], timingAndMethod: "API", retention: "없음" },
  withdrawal: { method: "설정", apiPath: "/v1/coach/consent", effect: "즉시" }, changeSummary: null,
  consent: { currentPolicyVersion: "v1", storedPolicyVersion: null, current: false, stale: false, consented: false,
    revoked: false, active: false, consentedAt: null, revokedAt: null, revision: null, state: "missing" },
} as CoachConsentPolicy;

describe("FirstUseCoachConsent", () => {
  it("calls onConsented only after server save succeeds and deduplicates rapid clicks", async () => {
    let resolve!: (value: CoachConsentPolicy) => void;
    mocks.accept.mockReturnValue(new Promise<CoachConsentPolicy>((done) => { resolve = done; }));
    const onConsented = vi.fn();
    render(<MemoryRouter><FirstUseCoachConsent open policy={policy} onCancel={vi.fn()} onConsented={onConsented} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "동의하고 질문하기" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(mocks.accept).toHaveBeenCalledOnce();
    expect(onConsented).not.toHaveBeenCalled();
    resolve({ ...policy, consent: { ...policy.consent, storedPolicyVersion: "v1", current: true, consented: true,
      active: true, revision: "2026-07-18", state: "current" } });
    await waitFor(() => expect(onConsented).toHaveBeenCalledOnce());
  });

  it("does not resume when save responds with inactive or mismatched consent", async () => {
    mocks.accept.mockResolvedValue({ ...policy, consent: { ...policy.consent, consented: true, stale: true, state: "stale" } });
    const onConsented = vi.fn();
    render(<MemoryRouter><FirstUseCoachConsent open policy={policy} onCancel={vi.fn()} onConsented={onConsented} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "동의하고 질문하기" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onConsented).not.toHaveBeenCalled();
  });

  it("does not resume on save failure", async () => {
    mocks.accept.mockRejectedValue(new Error("network"));
    const onConsented = vi.fn();
    render(<MemoryRouter><FirstUseCoachConsent open policy={policy} onCancel={vi.fn()} onConsented={onConsented} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "동의하고 질문하기" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onConsented).not.toHaveBeenCalled();
  });

  it.each(["accepted", "rejected"])("isolates a late %s save from the next consent dialog", async oldResult => {
    let resolveOld!: (value: CoachConsentPolicy) => void;
    let rejectOld!: (reason: Error) => void;
    const oldSave = new Promise<CoachConsentPolicy>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const active = { ...policy, consent: { ...policy.consent, storedPolicyVersion: "v1", current: true,
      consented: true, active: true, revision: "2026-07-18", state: "current" } } as CoachConsentPolicy;
    mocks.accept.mockReset().mockReturnValueOnce(oldSave).mockResolvedValueOnce(active);
    mocks.track.mockClear();
    const onOld = vi.fn();
    const onNew = vi.fn();
    const view = render(<MemoryRouter><FirstUseCoachConsent key="A" open policy={policy}
      onCancel={vi.fn()} onConsented={onOld} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "동의하고 질문하기" }));
    view.rerender(<MemoryRouter><FirstUseCoachConsent key="B" open policy={policy}
      onCancel={vi.fn()} onConsented={onNew} /></MemoryRouter>);
    await act(async () => {
      if (oldResult === "accepted") resolveOld(active);
      else rejectOld(new Error("old save failed"));
    });
    expect(onOld).not.toHaveBeenCalled();
    expect(onNew).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "동의하고 질문하기" }));
    await waitFor(() => expect(onNew).toHaveBeenCalledOnce());
    expect(onOld).not.toHaveBeenCalled();
    expect(mocks.accept).toHaveBeenCalledTimes(2);
  });

  it.each(["accepted", "rejected"])("keeps a reopened dialog independent of its previous %s save", async oldResult => {
    let resolveOld!: (value: CoachConsentPolicy) => void;
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (value: CoachConsentPolicy) => void;
    const oldSave = new Promise<CoachConsentPolicy>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const newSave = new Promise<CoachConsentPolicy>((resolve) => { resolveNew = resolve; });
    const active = { ...policy, consent: { ...policy.consent, storedPolicyVersion: "v1", current: true,
      consented: true, active: true, revision: "2026-07-18", state: "current" } } as CoachConsentPolicy;
    mocks.accept.mockReset().mockReturnValueOnce(oldSave).mockReturnValueOnce(newSave);
    const onConsented = vi.fn();
    const dialog = (open: boolean) => <MemoryRouter><FirstUseCoachConsent open={open} policy={policy}
      onCancel={vi.fn()} onConsented={onConsented} /></MemoryRouter>;
    const view = render(dialog(true));
    await userEvent.click(screen.getByRole("button", { name: "동의하고 질문하기" }));
    view.rerender(dialog(false));
    view.rerender(dialog(true));
    const newButton = screen.getByRole("button", { name: "동의하고 질문하기" });
    expect(newButton).toBeEnabled();
    await userEvent.click(newButton);
    await act(async () => {
      if (oldResult === "accepted") resolveOld(active);
      else rejectOld(new Error("old save failed"));
    });
    expect(onConsented).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /저장 중/ })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => resolveNew(active));
    await waitFor(() => expect(onConsented).toHaveBeenCalledOnce());
    expect(mocks.accept).toHaveBeenCalledTimes(2);
  });
});
