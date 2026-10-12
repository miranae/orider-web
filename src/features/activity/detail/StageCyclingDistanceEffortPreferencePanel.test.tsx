import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import fixture from "../../../services/stageCyclingDistanceEffortPreference.fixture.json";
import Panel from "./StageCyclingDistanceEffortPreferencePanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), inspect: vi.fn(), save: vi.fn() }));
vi.mock("../../../hooks/useStageCyclingDistanceEffortPreference", () => ({ useStageCyclingDistanceEffortPreference: (...args: unknown[]) => mocks.hook(...args) }));
const activity = { id: "fixture_bike_a", userId: "owner", type: "Ride" } as Activity;
const state = () => ({ available: true, read: null, busy: false, saved: false, failure: null, inspect: mocks.inspect, save: mocks.save });
beforeEach(() => { mocks.hook.mockReset().mockReturnValue(state()); mocks.inspect.mockClear(); mocks.save.mockClear(); });
it("starts folded without reads and uses manual inspection only", () => {
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  const title = screen.getByText("이 활동의 거리 기록 선택 관리"); expect(title.closest("details")).not.toHaveAttribute("open"); fireEvent.click(title);
  expect(mocks.inspect).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "관리 상태 확인 / 새로 확인", hidden: true })); expect(mocks.inspect).toHaveBeenCalledOnce();
  expect(screen.getByText(/현재 기간·연간 통계와 통산 기록에는 아직 반영되지 않습니다/)).toBeInTheDocument();
});
it("preserves all exact13 distance choices and one original observed value without automatic IO", () => {
  mocks.hook.mockReturnValue({ ...state(), read: fixture.original.response }); renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  const select = screen.getByRole("combobox", { hidden: true }); expect(screen.getAllByRole("option", { hidden: true }).map(v => (v as HTMLOptionElement).value)).toEqual([...BIKE_DISTANCE_TARGETS]);
  expect(screen.getByText("원본 관측 경과시간: 25:00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 거리의 선택 제외", hidden: true })); expect(mocks.save).toHaveBeenCalledWith("10km");
  fireEvent.change(select, { target: { value: "5miles" } }); expect(select).toHaveValue("5miles");
  expect(screen.getByRole("button", { name: "이 거리의 선택 제외", hidden: true })).toBeDisabled(); expect(screen.getByText("기록시간을 확인할 수 없어 제외할 수 없습니다.")).toBeInTheDocument();
  expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.save).toHaveBeenCalledOnce();
});
it("restores an orphaned saved exclusion without claiming that an observation was recovered", () => {
  mocks.hook.mockReturnValue({ ...state(), read: fixture.orphaned.response }); renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.getByText("원본 관측 경과시간: 확인 불가")).toBeInTheDocument(); expect(screen.getByText(/기존 제외 선택을 복원/)).toBeInTheDocument();
  const restore = screen.getByRole("button", { name: "이 거리의 선택 복원", hidden: true }); expect(restore).toBeEnabled(); fireEvent.click(restore); expect(mocks.save).toHaveBeenCalledWith("10km");
  expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
});
it("hides bindings on saved/error states and truthfully marks aggregation pending", () => {
  mocks.hook.mockReturnValue({ ...state(), saved: true }); const view = renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("선택을 저장했습니다"); expect(screen.queryByRole("combobox", { hidden: true })).not.toBeInTheDocument();
  mocks.hook.mockReturnValue({ ...state(), failure: "changed" }); view.rerender(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("새로 확인하세요"); expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("explains an older analysis format without claiming absence or offering nonexistent restoration", () => {
  const read = structuredClone(fixture.original.response);
  read.observationState = "legacy_unsupported"; read.provenance = null as never;
  read.efforts = read.efforts.map(row => ({ ...row, originalElapsedSeconds: null, effectiveElapsedSeconds: null, sourceStatus: "source_missing", excludeBinding: null }));
  mocks.hook.mockReturnValue({ ...state(), read });
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.getByText("이전 분석 형식이라 이 거리의 기록시간을 확인할 수 없습니다.")).toBeInTheDocument();
  expect(screen.getByText("기록시간을 확인할 수 없어 제외할 수 없습니다.")).toBeInTheDocument();
  expect(screen.queryByText(/관측 기록이 없습니다/)).not.toBeInTheDocument();
  expect(screen.queryByText(/기존 제외 선택을 복원/)).not.toBeInTheDocument();
  expect(screen.queryByText(/원본 관측 경과시간: 확인 불가|적용 경과시간: 확인 불가/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "이 거리의 선택 제외", hidden: true })).toBeDisabled();
  expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("keeps unavailable observation evidence separate from legacy format and only offers bound restoration", () => {
  const read = structuredClone(fixture.orphaned.response);
  read.observationState = "unavailable";
  read.efforts = read.efforts.map(row => ({ ...row, sourceStatus: "source_unavailable" }));
  mocks.hook.mockReturnValue({ ...state(), read });
  const view = renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.getByText("관측 근거를 확인할 수 없습니다.")).toBeInTheDocument();
  expect(screen.getByText("기존 제외 선택을 복원할 수 있습니다.")).toBeInTheDocument();
  expect(screen.queryByText(/이전 분석 형식/)).not.toBeInTheDocument();
  read.efforts[1]!.restoreBinding = null;
  mocks.hook.mockReturnValue({ ...state(), read }); view.rerender(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.queryByText("기존 제외 선택을 복원할 수 있습니다.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "이 거리의 선택 복원", hidden: true })).toBeDisabled();
  expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
