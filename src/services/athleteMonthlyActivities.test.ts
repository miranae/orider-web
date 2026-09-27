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
    expect(rows![1]?.summary).toBeUndefined();
    expect(rows![2]?.summary).toBeNull();
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

it("월별 단일 pass 구성도 원본 기록 수와 실제 운동 부하를 구분한다", () => {
  const start = new Date(2026, 8, 1, 12).getTime();
  const native = {...activity(start), id: "native", type: "Ride", source: "orider", summary: createMockSummary({distance: 1000, ridingTimeMillis: 3600000, tss: 100})};
  const imported = {...native, id: "imported", source: "strava", startTime: start + 30000};
  const later = {...native, id: "later", startTime: new Date(2026, 9, 1, 12).getTime(), summary: {} as typeof native.summary};
  const rows = aggregateMonthlyActivities([native, imported, later], new Date(2026, 9, 2));
  expect(rows[0]).toMatchObject({week: "2026.09", rides: 2, distance: 2, tss: 100, tssEstimated: false});
  expect(rows[1]).toMatchObject({week: "2026.10", rides: 1, tss: null, tssEstimated: false, tssUnknownCount: 1});
});

it.each([
  [100, { tss: 100, ridingTimeMillis: 3600000 }, false],
  [0, { tss: 0, ridingTimeMillis: 0 }, false],
  [null, null, false],
  [42, { ridingTimeMillis: 3600000 }, true],
])("월간 부하 %s와 미확인 활동을 추정 여부와 별도로 표시한다", (tss, summary, estimated) => {
  const start = new Date(2026, 8, 1, 12).getTime();
  const unknown = { ...activity(start + 2 * 86400000), id: "unknown", endTime: start + 2 * 86400000 + 3600000, summary: {} };
  const known = { ...activity(start), id: "known", endTime: start + 3600000, summary };
  const input = summary ? [known, unknown] : [unknown];
  expect(aggregateMonthlyActivities(input as Parameters<typeof aggregateMonthlyActivities>[0], new Date(2026, 8, 4))[0])
    .toMatchObject({ tss, tssEstimated: estimated, tssUnknownCount: 1 });
});
