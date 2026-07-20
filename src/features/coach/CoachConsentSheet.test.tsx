import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CoachConsentSheet } from "./CoachConsentSheet";
import { CoachPolicyDisclosure } from "./CoachPolicyDisclosure";
import type { CoachConsentPolicy } from "../../services/coachConsentClient";
import { MemoryRouter } from "react-router-dom";

const policy: CoachConsentPolicy = {
  policyVersion: "v4", title: "AI Coach", purpose: "답변 생성", dataCategories: ["user_question", "training_summary",
    "verified_answer", "answer_evidence", "thread_metadata", "subjective_checkin", "readiness_snapshot"],
  retention: "원문 로그 없음", privacyPolicyUrl: "/privacy", policyDocumentUrl: "/policies/ai-coach",
  processor: { name: "External LLM", service: "Claude", privacyPolicyUrl: "https://example.com/privacy" },
  internationalProcessing: { recipient: "External LLM", country: "미국", purpose: "답변 생성",
    dataCategories: ["user_question", "training_summary", "subjective_checkin", "readiness_snapshot"],
    timingAndMethod: "API 전송", retention: "보관하지 않음" },
  withdrawal: { method: "설정에서 철회", apiPath: "/v1/coach/consent", effect: "즉시 차단" },
  changeSummary: { effectiveAt: "2026-07-18", summary: "처리자가 변경됨" },
  consent: { currentPolicyVersion: "v2", storedPolicyVersion: "v1", current: false, stale: true,
    consented: true, revoked: false, active: false, consentedAt: "2026-01-01", revokedAt: null,
    revision: "2026-01-01", state: "stale" },
};

describe("CoachConsentSheet", () => {
  it("prioritizes compact policy summaries and exposes every legal detail before consent", async () => {
    const onConsented = vi.fn();
    const onCancel = vi.fn();
    render(<MemoryRouter><CoachConsentSheet open stale saving={false} policy={policy} onCancel={onCancel} onConsented={onConsented} /></MemoryRouter>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-describedby", "coach-consent-summary");
    expect(dialog.querySelector(":scope > .coach-consent-sheet__header")).toBeInTheDocument();
    expect(dialog.querySelector(":scope > .coach-consent-sheet__body")).toBeInTheDocument();
    expect(dialog.querySelector(":scope > .coach-consent-sheet__actions")).toBeInTheDocument();
    const dataSummary = screen.getByRole("heading", { name: "사용하는 데이터" }).closest(".ds-card");
    expect(within(dataSummary!).getByText("검증된 AI 코치 답변")).toBeInTheDocument();
    expect(within(dataSummary!).getByText("답변에 사용된 분석 근거")).toBeInTheDocument();
    expect(within(dataSummary!).getByText("대화 정보(제목·종목·생성 및 수정 시각)")).toBeInTheDocument();
    expect(within(dataSummary!).getByText("주간 주관적 체크인")).toBeInTheDocument();
    expect(within(dataSummary!).getByText("회복 준비도 스냅샷")).toBeInTheDocument();
    const externalSummary = screen.getByRole("heading", { name: "외부 AI 처리 · 미국" }).closest(".ds-card");
    const storageSummary = screen.getByRole("heading", { name: "저장 및 철회" }).closest(".ds-card");
    expect(within(storageSummary!).getByText("원문 로그 없음")).toBeInTheDocument();
    expect(screen.queryByText("user_question")).not.toBeInTheDocument();
    expect(within(externalSummary!).getByText(/External LLM · Claude/)).toBeInTheDocument();
    expect(within(externalSummary!).getAllByText(/External LLM/)).toHaveLength(1);
    expect(screen.getByText(/최근 질문과 답변 최대 3개\(합산 최대 12 KiB\).*외부 AI 처리/)).toBeInTheDocument();
    expect(screen.getByText(/처리 내용이 변경되거나 설정에서 동의를 철회하기 전까지/)).toBeInTheDocument();
    expect(document.querySelector(".coach-policy-compact > .ds-text--tone-warning")).toHaveTextContent("처리자가 변경됨");
    const details = screen.getByText("전체 데이터 처리 세부사항과 링크 보기").closest("details");
    expect(details).not.toHaveAttribute("open");
    await userEvent.click(within(details!).getByText("전체 데이터 처리 세부사항과 링크 보기"));
    expect(details).toHaveAttribute("open");
    expect(within(details!).getByRole("link", { name: "처리자 개인정보 처리방침" })).toHaveAttribute("href", "https://example.com/privacy");
    expect(within(details!).getByRole("link", { name: "AI 코치 데이터 처리 안내 전문" })).toHaveAttribute("href", "/ko/policies/ai-coach");
    expect(within(details!).getByRole("link", { name: "개인정보처리방침 보기" })).toHaveAttribute("href", "/ko/privacy");
    const accept = screen.getByRole("button", { name: "동의하고 질문하기" });
    expect(accept).toHaveClass("ds-btn--primary");
    await userEvent.click(accept);
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
    expect(screen.getByText("전체 데이터 처리 세부사항과 링크 보기").closest("summary")).toHaveFocus();
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

  it("localizes a known country in the summary while preserving the policy value in full details", async () => {
    const nonUsPolicy = {
      ...policy,
      internationalProcessing: { ...policy.internationalProcessing, country: "Japan" },
    };
    render(<MemoryRouter><CoachConsentSheet open saving={false} policy={nonUsPolicy} onCancel={vi.fn()} onConsented={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "외부 AI 처리 · 일본" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "외부 AI 처리 · 미국" })).not.toBeInTheDocument();
    const details = screen.getByText("전체 데이터 처리 세부사항과 링크 보기").closest("details");
    await userEvent.click(within(details!).getByText("전체 데이터 처리 세부사항과 링크 보기"));
    expect(within(details!).getByText(/External LLM · Japan/)).toBeInTheDocument();
  });

  it("shows an authoritative recipient only when it differs from the processor", () => {
    const delegatedPolicy = {
      ...policy,
      internationalProcessing: { ...policy.internationalProcessing, recipient: "Regional Processing Partner", country: "Japan" },
    };
    render(<MemoryRouter><CoachConsentSheet open saving={false} policy={delegatedPolicy} onCancel={vi.fn()} onConsented={vi.fn()} /></MemoryRouter>);
    const externalSummary = screen.getByRole("heading", { name: "외부 AI 처리 · 일본" }).closest(".ds-card");
    expect(within(externalSummary!).getByText("External LLM · Claude")).toBeInTheDocument();
    expect(within(externalSummary!).getByText("Regional Processing Partner · 일본")).toBeInTheDocument();
  });

  it("keeps the full policy disclosure expanded outside the first-use sheet", () => {
    render(<MemoryRouter><CoachPolicyDisclosure policy={policy} /></MemoryRouter>);
    expect(screen.queryByText("전체 데이터 처리 세부사항과 링크 보기")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "처리자 개인정보 처리방침" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI 코치 데이터 처리 안내 전문" })).toBeInTheDocument();
  });
});
