import { describe, it, expect } from "vitest";
import type { RunPrTable } from "@shared/types/personal-records";
import { distanceRecords, storedBestRecordsForActivity } from "./runRecords";

const e = (value: number, activityId: string, startTime = 0) => ({
  value,
  activityId,
  date: "2026-07-01",
  startTime,
});

describe("distanceRecords", () => {
  it("모든 거리를 표시 순서대로, 각 거리의 최고(최소 초)를 낸다", () => {
    const run: RunPrTable = {
      "1km": [e(281, "a"), e(290, "b")],
      "5km": [e(1600, "c")],
    };
    const rows = distanceRecords(run);
    expect(rows.map((r) => r.distance)).toEqual(["1km", "5km", "10km", "half", "full"]);
    expect(rows[0].best?.value).toBe(281);
    expect(rows[1].best?.value).toBe(1600);
    expect(rows[2].best).toBeNull(); // 10km 기록 없음 — 자리는 남긴다
    expect(rows[3].best).toBeNull(); // half
    expect(rows[4].best).toBeNull(); // full
  });

  it("정렬이 뒤섞여 있어도 최소값을 고른다 (방어적)", () => {
    const rows = distanceRecords({ "1km": [e(300, "x"), e(275, "y"), e(288, "z")] });
    expect(rows[0].best?.activityId).toBe("y");
  });

  it("run 이 없으면 전부 자리만 남긴다 (5거리)", () => {
    const rows = distanceRecords(undefined);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.best === null)).toBe(true);
  });
});

describe("storedBestRecordsForActivity", () => {
  it.each([0, 50, 200])("does not infer improvement from earlier, unknown or later records (time=%s)", startTime => {
    const run: RunPrTable = { "5km": [e(1600, "current", 100), e(1641, "other", startTime)] };
    expect(storedBestRecordsForActivity(run, "current")).toEqual([{ distance: "5km", timeSec: 1600, tied: false }]);
  });
  it("does not call a sole top-K entry the first ever record", () => {
    expect(storedBestRecordsForActivity({ "1km": [e(280, "current")] }, "current")).toEqual([{ distance: "1km", timeSec: 280, tied: false }]);
  });
  it("omits a slower activity and an absent table", () => {
    expect(storedBestRecordsForActivity({ "5km": [e(1600, "other"), e(1650, "current")] }, "current")).toEqual([]);
    expect(storedBestRecordsForActivity(undefined, "current")).toEqual([]);
  });
  it("keeps multiple distances and deduplicates entries for the same activity", () => {
    const run: RunPrTable = { "1km": [e(275, "current"), e(275, "current")], "5km": [e(1600, "current")], "10km": [e(3500, "other")] };
    expect(storedBestRecordsForActivity(run, "current")).toEqual([{ distance: "1km", timeSec: 275, tied: false }, { distance: "5km", timeSec: 1600, tied: false }]);
  });
  it("shows joint best neutrally and independently of list order", () => {
    const entries = [e(1600, "x"), e(1600, "y")];
    for (const id of ["x", "y"]) {
      const result = [{ distance: "5km", timeSec: 1600, tied: true }];
      expect(storedBestRecordsForActivity({ "5km": entries }, id)).toEqual(result);
      expect(storedBestRecordsForActivity({ "5km": [...entries].reverse() }, id)).toEqual(result);
    }
  });
  it("ignores invalid times instead of calling them records", () => {
    expect(storedBestRecordsForActivity({ "1km": [e(0, "current"), e(Number.NaN, "current"), e(-1, "current")] }, "current")).toEqual([]);
  });
});
