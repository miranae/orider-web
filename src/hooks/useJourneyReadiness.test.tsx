import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { track } from "../services/analytics";
import { ownerAnalysisOutcome, useJourneyReadiness } from "./useJourneyReadiness";
import type { JourneyOutcome } from "../services/journeyMeasurement";
vi.mock("../services/analytics", () => ({ track: vi.fn() }));
beforeEach(() => { vi.useFakeTimers(); vi.mocked(track).mockClear(); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
 vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16)); vi.stubGlobal("cancelAnimationFrame", clearTimeout); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const paint = () => act(() => { vi.advanceTimersByTime(40); });
it.each(["success", "empty", "error"] as const)("records committed feed %s once and ignores later refresh", outcome => {
 const session = {}, hook = renderHook(({ result }) => useJourneyReadiness("feed_first_content", "web_home_feed", "feed_initial", true, "private-scope", session, result), { initialProps: { result: null as JourneyOutcome | null } });
 paint(); expect(track).not.toHaveBeenCalled(); hook.rerender({ result: outcome }); paint(); hook.rerender({ result: null }); hook.rerender({ result: outcome }); paint();
 expect(track).toHaveBeenCalledTimes(1); expect(track).toHaveBeenCalledWith("feed_first_content", { surface: "web_home_feed", operation: "feed_initial", outcome, durationMs: expect.any(Number) }); hook.unmount(); expect(track).toHaveBeenCalledTimes(1);
});
it("keeps failed attempt and explicit retry in denominator", () => {
 const hook = renderHook(({ result }) => useJourneyReadiness("feed_first_content", "web_home_feed", "feed_initial", true, "scope", null, result), { initialProps: { result: "error" as JourneyOutcome | null } });
 paint(); act(() => hook.result.current()); hook.rerender({ result: null }); paint(); hook.rerender({ result: "success" }); paint();
 expect(vi.mocked(track).mock.calls.map(c => c[1]?.outcome)).toEqual(["error", "success"]);
});
it("cancels old session before paint and never sends scope or user fields", () => {
 const hook = renderHook(({ session }) => useJourneyReadiness("analysis_ready", "web_owner_activity", "activity_analysis", true, "secret-activity", session, "success"), { initialProps: { session: { uid: "private-user" } } });
 hook.rerender({ session: { uid: "private-user" } }); paint(); hook.unmount();
 expect(vi.mocked(track).mock.calls.map(c => c[1]?.outcome)).toEqual(["cancelled", "success"]);
 expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toMatch(/secret-activity|private-user/);
});
it("hidden or unmounted pending attempts cancel without late success", () => {
 const hook = renderHook(() => useJourneyReadiness("analysis_ready", "web_owner_activity", "activity_analysis", true, "a", null, "success"));
 vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); act(() => document.dispatchEvent(new Event("visibilitychange"))); paint(); hook.unmount();
 expect(vi.mocked(track).mock.calls.map(c => c[1]?.outcome)).toEqual(["cancelled"]);
});
const ready = { activityLoading: false, activityReady: true, error: false, processing: false, metricsStatus: "ready", inputCoverage: "complete", overviewLoading: false, overviewStatus: "available", streamsLoading: false, streamsResolved: true, noSensor: false };
it("waits for both overview and streams but not lazy narrative", () => {
 expect(ownerAnalysisOutcome({ ...ready, streamsLoading: true })).toBeNull(); expect(ownerAnalysisOutcome({ ...ready, overviewLoading: true })).toBeNull(); expect(ownerAnalysisOutcome(ready)).toBe("success");
});
it.each([
 [{ inputPending: true }, "pending"], [{ inputCoverage: "pending" }, "pending"], [{ metricsStatus: "stale" }, "stale"], [{ inputCoverage: "partial_terminal" }, "partial"], [{ inputCoverage: undefined }, "partial"], [{ noSensor: true }, "no_sensor"], [{ metricsStatus: "missing" }, "unavailable"], [{ error: true }, "error"],
] as const)("keeps non-fresh analysis states separate %j", (patch, outcome) => { expect(ownerAnalysisOutcome({ ...ready, ...patch })).toBe(outcome); });

it("terminates the new measurement when fixed dimensions change without state changes", () => {
 const hook = renderHook(({ analysis }) => useJourneyReadiness(analysis ? "analysis_ready" : "feed_first_content", analysis ? "web_owner_activity" : "web_home_feed", analysis ? "activity_analysis" : "feed_initial", true, "a", null, "success"), { initialProps: { analysis: false } });
 hook.rerender({ analysis: true }); paint();
 expect(vi.mocked(track).mock.calls.map(c => [c[0], c[1]?.outcome])).toEqual([["feed_first_content", "cancelled"], ["analysis_ready", "success"]]);
});
