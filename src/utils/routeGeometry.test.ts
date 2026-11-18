import { describe, expect, it } from "vitest";
import { routeSlots, routeGeometry, routeBounds, routeTrackSlots } from "./routeGeometry";

describe("route geometry at the untrusted stream boundary", () => {
  it("preserves null, malformed and sparse source indices without mutating the sensor clock", () => {
    const input: unknown[] = [[37, 127]];
    input.length = 2; // A genuine absent JSON/array slot, without compacting the axis.
    input.push({ latitude: 37 }, null, [38, 128], [38.01, 128]);
    const positions = routeSlots(input);
    expect(positions).toHaveLength(6);
    expect(positions.slice(1, 4)).toEqual([null, null, null]);
    expect(4 in input).toBe(true);
    expect(1 in input).toBe(false);
    expect(routeGeometry(positions).geometry.coordinates).toEqual([[128, 38], [128, 38.01]]);
    expect(routeBounds(input)).toEqual([[127, 37], [128, 38.01]]);
  });

  it("never draws a bridge across invalid samples or explicit part boundaries", () => {
    const points = routeSlots([[37,127], [37.01,127], [38,128], [38.01,128], [NaN, 127], [39,129], [39.01,129]]);
    expect(routeGeometry(points, [2]).geometry.coordinates).toEqual([
      [[127,37], [127,37.01]], [[128,38], [128,38.01]], [[129,39], [129,39.01]],
    ]);
  });

  it("retains legacy segment coordinates with trailing elevation", () => {
    expect(routeSlots([[37,127,42], [38,128,43]])).toEqual([[37,127], [38,128]]);
  });

  it("rejects incomplete encoded latitude/longitude pairs and non-string tracks", () => {
    expect(routeTrackSlots({})).toEqual([]);
    expect(routeTrackSlots("_p~iF~ps|U_ulL")).toEqual([]);
    expect(routeTrackSlots("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]);
    expect(routeTrackSlots("37,127;broken;38,128")).toEqual([[37,127],null,[38,128]]);
  });

  it("rejects invalid geographic values and returns no bounds for an empty route", () => {
    expect(routeSlots([[], [91, 0], [0, 181], [NaN, 0], [0, Infinity], ["37", 127], {}, null])).toEqual(Array(8).fill(null));
    expect(routeSlots({})).toEqual([]);
    expect(routeBounds([null, undefined, [NaN, 0]])).toBeNull();
    expect(routeGeometry([]).geometry.coordinates).toEqual([]);
    expect(routeSlots([[0,0], [-90,-180], [90,180]])).toEqual([[0,0], [-90,-180], [90,180]]);
  });
});
