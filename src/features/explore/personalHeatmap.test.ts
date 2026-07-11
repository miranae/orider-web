import { describe, expect, it } from "vitest";
import { aggregatePersonalHeatmap, aggregatePersonalHeatmapAsync } from "./personalHeatmap";
import { encodePolyline } from "../../utils/polyline";

describe("aggregatePersonalHeatmap", () => {
  it("counts a cell once per activity", () => {
    const points = aggregatePersonalHeatmap([
      { thumbnailTrack: "37.5000,127.0000;37.5001,127.0001;37.5000,127.0000" },
      { thumbnailTrack: "37.5000,127.0000;37.5001,127.0001" },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].weight).toBe(2);
  });

  it("fills cells crossed by a sparse segment", () => {
    const points = aggregatePersonalHeatmap([{ thumbnailTrack: "37.5,127.0;37.5,127.03" }]);
    expect(points.length).toBeGreaterThan(2);
    expect(points.every((point) => point.weight === 1)).toBe(true);
  });

  it("ignores empty and invalid coordinates", () => {
    expect(aggregatePersonalHeatmap([{ thumbnailTrack: "" }, { thumbnailTrack: "100,200" }])).toEqual([]);
  });

  it("decodes a Google encoded polyline", () => {
    const encoded = encodePolyline([[37.5, 127], [37.51, 127.02]]);
    expect(aggregatePersonalHeatmap([{ thumbnailTrack: encoded }]).length).toBeGreaterThan(1);
  });

  it("does not leave z14 cell gaps across a long sparse segment", () => {
    const points = aggregatePersonalHeatmap([{ thumbnailTrack: "37.5,100;37.5,120" }]);
    const longitudes = points.map((point) => point.lng).sort((a, b) => a - b);
    expect(longitudes.length).toBeGreaterThan(250);
    expect(Math.max(...longitudes.slice(1).map((lng, index) => lng - longitudes[index]!))).toBeLessThan(0.023);
  });

  it("bounds an extreme world-spanning diagonal with supercover traversal", () => {
    const points = aggregatePersonalHeatmap(
      [{ thumbnailTrack: "-80,-80;80,80" }],
      14,
      { limits: { segmentCells: 257, activityCells: 1_000, outputCells: 1_000 } },
    );
    expect(points).toHaveLength(257);
    expect(points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))).toBe(true);
  });

  it.each([
    "0,179;0,-179",
    "0,-179;0,179",
  ])("uses the short anti-meridian path without intermediate-world cells: %s", (thumbnailTrack) => {
    const points = aggregatePersonalHeatmap([{ thumbnailTrack }]);
    expect(points.length).toBeGreaterThan(2);
    expect(points.length).toBeLessThan(200);
    expect(points.every((point) => Math.abs(point.lng) > 170)).toBe(true);
    expect(points.some((point) => Math.abs(point.lng) < 1)).toBe(false);
  });

  it("caps track points, per-activity cells, and total output for a zigzag", () => {
    const zigzag = Array.from({ length: 200 }, (_, i) => `${37 + (i % 2)},${-170 + i * 1.7}`).join(";");
    const points = aggregatePersonalHeatmap(
      [{ thumbnailTrack: zigzag }, { thumbnailTrack: "0,-170;0,170" }],
      14,
      { limits: { trackPoints: 12, segmentCells: 50, activityCells: 40, outputCells: 45 } },
    );
    expect(points.length).toBeLessThanOrEqual(45);
  });

  it("checks cancellation during a bounded segment traversal", () => {
    let checks = 0;
    expect(() => aggregatePersonalHeatmap(
      [{ thumbnailTrack: "-80,-179;80,179" }],
      14,
      { isCancelled: () => ++checks > 20 },
    )).toThrow(expect.objectContaining({ name: "AbortError" }));
    expect(checks).toBeLessThan(100);
  });

  it("cancels async aggregation between batches without retaining batch arrays", async () => {
    const controller = new AbortController();
    const promise = aggregatePersonalHeatmapAsync(
      [{ thumbnailTrack: "37.5,127;37.6,127.1" }, { thumbnailTrack: "37.6,127.1;37.7,127.2" }],
      14,
      1,
      { signal: controller.signal },
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
