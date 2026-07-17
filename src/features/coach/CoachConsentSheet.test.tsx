import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CoachConsentSheet } from "./CoachConsentSheet";
import type { CoachConsentPolicy } from "../../services/coachConsentClient";
import { MemoryRouter } from "react-router-dom";

const policy: CoachConsentPolicy = {
  policyVersion: "v2", title: "AI Coach", purpose: "답변 생성", dataCategories: ["user_question", "training_summary"],
  retention: "원문 로그 없음", privacyPolicyUrl: "/privacy", policyDocumentUrl: "/policies/ai-coach",
  processor: { name: "External LLM", service: "Claude", privacyPolicyUrl: "https://example.com/privacy" },
  internationalProcessing: { recipient: "External LLM", country: "미국", purpose: "답변 생성",
    dataCategories: ["user_question", "training_summary"], timingAndMethod: "API 전송", retention: "보관하지 않음" },
  withdrawal: { method: "설정에서 철회", apiPath: "/v1/coach/consent", effect: "즉시 차단" },
  changeSummary: { effectiveAt: "2026-07-18", summary: "처리자가 변경됨" },
  consent: { currentPolicyVersion: "v2", storedPolicyVersion: "v1", current: false, stale: true,
    consented: true, revoked: false, active: false, consentedAt: "2026-01-01", revokedAt: null,
    revision: "2026-01-01", state: "stale" },
};

describe("CoachConsentSheet", () => {
  it("renders authoritative stale policy details and accessible actions", async () => {
    const onConsented = vi.fn();
    const onCancel = vi.fn();
    render(<MemoryRouter><CoachConsentSheet open stale saving={false} policy={policy} onCancel={onCancel} onConsented={onConsented} /></MemoryRouter>);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getAllByText("사용자가 입력한 AI 코치 질문")).toHaveLength(2);
    expect(screen.queryByText("user_question")).not.toBeInTheDocument();
    expect(screen.getByText(/External LLM · Claude/)).toBeInTheDocument();
    expect(screen.getByText(/처리자가 변경됨/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI 코치 데이터 처리 안내 전문" })).toHaveAttribute("href", "/ko/policies/ai-coach");
    await userEvent.click(screen.getByRole("button", { name: "동의하고 질문하기" }));
    expect(onConsented).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("traps focus, locks scroll, hides the background and restores all state", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const rendered = render(<MemoryRouter><CoachConsentSheet open stale saving={false} policy={policy} onCancel={onCancel} onConsented={vi.fn()} /></MemoryRouter>);
    const cancel = within(screen.getByRole("dialog")).getByRole("button", { name: "취소" });
    expect(cancel).toHaveFocus();
    const backdrop = document.querySelector<HTMLButtonElement>(".app-dialog__backdrop");
    expect(backdrop).toHaveAttribute("tabindex", "-1");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    await user.click(backdrop!);
    expect(cancel).toHaveFocus();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("hidden");
    expect(rendered.container).toHaveAttribute("aria-hidden", "true");
    screen.getByRole("button", { name: "동의하고 질문하기" }).focus();
    await user.tab();
    expect(screen.getByRole("link", { name: "처리자 개인정보 처리방침" })).toHaveFocus();
    rendered.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(rendered.container).not.toHaveAttribute("aria-hidden");
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("keeps submission blocked and exposes an alert on save failure", () => {
    render(<MemoryRouter><CoachConsentSheet open saving error="failed" policy={policy} onCancel={vi.fn()} onConsented={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  });
});
