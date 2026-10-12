import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import fixture from "../../../services/stageCyclingDistanceEffortPreference.fixture.json";
import { snapshotFixture } from "../../../services/stageCyclingSnapshotEffortPreference.fixture";
import Panel from "./StageCyclingDistanceEffortPreferencePanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), inspect: vi.fn(), save: vi.fn(), snapshot: vi.fn(), snapshotInspect: vi.fn(), snapshotSave: vi.fn() }));
vi.mock("../../../hooks/useStageCyclingDistanceEffortPreference", () => ({ useStageCyclingDistanceEffortPreference: (...args: unknown[]) => mocks.hook(...args) }));
vi.mock("../../../hooks/useStageCyclingSnapshotEffortPreference", () => ({ useStageCyclingSnapshotEffortPreference: (...args: unknown[]) => mocks.snapshot(...args) }));
const activity = { id: "fixture_bike_a", userId: "owner", type: "Ride" } as Activity;
const state = () => ({ available: true, read: null, busy: false, saved: false, failure: null, inspect: mocks.inspect, save: mocks.save });
beforeEach(() => { mocks.hook.mockReset().mockReturnValue(state()); mocks.inspect.mockClear(); mocks.save.mockClear(); mocks.snapshot.mockReset().mockReturnValue({ ...state(), inspect: mocks.snapshotInspect, save: mocks.snapshotSave }); mocks.snapshotInspect.mockReset(); mocks.snapshotSave.mockReset(); });
it("starts folded without reads and uses manual inspection only", () => {
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  const title = screen.getByText("이 활동의 거리 기록 선택 관리"); expect(title.closest("details")).not.toHaveAttribute("open"); fireEvent.click(title);
  expect(mocks.inspect).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "관리 상태 확인 / 새로 확인", hidden: true })); expect(mocks.inspect).toHaveBeenCalledOnce();
  const scope = screen.getByText(/이 활동의 거리 기록 선택을 저장합니다/);
  expect(scope).toHaveTextContent("원본 활동과 누적 거리·고도는 바뀌지 않습니다.");
  expect(scope).toHaveTextContent("‘확인한 활동의 거리 순위’가 제공되는 경우 직접 다시 확인하면 선택이 반영됩니다.");
  expect(scope).toHaveTextContent("기존 기간·연간 통계와 전역 개인기록은 바뀌지 않습니다.");
});
it("preserves all exact13 distance choices and one original observed value without automatic IO", () => {
  mocks.hook.mockReturnValue({ ...state(), read: fixture.original.response }); renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  const select = screen.getByLabelText("확인할 거리", { selector: "select" }); expect(Array.from(select.querySelectorAll("option")).map(v => (v as HTMLOptionElement).value)).toEqual([...BIKE_DISTANCE_TARGETS]);
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
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("선택을 저장했습니다"); expect(screen.queryByLabelText("확인할 거리", { selector: "select" })).not.toBeInTheDocument();
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

it("switches basis and distance with zero IO and inspects only the chosen derived reader", () => {
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  const selector = screen.getByLabelText("기록 기준");
  expect(mocks.snapshot).not.toHaveBeenCalled();
  fireEvent.change(selector, { target: { value: "snapshot" } });
  expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.snapshotInspect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "관리 상태 확인 / 새로 확인", hidden: true }));
  expect(mocks.snapshotInspect).toHaveBeenCalledOnce(); expect(mocks.inspect).not.toHaveBeenCalled();
  fireEvent.change(selector, { target: { value: "metrics" } });
  expect(mocks.snapshotInspect).toHaveBeenCalledOnce(); expect(mocks.snapshotSave).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});

it("shows derived elapsed without mislabeling legacy metrics, and keeps target changes manual", () => {
  mocks.snapshot.mockReturnValue({ ...state(), inspect: mocks.snapshotInspect, save: mocks.snapshotSave, read: snapshotFixture() });
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  fireEvent.change(screen.getByLabelText("기록 기준"), { target: { value: "snapshot" } });
  expect(screen.getByText("계산된 경과시간: 25:00")).toBeInTheDocument();
  expect(screen.getByText("저장된 경과시간 기준")).toBeInTheDocument();
  expect(screen.getByText("저장 지표는 이전 분석 형식입니다.")).toBeInTheDocument();
  expect(screen.queryByText("원본 관측 경과시간: 25:00")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 거리의 선택 제외", hidden: true })); expect(mocks.snapshotSave).toHaveBeenCalledExactlyOnceWith("10km");
  fireEvent.change(screen.getByLabelText("확인할 거리"), { target: { value: "50miles" } });
  expect(screen.getByRole("button", { name: "이 거리의 선택 제외", hidden: true })).toBeDisabled();
  expect(mocks.snapshotInspect).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
});
it("keeps basis selector but removes write controls after saved/failed derived requests", () => {
  mocks.snapshot.mockReturnValue({ ...state(), saved: true });
  const view = renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  fireEvent.change(screen.getByLabelText("기록 기준"), { target: { value: "snapshot" } });
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("선택을 저장했습니다");
  expect(screen.queryByLabelText("확인할 거리")).not.toBeInTheDocument();
  mocks.snapshot.mockReturnValue({ ...state(), failure: "changed" }); view.rerender(<Panel activity={activity} scopeKey="metrics" />);
  expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("새로 확인하세요");
  expect(mocks.snapshotInspect).not.toHaveBeenCalled(); expect(mocks.snapshotSave).not.toHaveBeenCalled();
});
it("keeps the calculated original unchanged when exclusion is saved and restores only server authority", () => {
  const read = snapshotFixture(), row = read.efforts[1]!;
  read.excludedTargets = ["10km"]; row.excluded = true; row.effectiveElapsedSeconds = null;
  row.restoreBinding = { ...row.excludeBinding!, excluded: false, expectedSourceAuthorityRevision: null }; row.excludeBinding = null;
  mocks.snapshot.mockReturnValue({ ...state(), read, inspect: mocks.snapshotInspect, save: mocks.snapshotSave });
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  fireEvent.change(screen.getByLabelText("기록 기준"), { target: { value: "snapshot" } });
  expect(screen.getByText("계산된 경과시간: 25:00")).toBeInTheDocument();
  expect(screen.getByText(/저장된 선택: 제외/)).toBeInTheDocument();
  const restore = screen.getByRole("button", { name: "이 거리의 선택 복원", hidden: true });
  expect(restore).toBeEnabled(); fireEvent.click(restore); expect(mocks.snapshotSave).toHaveBeenCalledExactlyOnceWith("10km");
  expect(mocks.snapshotInspect).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
});
it("presents a missing snapshot without zero times or offering an exclusion", () => {
  const read = snapshotFixture(); read.snapshotState = "missing"; read.provenance = null;
  read.snapshotBinding = { exists: false, createTime: "missing", updateTime: "missing", contentHash: "a".repeat(64), derivedRevision: null };
  read.efforts = read.efforts.map(row => ({ ...row, originalElapsedSeconds: null, exactElapsedSeconds: null, effectiveElapsedSeconds: null, excludeBinding: null }));
  mocks.snapshot.mockReturnValue({ ...state(), read });
  renderWithProviders(<Panel activity={activity} scopeKey="metrics" />);
  fireEvent.change(screen.getByLabelText("기록 기준"), { target: { value: "snapshot" } });
  expect(screen.getByText("계산된 거리 기록이 아직 준비되지 않았습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "이 거리의 선택 제외", hidden: true })).toBeDisabled();
  expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
});
