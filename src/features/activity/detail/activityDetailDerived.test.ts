import { describe, expect, it } from "vitest";

import {
  buildChartOverlays,
  buildSampledData,
  buildSummaryStats,
  getAvailableOverlays,
  getChartHighlightRange,
  getSegmentEfforts,
  getStreamPhotos,
} from "./activityDetailDerived";

describe("activityDetailDerived", () => {
  const streams = {
    distance: [0, 100, 200],
    altitude: [10, 20, 15],
    velocity_smooth: [0, 5, 10],
    heartrate: [0, 140, 150],
    watts: [0, 210, 220],
    cadence: [0, 85, 88],
    latlng: [[37, 127], [37.1, 127.1], [37.2, 127.2]],
    segment_efforts: [
      { id: "b", startIndex: 2, endIndex: 3 },
      { id: "a", startIndex: 0, endIndex: 1 },
    ],
    photos: [{ id: "p1", url: "https://example.com/p.webp", caption: null, location: [37, 127] }],
  };

  it("samples streams and derives overlay stats", () => {
    const sampled = buildSampledData(streams as never);

    expect(sampled).toHaveLength(3);
    expect(sampled[1]).toMatchObject({ distance: 100, altitude: 20, speed: 18, heartRate: 140, power: 210 });
    expect(getAvailableOverlays(sampled).map((cfg) => cfg.key)).toEqual(["speed", "hr", "power", "cadence"]);
    expect(buildSummaryStats(sampled, 205)?.overlays.power).toEqual({ avg: 205, max: 220 });
  });

  it("sorts segments, maps highlight ranges, and reads stream photos", () => {
    expect(getSegmentEfforts(streams as never).map((segment) => segment.id)).toEqual(["a", "b"]);
    expect(getChartHighlightRange({ id: "s", startIndex: 1, endIndex: 2 } as never, streams as never)).toEqual([1, 2]);
    expect(getStreamPhotos(streams as never)[0]?.id).toBe("p1");
  });

  it("builds chart overlay datasets", () => {
    const sampled = buildSampledData(streams as never);
    const overlays = buildChartOverlays(
      getAvailableOverlays(sampled),
      new Set(["speed"]),
      sampled,
      (label) => `overlay.${label}`,
    );

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ label: "overlay.speed (km/h)", yAxisID: "ySpeed" });
  });
});
