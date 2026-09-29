import { screen, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { RunActivityIntro, type RunActivityDetail, useRunActivityDetail } from "./runActivityDetail";

const hooks = vi.hoisted(() => ({ baseline: vi.fn(() => ({ paceSecPerKm: 300, loading: false, comparisonType: "run" as const, sampleCount: 3, windowComplete: true })), records: vi.fn(() => ({ run: undefined })), next: vi.fn(() => ({ status: "none" as const, session: null })) }));
vi.mock("../../../hooks/useRunBaselinePace", () => ({ useRunBaselinePace: hooks.baseline }));
vi.mock("../../../hooks/useRunNextTraining", async importOriginal => ({ ...await importOriginal<typeof import("../../../hooks/useRunNextTraining")>(), useRunNextTraining: hooks.next }));
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
  expect(hooks.baseline).toHaveBeenLastCalledWith(run.id, false, run.startTime, "Run");
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
 const { container } = renderWithProviders(<RunActivityIntro detail={{ ...introDetail, averageSpeedKmh: 0, isOwner: false }} activityId="run" gapSecPerKm={null} />);
 expect(container).toBeEmptyDOMElement();
});

it("omits pending baseline from owner interpretation", () => {
 hooks.baseline.mockReturnValueOnce({ paceSecPerKm: 300, loading: true, comparisonType: "run", sampleCount: 3, windowComplete: true });
 const { result } = renderHook(() => useRunActivityDetail(run, null, null, run.userId));
 expect(result.current.baselinePaceSecPerKm).toBeNull();
 expect(result.current.interpretationContext?.baselinePaceSecPerKm).toBeNull();
});

it("forwards the exact current running subtype to the baseline query", () => {
 const trail = { ...run, type: "TrailRun" };
 renderHook(() => useRunActivityDetail(trail, null, null, trail.userId));
 expect(hooks.baseline).toHaveBeenLastCalledWith(trail.id, true, trail.startTime, "TrailRun");
});
it("does not expose owner comparison evidence to public viewers", () => {
 const { result } = renderHook(() => useRunActivityDetail(run, null, null, "outside"));
 expect(result.current.baselineComparison).toBeUndefined();
});

it("passes completed owner comparison metadata to the intro", () => {
 const { result } = renderHook(() => useRunActivityDetail(run, null, null, run.userId));
 expect(result.current.baselineComparison).toMatchObject({ comparisonType: "run", sampleCount: 3, windowComplete: true });
});

it("disables next-plan reads and hides owner UI immediately on route activity mismatch", () => {
 const { result } = renderHook(() => useRunActivityDetail(run, null, null, run.userId, "other-route"));
 expect(hooks.next).toHaveBeenLastCalledWith(run.id, run.userId, false);
 expect(result.current.nextTraining).toBeUndefined();
 expect(result.current.isOwner).toBe(false);
});
it("shows next-plan availability to owner even when this run has no pace fields", () => {
 renderWithProviders(<RunActivityIntro detail={{ ...introDetail, averageSpeedKmh: 0, nextTraining: { status: "none", session: null } }} activityId="run" gapSecPerKm={null} />);
 expect(screen.getByTestId("run-next-training-card")).toBeInTheDocument();
});

it("never publishes upcoming-plan card data for an anonymous activity owner", () => {
 const { result } = renderHook(() => useRunActivityDetail(run, null, null, run.userId, run.id, true));
 expect(hooks.next).toHaveBeenLastCalledWith(run.id, run.userId, false);
 expect(result.current.nextTraining).toBeUndefined();
});
