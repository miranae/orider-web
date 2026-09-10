import { getDocs, query, where, startAfter } from "firebase/firestore";
import { aggregateMonthlyActivities, loadAthleteChartActivities } from "./athleteMonthlyActivities";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";

const activity = (startTime: number) => createMockActivity({ startTime, createdAt: new Date(2026, 8, 1).getTime(), summary: createMockSummary({ distance: 1000, ridingTimeMillis: 3600000, elevationGain: 10 }) });
const page = (count: number, offset = 0) => ({ docs: Array.from({ length: count }, (_, i) => ({ id: `a-${offset + i}`, data: () => activity(new Date(2021, 0, 2).getTime()) })) });

describe("athlete monthly activities", () => {
  it("uses ride dates, fills every missing month and retains more than twelve months", () => {
    const rows = aggregateMonthlyActivities([activity(new Date(2021, 0, 2).getTime()), activity(new Date(2022, 2, 3).getTime())], new Date(2022, 3, 1));
    expect(rows).toHaveLength(16);
    expect(rows[0]).toMatchObject({ week: "2021.01", distance: 1, rides: 1 });
    expect(rows[1]).toMatchObject({ week: "2021.02", distance: 0, rides: 0 });
    expect(rows[14]).toMatchObject({ week: "2022.03", distance: 1 });
    expect(rows[15]).toMatchObject({ week: "2022.04", distance: 0 });
  });

  it("falls back for legacy dates and uses the same displayed duration as activity cards", () => {
    const row = activity(NaN);
    row.summary.movingTimeSec = 1800;
    row.summary.pauseTimeSec = 1800;
    expect(aggregateMonthlyActivities([row], new Date(2026, 8, 1))[0]).toMatchObject({ week: "2026.09", time: 0.5 });
  });

  it("keeps known monthly hours when a legacy activity has no duration", () => {
    const legacy = activity(new Date(2021, 0, 2).getTime());
    legacy.summary.ridingTimeMillis = undefined as unknown as number;
    const rows = aggregateMonthlyActivities([legacy, activity(legacy.startTime)], new Date(2021, 0, 2));
    expect(rows[0]?.time).toBe(1);
  });

  it("loads beyond 200 activities and keeps public/deletion constraints on every page", async () => {
    const first = page(200);
    vi.mocked(getDocs).mockResolvedValueOnce(first as never).mockResolvedValueOnce(page(1, 200) as never);
    vi.mocked(where).mockClear();
    const rows = await loadAthleteChartActivities("athlete", false, () => false);
    expect(rows).toHaveLength(201);
    expect(startAfter).toHaveBeenCalledWith(first.docs[199]);
    expect(vi.mocked(where).mock.calls.filter(([field]) => field === "visibility")).toEqual([
      ["visibility", "==", "everyone"], ["visibility", "==", "everyone"],
    ]);
    expect(vi.mocked(where).mock.calls.filter(([field]) => field === "deletedAt")).toHaveLength(2);
    expect(aggregateMonthlyActivities(rows!, new Date(2021, 0, 2))[0]?.distance).toBe(201);
  });

  it("retains activities with absent or null summaries without changing measured totals", async () => {
    const first = page(1);
    const legacy = { ...activity(new Date(2021, 0, 2).getTime()), summary: undefined };
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [
      ...first.docs,
      { id: "missing-summary", data: () => legacy },
      { id: "null-summary", data: () => ({ ...legacy, summary: null }) },
    ] } as never);
    const rows = await loadAthleteChartActivities("athlete", true, () => false);
    expect(rows).toHaveLength(3);
    expect(rows![1]?.summary).toMatchObject({ distance: 0, ridingTimeMillis: 0, elevationGain: 0 });
    expect(aggregateMonthlyActivities(rows!, new Date(2021, 0, 2))[0]).toMatchObject({
      rides: 3, distance: 1, time: 1, elevation: 10,
    });
  });

  it("includes private activities only for the owner query", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(page(1) as never);
    vi.mocked(where).mockClear();
    await loadAthleteChartActivities("athlete", true, () => false);
    expect(vi.mocked(where).mock.calls.some(([field]) => field === "visibility")).toBe(false);
  });

  it("rejects a failed later page instead of returning partial totals", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(page(200) as never).mockRejectedValueOnce(new Error("network"));
    await expect(loadAthleteChartActivities("athlete", true, () => false)).rejects.toThrow("network");
  });

  it("discards an obsolete request and stops paging after cancellation", async () => {
    let cancelled = false;
    vi.mocked(getDocs).mockImplementationOnce(async () => { cancelled = true; return page(200) as never; });
    vi.mocked(query).mockClear();
    expect(await loadAthleteChartActivities("athlete", true, () => cancelled)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
