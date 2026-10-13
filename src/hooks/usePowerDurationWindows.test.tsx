import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePowerDurationWindows } from "./usePowerDurationWindows";
import type { AvailablePowerWindowInput } from "../utils/powerDurationWindows";
class TestWorker {
  static workers: TestWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { TestWorker.workers.push(this); }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}
const input: AvailablePowerWindowInput = { state: "available", reason: null, inputRevision: "a".repeat(64), algorithmVersion: "sample-time-weighted-v1", timingBasis: "elapsed", scope: "selected_range", rangeStartElapsedSec: 0, rangeEndElapsedSec: 7200, provenance: "direct_file", startsSec: [0], durationsSec: [7200], watts: [200], segmentStarts: [true], longestContinuousSeconds: 7200 };
beforeEach(() => { TestWorker.workers = []; vi.stubGlobal("Worker", TestWorker); });
afterEach(() => vi.unstubAllGlobals());
describe("power duration Worker ownership", () => {
  it("transfers input once, changes17/90min/2hr without new Worker or fetch and cancels on unmount", () => {
    const { result, rerender, unmount } = renderHook(props => usePowerDurationWindows(props.input, props.identity, props.duration), { initialProps: { input, identity: "owner:activity:r1", duration: 17 } });
    const worker = TestWorker.workers[0]!;
    expect(worker.postMessage.mock.calls.filter(([message]) => message.type === "initialize")).toHaveLength(1);
    act(() => worker.emit({ type: "ready", points: [{ durationSeconds: 17, maxPower: 200 }] }));
    const oldId = worker.postMessage.mock.calls.at(-1)![0].requestId;
    rerender({ input, identity: "owner:activity:r1", duration: 5400 });
    act(() => worker.emit({ type: "duration", requestId: oldId, point: { durationSeconds: 17, maxPower: 999 } }));
    expect(result.current.point).toBeNull();
    const currentId = worker.postMessage.mock.calls.at(-1)![0].requestId;
    act(() => worker.emit({ type: "duration", requestId: currentId, point: { durationSeconds: 5400, maxPower: 200 } }));
    expect(result.current.point?.maxPower).toBe(200);
    rerender({ input, identity: "owner:activity:r1", duration: 7200 });
    expect(TestWorker.workers).toHaveLength(1); expect(worker.postMessage.mock.calls.filter(([message]) => message.type === "initialize")).toHaveLength(1);
    unmount(); expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(["owner", "activity", "revision"])("terminates and immediately hides stale results on %s change including ABA", key => {
    const { result, rerender } = renderHook(props => usePowerDurationWindows(props.input, props.identity, 17), { initialProps: { input, identity: "A" } });
    const old = TestWorker.workers[0]!; act(() => old.emit({ type: "ready", points: [{ durationSeconds: 1, maxPower: 900 }] }));
    rerender({ input: key === "revision" ? { ...input, inputRevision: "b".repeat(64) } : input, identity: "B" });
    expect(result.current.points).toEqual([]); expect(old.terminate).toHaveBeenCalledOnce();
    rerender({ input, identity: "A" });
    act(() => old.emit({ type: "ready", points: [{ durationSeconds: 1, maxPower: 999 }] }));
    expect(result.current.points).toEqual([]);
  });
  it("finishes unavailable when a valid duration cannot produce a finite result", () => {
    const { result } = renderHook(() => usePowerDurationWindows(input, "A", 17));
    const worker = TestWorker.workers[0]!; const requestId = worker.postMessage.mock.calls.at(-1)![0].requestId;
    act(() => worker.emit({ type: "duration", requestId, point: null }));
    expect(result.current.selectedState).toBe("unavailable"); expect(result.current.point).toBeNull();
  });
  it("does not start for invalid/provenance-unavailable inputs or send durations above continuous range", () => {
    const { rerender } = renderHook(props => usePowerDurationWindows(props.input, "A", 7201), { initialProps: { input: { ...input, provenance: "unknown" } as AvailablePowerWindowInput } });
    expect(TestWorker.workers).toHaveLength(0); rerender({ input });
    expect(TestWorker.workers[0]!.postMessage).toHaveBeenCalledTimes(1);
  });
});
