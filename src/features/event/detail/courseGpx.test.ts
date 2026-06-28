import { describe, expect, it } from "vitest";

import { haversine, parseGpxFull } from "./courseGpx";

describe("courseGpx", () => {
  it("parses track points, waypoints, distance, and elevation", () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" creator="orider">
        <wpt lat="37.5005" lon="127.0005"><ele>15</ele><name>1차 보급</name><type>FOOD</type></wpt>
        <trk><trkseg>
          <trkpt lat="37.5" lon="127.0"><ele>10</ele></trkpt>
          <trkpt lat="37.501" lon="127.001"><ele>30</ele></trkpt>
          <trkpt lat="37.502" lon="127.002"><ele>20</ele></trkpt>
        </trkseg></trk>
      </gpx>`;

    const parsed = parseGpxFull(gpx);

    expect(parsed.points).toHaveLength(3);
    expect(parsed.waypoints).toEqual([
      { lat: 37.5005, lon: 127.0005, ele: 15, name: "1차 보급", type: "FOOD" },
    ]);
    expect(parsed.latlng).toEqual([[37.5, 127.0], [37.501, 127.001], [37.502, 127.002]]);
    expect(parsed.distance).toBeGreaterThan(250);
    expect(parsed.elevationGain).toBe(20);
    expect(parsed.elevationLoss).toBe(10);
    expect(parsed.maxElevation).toBe(30);
    expect(parsed.minElevation).toBe(10);
  });

  it("handles empty GPX safely", () => {
    expect(parseGpxFull("<gpx />")).toMatchObject({
      points: [],
      waypoints: [],
      latlng: [],
      distance: 0,
      elevationGain: 0,
      elevationLoss: 0,
      maxElevation: 0,
      minElevation: 0,
    });
  });

  it("measures nearby coordinates in meters", () => {
    expect(haversine(37.5, 127.0, 37.501, 127.001)).toBeGreaterThan(100);
  });
});
