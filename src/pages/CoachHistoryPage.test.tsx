import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachHistoryPage from "./CoachHistoryPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), more: vi.fn(), remove: vi.fn(), removeAll: vi.fn(), status: vi.fn(), policy: vi.fn(),
  navigate: vi.fn(), confirm: vi.fn(), user: { uid: "u1" },
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: mocks.confirm }) }));
vi.mock("../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => mocks.navigate, useLocalizedPath: (path: string) => `/ko${path}` }));
vi.mock("../services/coachHistoryClient", () => ({
  getCoachThreads: (...args: unknown[]) => mocks.list(...args), getCoachThread: (...args: unknown[]) => mocks.detail(...args),
  continueCoachThread: (...args: unknown[]) => mocks.more(...args), deleteCoachThread: (...args: unknown[]) => mocks.remove(...args),
  deleteAllCoachThreads: (...args: unknown[]) => mocks.removeAll(...args),
}));
vi.mock("../services/coachClient", () => ({ getCoachStatus: () => mocks.status() }));
vi.mock("../services/coachConsentClient", () => ({ getCoachConsentPolicy: () => mocks.policy() }));
vi.mock("../features/coach/CoachAnswerDocument", () => ({ CoachAnswerDocumentView: ({ response }: { response: { requestId: string } }) => <div>answer {response.requestId}</div> }));
vi.mock("../features/coach/FirstUseCoachConsent", () => ({ FirstUseCoachConsent: () => null }));

const threadId = "123e4567-e89b-42d3-a456-426614174000";
const requestId = "223e4567-e89b-42d3-a456-426614174001";
const summary = { threadId, title: "이번 주 운동량", discipline: "bike", createdAt: "2026-07-19T01:00:00Z",
  updatedAt: "2026-07-19T02:00:00Z", turnCount: 2 };
const response = { requestId, quota: { remaining: 2, resetAt: "2026-07-20T00:00:00Z" } };

function app(route = "/ko/coach") {
  return <MemoryRouter initialEntries={[route]}><Routes><Route path="/:lang/coach" element={<CoachHistoryPage />} />
    <Route path="/:lang/coach/:threadId" element={<CoachHistoryPage />} /></Routes></MemoryRouter>;
}

function setup(route = "/ko/coach") {
  return render(app(route));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("CoachHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.uid = "u1";
    mocks.list.mockResolvedValue({ threads: [summary], nextCursor: null });
    mocks.status.mockResolvedValue({ quota: { limit: 3, remaining: 3, resetAt: "2026-07-20T00:00:00Z", timezone: "Asia/Seoul" } });
    mocks.detail.mockResolvedValue({ thread: { ...summary, turns: [{ turnId: requestId, requestId, question: "이번 주 운동량이 어땠어?",
      createdAt: "2026-07-19T02:00:00Z", response }] }, nextCursor: null });
    mocks.policy.mockResolvedValue({ policyVersion: "v1", consent: { active: true, current: true, revoked: false, currentPolicyVersion: "v1", storedPolicyVersion: "v1" } });
    mocks.confirm.mockResolvedValue(true);
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
      createdAt: "2026-07-19T02:00:00Z", response }] }, nextCursor: null };
    const followUpId = "323e4567-e89b-42d3-a456-426614174002";
    const canonicalPage = { thread: { ...summary, turnCount: 3, updatedAt: "2026-07-19T03:00:00Z", turns: [
      ...originalPage.thread.turns, { turnId: followUpId, requestId: followUpId, question: "지난주와 비교해줘",
        createdAt: "2026-07-19T03:00:00Z", response: { ...response, requestId: followUpId } },
    ] }, nextCursor: null };
    mocks.detail.mockReset().mockResolvedValueOnce(originalPage).mockResolvedValueOnce(canonicalPage);
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByText(`answer ${requestId}`)).toBeInTheDocument();
    expect(screen.getByText(/최근 질문과 답변 최대 3개\(합산 최대 12 KiB\).*외부 AI 처리/)).toBeInTheDocument();
    const jump = screen.getByRole("button", { name: "이어 묻기로 이동" });
    await waitFor(() => expect(jump).toBeEnabled());
    await userEvent.click(jump);
    expect(screen.getByLabelText("이 대화에서 이어 묻기")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("이 대화에서 이어 묻기"), "지난주와 비교해줘");
    await userEvent.click(screen.getByRole("button", { name: "이어 묻기" }));
    await waitFor(() => expect(mocks.more).toHaveBeenCalledWith(threadId, expect.objectContaining({
      requestId: "323e4567-e89b-42d3-a456-426614174002", question: "지난주와 비교해줘", discipline: "bike",
    })));
    const original = screen.getByText(`answer ${requestId}`);
    const appended = await screen.findByText("answer 323e4567-e89b-42d3-a456-426614174002");
    expect(original.compareDocumentPosition(appended) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent("답변을 저장하고 최신 대화를 불러왔습니다.");
  });

  it("drops a late user A list response after the authenticated user changes to B", async () => {
    const lateA = deferred<{ threads: (typeof summary)[]; nextCursor: null }>();
    const bSummary = { ...summary, threadId: "323e4567-e89b-42d3-a456-426614174002", title: "B의 대화" };
    mocks.user.uid = "A";
    mocks.list.mockReset().mockReturnValueOnce(lateA.promise).mockResolvedValueOnce({ threads: [bSummary], nextCursor: null });
    const view = setup();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.user.uid = "B";
    view.rerender(app());
    expect(await screen.findByRole("link", { name: /B의 대화/ })).toBeInTheDocument();
    lateA.resolve({ threads: [summary], nextCursor: null });
    await waitFor(() => expect(screen.queryByRole("link", { name: /이번 주 운동량/ })).not.toBeInTheDocument());
  });

  it("ignores a late A follow-up after navigating A to B and back to A", async () => {
    const followUp = deferred<typeof response>();
    const bId = "323e4567-e89b-42d3-a456-426614174002";
    const bRequestId = "423e4567-e89b-42d3-a456-426614174003";
    const bSummary = { ...summary, threadId: bId, title: "회복 상태", turnCount: 1 };
    mocks.list.mockResolvedValue({ threads: [summary, bSummary], nextCursor: null });
    mocks.detail.mockImplementation(async (id: string) => ({ thread: {
      ...(id === bId ? bSummary : summary),
      turns: [{ turnId: id === bId ? bRequestId : requestId, requestId: id === bId ? bRequestId : requestId,
        question: id === bId ? "회복은 어때?" : "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z",
        response: { ...response, requestId: id === bId ? bRequestId : requestId } }],
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
    const bSummary = { ...summary, threadId: bId, title: "회복 상태", turnCount: 1 };
    const delayedB = deferred<{ thread: typeof bSummary & { turns: Array<Record<string, unknown>> }; nextCursor: null }>();
    mocks.list.mockResolvedValue({ threads: [summary, bSummary], nextCursor: null });
    mocks.detail.mockResolvedValueOnce({ thread: { ...summary, turns: [{ turnId: requestId, requestId,
      question: "이번 주 운동량이 어땠어?", createdAt: "2026-07-19T02:00:00Z", response }] }, nextCursor: null })
      .mockReturnValueOnce(delayedB.promise);
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await userEvent.click(screen.getByRole("link", { name: /회복 상태/ }));
    await waitFor(() => expect(mocks.detail).toHaveBeenLastCalledWith(bId, 20));
    expect(screen.queryByText(`answer ${requestId}`)).not.toBeInTheDocument();
    delayedB.resolve({ thread: { ...bSummary, turns: [{ turnId: bRequestId, requestId: bRequestId,
      question: "회복은 어때?", createdAt: "2026-07-19T03:00:00Z", response: { ...response, requestId: bRequestId } }] }, nextCursor: null });
    expect(await screen.findByText(`answer ${bRequestId}`)).toBeInTheDocument();
  });

  it("keeps history and deletion available when only quota loading fails", async () => {
    mocks.status.mockRejectedValue(new Error("status unavailable"));
    setup(`/ko/coach/${threadId}`);
    expect(await screen.findByRole("link", { name: /이번 주 운동량/ })).toBeInTheDocument();
    expect(await screen.findByText("AI 코치 사용 가능 횟수를 확인하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이어 묻기로 이동" })).toBeDisabled();
    expect(screen.getByLabelText("이 대화에서 이어 묻기")).toBeDisabled();
    const deleteButton = screen.getAllByRole("button", { name: "이번 주 운동량 대화 삭제" })[0]!;
    expect(deleteButton).toBeEnabled();
    await userEvent.click(deleteButton);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(threadId));
  });

  it("disables the follow-up jump when today's quota is exhausted", async () => {
    mocks.status.mockResolvedValue({ quota: { limit: 3, remaining: 0, resetAt: "2026-07-20T00:00:00Z", timezone: "Asia/Seoul" } });
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${requestId}`);
    await waitFor(() => expect(screen.getByText("오늘 0회 남음")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "이어 묻기로 이동" })).toBeDisabled();
    expect(screen.getByLabelText("이 대화에서 이어 묻기")).toBeDisabled();
  });

  it("prepends cursor-loaded older turns above the latest chronological page and removes overlap", async () => {
    const olderId = "323e4567-e89b-42d3-a456-426614174002";
    const newestId = "423e4567-e89b-42d3-a456-426614174003";
    const turn = (id: string, question: string, createdAt: string) => ({ turnId: id, requestId: id, question, createdAt,
      response: { ...response, requestId: id } });
    const middle = turn(requestId, "중간 질문", "2026-07-19T02:00:00Z");
    mocks.detail.mockResolvedValueOnce({ thread: { ...summary, turnCount: 3,
      turns: [middle, turn(newestId, "최신 질문", "2026-07-19T03:00:00Z")] }, nextCursor: "older-cursor" })
      .mockResolvedValueOnce({ thread: { ...summary, turnCount: 3,
        turns: [turn(olderId, "가장 오래된 질문", "2026-07-19T01:00:00Z"), middle] }, nextCursor: null });
    setup(`/ko/coach/${threadId}`);
    await screen.findByText(`answer ${newestId}`);
    await userEvent.click(screen.getByRole("button", { name: "이전 대화 더 보기" }));
    const older = await screen.findByText(`answer ${olderId}`);
    const middleAnswer = screen.getByText(`answer ${requestId}`);
    const newest = screen.getByText(`answer ${newestId}`);
    expect(older.compareDocumentPosition(middleAnswer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(middleAnswer.compareDocumentPosition(newest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(`answer ${requestId}`)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "이전 대화 더 보기" })).not.toBeInTheDocument();
  });
});
