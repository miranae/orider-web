import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const scope = { onmessage: null as ((event: MessageEvent) => void) | null, postMessage: vi.fn() };
beforeEach(async () => { scope.postMessage.mockReset(); vi.stubGlobal("self", scope); vi.resetModules(); await import("./powerDurationWindows.worker"); });
afterEach(() => vi.unstubAllGlobals());
describe("actual Worker kernel dispatch", () => {
  it("calculates supported grid and custom durations from one normalized input", () => {
    const input = { state: "available", reason: null, inputRevision: "a".repeat(64), algorithmVersion: "sample-time-weighted-v1", timingBasis: "elapsed", scope: "selected_range", rangeStartElapsedSec: 0, rangeEndElapsedSec: 7200, provenance: "orider_native", startsSec: [0], durationsSec: [7200], watts: [0], segmentStarts: [true], longestContinuousSeconds: 7200 };
    scope.onmessage!({ data: { type: "initialize", input } } as MessageEvent);
    const ready = scope.postMessage.mock.calls.at(-1)![0]; expect(ready.type).toBe("ready"); expect(ready.points.length).toBeLessThanOrEqual(64); expect(ready.points.every((point: { maxPower: number }) => point.maxPower === 0)).toBe(true);
    for (const durationSeconds of [17, 5400, 7200]) {
      scope.onmessage!({ data: { type: "duration", durationSeconds, requestId: durationSeconds } } as MessageEvent);
      expect(scope.postMessage).toHaveBeenLastCalledWith({ type: "duration", requestId: durationSeconds, point: { durationSeconds, maxPower: 0 } });
    }
    scope.onmessage!({ data: { type: "duration", durationSeconds: 7201, requestId: 1 } } as MessageEvent);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ type: "duration", requestId: 1, point: null });
  });
  it("rejects invalid provenance before grid computation", () => {
    scope.onmessage!({ data: { type: "initialize", input: { state: "available", provenance: "unknown" } } } as MessageEvent);
    expect(scope.postMessage).toHaveBeenLastCalledWith({ type: "error" });
  });
});
