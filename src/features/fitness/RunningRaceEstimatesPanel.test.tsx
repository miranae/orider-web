import { chooseDropdown, chooseDate } from "./fitnessControlTestUtils";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
const renderPanel = (element: ReactElement) => render(element, { wrapper: MemoryRouter });
import { racePreviewFixture } from "../../services/runningRaceEstimatesStage.fixture";
import RunningRaceEstimatesPanel from "./RunningRaceEstimatesPanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), preview: vi.fn(), discover: vi.fn(), history: vi.fn(), save: vi.fn(), cancel: vi.fn(), retry: vi.fn(), dismiss: vi.fn() }));
vi.mock("../../hooks/useRunningRaceEstimates", () => ({ useRunningRaceEstimates: mocks.hook }));
const state = () => ({ owner: true, available: true, response: null, sources: null, error: false, savingUnknown: false, storedAccountUnverified: false, busy: null, pendingSave: false, preview: mocks.preview, discover: mocks.discover, history: mocks.history, save: mocks.save, cancel: mocks.cancel, retrySave: mocks.retry, dismissSave: mocks.dismiss });
beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); mocks.hook.mockReturnValue(state()); });
it("starts folded with no queries, loads source/history only by explicit action, and keeps window changes manual", () => {
  renderPanel(<RunningRaceEstimatesPanel ownerUid="owner" />);
  expect(screen.getByText("대회 기록 참고 예측").closest("details")).not.toHaveAttribute("open"); expect(mocks.discover).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
  chooseDropdown(screen.getByLabelText("활동 조회 범위"), "24주"); expect(mocks.discover).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "활동 근거 불러오기", hidden: true })); expect(mocks.discover).toHaveBeenCalledWith(24);
  chooseDropdown(screen.getByLabelText("저장 기록 조회 범위"), "6개월"); expect(mocks.history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "저장 기록 불러오기", hidden: true })); expect(mocks.history).toHaveBeenCalledWith(6);
});
it("requires real raw time/date and maximal effort before preview without inventing trust fields", () => {
  renderPanel(<RunningRaceEstimatesPanel ownerUid="owner" />);
  fireEvent.click(screen.getByRole("button", { name: "참고 시간 계산", hidden: true })); expect(mocks.preview).not.toHaveBeenCalled();
  chooseDate(screen.getByLabelText("대회 날짜 (한국 시간)"), "2026-10-01");
  fireEvent.change(screen.getByLabelText("실제 기록 (시:분:초)"), { target: { value: "0:25:00.25" } });
  fireEvent.click(screen.getByLabelText("이 기록은 해당 거리에서 최대로 달린 노력입니다."));
  fireEvent.click(screen.getByRole("button", { name: "참고 시간 계산", hidden: true }));
  expect(mocks.preview.mock.lastCall![0]).toMatchObject({ activities: [], manualRaces: [{ target: "5k", elapsedSeconds: 1500.25, occurredAt: Date.parse("2026-10-01T00:00:00+09:00"), maximalEffortAttested: true }] });
  expect(mocks.preview.mock.lastCall![0].manualRaces[0]).not.toHaveProperty("clockVerified");
});
it("shows four reference/estimate/unknown rows, explicit save and honest one-point stale history", () => {
  mocks.hook.mockReturnValue({ ...state(), response: racePreviewFixture() });
  const view = renderPanel(<RunningRaceEstimatesPanel ownerUid="owner" />);
  expect(screen.getAllByRole("row", { hidden: true })).toHaveLength(5);
 
  expect(screen.getByText("실제 기록 참고")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 결과 저장", hidden: true })); expect(mocks.save).toHaveBeenCalledTimes(1);
  mocks.hook.mockReturnValue({ ...state(), response: racePreviewFixture("excluded_unavailable_preview") });
  view.rerender(<RunningRaceEstimatesPanel ownerUid="owner" />); expect(screen.getAllByText("계산 불가")).toHaveLength(4); expect(screen.getAllByText("—")).toHaveLength(4);
  mocks.hook.mockReturnValue({ ...state(), response: { mode: "history_page", windowMonths: 1, windowDays: 30, snapshots: [{ snapshot: { ...racePreviewFixture().snapshot, snapshotId: "a".repeat(64) }, sourceValidity: "changed_or_unavailable" }], nextCursor: null, capped: false } });
  view.rerender(<RunningRaceEstimatesPanel ownerUid="owner" />); expect(screen.getByText(/저장점 1개로는 성장 추세/)).toBeInTheDocument(); expect(screen.getByText(/현재 원본 근거가 바뀌었거나/)).toBeInTheDocument();
});
it("keeps nonowners and non-Stage capability hidden and stored-account outcomes explicit", () => {
  mocks.hook.mockReturnValue({ ...state(), owner: false }); const view = renderPanel(<RunningRaceEstimatesPanel ownerUid="owner" />); expect(screen.queryByText("대회 기록 참고 예측")).not.toBeInTheDocument();
  mocks.hook.mockReturnValue({ ...state(), available: false }); view.rerender(<RunningRaceEstimatesPanel ownerUid="owner" />); expect(screen.queryByText("대회 기록 참고 예측")).not.toBeInTheDocument();
  mocks.hook.mockReturnValue({ ...state(), error: true, savingUnknown: true, storedAccountUnverified: true, pendingSave: true }); view.rerender(<RunningRaceEstimatesPanel ownerUid="owner" />); expect(screen.getByText(/결과는 저장되었지만/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "참고 시간 계산", hidden: true })).toBeDisabled();
});
