import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection } from "../../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../../services/trainingDecisionContract.test";
import { TrainingExecutionPanel } from "./TrainingExecutionPanel";

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
  beforeEach(() => {
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
});
