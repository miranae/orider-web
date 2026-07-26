import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { DialogProvider } from "../../contexts/DialogContext";
import { CoachQuestionLauncher, retryActionFor } from "./CoachQuestionLauncher";
import { CoachClientError } from "../../services/coachClient";
import enCoach from "../../i18n/resources/en/coach.json";
import koCoach from "../../i18n/resources/ko/coach.json";

const mocks = vi.hoisted(() => ({ status: vi.fn(), ask: vi.fn(), policy: vi.fn(), analytics: {
  open: vi.fn(), submit: vi.fn(), complete: vi.fn(), evidenceExpand: vi.fn(), actionClick: vi.fn(), limitSeen: vi.fn(),
}, feedback: vi.fn() }));

vi.mock("../../services/coachClient", async (original) => ({ ...(await original()), getCoachStatus: mocks.status, askCoachV2: mocks.ask }));
vi.mock("../../services/coachConsentClient", () => ({ getCoachConsentPolicy: mocks.policy }));
vi.mock("./coachAnalytics", () => ({ coachAnalytics: mocks.analytics, trackCoachFeedback: mocks.feedback }));
vi.mock("./CoachPmcInsightCard", () => ({
  CoachPmcInsightCard: ({ onQuestionSelect }: { onQuestionSelect: (value: { question: string; snapshotId: string }) => void }) =>
    <button type="button" onClick={() => onQuestionSelect({ question: "최근 7일 동안 훈련 부하는 어떻게 달라졌어?",
      snapshotId: "pmc_aaaaaaaaaaaaaaaaaaaaaaaa" })}>PMC example</button>,
}));
vi.mock("./FirstUseCoachConsent", () => ({ FirstUseCoachConsent: ({ open, policy, onConsented }: {
  open: boolean; policy: unknown; onConsented: (value: unknown) => void;
}) => open ? <button data-testid="complete-consent" onClick={() => onConsented(policy)}>complete consent</button> : null }));

const user = { uid: "u1" } as User;
const quota = { limit: 3, consumed: 0, pending: 0, remaining: 3, timezone: "Asia/Seoul", resetAt: "2026-07-19T15:00:00Z" };
const activePolicy = { policyVersion: "v2", consent: {
  active: true, current: true, revoked: false, currentPolicyVersion: "v2", storedPolicyVersion: "v2",
} };
const inactivePolicy = { policyVersion: "v2", consent: {
  active: false, current: false, revoked: false, currentPolicyVersion: "v2", storedPolicyVersion: null,
} };
const disciplinePrompts = [
  {
    discipline: "bike" as const,
    placeholder: "예: 오늘 사이클의 평균 파워, 심박, 케이던스를 요약해줘.",
    labels: ["FTP 목표 코칭", "오늘 운동 리뷰", "한 달 몸 상태"],
    prompts: [
      "FTP 3.5 W/kg을 만들고 싶어. 최근 한 달 운동 기록을 확인하고 목표까지의 차이와 훈련 방향을 코칭해줘.",
      "오늘 운동 기록을 확인하고 잘된 점과 보완할 점을 코칭하고, 다음 운동에서 무엇을 할지 제안해줘.",
      "최근 한 달 운동 기록을 확인하고 체력·피로·회복 상태를 분석해줘.",
    ],
  },
  {
    discipline: "run" as const,
    placeholder: "예: 오늘 러닝의 심박, 케이던스, 시간과 거리를 요약해줘.",
    labels: ["10km 목표 코칭", "오늘 운동 리뷰", "한 달 몸 상태"],
    prompts: [
      "10km 50분을 달성하고 싶어. 최근 한 달 러닝 기록을 확인하고 목표까지의 차이와 훈련 방향을 코칭해줘.",
      "오늘 러닝 기록을 확인하고 잘된 점과 보완할 점을 코칭하고, 다음 러닝에서 무엇을 할지 제안해줘.",
      "최근 한 달 러닝 기록을 확인하고 체력·피로·회복 상태를 분석해줘.",
    ],
  },
  {
    discipline: "swim" as const,
    placeholder: "예: 오늘 수영의 심박, 시간과 거리를 요약해줘.",
    labels: ["1,500m 목표 코칭", "오늘 운동 리뷰", "한 달 몸 상태"],
    prompts: [
      "자유형 1,500m 30분을 달성하고 싶어. 최근 한 달 수영 기록을 확인하고 목표까지의 차이와 훈련 방향을 코칭해줘.",
      "오늘 수영 기록을 확인하고 잘된 점과 보완할 점을 코칭하고, 다음 수영에서 무엇을 할지 제안해줘.",
      "최근 한 달 수영 기록을 확인하고 체력·피로·회복 상태를 분석해줘.",
    ],
  },
];

it.each([{ locale: "KO", coach: koCoach }, { locale: "EN", coach: enCoach }])(
  "keeps every $locale visible label inside its accessible suggestion name", ({ coach }) => {
    for (const discipline of ["bike", "run", "swim"] as const) {
      for (const index of ["1", "2", "3"] as const) {
        const label = coach.suggestions.labels[discipline][index];
        const question = coach.suggestions[discipline][index];
        const accessibleName = `${label}: ${question}`;
        expect(accessibleName).toContain(label);
        expect(question.trim().length).toBeGreaterThan(20);
        expect(question.length).toBeLessThanOrEqual(1000);
      }
    }
  },
);

it("keeps today's representative prompts within the supported coaching-suggestion contract", () => {
  for (const discipline of ["bike", "run", "swim"] as const) {
    expect(koCoach.suggestions[discipline]["2"]).toContain("제안해줘");
    expect(koCoach.suggestions[discipline]["2"]).not.toContain("처방");
    expect(enCoach.suggestions[discipline]["2"]).toContain("suggest what I should do");
    expect(enCoach.suggestions[discipline]["2"]).not.toMatch(/prescrib/i);
  }
});
const answer = {
  requestId: "123e4567-e89b-42d3-a456-426614174000", status: "ok", reasonCode: "completed", intent: "summary",
  answer: { blocks: [{ kind: "headline", parts: [{ type: "text", text: "이번 주 훈련량이 높았습니다." }] }], actionCode: "OPEN_PLAN" },
  evidence: [{ evidenceId: "ev1", label: "훈련 부하", value: "120", unit: "TSS", period: "current7d", asOf: "2026-07-18T00:00:00Z" }],
  freshness: { asOf: "2026-07-18T00:00:00Z", latestActivityAt: "2026-07-17T00:00:00Z", staleSources: [] },
  context: { discipline: "bike", period: "current7d", goalIncluded: true },
  quota: { limit: 3, remaining: 2, timezone: "Asia/Seoul", resetAt: "2026-07-19T15:00:00Z" },
  retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "completed" },
};
const p1Base = {
  apiVersion: "v2", capabilityVersion: "p1", schemaVersion: "coach-response-envelope-v1",
  quota: { limit: 3, remaining: 2, resetAt: "2099-07-19T15:00:00Z", consumed: true },
  budget: { blocked: false, providerCalls: 0, inputTokens: 0, outputTokens: 0 },
  retry: { mode: "same_request_replay", quotaImpact: "none", previousTurnConsumed: true, providerCallAllowed: false, retryable: false, reasonCode: "completed" },
  execution: { parser: "deterministic", asOf: "2026-07-18T00:00:00Z" },
};
const p1Answer = {
  ...p1Base, requestId: "223e4567-e89b-42d3-a456-426614174001", outcome: "answer",
  budget: { blocked: false, providerCalls: 1, inputTokens: 20, outputTokens: 30 },
  execution: { parser: "provider", queryPlanHash: "plan_hash_1", catalogVersion: "p1-v1", factsId: "facts_1", asOf: "2026-07-18T00:00:00Z" },
  answer: { compatibility: "supported", answerId: "answer_1", sourceFactsId: "facts_1", questionSummary: "coach.answer.summary.distance",
    status: "complete", blocks: [], evidence: [], warnings: [], freshness: { asOf: "2026-07-18T00:00:00Z", timezone: "Asia/Seoul", staleSourceSlotIds: [] }, followUps: [] },
};

function setup(currentUser: User | null = user, discipline: "bike" | "run" | "swim" = "bike") {
  return render(<MemoryRouter initialEntries={["/ko/"]}><DialogProvider>
    <CoachQuestionLauncher user={currentUser} discipline={discipline} onSignIn={vi.fn()} />
  </DialogProvider></MemoryRouter>);
}

function setupPmc() {
  return render(<MemoryRouter initialEntries={["/ko/"]}><DialogProvider>
    <CoachQuestionLauncher user={user} discipline="bike" onSignIn={vi.fn()} showPmcInsight />
  </DialogProvider></MemoryRouter>);
}

describe("CoachQuestionLauncher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockResolvedValue({ status: "available", quota });
    mocks.policy.mockResolvedValue(activePolicy);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(answer.requestId);
  });

  it("does not call authenticated APIs for a signed-out user", async () => {
    const signin = vi.fn();
    render(<MemoryRouter><DialogProvider><CoachQuestionLauncher user={null} discipline="bike" onSignIn={signin} /></DialogProvider></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    expect(screen.getByText("AI 코치가 내 운동 기록을 분석하려면 로그인이 필요합니다.")).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.policy).not.toHaveBeenCalled(); expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("supports an inline trigger without changing the default block trigger", () => {
    const defaultView = setup();
    expect(screen.getByRole("button", { name: "AI 코치에게 물어보기" })).toHaveClass("ds-btn--block");
    defaultView.unmount();

    render(<MemoryRouter><DialogProvider>
      <CoachQuestionLauncher user={user} discipline="bike" onSignIn={vi.fn()} triggerBlock={false} />
    </DialogProvider></MemoryRouter>);
    expect(screen.getByRole("button", { name: "AI 코치에게 물어보기" })).not.toHaveClass("ds-btn--block");
  });

  it("opens through authoritative status loading, focuses the PMC draft, and never auto-sends it", async () => {
    setupPmc();
    await userEvent.click(screen.getByRole("button", { name: "PMC example" }));
    const composer = await screen.findByLabelText("내 운동에 대한 질문");
    await waitFor(() => expect(composer).toHaveFocus());
    expect(composer).toHaveValue("최근 7일 동안 훈련 부하는 어떻게 달라졌어?");
    expect(mocks.status).toHaveBeenCalledTimes(1); expect(mocks.policy).toHaveBeenCalledTimes(1);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("clears the selected snapshot when the user manually edits its draft", async () => {
    mocks.ask.mockResolvedValue(answer);
    setupPmc();
    await userEvent.click(screen.getByRole("button", { name: "PMC example" }));
    const composer = await screen.findByLabelText("내 운동에 대한 질문");
    await userEvent.type(composer, " 직접 수정");
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ contextFilters: {} })));
  });

  it("keeps the draft and snapshot paired across close and reopen", async () => {
    mocks.ask.mockResolvedValue(answer);
    setupPmc();
    await userEvent.click(screen.getByRole("button", { name: "PMC example" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: "AI 코치 닫기" }));
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    const composer = await screen.findByLabelText("내 운동에 대한 질문");
    expect(composer).toHaveValue("최근 7일 동안 훈련 부하는 어떻게 달라졌어?");
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({
      contextFilters: { pmcSnapshotId: "pmc_aaaaaaaaaaaaaaaaaaaaaaaa" },
    })));
  });

  it("keeps the card visible while authoritative quota exhaustion disables its selected composer", async () => {
    mocks.status.mockResolvedValue({ status: "quota_exhausted", quota: { ...quota, consumed: 3, remaining: 0 } });
    setupPmc();
    await userEvent.click(screen.getByRole("button", { name: "PMC example" }));
    const composer = await screen.findByLabelText("내 운동에 대한 질문");
    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "PMC example", hidden: true })).toBeInTheDocument();
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("uses the design-system composer hierarchy without duplicating a selected quick prompt", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");

    expect(screen.getByText("내 운동 기록을 근거로 답합니다.")).toBeInTheDocument();
    expect(screen.getByText("새 질문은 새 대화로 저장됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대화 내역" })).toBeInTheDocument();
    expect(screen.getByText("사이클 기록 분석")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "답변 형식" })).not.toBeInTheDocument();
    expect(screen.queryByText("서버가 질문에서 기간 확인")).not.toBeInTheDocument();
    expect(screen.queryByText("0/1000")).not.toBeInTheDocument();
    expect(screen.getByLabelText("내 운동에 대한 질문")).toHaveAttribute("aria-describedby", "coach-question-note");

    const composer = screen.getByLabelText("내 운동에 대한 질문");
    const quickPromptTitle = screen.getByRole("heading", { name: "이런 질문을 해보세요" });
    expect(composer.compareDocumentPosition(quickPromptTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(composer);
    expect(screen.getByText("0/1000")).toBeInTheDocument();
    expect(composer).toHaveAttribute("aria-describedby", "coach-question-note coach-question-counter");

    const submit = screen.getByRole("button", { name: "질문하기" });
    expect(submit).toHaveClass("ds-btn--primary", "ds-btn--block");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    expect(composer).toHaveValue("FTP 3.5 W/kg을 만들고 싶어. 최근 한 달 운동 기록을 확인하고 목표까지의 차이와 훈련 방향을 코칭해줘.");
    expect(composer).toHaveFocus();
    expect(screen.queryByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /오늘 운동 기록을 확인하고 잘된 점과 보완할 점/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /최근 한 달 운동 기록을 확인하고 체력·피로·회복 상태/ })).toBeInTheDocument();
  });

  it("always requests the planner-selected automatic response format", async () => {
    mocks.ask.mockResolvedValue(answer);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ responseFormat: "auto" })));
    await userEvent.click(screen.getByRole("button", { name: "다른 질문하기" }));
    expect(screen.queryByRole("group", { name: "답변 형식" })).not.toBeInTheDocument();
  });

  it("keeps the format picker removed when the launcher session is cleared", async () => {
    mocks.ask.mockResolvedValue(answer);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await screen.findByText("이번 주 훈련량이 높았습니다.");
    await userEvent.click(screen.getByRole("button", { name: "AI 코치 닫기" }));
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    expect(screen.queryByRole("group", { name: "답변 형식" })).not.toBeInTheDocument();
    expect(mocks.ask.mock.calls[0]?.[0].responseFormat).toBe("auto");
  });

  it.each(disciplinePrompts)("shows only $discipline prompts and placeholder", async ({ discipline, placeholder, labels, prompts }) => {
    setup(user, discipline);
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    expect(screen.getByLabelText("내 운동에 대한 질문")).toHaveAttribute("placeholder", placeholder);
    const quickPrompts = screen.getByRole("heading", { name: "이런 질문을 해보세요" }).closest(".coach-sheet__quick-prompts");
    expect(within(quickPrompts!).getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(prompts.map((prompt, index) => `${labels[index]}: ${prompt}`));
    labels.forEach((label, index) => {
      expect(within(quickPrompts!).getByText(label)).toBeInTheDocument();
    });
  });

  it("disables the composer and every suggestion when the authoritative quota is exhausted", async () => {
    mocks.status.mockResolvedValue({ status: "available", quota: { ...quota, consumed: 3, remaining: 0 } });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText(/오늘 사용 완료/);
    expect(screen.getByLabelText("내 운동에 대한 질문")).toBeDisabled();
    expect(screen.getByRole("button", { name: "질문하기" })).toBeDisabled();
    const quickPrompts = screen.getByRole("heading", { name: "이런 질문을 해보세요" }).closest(".coach-sheet__quick-prompts");
    within(quickPrompts!).getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
  });

  it("disables server-suggested replacement questions when the response exhausts quota", async () => {
    mocks.ask.mockResolvedValue({
      ...p1Base,
      requestId: answer.requestId,
      outcome: "unsupported",
      quota: { ...p1Base.quota, remaining: 0 },
      retry: { ...p1Base.retry, mode: "none", reasonCode: "unsupported_question" },
      unsupported: {
        reasonCodes: ["unsupported_question"],
        missingCapabilities: [],
        suggestedQueries: [{ queryTemplateId: "show_weekly_trend", labelKey: "coach.follow_up.weekly_trend" }],
      },
    });
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("현재 지원하지 않는 질문입니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최근 주별 운동 추세를 보여줘." })).toBeDisabled();
    expect(screen.getByText(/오늘 사용 완료/)).toBeInTheDocument();
  });

  it("retries initial status and consent loading in the same sheet without exposing raw errors", async () => {
    mocks.status.mockRejectedValueOnce(new Error("private backend detail")).mockResolvedValueOnce({ status: "available", quota });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI 코치 상태를 불러오지 못했습니다");
    expect(screen.getByRole("alert")).toHaveClass("ds-alert--danger", "coach-sheet__alert");
    expect(document.body).not.toHaveTextContent("private backend detail");
    await userEvent.click(screen.getByRole("button", { name: "상태 다시 확인" }));
    expect(await screen.findByText("오늘 3회 남음")).toBeInTheDocument();
    expect(mocks.status).toHaveBeenCalledTimes(2); expect(mocks.policy).toHaveBeenCalledTimes(2);
  });

  it("uses authoritative initial quota and renders allowlisted answer/evidence without another API call", async () => {
    mocks.ask.mockResolvedValue(answer);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    expect(await screen.findByText("오늘 3회 남음")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("이번 주 훈련량이 높았습니다.")).toBeInTheDocument();
    expect(screen.getByText("이번 주 훈련량이 높았습니다.").closest(".coach-result__answer")).toHaveClass("coach-result__answer--hero");
    const feedbackPrompt = screen.getByText("이 답변이 도움됐나요?");
    expect(feedbackPrompt.closest(".coach-sheet__dock")).toBeInTheDocument();
    expect(document.querySelector(".coach-sheet__content")).not.toContainElement(feedbackPrompt);
    expect(document.querySelector(".coach-sheet__content")).not.toContainElement(document.querySelector(".coach-sheet__dock"));
    expect(screen.getByText("오늘 2회 남음")).toBeInTheDocument();
    expect(screen.getByText("이 요청은 이미 오늘 사용 횟수 1회를 사용했습니다.")).toBeInTheDocument();
    const calls = mocks.ask.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "분석 근거 1개 보기" }));
    expect(screen.getByText("훈련 부하")).toBeInTheDocument();
    expect(mocks.ask).toHaveBeenCalledTimes(calls);
    expect(mocks.analytics.submit).toHaveBeenCalledWith("suggestion_1");
    expect(JSON.stringify(mocks.analytics.submit.mock.calls)).not.toContain("FTP 3.5 W/kg");
  });

  it("announces a non-urgent stale legacy answer as status rather than an assertive alert", async () => {
    mocks.ask.mockResolvedValue({ ...answer, status: "stale", reasonCode: "stale" });
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /오늘 운동 기록을 확인하고 잘된 점과 보완할 점/ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("일부 최신 계산을 기다리는 중입니다");
    expect(screen.queryByRole("alert", { name: /일부 최신 계산/ })).not.toBeInTheDocument();
  });

  it("single-flights rapid submit and resumes consent with exactly the same memory-only requestId", async () => {
    mocks.policy.mockResolvedValue(inactivePolicy);
    mocks.ask.mockResolvedValue(answer);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.type(screen.getByLabelText("내 운동에 대한 질문"), "최근 운동을 요약해줘");
    const submit = screen.getByRole("button", { name: "질문하기" });
    await userEvent.click(submit); await userEvent.click(submit);
    expect(mocks.ask).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("complete-consent"));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledOnce());
    expect(mocks.ask.mock.calls[0]?.[0]).toMatchObject({ requestId: answer.requestId, question: "최근 운동을 요약해줘" });
  });

  it("retries a lost response with the same requestId and no client-side quota decrement", async () => {
    mocks.ask.mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR")).mockResolvedValueOnce(answer);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("오늘 3회 남음")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "같은 요청 다시 확인" }));
    await screen.findByText("이번 주 훈련량이 높았습니다.");
    expect(mocks.ask).toHaveBeenCalledTimes(2);
    expect(mocks.ask.mock.calls[0]?.[0].requestId).toBe(mocks.ask.mock.calls[1]?.[0].requestId);
    expect(mocks.ask.mock.calls.map((call) => call[0].responseFormat)).toEqual(["auto", "auto"]);
    expect(mocks.analytics.submit).toHaveBeenCalledOnce();
  });

  it("creates a new requestId only after confirming one additional turn", async () => {
    const nextId = "223e4567-e89b-42d3-a456-426614174001";
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(answer.requestId).mockReturnValueOnce(nextId);
    mocks.ask.mockImplementation(async (input) => ({
      ...answer, requestId: input.requestId,
      retry: input.requestId === answer.requestId
        ? { ...answer.retry, mode: "new_request_required", quotaImpact: "one_new_turn", retryable: true, reasonCode: "new_turn_required" }
        : answer.retry,
    }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" })); await screen.findByText("이번 주 훈련량이 높았습니다.");
    await userEvent.click(screen.getByRole("button", { name: "1회 사용하고 다시 질문" }));
    const confirmation = await screen.findByRole("dialog", { name: "새 질문으로 다시 시도" });
    expect(mocks.ask).toHaveBeenCalledOnce();
    await userEvent.click(within(confirmation).getByRole("button", { name: "1회 사용하고 다시 질문" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
    expect(mocks.ask.mock.calls[1]?.[0].requestId).toBe(nextId);
  });

  it.each([
    ["same_request_resume", "same"], ["same_request_poll", "poll"], ["same_request_replay", "replay"],
    ["new_request_required", "new"], ["none", "none"],
  ] as const)("maps retry mode %s by contract semantics", (mode, expected) => {
    expect(retryActionFor(mode)).toBe(expected);
  });

  it.each([
    "request_mismatch", "invalid_request", "unsupported_capability", "unsupported_capability_version", "token_cap_exceeded",
  ])("hides retry for the explicit deny reason %s regardless of mode", async (reasonCode) => {
    mocks.ask.mockResolvedValue({
      ...answer, reasonCode, retry: { ...answer.retry, mode: "same_request_resume", retryable: true },
    });
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await screen.findByText("이번 주 훈련량이 높았습니다.");
    expect(screen.queryByRole("button", { name: /같은 요청|결과 다시|저장된 결과|1회 사용/ })).not.toBeInTheDocument();
  });

  it("renders same_request_poll even when retryable is false and blocks none", async () => {
    mocks.ask.mockResolvedValueOnce({ ...answer, retry: { ...answer.retry, mode: "same_request_poll", retryable: false } })
      .mockResolvedValueOnce({ ...answer, retry: { ...answer.retry, mode: "none", retryable: true } });
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByRole("button", { name: "결과 다시 확인" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "결과 다시 확인" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /같은 요청|결과 다시|저장된 결과|1회 사용/ })).not.toBeInTheDocument();
  });

  it.each([
    [new CoachClientError("http", "invalid_request"), "이 요청을 처리할 수 없습니다"],
    [new CoachClientError("http", "unsupported_capability"), "이 답변을 안전하게 표시할 수 없습니다"],
    [new CoachClientError("http", "token_cap_exceeded"), "이 요청을 처리할 수 없습니다"],
    [new CoachClientError("contract", "INVALID_COACH_RESPONSE"), "이 답변을 안전하게 표시할 수 없습니다"],
  ])("shows a non-retry fixed state for %s", async (failure, title) => {
    mocks.ask.mockRejectedValue(failure); setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(failure.code);
    expect(screen.queryByRole("button", { name: /같은 요청|결과 다시|저장된 결과|1회 사용/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 질문하기" })).toBeInTheDocument();
  });

  it.each([
    new CoachClientError("http", "provider_kill_switch"),
    {
      ...p1Base,
      requestId: answer.requestId,
      outcome: "failed",
      error: { code: "provider_kill_switch", retryable: false, fallbackAvailable: false },
      quota: { ...p1Base.quota, remaining: 3, consumed: false },
      retry: { ...p1Base.retry, previousTurnConsumed: false, mode: "none", reasonCode: "provider_kill_switch" },
    },
  ])("treats provider kill switch as service unavailability without suggesting another question", async (result) => {
    if (result instanceof Error) mocks.ask.mockRejectedValue(result);
    else mocks.ask.mockResolvedValue(result);
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("AI 코치를 준비하고 있습니다")).toBeInTheDocument();
    expect(screen.getByText(/사용 횟수는 차감되지 않았습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다른 질문하기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫고 나중에 다시 시도" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("provider_kill_switch");
  });

  it("preserves a prior terminal answer when a contract retry fails", async () => {
    mocks.ask.mockResolvedValueOnce({ ...answer, retry: { ...answer.retry, mode: "same_request_resume" } })
      .mockRejectedValueOnce(new CoachClientError("http", "invalid_request"));
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await screen.findByText("이번 주 훈련량이 높았습니다.");
    await userEvent.click(screen.getByRole("button", { name: "같은 요청 다시 확인" }));
    expect(await screen.findByText("이 요청을 처리할 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("이번 주 훈련량이 높았습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "같은 요청 다시 확인" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다른 질문하기" }));
    mocks.ask.mockResolvedValue({ ...answer, requestId: "323e4567-e89b-42d3-a456-426614174002" });
  });

  it("hides feedback for the previous answer while checking the same request", async () => {
    let resolveRetry!: (value: typeof answer) => void;
    mocks.ask.mockResolvedValueOnce({ ...answer, retry: { ...answer.retry, mode: "same_request_resume" } })
      .mockReturnValueOnce(new Promise((done) => { resolveRetry = done; }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await screen.findByText("이 답변이 도움됐나요?");

    await userEvent.click(screen.getByRole("button", { name: "같은 요청 다시 확인" }));

    expect(screen.queryByText("이 답변이 도움됐나요?")).not.toBeInTheDocument();
    await act(async () => resolveRetry(answer));
    expect(await screen.findByText("이 답변이 도움됐나요?")).toBeInTheDocument();
  });

  it("treats a response requestId mismatch as a non-retry compatibility failure", async () => {
    mocks.ask.mockResolvedValue({ ...answer, requestId: "323e4567-e89b-42d3-a456-426614174002" });
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("이 답변을 안전하게 표시할 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /같은 요청|결과 다시|저장된 결과|1회 사용/ })).not.toBeInTheDocument();
  });

  it("locks the network-recovery draft and editing starts an explicit new request", async () => {
    const nextId = "223e4567-e89b-42d3-a456-426614174001";
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(answer.requestId).mockReturnValueOnce(nextId);
    mocks.ask.mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockImplementationOnce(async (input) => ({ ...answer, requestId: input.requestId }));
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await screen.findByText("답변을 확인하지 못했습니다");
    expect(screen.queryByLabelText("내 운동에 대한 질문")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다른 질문하기" }));
    await userEvent.type(screen.getByLabelText("내 운동에 대한 질문"), "새로운 독립 질문");
    await userEvent.click(screen.getByRole("button", { name: "질문하기" })); await screen.findByText("이번 주 훈련량이 높았습니다.");
    expect(mocks.ask.mock.calls[1]?.[0].requestId).toBe(nextId);
  });

  it("clears draft and answer on the consent session reset event", async () => {
    mocks.ask.mockResolvedValue(answer); setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.type(screen.getByLabelText("내 운동에 대한 질문"), "민감한 질문 원문");
    act(() => window.dispatchEvent(new CustomEvent("orider:coach-consent-revoked")));
    expect(screen.queryByRole("dialog", { name: "O·RIDER Coach" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("민감한 질문 원문");
  });

  it("traps focus and restores it to the home CTA", async () => {
    setup(); const trigger = screen.getByRole("button", { name: "AI 코치에게 물어보기" });
    trigger.focus(); await userEvent.click(trigger); await screen.findByText("오늘 3회 남음");
    expect(screen.getByRole("heading", { name: "O·RIDER Coach" })).toHaveFocus();
    const backdrop = document.querySelector<HTMLButtonElement>(".coach-sheet__backdrop");
    expect(backdrop).toHaveAttribute("tabindex", "-1");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    fireEvent.mouseDown(backdrop!);
    expect(screen.getByRole("heading", { name: "O·RIDER Coach" })).toHaveFocus();
    await userEvent.click(backdrop!);
    await userEvent.click(trigger); // Re-open after backdrop close.
    await screen.findByText("오늘 3회 남음");
    const heading = screen.getByRole("heading", { name: "O·RIDER Coach" });
    heading.focus(); await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: /최근 한 달 운동 기록을 확인하고 체력·피로·회복 상태/ })).toHaveFocus();
    const outside = document.createElement("button"); document.body.appendChild(outside); outside.focus();
    await userEvent.tab();
    expect(within(screen.getByRole("dialog", { name: "O·RIDER Coach" })).getByRole("button", { name: "대화 내역" })).toHaveFocus();
    outside.remove();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("moves focus into the panel while submitting", async () => {
    let resolve!: (value: typeof answer) => void;
    mocks.ask.mockReturnValue(new Promise((done) => { resolve = done; }));
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(screen.getByRole("dialog", { name: "O·RIDER Coach" })).toHaveFocus();
    expect(document.querySelector(".coach-sheet__backdrop")).toBeDisabled();
    resolve(answer); await screen.findByText("이번 주 훈련량이 높았습니다.");
  });

  it("keeps an unsubmitted draft across close/reopen but clears it on unmount", async () => {
    const view = setup(); const trigger = screen.getByRole("button", { name: "AI 코치에게 물어보기" });
    await userEvent.click(trigger); await screen.findByText("오늘 3회 남음");
    await userEvent.type(screen.getByLabelText("내 운동에 대한 질문"), "닫아도 유지할 초안");
    await userEvent.click(screen.getByRole("button", { name: "AI 코치 닫기" })); await userEvent.click(trigger); await screen.findByText("오늘 3회 남음");
    expect(screen.getByLabelText("내 운동에 대한 질문")).toHaveValue("닫아도 유지할 초안");
    view.unmount(); expect(document.body).not.toHaveTextContent("닫아도 유지할 초안");
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    expect(screen.getByLabelText("내 운동에 대한 질문")).toHaveValue("");
  });

  it("clears and rebinds the session when discipline changes", async () => {
    const view = setup(user, "bike"); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.type(screen.getByLabelText("내 운동에 대한 질문"), "자전거 전용 초안");
    view.rerender(<MemoryRouter initialEntries={["/ko/"]}><DialogProvider><CoachQuestionLauncher user={user} discipline="run" onSignIn={vi.fn()} /></DialogProvider></MemoryRouter>);
    expect(screen.queryByRole("dialog", { name: "O·RIDER Coach" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("자전거 전용 초안");
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /10km 50분을 달성하고 싶어/ })); mocks.ask.mockResolvedValue(answer);
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalled());
    expect(mocks.ask.mock.calls[mocks.ask.mock.calls.length - 1]?.[0].discipline).toBe("run");
  });

  it("discards a late in-flight response after a discipline session reset", async () => {
    let resolve!: (value: typeof answer) => void;
    mocks.ask.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = setup(user, "bike");
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(screen.getByText("운동 기록을 확인하고 답변을 준비하고 있습니다…")).toBeInTheDocument();
    view.rerender(<MemoryRouter initialEntries={["/ko/"]}><DialogProvider><CoachQuestionLauncher user={user} discipline="run" onSignIn={vi.fn()} /></DialogProvider></MemoryRouter>);
    expect(screen.queryByRole("dialog", { name: "O·RIDER Coach" })).not.toBeInTheDocument();
    resolve(answer);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog", { name: "O·RIDER Coach" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("이번 주 훈련량이 높았습니다.");
    expect(mocks.analytics.complete).not.toHaveBeenCalled();
  });

  it("discards a late in-flight error after a consent session reset", async () => {
    let reject!: (reason: unknown) => void;
    mocks.ask.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    act(() => window.dispatchEvent(new CustomEvent("orider:coach-consent-revoked")));
    expect(screen.queryByRole("dialog", { name: "O·RIDER Coach" })).not.toBeInTheDocument();
    reject(new CoachClientError("transport", "NETWORK_ERROR"));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog", { name: "O·RIDER Coach" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("답변을 확인하지 못했습니다");
  });

  it("submits a signed continue_no_charge clarification as option-only child DTO", async () => {
    const parentId = answer.requestId; const childId = p1Answer.requestId;
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(parentId).mockReturnValueOnce(childId);
    const clarification = { ...p1Base, requestId: parentId, outcome: "clarification_required",
      clarification: { clarificationId: "clarify_1", promptKey: "coach.clarification.time_range",
        options: [{ optionId: "this_week", labelKey: "coach.clarification.this_week" }], turnToken: "signed-token-abcdefghijklmnopqrstuvwxyz",
        expiresAt: "2099-07-19T15:00:00Z", resolutionMode: "continue_no_charge", consumesQuota: false, providerCalls: 0,
        reasonCode: "time_range_required" } };
    mocks.ask.mockResolvedValueOnce(clarification).mockResolvedValueOnce(p1Answer);
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("어느 기간을 분석할까요?")).toBeInTheDocument();
    expect(screen.getByText("이 선택은 추가 사용 없음 · AI 호출 0회")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "이번 주" }));
    await userEvent.click(screen.getByRole("button", { name: "이 조건으로 계속" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
    expect(mocks.ask.mock.calls[1]?.[0]).toEqual({ requestId: childId, parentRequestId: parentId,
      turnToken: clarification.clarification.turnToken, optionId: "this_week", apiVersion: "v2", schemaVersion: "coach-respond-v2", capabilityVersion: "p1" });
  });

  it("requires confirmation before a new-turn clarification and sends a new natural-language request", async () => {
    const parentId = answer.requestId; const childId = p1Answer.requestId;
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(parentId).mockReturnValueOnce(childId);
    const clarification = { ...p1Base, requestId: parentId, outcome: "clarification_required",
      clarification: { clarificationId: "clarify_2", promptKey: "coach.clarification.time_range",
        options: [{ optionId: "last_week", labelKey: "coach.clarification.last_week" }], turnToken: "",
        expiresAt: "2099-07-19T15:00:00Z", resolutionMode: "new_turn_required", consumesQuota: false, providerCalls: 0,
        reasonCode: "time_range_required" } };
    mocks.ask.mockResolvedValueOnce(clarification).mockResolvedValueOnce(p1Answer);
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await userEvent.click(await screen.findByRole("radio", { name: "지난주" }));
    await userEvent.click(screen.getByRole("button", { name: "이 조건으로 계속" }));
    const confirmation = await screen.findByRole("dialog", { name: "새 질문으로 다시 시도" });
    expect(mocks.ask).toHaveBeenCalledOnce();
    await userEvent.click(within(confirmation).getByRole("button", { name: "1회 사용하고 다시 질문" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
    expect(mocks.ask.mock.calls[1]?.[0]).toMatchObject({ requestId: childId, question: expect.stringContaining("분석 기간은 지난주"),
      apiVersion: "v2", schemaVersion: "coach-respond-v2", capabilityVersion: "p1", contextFilters: {} });
    expect(mocks.ask.mock.calls[1]?.[0]).not.toHaveProperty("turnToken");
  });

  it("keeps the selected PMC snapshot on a confirmed new-turn clarification", async () => {
    const parentId = answer.requestId; const childId = p1Answer.requestId;
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(parentId).mockReturnValueOnce(childId);
    const clarification = { ...p1Base, requestId: parentId, outcome: "clarification_required",
      clarification: { clarificationId: "clarify_pmc", promptKey: "coach.clarification.time_range",
        options: [{ optionId: "last_week", labelKey: "coach.clarification.last_week" }], turnToken: "",
        expiresAt: "2099-07-19T15:00:00Z", resolutionMode: "new_turn_required", consumesQuota: false, providerCalls: 0,
        reasonCode: "time_range_required" } };
    mocks.ask.mockResolvedValueOnce(clarification).mockResolvedValueOnce(p1Answer);
    setupPmc();
    await userEvent.click(screen.getByRole("button", { name: "PMC example" }));
    await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await userEvent.click(await screen.findByRole("radio", { name: "지난주" }));
    await userEvent.click(screen.getByRole("button", { name: "이 조건으로 계속" }));
    const confirmation = await screen.findByRole("dialog", { name: "새 질문으로 다시 시도" });
    await userEvent.click(within(confirmation).getByRole("button", { name: "1회 사용하고 다시 질문" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
    expect(mocks.ask.mock.calls[1]?.[0]).toMatchObject({ requestId: childId,
      contextFilters: { pmcSnapshotId: "pmc_aaaaaaaaaaaaaaaaaaaaaaaa" } });
  });

  it("keeps an unknown valid clarification actionable without claiming a free provider call", async () => {
    const parentId = answer.requestId; const childId = p1Answer.requestId;
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(parentId).mockReturnValueOnce(childId);
    const clarification = { ...p1Base, requestId: parentId, outcome: "clarification_required",
      clarification: { clarificationId: "clarify_custom", promptKey: "coach.clarification.custom_period",
        options: [{ optionId: "rolling_42_days", labelKey: "coach.clarification.rolling_42_days" }], turnToken: "",
        expiresAt: "2099-07-19T15:00:00Z", resolutionMode: "new_turn_required", consumesQuota: false, providerCalls: 0,
        reasonCode: "custom_period_required" } };
    mocks.ask.mockResolvedValueOnce(clarification).mockResolvedValueOnce(p1Answer);
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ })); await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    expect(await screen.findByText("추가 분석 조건을 선택해 주세요")).toBeInTheDocument();
    expect(screen.getByText("확인 후 새 질문 1회를 사용하며 질문에 따라 AI를 최대 1회 호출할 수 있습니다")).toBeInTheDocument();
    expect(screen.queryByText(/AI 호출 0회/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "rolling 42 days" }));
    await userEvent.click(screen.getByRole("button", { name: "이 조건으로 계속" }));
    const confirmation = await screen.findByRole("dialog", { name: "새 질문으로 다시 시도" });
    await userEvent.click(within(confirmation).getByRole("button", { name: "1회 사용하고 다시 질문" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
    expect(mocks.ask.mock.calls[1]?.[0]).toMatchObject({ requestId: childId,
      question: expect.stringContaining("rolling 42 days"), capabilityVersion: "p1" });
  });

  it("toggles an AnswerDocument load chart without another coach request", async () => {
    const atEvidence = { evidenceId: "ev_load_at", source: "load_analysis", sourceId: "load_fixture", field: "week",
      value: "2026-W30", sourceRevision: "load-r1", asOf: "2026-07-18T00:00:00Z", ownerScope: "authenticated_user" };
    const valueEvidence = { ...atEvidence, evidenceId: "ev_load_ctl", field: "ctl", value: 21 };
    const previousAtEvidence = { ...atEvidence, evidenceId: "ev_load_at_previous", value: "2026-W29" };
    const previousValueEvidence = { ...valueEvidence, evidenceId: "ev_load_ctl_previous", value: 19 };
    const loadResponse = { ...p1Answer, requestId: answer.requestId, answer: { ...p1Answer.answer,
      blocks: [{ blockId: "block_dynamic_load", sourceSlotIds: ["weekly_ctl"], partial: false, stale: false,
        truncated: false, omittedCount: 0, kind: "time_series", series: [{ seriesId: "weekly_ctl", metricId: "ctl",
          points: [{ at: { value: previousAtEvidence.value, evidenceId: previousAtEvidence.evidenceId },
            value: { value: previousValueEvidence.value, unit: "score", evidenceId: previousValueEvidence.evidenceId } },
          { at: { value: atEvidence.value, evidenceId: atEvidence.evidenceId },
            value: { value: valueEvidence.value, unit: "score", evidenceId: valueEvidence.evidenceId } }] }] }],
      evidence: [previousAtEvidence, previousValueEvidence, atEvidence, valueEvidence] } };
    mocks.ask.mockResolvedValue(loadResponse);
    setup(); await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" })); await screen.findByText("오늘 3회 남음");
    await userEvent.click(screen.getByRole("button", { name: /FTP 3\.5 W\/kg을 만들고 싶어\./ }));
    await userEvent.click(screen.getByRole("button", { name: "질문하기" }));
    await screen.findByRole("button", { name: "차트와 표로 보기" });
    expect(mocks.ask).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "차트와 표로 보기" }));
    expect(screen.getByRole("img", { name: "서버가 제공한 시계열의 추세 차트" })).toBeInTheDocument();
    expect(mocks.ask).toHaveBeenCalledOnce();
  });
});
