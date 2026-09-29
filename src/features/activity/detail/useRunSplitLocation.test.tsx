import { act, renderHook } from "@testing-library/react";
import type { ActivityStreams } from "@shared/types";
import type { SplitRow } from "@shared/types/activity-metrics";
import { resolveRunSplitLocation, useRunSplitLocation } from "./useRunSplitLocation";

const split = (km: number): SplitRow => ({ km, paceSec: 300, gapSec: 300, elevGain: 0, avgHr: null });
const stream = (): ActivityStreams => ({
  userId: "fixture", distance: [1.7, 501.7, 1001.7, 1501.7, 2001.7, 2301.7], time: [0, 100, 200, 300, 400, 500],
  latlng: [[37, 127], [37.001, 127], [37.002, 127], [37.003, 127], [37.004, 127], [37.005, 127]],
  altitude: [0, 1, 2, 3, 4, 5],
});
const points = (streams: ActivityStreams) => streams.distance!.map(distance => ({ distance }));

describe("canonical running split spatial linkage", () => {
  it("uses observed metre baseline and real chart distances rather than sample-stride approximations", () => {
    const streams = stream();
    expect(resolveRunSplitLocation(split(2), streams, [{ distance: 1.7 }, { distance: 1501.7 }, { distance: 2301.7 }]))
      .toEqual({ routeRange: { startIndex: 2, endIndex: 4 }, chartRange: [0, 2], markerPosition: [37.004, 127] });
  });
  it("clamps ordinal and fractional final partial splits to observed distance", () => {
    const streams = stream();
    for (const km of [3, 2.3]) expect(resolveRunSplitLocation(split(km), streams, points(streams), 2.3))
      .toEqual({ routeRange: { startIndex: 4, endIndex: 5 }, chartRange: [4, 5], markerPosition: [37.005, 127] });
    expect(resolveRunSplitLocation(split(4), streams, points(streams))).toBeNull();
    expect(resolveRunSplitLocation(split(3), streams, points(streams), 2.9)).toBeNull();
  });
  it("preserves pause duplicates and accepts consistent seconds and epoch-millisecond clocks", () => {
    const streams = stream();
    streams.time = [0, 100, 100, 300, 400, 500];
    expect(resolveRunSplitLocation(split(1), streams, points(streams))?.routeRange).toEqual({ startIndex: 0, endIndex: 2 });
    streams.time = streams.time.map(time => 1_800_000_000_000 + time * 1000);
    expect(resolveRunSplitLocation(split(1), streams, points(streams))?.routeRange).toEqual({ startIndex: 0, endIndex: 2 });
  });
  it.each([
    { distance: [0, 500, 400, 1500, 2000, 2300] },
    { distance: [0, 500, Number.NaN, 1500, 2000, 2300] },
    { distance: [0, 0.5, 1, 1.5, 2, 2.3] },
    { time: [0, 100, 90, 300, 400, 500] },
    { time: [0, 100, Number.NaN, 300, 400, 500] },
    { time: [0, 0, 0, 0, 0, 0] },
    { time: [0, 100, 1_800_000_000_000, 300, 400, 500] },
    { time: [0, 100] },
  ])("does not invent spatial links from malformed or kilometre-valued raw axes: %o", overrides => {
    const streams = { ...stream(), ...overrides };
    expect(resolveRunSplitLocation(split(1), streams, points(streams))).toBeNull();
  });
  it("keeps GPS and elevation linkage independently honest", () => {
    const streams = stream();
    expect(resolveRunSplitLocation(split(1), { ...streams, latlng: [[37, 127]] }, points(streams)))
      .toEqual({ chartRange: [0, 2], routeRange: undefined, markerPosition: null });
    expect(resolveRunSplitLocation(split(1), { ...streams, altitude: [] }, points(streams)))
      .toEqual({ chartRange: undefined, routeRange: { startIndex: 0, endIndex: 2 }, markerPosition: [37.002, 127] });
    expect(resolveRunSplitLocation(split(1), { ...streams, altitude: [], latlng: undefined }, points(streams))).toBeNull();
    expect(resolveRunSplitLocation(split(1), null, [])).toBeNull();
    const sparseTime = [...streams.time!];
    delete sparseTime[1];
    expect(resolveRunSplitLocation(split(1), { ...streams, time: sparseTime }, points(streams))).toBeNull();
    const sparsePosition = [...streams.latlng!];
    delete sparsePosition[1];
    expect(resolveRunSplitLocation(split(1), { ...streams, latlng: sparsePosition, altitude: [] }, points(streams))).toBeNull();
  });
  it("clears selected state on activity switches, missing rows and rejected streams", () => {
    const streams = stream();
    const { result, rerender } = renderHook(({ route, loaded, input }) => useRunSplitLocation(route, loaded, true, input, points(streams)),
      { initialProps: { route: "a", loaded: "a", input: streams as ActivityStreams | null } });
    act(() => result.current.onSelectSplit(split(2)));
    expect(result.current.location?.routeRange).toEqual({ startIndex: 2, endIndex: 4 });
    rerender({ route: "b", loaded: "a", input: streams });
    expect(result.current.location).toBeNull();
    rerender({ route: "a", loaded: "a", input: streams });
    expect(result.current.location).toBeNull();
    act(() => result.current.onSelectSplit(split(1)));
    rerender({ route: "a", loaded: "a", input: null });
    expect(result.current.location).toBeNull();
    rerender({ route: "a", loaded: "a", input: streams });
    act(() => result.current.onSelectSplit(null));
    expect(result.current.location).toBeNull();
  });
});
