import { describe, expect, it } from "vitest";
import { buildMonthCells, firstPolylinePoint } from "./eventViews";

describe("event discovery views", () => {
  it("builds a stable six-week month grid and assigns events by local day", () => {
    const event = { id: "e1", startTime: new Date(2026, 6, 12, 9).getTime() };
    const cells = buildMonthCells([event], new Date(2026, 6, 1));
    expect(cells).toHaveLength(42);
    expect(cells.find((cell) => cell.events[0]?.id === "e1")?.date.getDate()).toBe(12);
  });

  it("returns only finite route start points", () => {
    expect(firstPolylinePoint("route", () => [[37.5, 127]])).toEqual([37.5, 127]);
    expect(firstPolylinePoint(undefined, () => [])).toBeNull();
    expect(firstPolylinePoint("bad", () => [[Number.NaN, 127]])).toBeNull();
  });
});
