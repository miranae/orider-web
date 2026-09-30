import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fakeRun30Api, run30Program, run30Sessions } from "../../../__tests__/fixtures/run30";
import type { RunStartOutcome, ScheduledRunStarter } from "../../../embedded/runStartBridge";
import Run30ProgramView from "./Run30ProgramView";
import type { Run30StartMode } from "./run30Start";

const TODAY = "2026-09-30";

function renderView(options: {
  program?: ReturnType<typeof run30Program>;
  startMode?: Run30StartMode;
  api?: ReturnType<typeof fakeRun30Api>;
  onRefresh?: () => Promise<void>;
} = {}) {
  const api = options.api ?? fakeRun30Api();
  const onRefresh = options.onRefresh ?? vi.fn().mockResolvedValue(undefined);
  render(
    <Run30ProgramView
      api={api}
      program={options.program ?? run30Program()}
      onRefresh={onRefresh}
      startMode={options.startMode ?? { kind: "web" }}
      today={TODAY}
    />,
  );
  return { api, onRefresh };
}

function todayCard() {
  return screen.getByRole("region", { name: "오늘" });
}

describe("Run30ProgramView header", () => {
  it("shows the program title, stage progress, and a held decision in warning tone", () => {
    const sessions = run30Sessions(TODAY, { 1: "completed", 2: "completed" });
    renderView({
      program: run30Program({
        sessions,
        nextStage: 3,
        todayAction: "decide",
        nextWorkoutDecision: {
          status: "hold",
          reasonCode: "partial_or_abandoned",
          reason: "이전 기록을 먼저 확인하세요.",
          provenance: "owner_feedback_v1",
        },
      }),
    });
    expect(screen.getByRole("heading", { level: 2, name: "30분 달리기 입문" })).toBeInTheDocument();
    expect(screen.getByText(/2\/24 단계 완료/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "프로그램 진행률" })).toHaveAttribute("aria-valuenow", "8");
    const decision = screen.getByText("다음 운동 보류 · 이전 기록을 먼저 확인하세요.");
    expect(decision).toHaveClass("run30-warning");
    expect(screen.getByText(/근거: 내 러닝 피드백/)).toBeInTheDocument();
  });
});

describe("Run30ProgramView today block", () => {
  it("start: shows stage, workout, duration and the web-only hint outside the app", () => {
    renderView({ program: run30Program({ todayAction: "start" }), startMode: { kind: "web" } });
    const card = todayCard();
    expect(card).toHaveAttribute("data-today-action", "start");
    expect(within(card).getByText("1단계 · 1단계 걷기·달리기")).toBeInTheDocument();
    expect(within(card).getByText("총 32분")).toBeInTheDocument();
    expect(within(card).getByText("러닝 시작은 O-Rider 앱에서 할 수 있어요.")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "1단계 시작" })).not.toBeInTheDocument();
  });

  it("start: falls back to the app-home hint when the host lacks the capability", () => {
    renderView({ program: run30Program({ todayAction: "start" }), startMode: { kind: "host-unsupported" } });
    expect(within(todayCard()).getByText("앱 홈에서 오늘 러닝을 시작하세요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1단계 시작" })).not.toBeInTheDocument();
  });

  it("start: requests the host, shows pending, then the accepted notice", async () => {
    let resolve!: (outcome: RunStartOutcome) => void;
    const starter: ScheduledRunStarter = {
      start: vi.fn(() => new Promise<RunStartOutcome>((done) => { resolve = done; })),
    };
    renderView({ program: run30Program({ todayAction: "start" }), startMode: { kind: "host", starter } });
    fireEvent.click(screen.getByRole("button", { name: "1단계 시작" }));
    expect(starter.start).toHaveBeenCalledWith("ss_stage01");
    expect(await screen.findByText("시작 가능 여부 확인 중…")).toBeInTheDocument();
    await act(async () => resolve({ accepted: true }));
    expect(screen.getByText("러닝 화면으로 이동합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1단계 시작" })).toBeDisabled();
  });

  it.each([
    ["ride-active", "진행 중인 운동이 있어요. 먼저 마친 뒤 시작해 주세요."],
    ["not-today", "오늘 예정된 회차가 아니에요. 새로고침한 뒤 다시 확인해 주세요."],
    ["timeout", "앱 응답이 없어요. 잠시 후 다시 시도해 주세요."],
  ] as const)("start: shows the %s rejection inline", async (reason, copy) => {
    const starter: ScheduledRunStarter = { start: vi.fn().mockResolvedValue({ accepted: false, reason }) };
    renderView({ program: run30Program({ todayAction: "start" }), startMode: { kind: "host", starter } });
    fireEvent.click(screen.getByRole("button", { name: "1단계 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByRole("button", { name: "1단계 시작" })).toBeEnabled();
  });

  it("rest: shows the next date and stage without a start button", () => {
    const sessions = run30Sessions("2026-10-01");
    renderView({ program: run30Program({ sessions, todayAction: "rest" }), startMode: { kind: "host", starter: { start: vi.fn() } } });
    const card = todayCard();
    expect(within(card).getByText("오늘은 휴식 · 다음 10월 1일 (목) 1단계")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /단계 시작/ })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "이 단계 건너뛰기" })).toBeInTheDocument();
  });

  it("decide: explains a partial stage and offers retry, continue, but not skip or postpone", () => {
    const sessions = run30Sessions("2026-09-28", { 1: "partial" });
    renderView({
      program: run30Program({ sessions, todayAction: "decide", retryDates: ["2026-10-01", "2026-10-02"] }),
    });
    const card = todayCard();
    expect(within(card).getByText("1단계 · 9월 28일 (월) · 일부 수행")).toBeInTheDocument();
    expect(within(card).getByText(/여기까지 움직인 기록도 남아요/)).toBeInTheDocument();
    expect(within(card).getByRole("combobox", { name: "다시 도전할 날짜" })).toHaveDisplayValue("10월 1일 (목)");
    expect(within(card).getByRole("button", { name: "재도전 일정 확인" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "기록 유지하고 다음 단계 진행" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "이 단계 건너뛰기" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "미리보고 일정 옮기기" })).not.toBeInTheDocument();
  });

  it("decide: tells the user when no retry dates are available", () => {
    const sessions = run30Sessions("2026-09-28", { 1: "missed" });
    renderView({ program: run30Program({ sessions, todayAction: "decide", retryDates: [] }) });
    expect(within(todayCard()).getByText(/지금 선택할 수 있는 재도전 날짜가 없어요/)).toBeInTheDocument();
    expect(within(todayCard()).getByRole("button", { name: "이 단계 건너뛰기" })).toBeInTheDocument();
  });

  it("hold: shows the safety reason and never a start button", () => {
    renderView({
      program: run30Program({
        todayAction: "hold",
        nextWorkoutDecision: {
          status: "hold",
          reasonCode: "pain_or_illness",
          reason: "통증 기록이 있어 회복을 우선합니다.",
          provenance: "owner_feedback_v1",
        },
      }),
      startMode: { kind: "host", starter: { start: vi.fn() } },
    });
    const card = todayCard();
    expect(within(card).getByText("오늘은 시작하지 않아요")).toBeInTheDocument();
    expect(within(card).getByText("통증 기록이 있어 회복을 우선합니다.")).toHaveClass("run30-warning");
    expect(screen.queryByRole("button", { name: /단계 시작/ })).not.toBeInTheDocument();
  });
});

describe("Run30ProgramView schedule change", () => {
  it("previews on the server, shows message and safety, then confirms and refreshes", async () => {
    const api = fakeRun30Api();
    api.previewChange.mockResolvedValue({
      proposalId: "rp_1",
      goalId: "run30_goal_fixture",
      expectedRevision: 3,
      action: "postpone",
      stage: 1,
      fromLocalDate: "2026-09-30",
      toLocalDate: "2026-10-01",
      message: "이 단계를 선택한 휴식일로 옮깁니다.",
      safetyGuidance: "무리하지 마세요.",
    });
    api.confirmChange.mockResolvedValue({ goalId: "run30_goal_fixture", revision: 4, action: "postpone", stage: 1, toLocalDate: "2026-10-01" });
    const { onRefresh } = renderView({ api, program: run30Program({ todayAction: "start" }) });

    fireEvent.click(screen.getByRole("button", { name: "미리보고 일정 옮기기" }));
    expect(api.previewChange).toHaveBeenCalledWith({
      goalId: "run30_goal_fixture",
      expectedRevision: 3,
      action: "postpone",
      stage: 1,
      toLocalDate: "2026-10-01",
    });
    expect(api.confirmChange).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "1단계 변경 확인" });
    expect(within(dialog).getByText("1단계 · 9월 30일 (수) → 10월 1일 (목)")).toBeInTheDocument();
    expect(within(dialog).getByText("이 단계를 선택한 휴식일로 옮깁니다.")).toBeInTheDocument();
    expect(within(dialog).getByText("무리하지 마세요.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "선택한 날짜로 옮기기" }));
    await waitFor(() => expect(api.confirmChange).toHaveBeenCalledWith({
      goalId: "run30_goal_fixture",
      expectedRevision: 3,
      action: "postpone",
      stage: 1,
      toLocalDate: "2026-10-01",
      proposalId: "rp_1",
    }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends skip without a date and cancelling changes nothing", async () => {
    const api = fakeRun30Api();
    api.previewChange.mockResolvedValue({
      proposalId: "rp_skip", goalId: "run30_goal_fixture", expectedRevision: 3, action: "skip", stage: 1,
      fromLocalDate: "2026-09-30", toLocalDate: null, message: "이 단계는 건너뜁니다.", safetyGuidance: "무리하지 마세요.",
    });
    renderView({ api });
    fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
    expect(api.previewChange).toHaveBeenCalledWith({ goalId: "run30_goal_fixture", expectedRevision: 3, action: "skip", stage: 1 });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.confirmChange).not.toHaveBeenCalled();
  });

  it("surfaces a server rejection from preview inline", async () => {
    const api = fakeRun30Api();
    api.previewChange.mockRejectedValue(Object.assign(new Error("다음 단계 전의 비어 있는 미래 휴식일을 선택하세요."), {
      code: "functions/failed-precondition",
    }));
    renderView({ api });
    fireEvent.click(screen.getByRole("button", { name: "미리보고 일정 옮기기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다음 단계 전의 비어 있는 미래 휴식일을 선택하세요.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the server error when confirm fails", async () => {
    const api = fakeRun30Api();
    api.previewChange.mockResolvedValue({
      proposalId: "rp_skip", goalId: "run30_goal_fixture", expectedRevision: 3, action: "skip", stage: 1,
      fromLocalDate: "2026-09-30", toLocalDate: null, message: "이 단계는 건너뜁니다.", safetyGuidance: "무리하지 마세요.",
    });
    api.confirmChange.mockRejectedValue(Object.assign(new Error("계획이 변경되었습니다. 다시 확인하세요."), {
      code: "functions/failed-precondition",
    }));
    const { onRefresh } = renderView({ api });
    fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "이 회차 건너뛰기" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("계획이 변경되었습니다. 다시 확인하세요.");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("uses generic copy for internal errors", async () => {
    const api = fakeRun30Api();
    api.previewChange.mockRejectedValue(Object.assign(new Error("internal"), { code: "functions/internal" }));
    renderView({ api });
    fireEvent.click(screen.getByRole("button", { name: "이 단계 건너뛰기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  });
});

describe("Run30ProgramView stage list", () => {
  it("highlights the next stage, collapses past stages, and expands segments", () => {
    const sessions = run30Sessions("2026-09-23", { 1: "completed", 2: "completed", 3: "missed" });
    renderView({ program: run30Program({ sessions, nextStage: 4, todayAction: "rest" }) });
    expect(screen.queryByTestId("run30-stage-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("run30-stage-4")).toHaveClass("is-next");
    fireEvent.click(screen.getByRole("button", { name: "지난 단계 3개 보기" }));
    expect(within(screen.getByTestId("run30-stage-1")).getByText("완료")).toBeInTheDocument();
    expect(within(screen.getByTestId("run30-stage-3")).getByText("일정을 놓쳤어요")).toBeInTheDocument();

    const stage5 = screen.getByTestId("run30-stage-5");
    expect(within(stage5).queryByText("몸풀기 걷기")).not.toBeInTheDocument();
    fireEvent.click(within(stage5).getByRole("button", { name: "구간 2개 보기" }));
    expect(within(stage5).getByText("몸풀기 걷기")).toBeInTheDocument();
    expect(within(stage5).getByText("5분")).toBeInTheDocument();
  });

  it("shows the safety guidance footer", () => {
    renderView();
    expect(within(screen.getByRole("region", { name: "안전 안내" })).getByText(/통증이나 질병 증상이 있으면/)).toBeInTheDocument();
  });
});
