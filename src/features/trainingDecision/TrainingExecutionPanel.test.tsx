import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enTraining from "../../i18n/resources/en/training.json";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { TrainingExecutionPanel, keepPartialRetry } from "./TrainingExecutionPanel";

const mocks = vi.hoisted(() => ({ list: vi.fn(), reserve: vi.fn(), start: vi.fn(), link: vi.fn(), unlink: vi.fn(), outcome: vi.fn(),
  log: vi.fn(), activities: { activities: [] as Array<Record<string, unknown>>, loading: false } }));
vi.mock("../../services/trainingExecutionClient", () => ({ listSessionExecutions: mocks.list,
  reserveSessionExecution: mocks.reserve, startSessionExecution: mocks.start,
  linkSessionExecutionActivity: mocks.link, unlinkSessionExecutionActivity: mocks.unlink,
  setSessionExecutionOutcome: mocks.outcome }));
vi.mock("../../hooks/useActivities", () => ({ useActivities: () => mocks.activities }));
vi.mock("../../services/errorLogger", () => ({ logClientError: mocks.log }));

const baseExecution = { schemaVersion: 1 as const, executionId: "exec_dddddddddddddddddddddddd", status: "reserved" as const,
  scheduledSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", dayRef: { goalId: "goal_123", weekId: "week_01", dayIndex: 2, localDate: "2026-08-15" },
  scheduledSessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb", planRevision: "plan_123", projectionId: "today_cccccccccccccccccccccccc",
  prescriptionId: "rx_111111111111111111111111", prescriptionValidFrom: "2026-08-14T15:00:00.000Z",
  proposalId: null, proposalAfterRevision: null, receiptAuditId: null, activityId: null, activityRevision: null,
  discipline: "bike" as const, startedAt: null, linkedAt: null, createdAt: 1, updatedAt: 1,
  matchMethod: "explicit-start" as const,
  matchConfidence: "exact" as const, outcomeStatus: "pending" as const, outcomeAt: null, postponedToLocalDate: null };

describe("TrainingExecutionPanel", () => {
  beforeEach(async () => {
    i18n.addResourceBundle("en", "training", enTraining, true, true);
    await i18n.changeLanguage("ko");
    vi.clearAllMocks(); resetRuntimeConfigForTests({ trainingExecutionEnabled: true }); mocks.list.mockResolvedValue([]);
    mocks.activities = { activities: [], loading: false };
    mocks.reserve.mockResolvedValue(baseExecution); mocks.start.mockResolvedValue({ ...baseExecution, status: "started", startedAt: 2 });
  });

  it("pins reserve and start to the canonical projection/session revisions", async () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const changed = vi.fn();
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={changed} />);
    expect((await screen.findByText("지금 이 세션을 시작할 수 있습니다.")).closest("[data-execution-state]"))
      .toHaveAttribute("data-execution-state", "executable");
    expect(screen.getByRole("status", { name: "" })).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "운동 시작" }));
    expect(mocks.list).toHaveBeenCalledWith("bike");
    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ projectionId: "today_cccccccccccccccccccccccc",
      scheduledSessionId: "ss_aaaaaaaaaaaaaaaaaaaaaaaa", scheduledSessionRevision: "ssr_bbbbbbbbbbbbbbbbbbbbbbbb",
      dayRef: { goalId: "goal_123", weekId: "week_01", dayIndex: 2, localDate: "2026-08-15" }, planRevision: "plan_123" }));
    expect(mocks.reserve.mock.calls[0]?.[0]).not.toHaveProperty("goalId");
    expect(mocks.reserve.mock.calls[0]?.[0]).not.toHaveProperty("proposalAfterRevision");
    expect(changed).toHaveBeenCalled();
  });

  it("fails closed when the runtime execution gate is off", () => {
    resetRuntimeConfigForTests({ trainingExecutionEnabled: false });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const { container } = render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("fails closed for a health stop before reading or mutating executions", () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      healthGate: { state: "stop", reasonCodes: ["self_reported_pain_or_illness"], sourceFreshness: "current" },
    }));
    const { container } = render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([
    { status: "completed" as const, completed: true },
    { status: "skipped" as const, completed: false },
    { status: "postponed" as const, completed: false },
  ])("does not expose a $status session as executable", ({ status, completed }) => {
    const base = trainingDecisionEnvelope();
    const session = { ...base.data.effectiveSessions[0]!, status, current: {
      ...base.data.effectiveSessions[0]!.current, completed,
    } };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ effectiveSessions: [session] }));
    const { container } = render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each(["click", "Enter"] as const)("recovers a list error through %s retry activation", async (activation) => {
    let resolveRetry!: (items: Array<typeof baseExecution>) => void;
    mocks.list.mockRejectedValueOnce(new Error("list failed"));
    mocks.list.mockReturnValueOnce(new Promise((resolve) => { resolveRetry = resolve; }));
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "운동 시작" })).not.toBeInTheDocument();
    expect(await screen.findByText(/기존 실행 상태를 확인하지 못했습니다/)).toBeInTheDocument();
    expect(mocks.log).toHaveBeenCalledWith("TrainingExecutionPanel.list", expect.any(Error), { discipline: "bike" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    const retry = screen.getByRole("button", { name: "새로 확인" });
    const user = userEvent.setup();
    if (activation === "click") await user.click(retry);
    else { retry.focus(); await user.keyboard("{Enter}"); }
    expect(await screen.findByText("기존 실행 상태를 확인하는 중…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로 확인" })).not.toBeInTheDocument();
    resolveRetry([]);
    expect(await screen.findByText("지금 이 세션을 시작할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "운동 시작" })).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("resumes a recovered reservation with Start without reserving again", async () => {
    mocks.list.mockResolvedValue([baseExecution]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect((await screen.findByText(/세션이 예약되었습니다/)).closest("[data-execution-state]"))
      .toHaveAttribute("data-execution-state", "reserved");
    expect(screen.queryByRole("button", { name: "건너뜀" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "연기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "운동 시작" }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("exec_dddddddddddddddddddddddd", expect.any(String)));
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("keeps a recovered execution usable when only new reservations are disabled", async () => {
    mocks.list.mockResolvedValue([baseExecution]);
    const envelope = trainingDecisionEnvelope();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ capabilities: {
      ...envelope.data.capabilities, execution: { ...envelope.data.capabilities.execution, reserve: "disabled" },
    } }));
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByText(/세션이 예약되었습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "운동 시작" })).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith("bike");
  });

  it("does not recover an execution from a stale source tuple", async () => {
    mocks.list.mockResolvedValue([{ ...baseExecution, projectionId: "today_stale_projection_123" }]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByText("지금 이 세션을 시작할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/세션이 예약되었습니다/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "운동 시작" }));
    await waitFor(() => expect(mocks.reserve).toHaveBeenCalledTimes(1));
  });

  it("re-queries and resets local execution state when the projection changes", async () => {
    mocks.list.mockResolvedValueOnce([baseExecution]).mockResolvedValueOnce([]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const { rerender } = render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByText(/세션이 예약되었습니다/)).toBeInTheDocument();
    const nextDecision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      projectionId: "today_eeeeeeeeeeeeeeeeeeeeeeee",
    }));
    rerender(<TrainingExecutionPanel decision={nextDecision} sessions={nextDecision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByText("지금 이 세션을 시작할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/세션이 예약되었습니다/)).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("links a selected owned activity with its current hidden revision", async () => {
    mocks.list.mockResolvedValue([{ ...baseExecution, status: "started", startedAt: 2 }]);
    mocks.activities = { activities: [{ id: "activity_123", userId: "owner", type: "Ride", startTime: 1_787_000_000_000,
      activityRevision: "ar_current" }], loading: false };
    mocks.link.mockResolvedValue({ ...baseExecution, status: "linked", activityId: "activity_123", activityRevision: "ar_current",
      startedAt: 2, linkedAt: 3, matchMethod: "manual", matchConfidence: "manual", outcomeStatus: "completed" });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    const toggle = await screen.findByRole("button", { name: "활동 직접 연결" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "연결할 내 최근 활동" }), { target: { value: "activity_123" } });
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith("exec_dddddddddddddddddddddddd", "activity_123", "ar_current", expect.any(String)));
    expect(screen.queryByPlaceholderText(/revision/i)).not.toBeInTheDocument();
  });

  it("reuses the same link idempotency key after a lost response", async () => {
    mocks.list.mockResolvedValue([{ ...baseExecution, status: "started", startedAt: 2 }]);
    mocks.activities = { activities: [{ id: "activity_123", userId: "owner", type: "Ride", startTime: 1_787_000_000_000,
      activityRevision: "ar_current" }], loading: false };
    mocks.link.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ ...baseExecution, status: "linked",
      activityId: "activity_123", activityRevision: "ar_current", startedAt: 2, linkedAt: 3,
      matchMethod: "manual", matchConfidence: "manual" });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "활동 직접 연결" }));
    fireEvent.change(screen.getByRole("combobox", { name: "연결할 내 최근 활동" }), { target: { value: "activity_123" } });
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(mocks.link).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(mocks.link).toHaveBeenCalledTimes(2));
    expect(mocks.link.mock.calls[0]?.[3]).toBe(mocks.link.mock.calls[1]?.[3]);
  });

  it("uses a new link idempotency key after a completed link and unlink cycle", async () => {
    const started = { ...baseExecution, status: "started" as const, startedAt: 2 };
    const linked = { ...started, status: "linked" as const, activityId: "activity_123", activityRevision: "ar_current",
      linkedAt: 3, matchMethod: "manual" as const, matchConfidence: "manual" as const };
    mocks.list.mockResolvedValue([started]);
    mocks.activities = { activities: [{ id: "activity_123", userId: "owner", type: "Ride", startTime: 1_787_000_000_000,
      activityRevision: "ar_current" }], loading: false };
    mocks.link.mockResolvedValue(linked);
    mocks.unlink.mockResolvedValue(started);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "활동 직접 연결" }));
    fireEvent.change(screen.getByRole("combobox", { name: "연결할 내 최근 활동" }), { target: { value: "activity_123" } });
    fireEvent.click(screen.getByRole("button", { name: "연결" }));
    await waitFor(() => expect(mocks.link).toHaveBeenCalledTimes(1));
    const unlink = await screen.findByRole("button", { name: "활동 연결 해제" });
    expect(screen.queryByRole("combobox", { name: "연결할 내 최근 활동" })).not.toBeInTheDocument();
    fireEvent.click(unlink);
    await waitFor(() => expect(mocks.unlink).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "활동 직접 연결" }));
    const relink = await screen.findByRole("button", { name: "연결" });
    await waitFor(() => expect(relink).toBeEnabled());
    fireEvent.click(relink);
    await waitFor(() => expect(mocks.link).toHaveBeenCalledTimes(2));
    expect(mocks.link.mock.calls[0]?.[3]).not.toBe(mocks.link.mock.calls[1]?.[3]);
  });

  it.each([
    { language: "ko", discipline: "사이클" },
    { language: "en", discipline: "Cycling" },
  ])("formats picker activity metadata in $language without exposing the raw type", async ({ language, discipline }) => {
    await i18n.changeLanguage(language);
    mocks.list.mockResolvedValue([{ ...baseExecution, status: "started", startedAt: 2 }]);
    const startTime = 1_787_000_000_000;
    mocks.activities = { activities: [{ id: "activity_123", userId: "owner", type: "Ride", startTime,
      activityRevision: "ar_current" }], loading: false };
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: language === "ko" ? "활동 직접 연결" : "Link activity manually" }));
    const expectedDate = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(startTime));
    const picker = screen.getByRole("combobox", { name: language === "ko" ? "연결할 내 최근 활동" : "Your recent activity to link" });
    expect(picker).toHaveTextContent(`${expectedDate} · ${discipline}`);
    expect(picker).not.toHaveTextContent("Ride");
  });

  it("renders a linked pending state with completion actions", async () => {
    mocks.list.mockResolvedValue([{ ...baseExecution, status: "linked", activityId: "activity_123", activityRevision: "ar_current",
      startedAt: 2, linkedAt: 3, matchMethod: "manual", matchConfidence: "manual", outcomeStatus: "pending" }]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "부분 완료" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "건너뜀" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "연기" })).not.toBeInTheDocument();
  });

  it("renders a completed state without mutable outcome actions", async () => {
    mocks.list.mockResolvedValue([{ ...baseExecution, status: "linked", activityId: "activity_123", activityRevision: "ar_current",
      startedAt: 2, linkedAt: 3, matchMethod: "manual", matchConfidence: "manual", outcomeStatus: "completed" }]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect((await screen.findByText("이 세션의 실행 결과가 기록되었습니다.")).closest("[data-execution-state]"))
      .toHaveAttribute("data-execution-state", "completed");
    expect(screen.queryByRole("button", { name: "완료" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "부분 완료" })).not.toBeInTheDocument();
  });

  it("lists once per discipline and distributes recovered executions across multiple sessions", async () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    const secondSession = { ...decision.effectiveSessions[0]!, sessionId: "ss_eeeeeeeeeeeeeeeeeeeeeeee",
      scheduledSessionId: "ss_eeeeeeeeeeeeeeeeeeeeeeee", scheduledSessionRevision: "ssr_ffffffffffffffffffffffff",
      sessionRevision: "ssr_ffffffffffffffffffffffff", planItemId: "item_456" };
    mocks.list.mockResolvedValue([baseExecution]);
    render(<TrainingExecutionPanel decision={decision} sessions={[decision.effectiveSessions[0]!, secondSession]} onChanged={vi.fn()} />);
    expect(await screen.findAllByRole("button", { name: "운동 시작" })).toHaveLength(2);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledWith("bike");
    expect(screen.getByText(/시작 대기/)).toBeInTheDocument();
  });

  const probableExecution = { ...baseExecution, status: "linked" as const, activityId: "activity_123",
    activityRevision: "ar_current", startedAt: 2, linkedAt: 3, matchMethod: "legacy-time-window" as const,
    matchConfidence: "probable" as const, outcomeStatus: "pending" as const };

  it("offers an escape from a probable auto match instead of a dead end", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect((await screen.findByText(/추정으로 연결된 활동이 있습니다/)).closest("[data-execution-state]"))
      .toHaveAttribute("data-execution-state", "probable");
    expect(screen.getByRole("button", { name: "맞아요 · 완료 처리" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "맞지만 부분 완료" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "아니에요 · 연결 해제" })).toBeInTheDocument();
  });

  it("promotes a confirmed probable match to a manual link on the same activity", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    mocks.link.mockResolvedValue({ ...probableExecution, matchMethod: "manual", matchConfidence: "manual",
      outcomeStatus: "completed" });
    const changed = vi.fn();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: "맞아요 · 완료 처리" }));
    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith("exec_dddddddddddddddddddddddd", "activity_123",
      "ar_current", expect.any(String)));
    expect(mocks.outcome).not.toHaveBeenCalled();
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(await screen.findByText("이 세션의 실행 결과가 기록되었습니다.")).toBeInTheDocument();
  });

  it("records a partial outcome after confirming the probable match", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    mocks.link.mockResolvedValue({ ...probableExecution, matchMethod: "manual", matchConfidence: "manual",
      outcomeStatus: "completed" });
    mocks.outcome.mockResolvedValue({ ...probableExecution, matchMethod: "manual", matchConfidence: "manual",
      outcomeStatus: "partial" });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "맞지만 부분 완료" }));
    await waitFor(() => expect(mocks.outcome).toHaveBeenCalledWith("exec_dddddddddddddddddddddddd", "partial", expect.any(String)));
    expect(mocks.link).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/부분 완료/)).toBeInTheDocument();
  });

  it("reopens execution after rejecting a probable match, since unlink invalidates it server-side", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    // 서버는 해제된 실행을 invalidated 로 닫는다 — started 로 돌아오지 않는다.
    mocks.unlink.mockResolvedValue({ ...probableExecution, status: "invalidated", activityId: null,
      activityRevision: null, matchMethod: "manual", matchConfidence: "manual" });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "아니에요 · 연결 해제" }));
    await waitFor(() => expect(mocks.unlink).toHaveBeenCalledWith("exec_dddddddddddddddddddddddd", expect.any(String)));
    // 교착으로 되돌아가지 않는다: 새 실행을 시작해 건너뛰기·연기까지 갈 수 있어야 한다.
    expect(await screen.findByRole("button", { name: "운동 시작" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "맞아요 · 완료 처리" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "운동 시작" }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalled());
    expect(mocks.reserve.mock.calls[0]?.[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(await screen.findByRole("button", { name: "건너뜀" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연기" })).toBeInTheDocument();
  });

  it("ignores an invalidated execution recovered from the list", async () => {
    mocks.list.mockResolvedValue([{ ...probableExecution, status: "invalidated", activityId: null, activityRevision: null }]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "운동 시작" })).toBeInTheDocument();
  });

  it("confirms a probable match with the activity's current revision, not the stale linked one", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    mocks.activities = { activities: [{ id: "activity_123", userId: "owner", type: "Ride", startTime: 1_787_000_000_000,
      activityRevision: "ar_reprocessed" }], loading: false };
    mocks.link.mockResolvedValue({ ...probableExecution, activityRevision: "ar_reprocessed",
      matchMethod: "manual", matchConfidence: "manual", outcomeStatus: "completed" });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "맞아요 · 완료 처리" }));
    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith("exec_dddddddddddddddddddddddd", "activity_123",
      "ar_reprocessed", expect.any(String)));
  });

  it("hides the partial confirmation when the outcome capability is unavailable", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({ capabilities: {
      ...trainingDecisionEnvelope().data.capabilities,
      execution: { ...trainingDecisionEnvelope().data.capabilities.execution, outcome: "disabled" },
    } }));
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "맞아요 · 완료 처리" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "맞지만 부분 완료" })).not.toBeInTheDocument();
  });

  it("keeps the confirmed link applied when the follow-up partial outcome fails", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    mocks.link.mockResolvedValue({ ...probableExecution, matchMethod: "manual", matchConfidence: "manual",
      outcomeStatus: "completed" });
    mocks.outcome.mockRejectedValue(new Error("network blip"));
    const changed = vi.fn();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: "맞지만 부분 완료" }));
    await waitFor(() => expect(mocks.outcome).toHaveBeenCalled());
    // 서버에 이미 기록된 링크를 화면이 부정하면 안 된다 — 추정 상태로 되돌아가지 않는다.
    expect(screen.queryByRole("button", { name: "맞아요 · 완료 처리" })).not.toBeInTheDocument();
    expect(screen.getByText(/활동 연결됨 · 완료/)).toBeInTheDocument();
    expect(screen.getByText("실행 상태를 저장하지 못했습니다.")).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
    // 사용자의 "부분 완료" 의도가 completed 로 굳지 않도록 재시도 경로가 남아야 한다.
    const retry = screen.getByRole("button", { name: "부분 완료로 다시 기록" });
    mocks.outcome.mockResolvedValueOnce({ ...probableExecution, matchMethod: "manual", matchConfidence: "manual",
      outcomeStatus: "partial" });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText(/활동 연결됨 · 부분 완료/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "부분 완료로 다시 기록" })).not.toBeInTheDocument();
    // 끊긴 호출과 재시도가 같은 멱등키를 쓰는지 — 서버에 중복 기록이 생기면 안 된다.
    expect(mocks.outcome.mock.calls[0]?.[2]).toBe(mocks.outcome.mock.calls[1]?.[2]);
  });

  it.each([
    { label: "같은 실행이 갱신돼 돌아오면 유지", next: { executionId: "exec_dddddddddddddddddddddddd" }, kept: true },
    { label: "다른 실행으로 바뀌면 폐기", next: { executionId: "exec_eeeeeeeeeeeeeeeeeeeeeeee" }, kept: false },
    { label: "실행이 사라지면 폐기", next: null, kept: false },
  ])("keepPartialRetry — $label", ({ next, kept }) => {
    const retry = { executionId: "exec_dddddddddddddddddddddddd", operation: "confirm:x" };
    expect(keepPartialRetry(retry, next)).toBe(kept ? retry : null);
  });

  it("drops the partial retry once the confirmed link is unlinked", async () => {
    mocks.list.mockResolvedValue([probableExecution]);
    const confirmed = { ...probableExecution, matchMethod: "manual" as const, matchConfidence: "manual" as const,
      outcomeStatus: "completed" as const };
    mocks.link.mockResolvedValue(confirmed);
    mocks.outcome.mockRejectedValue(new Error("network blip"));
    mocks.unlink.mockResolvedValue({ ...confirmed, status: "invalidated", activityId: null, activityRevision: null });
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope());
    render(<TrainingExecutionPanel decision={decision} sessions={decision.effectiveSessions} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "맞지만 부분 완료" }));
    expect(await screen.findByRole("button", { name: "부분 완료로 다시 기록" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "활동 연결 해제" }));
    // 해제된(무효화된) 실행에 대고 재시도하면 엉뚱한 실행을 건드린다.
    expect(await screen.findByRole("button", { name: "운동 시작" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "부분 완료로 다시 기록" })).not.toBeInTheDocument();
  });
});
