import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import fixture from "../../../services/stageActivityPowerDuration.fixture.json";
import Panel from "./StageActivityPowerDurationPanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), load: vi.fn(), calculate: vi.fn() }));
vi.mock("../../../hooks/useStageActivityPowerDuration", () => ({ useStageActivityPowerDuration: (...args: unknown[]) => mocks.hook(...args) }));
const activity = { id: "a", type: "Ride", userId: "owner", startTime: fixture[0]!.metadata.activityStartEpochMs } as Activity;
const state = () => ({ available: true, metadata: null, response: null, busy: false, error: false, reloadRequired: false, canCalculate: false, load: mocks.load, calculate: mocks.calculate });
beforeEach(() => { mocks.hook.mockReset().mockReturnValue(state()); mocks.load.mockClear(); mocks.calculate.mockClear(); });
it("stays folded and mount/open/draft changes do not issue calls; manual controls support keyboard submission", () => {
  const view = renderWithProviders(<Panel activity={activity} />);
  const summary = screen.getByText("원하는 시간의 최대 평균 파워"); expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(summary); expect(mocks.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "파워 데이터 확인", hidden: true })); expect(mocks.load).toHaveBeenCalledOnce();
  mocks.hook.mockReturnValue({ ...state(), metadata: fixture[0]!.metadata, canCalculate: true }); view.rerender(<Panel activity={activity} />);
  fireEvent.change(screen.getByRole("textbox", { name: "시간 (정수 초)", hidden: true }), { target: { value: "137" } });
  expect(mocks.hook.mock.lastCall?.[1]).toBe("137"); expect(mocks.calculate).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole("textbox", { hidden: true }).closest("form")!); expect(mocks.calculate).toHaveBeenCalledOnce();
});
it("renders scalar W including zero with source/bounds and concise qualified basis", () => {
  const response = structuredClone(fixture[1]!.result); response.result.maxAveragePowerW = 0;
  mocks.hook.mockReturnValue({ ...state(), metadata: fixture[1]!.metadata, response });
  renderWithProviders(<Panel activity={activity} />);
  expect(screen.getByText("0 W · 0:02")).toHaveClass("ds-text--data-medium");
  expect(screen.getByText("활동 경과 0:02–0:04")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "이 활동에서 확인", hidden: true })).toHaveAttribute("href", "/ko/activity/a");
  expect(screen.getByText(/센서의 원래 집계 구간/).closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText(/이전 저장 형식이며/)).toBeInTheDocument();
});
it("does not display zero for missing data and disables unsupported duration when maximum is zero", () => {
  mocks.hook.mockReturnValue({ ...state(), metadata: { ...fixture[0]!.metadata, maxIntegerDurationSeconds: 0 } });
  const view = renderWithProviders(<Panel activity={activity} />);
  expect(screen.getByRole("button", { name: "최대 평균 파워 계산", hidden: true })).toBeDisabled();
  expect(screen.getByText("요청한 시간의 연속 관측 구간이 없습니다.")).toBeInTheDocument(); expect(screen.queryByText(/1–0초/)).not.toBeInTheDocument();
  mocks.hook.mockReturnValue({ ...state(), metadata: { state: "unavailable" } }); view.rerender(<Panel activity={activity} />);
  expect(screen.getByText("이 활동에 준비된 파워 데이터가 없습니다.")).toBeInTheDocument(); expect(screen.queryByText(/0 W/)).not.toBeInTheDocument();
  mocks.hook.mockReturnValue({ ...state(), available: false }); view.rerender(<Panel activity={activity} />); expect(screen.queryByText("파워 데이터 확인")).not.toBeInTheDocument();
});
it("keeps the duration input at the existing touch-size token and source preconditions distinct from network errors", () => {
  mocks.hook.mockReturnValue({ ...state(), metadata: fixture[0]!.metadata, error: true, failureKind: "source_precondition" });
  const view = renderWithProviders(<Panel activity={activity} />);
  expect(screen.getByRole("textbox", { name: "시간 (정수 초)", hidden: true })).toHaveClass("min-h-[calc(var(--dim-button-height)+var(--space-1))]");
  expect(screen.getByRole("alert")).toHaveTextContent("저장된 파워 데이터가 없거나 확인 기준이 바뀌었습니다. 다른 활동을 선택하거나 새로 확인하세요.");
  mocks.hook.mockReturnValue({ ...state(), error: true, reloadRequired: true, failureKind: "generic" }); view.rerender(<Panel activity={activity} />);
  expect(screen.getByRole("alert")).toHaveTextContent("파워 데이터를 확인하지 못했습니다. 다시 확인해 주세요.");
  expect(screen.queryByText(/확인 기준이 바뀌었습니다/)).not.toBeInTheDocument();
});
it("shows the stored-origin qualifier beside positive power while keeping hardware uncertainty in the closed basis fold", async () => {
  const { default: stored } = await import("../../../services/stageActivityPowerStoredOrigin.fixture.json");
  mocks.hook.mockReturnValue({ ...state(), metadata: stored.metadataResponse, response: stored.response });
  renderWithProviders(<Panel activity={{ ...activity, id: stored.response.activityId, startTime: stored.metadataResponse.activityStartEpochMs }} />);
  const qualifier = screen.getByText("저장된 파워값으로 계산 · 측정 출처 미확인");
  expect(screen.getByText("250 W · 0:02").nextElementSibling).toBe(qualifier);
  expect(qualifier.closest("details")?.querySelector("summary")).toHaveTextContent("원하는 시간의 최대 평균 파워");
  expect(screen.getByText(/센서의 원래 집계 구간/).closest("details")).not.toHaveAttribute("open");
  expect(screen.queryByText(/stored_native_watts|sourceDigest|generation/)).not.toBeInTheDocument();
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.calculate).not.toHaveBeenCalled();
});
it("does not add an unverified measurement label to the qualified metadata channel", () => {
  mocks.hook.mockReturnValue({ ...state(), metadata: fixture[0]!.metadata, response: fixture[0]!.result });
  renderWithProviders(<Panel activity={activity} />);
  expect(screen.getByText("250 W · 0:02")).toBeInTheDocument();
  expect(screen.queryByText("저장된 파워값으로 계산 · 측정 출처 미확인")).not.toBeInTheDocument();
  expect(screen.getByText(/센서의 원래 집계 구간/)).toBeInTheDocument();
});
it("keeps the prior duration and value visible while a new attempt is loading or fails", () => {
  const savedResponse = fixture[0]!.result;
  mocks.hook.mockReturnValue({ ...state(), savedResponse, busy: true });
  const view = renderWithProviders(<Panel activity={activity} />);
  const value = screen.getByText(/ W · 0:02$/);
  expect(value).toBeInTheDocument();
  expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  mocks.hook.mockReturnValue({ ...state(), savedResponse, error: true, failureKind: "generic" });
  view.rerender(<Panel activity={activity} />);
  expect(value).toBeInTheDocument(); expect(screen.getByRole("alert")).toBeInTheDocument();
});
