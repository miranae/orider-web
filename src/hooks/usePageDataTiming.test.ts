import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const track = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
vi.mock("../services/errorLogger", () => ({ logClientError: logError }));
vi.mock("../services/analytics", () => ({ track }));
import { usePageDataTiming } from "./usePageDataTiming";
let frames: Map<number, FrameRequestCallback>, id: number;
function paint() { const current = [...frames]; frames.clear(); current.forEach(([, callback]) => callback(0)); }
beforeEach(() => { frames = new Map(); id = 0; track.mockClear(); vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(++id, cb); return id; }); vi.stubGlobal("cancelAnimationFrame", (n: number) => frames.delete(n)); });
afterEach(() => vi.unstubAllGlobals());
it("waits for usable data and paint, reports once without document paths, and resets on navigation", () => {
  const { rerender } = renderHook(({ key, loading }) => usePageDataTiming("activity", key, loading, !loading, false), { initialProps: { key: "private-id-a", loading: true } });
  act(() => { paint(); paint(); }); expect(track).not.toHaveBeenCalled();
  rerender({ key: "private-id-a", loading: false }); act(() => { paint(); paint(); });
  expect(track).toHaveBeenCalledOnce(); expect(track).toHaveBeenCalledWith("page_data_ready", { page: "activity", duration_ms: expect.any(Number), outcome: "ready" });
  rerender({ key: "private-id-b", loading: false }); act(() => { paint(); paint(); }); expect(track).toHaveBeenCalledTimes(2);
});
it("cancels pending paint when readiness changes or the component unmounts", () => {
  const { rerender, unmount } = renderHook(({ loading }) => usePageDataTiming("dashboard", "route", loading, !loading, false), { initialProps: { loading: false } });
  act(() => paint()); rerender({ loading: true }); act(() => paint()); expect(track).not.toHaveBeenCalled();
  rerender({ loading: false }); unmount(); act(() => { paint(); paint(); }); expect(track).not.toHaveBeenCalled();
});

it("records telemetry failure without interrupting page rendering", () => {
  const error = new Error("analytics unavailable"); track.mockImplementationOnce(() => { throw error; });
  renderHook(() => usePageDataTiming("dashboard", "route-error", false, true, false));
  act(() => { paint(); paint(); });
  expect(logError).toHaveBeenCalledWith("pageDataTiming.track", error, { page: "dashboard" });
});
