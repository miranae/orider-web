import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { stageRunEffortFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import RunEffortStageManagementPanel from "./RunEffortStageManagementPanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), refresh: vi.fn(), change: vi.fn(), retry: vi.fn(), cancel: vi.fn(), comparison: vi.fn() }));
vi.mock("../../../hooks/useRunEffortStageManagement", () => ({ useRunEffortStageManagement: (...args: unknown[]) => mocks.hook(...args) }));
vi.mock("./RunPeriodComparisonPanel", () => ({ default: (props: unknown) => { mocks.comparison(props); return <div data-testid="filtered-five-fourteen-view" />; } }));
const state = () => ({ owner: true, available: true, state: "idle", response: null, outcome: null, failure: null, confirmedOutcome: false, canRetry: false, pendingRequest: false, cancelledUnknown: false, cancelPending: mocks.cancel, busy: false, refresh: mocks.refresh, change: mocks.change, retry: mocks.retry });
beforeEach(() => { mocks.hook.mockReset().mockReturnValue(state()); mocks.refresh.mockClear(); mocks.change.mockClear(); mocks.retry.mockClear(); mocks.cancel.mockClear(); mocks.comparison.mockClear(); });
it("keeps requests manual and scoped to the applied periods without new date/sport reads", () => {
  const applied = stageRunEffortFixture(); const view = renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={applied} />);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.getByText("이 분석 화면에만 반영됩니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "거리 기록 선택 불러오기", hidden: true })); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  const next = structuredClone(applied); next.periods[0]!.fromInclusive += 1000;
  view.rerender(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={next} />);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(mocks.hook.mock.lastCall?.[1][0].fromInclusive).toBe(next.periods[0]!.fromInclusive);
  mocks.hook.mockReturnValue({ ...state(), owner: false }); view.rerender(<RunEffortStageManagementPanel ownerUid="other" appliedResponse={next} />);
  expect(screen.queryByText("거리 기록 선택 불러오기")).not.toBeInTheDocument();
});
it("restores excluded bindings even when every selected time/source row was removed", () => {
  const response = stageRunEffortFixture(); response.periods = [response.periods[0]!];
  const running = response.periods[0]!.running!, binding = running.stageEffortOverlay!.preferenceBindings[0]!;
  binding.excludedTargets = ["5km"]; binding.preferenceRevision = 1;
  running.bestDistances.points = []; running.bestDistances.excludedEffortActivityCount = 1;
  const target = running.expandedDistanceAnalysis!.distances.find(value => value.distance === "5km")!;
  target.sources = []; target.bestTimeSeconds = null; target.medianTimeSeconds = null; target.observedEffortActivityCount = 0; target.noObservedEffortActivityCount = 1; target.excludedEffortActivityCount = 1;
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response });
  renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  expect(screen.getByText("기간 1 · 이 거리에서 제외한 관측 활동 1건")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /기록을 이 비교에 복원/, hidden: true }));
  expect(mocks.change).toHaveBeenCalledWith(binding, "5km", false);
  expect(mocks.comparison).toHaveBeenLastCalledWith({ response });
  const select = screen.getByRole("combobox", { name: "선택할 거리", hidden: true });
  expect(within(select).getAllByRole("option", { hidden: true })).toHaveLength(14);
  fireEvent.change(select, { target: { value: "400m" } }); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("blocks unverified current sources and keeps committed-pending distinct from a lost write", () => {
  const response = stageRunEffortFixture(); response.periods = [response.periods[0]!];
  const binding = response.periods[0]!.running!.stageEffortOverlay!.preferenceBindings[0]!; binding.mutationReady = false;
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response });
  const view = renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  expect(screen.getByRole("button", { name: /기록을 이 비교에서 제외/, hidden: true })).toBeDisabled();
  mocks.hook.mockReturnValue({ ...state(), state: "error", canRetry: true, pendingRequest: true, failure: { kind: "source_unverified", storedOutcome: "stored_pending_analysis_refresh" } });
  view.rerender(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  expect(screen.getByText(/선택은 저장되었지만 저장 직후 분석 근거를 확인할 수 없었습니다/)).toBeInTheDocument();
  expect(screen.getByText(/선택이 저장되었습니다/)).toBeInTheDocument();
  expect(screen.queryByTestId("filtered-five-fourteen-view")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "같은 요청으로 재시도", hidden: true })); expect(mocks.retry).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "이 요청 확인 종료", hidden: true })); expect(mocks.cancel).toHaveBeenCalledTimes(1);
});

it("selects only applied activity IDs without fetching and keeps stored-axis records separate with one action", async () => {
  const { default: wire } = await import("../../../services/stageRunDistanceSnapshot.fixture.json");
  const response = wire.cases.before as unknown as Parameters<typeof RunEffortStageManagementPanel>[0]["appliedResponse"];
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response });
  renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  const picker = screen.getByRole("combobox", { name: "저장 거리 데이터로 확인할 활동", hidden: true });
  expect(within(picker).getAllByRole("option", { hidden: true }).map(option => (option as HTMLOptionElement).value)).toEqual(["", "a"]);
  fireEvent.change(picker, { target: { value: "a" } }); expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.hook.mock.lastCall?.[2]).toBe("a");
  fireEvent.change(screen.getByRole("combobox", { name: "선택할 거리", hidden: true }), { target: { value: "400m" } });
  expect(screen.getByText("저장된 거리 데이터로 계산")).toBeInTheDocument();
  expect(screen.queryByText(/이전 저장 형식의 거리로 계산했습니다/)).not.toBeInTheDocument();
  expect(screen.getByText("6:07")).toHaveAttribute("title", expect.stringContaining("6:06.666667"));
  expect(screen.getByText(/원래 센서 시계와 활동 전체의 수집 완전성은 확인되지/)).toBeInTheDocument();
  const exclude = screen.getAllByRole("button", { name: /기록을 이 비교에서 제외/, hidden: true }); expect(exclude).toHaveLength(1);
  fireEvent.click(exclude[0]!); expect(mocks.change).toHaveBeenCalledWith(response.periods[0]!.running!.stageEffortOverlay!.preferenceBindings[0], "400m", true, true);
  expect(mocks.comparison).toHaveBeenLastCalledWith({ response });
});

it("renders one stored-source action when identical or overlapping periods repeat the same activity revision", async () => {
  const { default: wire } = await import("../../../services/stageRunDistanceSnapshot.fixture.json");
  const response = structuredClone(wire.cases.before) as unknown as Parameters<typeof RunEffortStageManagementPanel>[0]["appliedResponse"];
  response.periods.push(structuredClone(response.periods[0]!));
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response });
  const view = renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  fireEvent.change(screen.getByRole("combobox", { name: "저장 거리 데이터로 확인할 활동", hidden: true }), { target: { value: "a" } });
  fireEvent.change(screen.getByRole("combobox", { name: "선택할 거리", hidden: true }), { target: { value: "400m" } });
  expect(screen.getAllByText("6:07")).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /기록을 이 비교에서 제외/, hidden: true })).toHaveLength(1);
  const overlap = structuredClone(response); overlap.periods[1]!.fromInclusive += 1;
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response: overlap });
  view.rerender(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  expect(screen.getAllByText("6:07")).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /기록을 이 비교에서 제외/, hidden: true })).toHaveLength(1);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("qualifies earlier stored formats in the folded method note and keeps original clock/completeness unknown", async () => {
  const { default: wire } = await import("../../../services/stageRunDistanceSnapshotLegacy.fixture.json");
  const response = wire.cases.before as unknown as Parameters<typeof RunEffortStageManagementPanel>[0]["appliedResponse"];
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response });
  renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  fireEvent.change(screen.getByRole("combobox", { name: "저장 거리 데이터로 확인할 활동", hidden: true }), { target: { value: "a" } });
  fireEvent.change(screen.getByRole("combobox", { name: "선택할 거리", hidden: true }), { target: { value: "400m" } });
  const note = screen.getByText("이전 저장 형식의 거리로 계산했습니다. 처음 기록된 데이터와의 연결은 확인되지 않았습니다.");
  expect(note.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText(/원래 센서 시계와 활동 전체의 수집 완전성은 확인되지/)).toBeInTheDocument();
  expect(screen.getByText("6:07")).toBeInTheDocument();
  expect(screen.queryByText(/legacy_manifest|manifestObject|gcsIncarnationToken/)).not.toBeInTheDocument();
});

it("describes a stored start/end clock window inside the folded method note without claiming measured hardware elapsed", async () => {
  const { default: wire } = await import("../../../services/stageRunDistanceSnapshotLegacyWall.fixture.json");
  const response = wire.cases.before as unknown as Parameters<typeof RunEffortStageManagementPanel>[0]["appliedResponse"];
  mocks.hook.mockReturnValue({ ...state(), state: "ready", response });
  renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} />);
  fireEvent.change(screen.getByRole("combobox", { name: "저장 거리 데이터로 확인할 활동", hidden: true }), { target: { value: "a" } });
  const note = screen.getByText("저장된 활동 시작·종료 시각 범위의 거리 데이터로 계산했습니다.");
  expect(note.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText(/원래 센서 시계와 활동 전체의 수집 완전성은 확인되지/)).toBeInTheDocument();
  expect(screen.getByText(/처음 기록된 데이터와의 연결은 확인되지/)).toBeInTheDocument();
  expect(screen.queryByText(/stored_activity_wall_clock_window|timeBasis|ridingTime/)).not.toBeInTheDocument();
});

it("adds the current owned Run alias to applied options without selecting or fetching it", () => {
  const response = stageRunEffortFixture();
  const currentActivity = { id: "native-alias", userId: "test-uid", type: "Run", source: "orider", startTime: response.periods[0]!.fromInclusive } as NonNullable<Parameters<typeof RunEffortStageManagementPanel>[0]["currentActivity"]>;
  const view = renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} currentActivity={currentActivity} />);
  const picker = screen.getByRole("combobox", { name: "저장 거리 데이터로 확인할 활동", hidden: true });
  expect(within(picker).getByRole("option", { name: /현재 활동.*ORider/, hidden: true })).toHaveValue("native-alias");
  expect(picker).toHaveValue(""); expect(mocks.hook.mock.lastCall?.[2]).toBeNull();
  fireEvent.change(picker, { target: { value: "native-alias" } });
  expect(mocks.hook.mock.lastCall?.[2]).toBe("native-alias"); expect(mocks.refresh).not.toHaveBeenCalled();
  view.rerender(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} currentActivity={{ ...currentActivity, id: response.periods[0]!.activities[0]!.activityId }} />);
  const ids = within(picker).getAllByRole("option", { hidden: true }).map(option => (option as HTMLOptionElement).value);
  expect(ids).toHaveLength(new Set(ids).size);
});

it.each([{ userId: "other" }, { type: "Ride" }, { deletedAt: 1 }, { startTime: NaN }, { startTime: Infinity }, { startTime: 0 }, { id: "../native" }, { id: "a".repeat(201) }, { startTime: -1 }])("does not add an invalid current detail option: %j", patch => {
  const response = stageRunEffortFixture();
  const currentActivity = { id: "native-alias", userId: "test-uid", type: "Run", startTime: response.periods[0]!.fromInclusive, ...patch } as NonNullable<Parameters<typeof RunEffortStageManagementPanel>[0]["currentActivity"]>;
  renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} currentActivity={currentActivity} />);
  expect(screen.queryByRole("option", { name: /현재 활동/, hidden: true })).not.toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("does not add a current Run outside all applied periods or expose options to a non-owner", () => {
  const response = stageRunEffortFixture();
  const currentActivity = { id: "native-alias", userId: "test-uid", type: "Run", startTime: Math.max(...response.periods.map(p => p.toExclusive)) } as NonNullable<Parameters<typeof RunEffortStageManagementPanel>[0]["currentActivity"]>;
  const view = renderWithProviders(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} currentActivity={currentActivity} />);
  expect(screen.queryByRole("option", { name: /현재 활동/, hidden: true })).not.toBeInTheDocument();
  mocks.hook.mockReturnValue({ ...state(), owner: false });
  view.rerender(<RunEffortStageManagementPanel ownerUid="test-uid" appliedResponse={response} currentActivity={{ ...currentActivity, startTime: response.periods[0]!.fromInclusive }} />);
  expect(screen.queryByRole("combobox", { name: "저장 거리 데이터로 확인할 활동", hidden: true })).not.toBeInTheDocument();
});
