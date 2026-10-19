import { describe, expect, it } from "vitest";
import { groupRideMapRange } from "./groupRideMapRange";

const latlng: [number, number][] = [[37, 127], [37, 127.001], [37, 127.002], [37, 127.003]];
const distance = [0, 100, 200, 300];
const clock = [1000, 2000, 3000, 4000];
const lines = (result: ReturnType<typeof groupRideMapRange>) => result.geometry.coordinates;

describe("groupRideMapRange", () => {
  it("clips the actual adjacent GPS segments by each record's own distance", () => {
    const result = lines(groupRideMapRange({ latlng, distance }, clock, { axis: "distance", start: 50, end: 250 }));
    expect(result).toHaveLength(1);
    expect(result[0]![0]![0]).toBeCloseTo(127.0005);
    expect(result[0]!.at(-1)![0]).toBeCloseTo(127.0025);
    expect(lines(groupRideMapRange({ latlng, distance: [0, 200, 400, 600] }, clock, { axis: "distance", start: 50, end: 250 }))[0]!.at(-1)![0]).toBeCloseTo(127.00125);
  });

  it("uses the real clock rather than a shared rider index", () => {
    const range = { axis: "time" as const, start: 1500, end: 2500 };
    expect(lines(groupRideMapRange({ latlng, distance }, clock, range))[0]![0]![0]).toBeCloseTo(127.0005);
    expect(lines(groupRideMapRange({ latlng, distance }, clock.map(time => time + 5000), range))).toEqual([]);
  });

  it("breaks the line at missing, zero placeholder and invalid GPS points", () => {
    for (const missing of [[NaN, 127], [0, 0], [91, 127]] as [number, number][]) {
      expect(lines(groupRideMapRange({ latlng: [latlng[0]!, missing, latlng[2]!, latlng[3]!] }, clock))).toEqual([[[127.002, 37], [127.003, 37]]]);
    }
  });

  it("never connects across long sample gaps or a teleport", () => {
    expect(lines(groupRideMapRange({ latlng }, [1000, 2000, 100000, 101000]))).toEqual([
      [[127, 37], [127.001, 37]], [[127.002, 37], [127.003, 37]],
    ]);
    expect(lines(groupRideMapRange({ latlng: [latlng[0]!, [38, 128], latlng[2]!, latlng[3]!] }, clock))).toEqual([[[127.002, 37], [127.003, 37]]]);
  });

  it("does not invent coordinates or a clock for thumbnail and absent GPS streams", () => {
    expect(lines(groupRideMapRange({ distance }, clock, { axis: "distance", start: 0, end: 100 }))).toEqual([]);
    expect(lines(groupRideMapRange({ latlng, distance }, null, { axis: "time", start: 0, end: 300 }))).toEqual([]);
    expect(lines(groupRideMapRange({ latlng, distance: [0, 100] }, clock, { axis: "distance", start: 0, end: 100 }))).toEqual([]);
  });

  it("restores all valid geometry without a selected range and returns none outside the record", () => {
    expect(lines(groupRideMapRange({ latlng, distance }, clock))[0]).toHaveLength(4);
    expect(lines(groupRideMapRange({ latlng, distance }, clock, { axis: "distance", start: 400, end: 500 }))).toEqual([]);
    expect(lines(groupRideMapRange({ latlng, distance }, clock, { axis: "distance", start: 100, end: 100 }))).toEqual([]);
  });

  it("splits regressing and invalid distance edges without joining their neighbours", () => {
    expect(lines(groupRideMapRange({ latlng, distance: [0, 100, NaN, 300] }, clock, { axis: "distance", start: 0, end: 300 }))).toEqual([[[127, 37], [127.001, 37]]]);
    expect(lines(groupRideMapRange({ latlng, distance: [0, 100, 50, 300] }, clock, { axis: "distance", start: 0, end: 300 }))).toHaveLength(2);
  });

  it("keeps stationary samples inside a distance range", () => {
    expect(lines(groupRideMapRange({ latlng, distance: [100, 100, 100, 100] }, clock, { axis: "distance", start: 50, end: 150 }))[0]).toHaveLength(4);
  });
});
