import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityAnalysisModel } from "./useActivityAnalysisModel";
import type { SampledPoint } from "../features/activity/detail/activityDetailUtils";
import { useActivityRangeSelection } from "./useActivityRangeSelection";
const auth = vi.hoisted(() => ({ uid: "owner" }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: auth.uid } }) }));
const epoch = 1791504000000;
const model = { activity: { id: "a", userId: "owner", startTime: epoch, summary: { elapsedTimeMillis: 10000 } },
  isActivityOwner: true, serverMetrics: { metrics: { durationSec: 10, movingTimeSec: 6, computedAt: 1 } },
  streams: { time: Array.from({ length: 10 }, (_, index) => epoch + 200 + index * 1000),
    latlng: Array.from({ length: 10 }, () => [37, 127]) } } as unknown as ActivityAnalysisModel;
const sampled = [0, 2, 4, 6, 8, 9].map(sourceIndex => ({ sourceIndex, distance: 100 })) as SampledPoint[];
describe("single elapsed range selection", () => {
  it("preserves epoch offsets and uses raw indices even when every distance is identical during stops", () => {
    auth.uid = "owner";
    const { result } = renderHook(() => useActivityRangeSelection(model, sampled));
    expect(result.current.axis?.[0]).toBeCloseTo(0.2, 5);
    act(() => result.current.toggle());
    expect(result.current.selection).toBeNull();
    act(() => result.current.selectChart([1, 3]));
    expect(result.current.selection?.startOffsetSec).toBeCloseTo(2.2, 5);
    expect(result.current.selection?.endOffsetSec).toBeCloseTo(6.2, 5);
    expect(result.current.routeRange).toEqual({ startIndex: 2, endIndex: 6 });
    expect(result.current.chartRange).toEqual([1, 3]);
    act(() => result.current.clear());
    expect(result.current.routeRange).toBeUndefined();
    expect(result.current.selection).toBeNull();
  });
  it("clears selection and control mode on revision/owner ABA rather than resurrecting an old range", () => {
    auth.uid = "owner";
    const { result, rerender } = renderHook(props => useActivityRangeSelection(props, sampled), { initialProps: model });
    act(() => result.current.toggle());
    act(() => result.current.select({ startOffsetSec: 1, endOffsetSec: 4 }));
    const oldId = result.current.selection!.requestId;
    rerender({ ...model, serverMetrics: { metrics: { ...model.serverMetrics.metrics!, computedAt: 2 }, status: "ready" } });
    expect(result.current.selection).toBeNull();
    rerender(model);
    expect(result.current.selection).toBeNull();
    act(() => result.current.toggle()); act(() => result.current.select({ startOffsetSec: 1, endOffsetSec: 4 }));
    expect(result.current.selection!.requestId).not.toBe(oldId);
    auth.uid = "other"; rerender(model);
    expect(result.current.ownerUid).toBeNull();
    auth.uid = "owner"; rerender(model);
    expect(result.current.selection).toBeNull(); expect(result.current.enabled).toBe(false);
  });
  it("retains the source lock across metrics revisions and remounting readers, until explicit reload returns a fresh raw source", () => {
    auth.uid = "owner";
    const retryStreams = vi.fn(async () => {});
    const initial = { ...model, retryStreams, loadingStreams: false };
    const { result, rerender } = renderHook(props => useActivityRangeSelection(props, sampled), { initialProps: initial });
    act(() => result.current.lockSource());
    expect(result.current.sourceLocked).toBe(true);
    const metadata = { ...initial, serverMetrics: { metrics: { ...model.serverMetrics.metrics!, computedAt: 2 }, status: "ready" as const } };
    rerender(metadata);
    expect(result.current.sourceLocked).toBe(true);
    const unrequestedFresh = { ...metadata, streams: { ...model.streams! } };
    rerender(unrequestedFresh);
    expect(result.current.sourceLocked).toBe(true);
    act(() => { void result.current.reloadSource(); });
    expect(retryStreams).toHaveBeenCalledTimes(1);
    expect(result.current.sourceLocked).toBe(true);
    rerender({ ...unrequestedFresh, streams: { ...model.streams! } });
    expect(result.current.sourceLocked).toBe(false);
  });
  it("permits manual canonical sensor analysis indoors without route time or coordinates", () => {
    auth.uid = "owner";
    const { result } = renderHook(() => useActivityRangeSelection({ ...model, streams: { sensorStreamsV1: { time: [0, 1, 2] } } } as unknown as ActivityAnalysisModel, []));
    expect(result.current.axis).toBeNull();
    act(() => result.current.toggle());
    act(() => result.current.select({ startOffsetSec: 0.2, endOffsetSec: 5 }));
    expect(result.current.selection).toMatchObject({ startOffsetSec: 0.2, endOffsetSec: 5 });
    expect(result.current.chartRange).toBeUndefined(); expect(result.current.routeRange).toBeUndefined();
    expect(result.current.locationUnavailable).toBe(true);
  });
  it("rejects absent raw indices and compact moving clocks while retaining valid elapsed epoch axes", () => {
    auth.uid = "owner";
    const { result, rerender } = renderHook(props => useActivityRangeSelection(props, [{ distance: 1 } as SampledPoint]), { initialProps: model });
    expect(result.current.axis).not.toBeNull(); expect(result.current.sampledAxis).toBeNull();
    act(() => result.current.selectChart([0, 1])); expect(result.current.selection).toBeNull();
    rerender({ ...model, streams: { time: [0, 1, 2, 3, 4, 5, 6] } });
    expect(result.current.axis).toBeNull();
  });
});
