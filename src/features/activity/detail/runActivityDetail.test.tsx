import { screen, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { RunActivityIntro, type RunActivityDetail, useRunActivityDetail } from "./runActivityDetail";

const hooks = vi.hoisted(() => ({ baseline: vi.fn(() => ({ paceSecPerKm: 300, loading: false })), records: vi.fn(() => ({ run: undefined })) }));
vi.mock("../../../hooks/useRunBaselinePace", () => ({ useRunBaselinePace: hooks.baseline }));
vi.mock("../../../hooks/useRunRecords", () => ({ useRunRecords: hooks.records }));

const base = createMockActivity();
const run = createMockActivity({ type: "Run", source: "strava", summary: { ...base.summary, averageCadence: 95 } });

describe("running interpretation avoids absolute cadence coaching", () => {
  it("does not turn canonical Strava cadence into an absolute recommendation", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 89, cadenceUnit: "strides_per_minute" }, run.userId));
    expect(result.current.interpretationContext?.cadenceSpm).toBeNull();
  });
  it("does not apply a fixed cadence target to app step cadence", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 178, cadenceUnit: "spm" }, run.userId));
    expect(result.current.interpretationContext?.cadenceSpm).toBeNull();
  });
  it("does not replace canonical missing cadence or unknown units with stale summary", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: null, cadenceUnit: "strides_per_minute" }, run.userId));
    expect(result.current.interpretationContext?.cadenceSpm).toBeNull();
    const unknown = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 95, cadenceUnit: null }, run.userId));
    expect(unknown.result.current.interpretationContext?.cadenceSpm).toBeNull();
  });
  it("does not infer a cadence target from a provider summary", () => {
    const { result } = renderHook(() => useRunActivityDetail(run, null, null, run.userId));
    expect(result.current.interpretationContext?.cadenceSpm).toBeNull();
  });
});

it("disables personal queries and interpretation on somebody else's run", () => {
  const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: 89, cadenceUnit: "strides_per_minute", avgSpeedKph: 10 }, "outsider"));
  expect(hooks.baseline).toHaveBeenLastCalledWith(run.id, false, run.startTime);
  expect(hooks.records).toHaveBeenLastCalledWith(false);
  expect(result.current.interpretationContext).toBeUndefined();
  expect(result.current.baselinePaceSecPerKm).toBeNull();
});
it("uses canonical speed and never stale summary speed when metrics are present", () => {
  const { result } = renderHook(() => useRunActivityDetail(run, null, { avgCadence: null, cadenceUnit: null, avgSpeedKph: null }, run.userId));
  expect(result.current.averageSpeedKmh).toBe(0);
});

const introDetail: RunActivityDetail = { isRun: true, isOwner: true, averageSpeedKmh: 10, runRecords: undefined, baselinePaceSecPerKm: null, interpretationContext: undefined };
it("offers owner navigation to running plan and fitness without starting a workout", () => {
 renderWithProviders(<RunActivityIntro detail={introDetail} activityId="run" gapSecPerKm={340} />);
 const links = screen.getByTestId("run-next-actions").querySelectorAll("a");
 expect(links).toHaveLength(2);
 expect(links[0]).toHaveAttribute("href", "/ko/plan?sport=run");
 expect(links[1]).toHaveAttribute("href", "/ko/fitness?sport=run");
});
it("shows no owner actions on a public run", () => {
 renderWithProviders(<RunActivityIntro detail={{ ...introDetail, isOwner: false }} activityId="run" gapSecPerKm={340} />);
 expect(screen.queryByTestId("run-next-actions")).not.toBeInTheDocument();
});
it("does not render an intro without pace or GAP evidence", () => {
 const { container } = renderWithProviders(<RunActivityIntro detail={{ ...introDetail, averageSpeedKmh: 0 }} activityId="run" gapSecPerKm={null} />);
 expect(container).toBeEmptyDOMElement();
});

it("omits pending baseline from owner interpretation", () => {
 hooks.baseline.mockReturnValueOnce({ paceSecPerKm: 300, loading: true });
 const { result } = renderHook(() => useRunActivityDetail(run, null, null, run.userId));
 expect(result.current.baselinePaceSecPerKm).toBeNull();
 expect(result.current.interpretationContext?.baselinePaceSecPerKm).toBeNull();
});
