import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachHistoryPage from "./CoachHistoryPage";
import type { CoachConsentPolicy } from "../services/coachConsentClient";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), more: vi.fn(), remove: vi.fn(), removeAll: vi.fn(), status: vi.fn(), policy: vi.fn(),
  navigate: vi.fn(), confirm: vi.fn(), signIn: vi.fn(), user: { uid: "u1" } as { uid: string } | null,
  consentCallbacks: [] as Array<{ onCancel: () => void; onConsented: (saved: CoachConsentPolicy) => void }>,
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({
  user: mocks.user, profile: { primaryDiscipline: "run" }, signInWithGoogle: mocks.signIn,
}) }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: mocks.confirm }) }));
vi.mock("../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => mocks.navigate, useLocalizedPath: (path: string) => `/ko${path}` }));
vi.mock("../services/coachHistoryClient", () => ({
  getCoachThreads: (...args: unknown[]) => mocks.list(...args), getCoachThread: (...args: unknown[]) => mocks.detail(...args),
  continueCoachThread: (...args: unknown[]) => mocks.more(...args), deleteCoachThread: (...args: unknown[]) => mocks.remove(...args),
  deleteAllCoachThreads: (...args: unknown[]) => mocks.removeAll(...args),
  isCoachHistoryTransportError: (error: unknown) => error instanceof Error && error.name === "CoachHistoryTransportError",
}));
vi.mock("../services/coachClient", () => ({ getCoachStatus: () => mocks.status() }));
vi.mock("../services/coachConsentClient", () => ({ getCoachConsentPolicy: () => mocks.policy() }));
vi.mock("../features/coach/CoachAnswerDocument", () => ({ CoachAnswerDocumentView: ({ response }: { response: { requestId: string } }) => <div>answer {response.requestId}</div> }));
vi.mock("../features/coach/FirstUseCoachConsent", () => ({ FirstUseCoachConsent: ({ open, onCancel, onConsented }: {
  open: boolean; onCancel: () => void; onConsented: (saved: CoachConsentPolicy) => void,
}) => {
  if (!open) return null;
  mocks.consentCallbacks.push({ onCancel, onConsented });
  return <button onClick={onCancel} data-testid="consent-open">consent-cancel-test</button>;
} }));

const threadId = "123e4567-e89b-42d3-a456-426614174000";
const requestId = "223e4567-e89b-42d3-a456-426614174001";
const summary = { threadId, title: "이번 주 운동량", discipline: "bike", createdAt: "2026-07-19T01:00:00Z",
  updatedAt: "2026-07-19T02:00:00Z", turnCount: 2, revision: 2 };
const response = { requestId, outcome: "unsupported", unsupported: { reasonCodes: ["unsupported_question"], missingCapabilities: [], suggestedQueries: [] },
  quota: { remaining: 2, resetAt: "2026-07-20T00:00:00Z" } };

function app(route = "/ko/coach") {
  return <MemoryRouter initialEntries={[route]}><Routes><Route path="/:lang/coach" element={<CoachHistoryPage />} />
    <Route path="/:lang/coach/:threadId" element={<CoachHistoryPage />} /></Routes></MemoryRouter>;
}

function setup(route = "/ko/coach") {
  return render(app(route));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("CoachHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consentCallbacks = [];
    mocks.user = { uid: "u1" };
    mocks.list.mockResolvedValue({ threads: [summary], nextCursor: null });
    mocks.status.mockResolvedValue({ quota: { limit: 3, remaining: 3, resetAt: "2026-07-20T00:00:00Z", timezone: "Asia/Seoul" } });
    mocks.detail.mockResolvedValue({ thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null });
    mocks.policy.mockResolvedValue({ policyVersion: "v1", consent: { active: true, current: true, revoked: false, currentPolicyVersion: "v1", storedPolicyVersion: "v1" } });
    mocks.confirm.mockResolvedValue(true);
  });

  it("offers the real Coach launcher and sign-in action on the signed-out tab entry", async () => {
    mocks.user = null;
    setup();

    expect(screen.getByRole("heading", { name: "AI 코치에게 물어보세요" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "AI 코치에게 물어보기" }));
    await userEvent.click(screen.getByRole("button", { name: "로그인하기" }));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("renders the saved list and performs a confirmed permanent thread delete", async () => {
    setup();
    expect(await screen.findByRole("link", { name: /이번 주 운동량/ })).toHaveAttribute("href", `/ko/coach/${threadId}`);
    await userEvent.click(screen.getByRole("button", { name: "이번 주 운동량 대화 삭제" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(threadId));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("복구할 수 없습니다"), expect.objectContaining({ destructive: true }));
  });

  it("reuses the stored answer and posts a follow-up with the selected thread context", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("323e4567-e89b-42d3-a456-426614174002");
    mocks.more.mockResolvedValue({ ...response, requestId: "323e4567-e89b-42d3-a456-426614174002" });
    const originalPage = { thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null };
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    const canonicalPage = { thread: { ...summary, turnCount: 3, revision: 3, updatedAt: "2026-07-19T03:00:00Z", turns: [
      ...originalPage.thread.turns, { turnId: followUpId, requestId: followUpId, question: "지난주와 비교해줘",
        createdAt: "2026-07-19T03:00:00Z", response: { ...response, requestId: followUpId, outcome: "answer" }, sessionRevision: 3 },
    ] }, nextCursor: null };
    mocks.detail.mockReset().mockResolvedValueOnce(originalPage).mockResolvedValueOnce(canonicalPage);
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByText(`answer ${requestId}`)).toBeInTheDocument();
    expect(screen.getByText("현재 지원하지 않는 질문입니다")).toBeInTheDocument();
    expect(screen.getByText(/최근 질문과 답변 최대 3개\(합산 최대 5 KiB\).*외부 AI 처리/)).toBeInTheDocument();
    const followUp = screen.getByLabelText("이 대화에서 이어 묻기");
    await waitFor(() => expect(followUp).toBeEnabled());
    await userEvent.click(followUp);
    expect(followUp).toHaveFocus();
    await userEvent.type(followUp, "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({
      requestId: "323e4567-e89b-42d3-a456-426614174002", question: "지난주와 비교해줘", discipline: "bike", responseFormat: "auto",
      expectedSessionRevision: 2,
    })));
    const original = screen.getByText(`answer ${requestId}`);
    const appended = await screen.findByText("answer 323e4567-e89b-42d3-a456-426614174002");
    expect(original.compareDocumentPosition(appended) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent("답변을 저장하고 최신 대화를 불러왔습니다.");
    expect(screen.queryByRole("group", { name: "답변 형식" })).not.toBeInTheDocument();
  });

  it("admits only one follow-up while consent policy lookup is pending", async () => {
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(followUpId);
    const policy = deferred<Awaited<ReturnType<typeof mocks.policy>>>();
    const followUp = deferred<typeof response>();
    mocks.policy.mockReturnValue(policy.promise);
    mocks.more.mockReturnValue(followUp.promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    const button = screen.getByRole("button", { name: "이어 묻기" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.policy).toHaveBeenCalledTimes(1);
    expect(mocks.more).not.toHaveBeenCalled();

    policy.resolve({ policyVersion: "v1", consent: { active: true, current: true, revoked: false,
      currentPolicyVersion: "v1", storedPolicyVersion: "v1" } });
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(1));
    expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({ requestId: followUpId }));
  });

  it.each(["resolved", "rejected"])("ignores a stale %s policy result after editing and admitting a new follow-up", async oldResult => {
    const firstId = "323e4567-e89b-42d3-a456-426614174002";
    const secondId = "423e4567-e89b-42d3-a456-426614174003";
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    const oldPolicy = deferred<Awaited<ReturnType<typeof mocks.policy>>>();
    const newPolicy = deferred<Awaited<ReturnType<typeof mocks.policy>>>();
    mocks.policy.mockReturnValueOnce(oldPolicy.promise).mockReturnValueOnce(newPolicy.promise);
    mocks.more.mockReturnValue(deferred<typeof response>().promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    const editor = screen.getByLabelText("이 대화에서 이어 묻기");
    await userEvent.type(editor, "첫 질문");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await userEvent.clear(editor);
    await userEvent.type(editor, "둘째 질문");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    expect(mocks.policy).toHaveBeenCalledTimes(2);

    await act(async () => {
      if (oldResult === "resolved") oldPolicy.resolve({ policyVersion: "v1", consent: { active: false, current: false,
        revoked: false, currentPolicyVersion: "v1", storedPolicyVersion: "v1" } });
      else oldPolicy.reject(new Error("old policy lookup failed"));
    });
    expect(screen.queryByTestId("consent-open")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.more).not.toHaveBeenCalled();

    newPolicy.resolve({ policyVersion: "v1", consent: { active: true, current: true, revoked: false,
      currentPolicyVersion: "v1", storedPolicyVersion: "v1" } });
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(1));
    expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({ requestId: secondId, question: "둘째 질문" }));
    expect(screen.queryByTestId("consent-open")).not.toBeInTheDocument();
  });

  it("releases the pending request when first-use consent is cancelled", async () => {
    const firstId = "323e4567-e89b-42d3-a456-426614174002";
    const secondId = "423e4567-e89b-42d3-a456-426614174003";
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    mocks.policy.mockResolvedValueOnce({ policyVersion: "v1", consent: { active: false, current: false,
      revoked: false, currentPolicyVersion: "v1", storedPolicyVersion: "v1" } }).mockResolvedValueOnce({
      policyVersion: "v1", consent: { active: true, current: true, revoked: false,
        currentPolicyVersion: "v1", storedPolicyVersion: "v1" },
    });
    mocks.more.mockReturnValue(deferred<typeof response>().promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await userEvent.click(await screen.findByTestId("consent-open"));
    expect(screen.queryByTestId("consent-open")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(1));
    expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({ requestId: secondId }));
    expect(mocks.policy).toHaveBeenCalledTimes(2);
  });

  it.each(["accepted", "cancelled"])("keeps a new consent dialog when the previous %s callback arrives late", async previous => {
    const firstId = "323e4567-e89b-42d3-a456-426614174002";
    const secondId = "423e4567-e89b-42d3-a456-426614174003";
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    const inactive = { policyVersion: "v1", consent: { active: false, current: false, revoked: false,
      currentPolicyVersion: "v1", storedPolicyVersion: "v1" } } as CoachConsentPolicy;
    const active = { ...inactive, consent: { ...inactive.consent, active: true, current: true } };
    mocks.policy.mockResolvedValue(inactive);
    mocks.more.mockReturnValue(deferred<typeof response>().promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    const editor = screen.getByLabelText("이 대화에서 이어 묻기");
    await userEvent.type(editor, "첫 질문");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await screen.findByTestId("consent-open");
    const oldCallback = mocks.consentCallbacks.at(-1)!;
    fireEvent.change(editor, { target: { value: "둘째 질문" } });
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await screen.findByTestId("consent-open");
    const newCallback = mocks.consentCallbacks.at(-1)!;
    expect(newCallback).not.toBe(oldCallback);

    act(() => { if (previous === "accepted") oldCallback.onConsented(active); else oldCallback.onCancel(); });
    expect(screen.getByTestId("consent-open")).toBeInTheDocument();
    expect(mocks.more).not.toHaveBeenCalled();
    act(() => newCallback.onConsented(active));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(1));
    expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({ requestId: secondId, question: "둘째 질문" }));
  });

  it.each(["route ABA", "account switch"])("does not apply an old consent acceptance after %s", async transition => {
    const firstId = "323e4567-e89b-42d3-a456-426614174002";
    const secondId = "423e4567-e89b-42d3-a456-426614174003";
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    const inactive = { policyVersion: "v1", consent: { active: false, current: false, revoked: false,
      currentPolicyVersion: "v1", storedPolicyVersion: "v1" } } as CoachConsentPolicy;
    const active = { ...inactive, consent: { ...inactive.consent, active: true, current: true } };
    mocks.policy.mockResolvedValue(inactive);
    mocks.more.mockReturnValue(deferred<typeof response>().promise);
    const view = setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "첫 질문");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await screen.findByTestId("consent-open");
    const oldCallback = mocks.consentCallbacks.at(-1)!;

    if (transition === "route ABA") {
      await userEvent.click(screen.getByRole("link", { name: "대화 목록으로 돌아가기" }));
      await userEvent.click(screen.getByRole("link", { name: /이번 주 운동량/ }));
    } else {
      mocks.user = { uid: "u2" };
      view.rerender(app(`/ko/coach/${threadId}`));
    }
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(2));
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "둘째 질문");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await screen.findByTestId("consent-open");
    const newCallback = mocks.consentCallbacks.at(-1)!;
    act(() => oldCallback.onConsented(active));
    expect(screen.getByTestId("consent-open")).toBeInTheDocument();
    expect(mocks.more).not.toHaveBeenCalled();
    act(() => newCallback.onConsented(active));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(1));
    expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({ requestId: secondId, question: "둘째 질문" }));
  });

  it("renders a stored P2 AnswerDocument through the existing answer renderer", async () => {
    const p2Stored = { requestId, capabilityVersion: "p2", outcome: "answer",
      answer: { compatibility: "supported", blocks: [], evidence: [], freshness: { asOf: "2026-08-01T02:23:00Z", timezone: "Asia/Seoul" } },
      quota: { consumed: true }, retry: { mode: "none", retryable: false, reasonCode: "answer_generated" } };
    mocks.detail.mockResolvedValue({ thread: { ...summary, turns: [{ turnId: requestId, requestId,
      question: "내 마지막 운동 기록을 코칭해줘.", createdAt: "2026-08-01T02:23:00Z", response: p2Stored,
      sessionRevision: 2 }] }, nextCursor: null });
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByText(`answer ${requestId}`)).toBeInTheDocument();
    expect(screen.queryByText("현재 지원하지 않는 질문입니다")).not.toBeInTheDocument();
  });

  it("labels each saved turn with chronology and explicit speaker identity", async () => {
    const firstId = "323e4567-e89b-42d3-a456-426614174002";
    mocks.detail.mockResolvedValue({ thread: { ...summary, turns: [
      { turnId: firstId, requestId: firstId, question: "지난주 운동량은 어땠어?", createdAt: "2026-07-18T02:00:00Z",
        response: { ...response, requestId: firstId }, sessionRevision: 1 },
      { turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 },
    ] }, nextCursor: null });
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByRole("heading", { name: "대화 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "대화 2" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "나" })).toHaveLength(2);
    expect(screen.getAllByRole("heading", { name: "O·RIDER 코치" })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "대화 1 · 나" })).toHaveTextContent("지난주 운동량은 어땠어?");
    expect(screen.getByRole("region", { name: "대화 1 · O·RIDER 코치" })).toHaveTextContent(`answer ${firstId}`);
    expect(screen.getByRole("region", { name: "대화 2 · 나" })).toHaveTextContent("이번 주 운동량이 어땠어?");
    expect(screen.getByRole("region", { name: "대화 2 · O·RIDER 코치" })).toHaveTextContent(`answer ${requestId}`);
  });

  it.each([false, true])("does not announce a saved answer for a 503 envelope without its canonical request advanced=%s", async advanced => {
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(followUpId);
    mocks.more.mockResolvedValue({ ...response, requestId: followUpId, outcome: "failed", httpOk: false, httpStatus: 503 });
    const original = { thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null };
    const canonical = advanced ? { ...original, thread: { ...original.thread, revision: 3, turnCount: 3 } } : original;
    mocks.detail.mockReset().mockResolvedValueOnce(original).mockResolvedValue(canonical);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    expect(await screen.findByRole("button", { name: "같은 요청 결과 다시 확인" })).toBeInTheDocument();
    expect(screen.queryByText("답변을 저장하고 최신 대화를 불러왔습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("이 대화에서 이어 묻기")).toHaveValue("지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "같은 요청 결과 다시 확인" }));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(2));
    expect(mocks.more.mock.calls[1]?.[1]).toEqual(mocks.more.mock.calls[0]?.[1]);
  });

  it("treats a stored terminal follow-up as confirmed instead of offering a transport retry", async () => {
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(followUpId);
    const failed = { ...response, requestId: followUpId, outcome: "failed",
      error: { code: "token_cap_exceeded", retryable: false, fallbackAvailable: false } };
    const originalPage = { thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null };
    const canonicalPage = { thread: { ...summary, turnCount: 3, revision: 3, turns: [
      ...originalPage.thread.turns, { turnId: followUpId, requestId: followUpId, question: "지난주와 비교해줘",
        createdAt: "2026-07-19T03:00:00Z", response: failed, sessionRevision: 3 },
    ] }, nextCursor: null };
    mocks.detail.mockReset().mockResolvedValueOnce(originalPage).mockResolvedValueOnce(canonicalPage);
    mocks.more.mockResolvedValue({ ...failed, httpOk: false, httpStatus: 503 });
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    expect(await screen.findByText("답변을 완성하지 못했습니다. 표시된 일부 결과가 있다면 안전하게 확인된 범위입니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "같은 요청 결과 다시 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("요청 결과가 대화 기록에 저장되었습니다.");
    expect(screen.queryByText("답변을 저장하고 최신 대화를 불러왔습니다.")).not.toBeInTheDocument();
    expect(mocks.more).toHaveBeenCalledOnce();
  });

  it("keeps the same request available when canonical confirmation cannot be loaded", async () => {
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(followUpId);
    const originalPage = { thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null };
    const canonicalPage = { thread: { ...summary, turnCount: 3, revision: 3, turns: [...originalPage.thread.turns, { turnId: followUpId, requestId: followUpId, question: "지난주와 비교해줘",
      createdAt: "2026-07-19T03:00:00Z", response: { ...response, requestId: followUpId, outcome: "answer" }, sessionRevision: 3 }] }, nextCursor: null };
    mocks.detail.mockReset().mockResolvedValueOnce(originalPage).mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce(canonicalPage);
    mocks.more.mockResolvedValue({ ...response, requestId: followUpId });
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await screen.findByRole("button", { name: "다시 시도" });
    expect(screen.getByText("선택한 대화를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "같은 요청 결과 다시 확인" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "같은 요청 결과 다시 확인" }));
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(3));
    expect(mocks.more).toHaveBeenCalledTimes(2);
    expect(mocks.more.mock.calls[1]?.[1]).toEqual(mocks.more.mock.calls[0]?.[1]);
    expect(screen.queryByText("선택한 대화를 불러오지 못했습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("답변을 저장하고 최신 대화를 불러왔습니다.");
  });

  it("drops a late user A list response after the authenticated user changes to B", async () => {
    const lateA = deferred<{ threads: (typeof summary)[]; nextCursor: null }>();
    const bSummary = { ...summary, threadId: "323e4567-e89b-42d3-a456-426614174002", title: "B의 대화" };
    mocks.user!.uid = "A";
    mocks.list.mockReset().mockReturnValueOnce(lateA.promise).mockResolvedValueOnce({ threads: [bSummary], nextCursor: null });
    const view = setup();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.user!.uid = "B";
    view.rerender(app());
    expect(await screen.findByRole("link", { name: /B의 대화/ })).toBeInTheDocument();
    lateA.resolve({ threads: [summary], nextCursor: null });
    await waitFor(() => expect(screen.queryByRole("link", { name: /이번 주 운동량/ })).not.toBeInTheDocument());
  });

  it("ignores a late A follow-up after navigating A to B and back to A", async () => {
    const followUp = deferred<typeof response>();
    const bId = "323e4567-e89b-42d3-a456-426614174002";
    const bRequestId = "423e4567-e89b-42d3-a456-426614174003";
    const bSummary = { ...summary, threadId: bId, title: "회복 상태", turnCount: 1, revision: 1 };
    mocks.list.mockResolvedValue({ threads: [summary, bSummary], nextCursor: null });
    mocks.detail.mockImplementation(async (id: string) => ({ thread: {
      ...(id === bId ? bSummary : summary),
      turns: [{ turnId: id === bId ? bRequestId : requestId, requestId: id === bId ? bRequestId : requestId,
        question: id === bId ? "회복은 어때?" : "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z",
        response: { ...response, requestId: id === bId ? bRequestId : requestId }, sessionRevision: id === bId ? 1 : 2 }],
    }, nextCursor: null }));
    mocks.more.mockReturnValue(followUp.promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("link", { name: /회복 상태/ }));
    await screen.findByText(`answer ${bRequestId}`);
    await userEvent.click(screen.getByRole("link", { name: /이번 주 운동량/ }));
    await screen.findByText(`answer ${requestId}`);
    followUp.resolve(response);
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(3));
    expect(screen.queryByText("이어 묻기 답변이 저장되었습니다")).not.toBeInTheDocument();
  });

  it("does not render the previous thread during a route transition", async () => {
    const bId = "323e4567-e89b-42d3-a456-426614174002";
    const bRequestId = "423e4567-e89b-42d3-a456-426614174003";
    const bSummary = { ...summary, threadId: bId, title: "회복 상태", turnCount: 1, revision: 1 };
    const delayedB = deferred<{ thread: typeof bSummary & { turns: Array<Record<string, unknown>> }; nextCursor: null }>();
    mocks.list.mockResolvedValue({ threads: [summary, bSummary], nextCursor: null });
    mocks.detail.mockResolvedValueOnce({ thread: { ...summary, turns: [{ turnId: requestId, requestId,
      question: "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null })
      .mockReturnValueOnce(delayedB.promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.click(screen.getByRole("link", { name: /회복 상태/ }));
    await waitFor(() => expect(mocks.detail).toHaveBeenLastCalledWith(bId, 20));
    expect(screen.queryByText(`answer ${requestId}`)).not.toBeInTheDocument();
    delayedB.resolve({ thread: { ...bSummary, turns: [{ turnId: bRequestId, requestId: bRequestId,
      question: "회복은 어때?", createdAt: "2026-07-19T03:00:00Z", response: { ...response, requestId: bRequestId }, sessionRevision: 1 }] }, nextCursor: null });
    expect(await screen.findByText(`answer ${bRequestId}`)).toBeInTheDocument();
  });

  it("keeps history and deletion available when only quota loading fails", async () => {
    mocks.status.mockRejectedValue(new Error("status unavailable"));
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByRole("link", { name: /이번 주 운동량/ })).toBeInTheDocument();
    expect(await screen.findByText("AI 코치 사용 가능 횟수를 확인하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("이 대화에서 이어 묻기")).toBeDisabled();
    const deleteButton = screen.getAllByRole("button", { name: "이번 주 운동량 대화 삭제" })[0]!;
    expect(deleteButton).toBeEnabled();
    await userEvent.click(deleteButton);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(threadId));
  });

  it("retries a fetch or response-body ambiguity with the same request id and automatic format", async () => {
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(followUpId);
    const transportError = new Error("transport unknown"); transportError.name = "CoachHistoryTransportError";
    mocks.more.mockRejectedValueOnce(transportError).mockResolvedValueOnce({ ...response, requestId: followUpId });
    const originalPage = { thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response, sessionRevision: 2 }] }, nextCursor: null };
    const canonicalPage = { thread: { ...summary, revision: 3, turnCount: 3, turns: [
      ...originalPage.thread.turns, { turnId: followUpId, requestId: followUpId, question: "지난주와 비교해줘",
        createdAt: "2026-07-19T03:00:00Z", response: { ...response, requestId: followUpId, outcome: "answer" }, sessionRevision: 3 },
    ] }, nextCursor: null };
    mocks.detail.mockReset().mockResolvedValueOnce(originalPage).mockResolvedValueOnce(canonicalPage);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    expect(await screen.findByRole("button", { name: "같은 요청 결과 다시 확인" })).toBeInTheDocument();
    expect(screen.getByText(/동일한 요청 ID와 답변 형식.*새 사용 횟수를 요청하지 않으며.*서버 응답/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이어 묻기" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "같은 요청 결과 다시 확인" }));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledTimes(2));
    expect(mocks.more.mock.calls.map((call) => call[0])).toEqual([threadId, threadId]);
    expect(mocks.more.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ requestId: followUpId, responseFormat: "auto", expectedSessionRevision: 2 }),
      expect.objectContaining({ requestId: followUpId, responseFormat: "auto", expectedSessionRevision: 2 }),
    ]);
    expect(screen.queryByRole("button", { name: "같은 요청 결과 다시 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "답변 형식" })).not.toBeInTheDocument();
  });

  it("disables the follow-up composer when today's quota is exhausted", async () => {
    mocks.status.mockResolvedValue({ quota: { limit: 3, remaining: 0, resetAt: "2026-07-20T00:00:00Z", timezone: "Asia/Seoul" } });
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await waitFor(() => expect(screen.getByText("오늘 0회 남음")).toBeInTheDocument());
    expect(screen.getByLabelText("이 대화에서 이어 묻기")).toBeDisabled();
  });

  it("keeps a saved partial answer's failed outcome visible without announcing historical content as a live alert", async () => {
    mocks.detail.mockResolvedValue({ thread: { ...summary, turns: [{ turnId: requestId, requestId,
      question: "훈련 방향을 알려줘", createdAt: "2026-07-19T02:00:00Z",
      response: { ...response, outcome: "failed", answer: { status: "partial" } }, sessionRevision: 2 }] }, nextCursor: null });
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByText(`answer ${requestId}`)).toBeInTheDocument();
    expect(screen.getByText("답변을 완성하지 못했습니다. 표시된 일부 결과가 있다면 안전하게 확인된 범위입니다.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders saved clarification options from the allowlisted label key instead of a conflicting option id", async () => {
    mocks.detail.mockResolvedValue({ thread: { ...summary, turns: [{ turnId: requestId, requestId,
      question: "어떤 종목?", createdAt: "2026-07-19T02:00:00Z", response: { ...response,
        outcome: "clarification_required", answer: undefined, clarification: {
          promptKey: "coach.clarify.discipline", options: [
            { optionId: "bike", labelKey: "coach.clarification.swim" },
            { optionId: "custom_option", labelKey: "untrusted.label" },
          ],
        } }, sessionRevision: 2 }] }, nextCursor: null });
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByText("어느 종목을 분석할까요?")).toBeInTheDocument();
    const outcome = screen.getByText("질문을 조금 더 구체화해 주세요").closest(".coach-thread-turn__outcome")!;
    expect(within(outcome).getByText("수영")).toBeInTheDocument();
    expect(within(outcome).queryByText("사이클")).not.toBeInTheDocument();
    expect(within(outcome).getByText("custom option")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prepends cursor-loaded older turns above the latest chronological page and removes overlap", async () => {
    const olderId = "323e4567-e89b-42d3-a456-426614174002";
    const newestId = "423e4567-e89b-42d3-a456-426614174003";
    const turn = (id: string, question: string, createdAt: string, sessionRevision: number) => ({ turnId: id, requestId: id, question, createdAt,
      response: { ...response, requestId: id }, sessionRevision });
    const middle = turn(requestId, "중간 질문", "2026-07-19T02:00:00Z", 2);
    mocks.detail.mockResolvedValueOnce({ thread: { ...summary, turnCount: 3, revision: 3,
      turns: [middle, turn(newestId, "최신 질문", "2026-07-19T03:00:00Z", 3)] }, nextCursor: "older-cursor" })
      .mockResolvedValueOnce({ thread: { ...summary, turnCount: 3, revision: 3,
        turns: [turn(olderId, "가장 오래된 질문", "2026-07-19T01:00:00Z", 1), middle] }, nextCursor: null });
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${newestId}`);
    expect(screen.getByRole("heading", { name: "대화 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "대화 3" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "대화 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "대화 2 · 나" })).toHaveTextContent("중간 질문");
    expect(screen.getByRole("region", { name: "대화 3 · O·RIDER 코치" })).toHaveTextContent(`answer ${newestId}`);
    await userEvent.click(screen.getByRole("button", { name: "이전 대화 더 보기" }));
    const older = await screen.findByText(`answer ${olderId}`);
    const middleAnswer = screen.getByText(`answer ${requestId}`);
    const newest = screen.getByText(`answer ${newestId}`);
    expect(older.compareDocumentPosition(middleAnswer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(middleAnswer.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(`answer ${requestId}`)).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "대화 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "대화 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "대화 3" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "대화 2 · 나" })).toHaveTextContent("중간 질문");
    expect(screen.queryByRole("button", { name: "이전 대화 더 보기" })).not.toBeInTheDocument();
  });
});
