import { installActivityQueryFake } from "../__tests__/fixtures/activityQueryFake";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { createYearReadSession } from "../hooks/yearActivitiesRead";
import { auth } from "./firebase";
import { planMonthBounds } from "@shared/training/planDate";
import { loadActivityDiscovery } from "./activityDiscovery";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
vi.mock("./activityDiscovery", () => ({ loadActivityDiscovery: vi.fn() }));
import type { Activity } from "@shared/types";
import { getDocs, collection } from "firebase/firestore";
import { aggregateMonthlyActivities, loadAthleteChartActivities, athleteProfileYears } from "./athleteMonthlyActivities";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";

// endTime 을 고정한다 — 기본값(현재 시각 - 1시간)이면 9월 활동이 지금까지 이어진 것으로 보여, 10월 이후에는
// 10월 활동과 시간이 겹쳐 같은 실주행으로 묶였다(2026-10-01 부터 실패).
const activity = (startTime: number) => createMockActivity({ startTime, endTime: startTime + 3600000, createdAt: new Date(2026, 8, 1).getTime(), summary: createMockSummary({ distance: 1000, ridingTimeMillis: 3600000, elevationGain: 10 }) });
const ownerActivity = (id: string, startTime: number, extra: Record<string, unknown> = {}) => ({ ...activity(startTime), id, userId: "athlete", deletedAt: null, ...extra });

beforeEach(() => { auth.currentUser = { uid: "athlete" } as never; });

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

  it("loads bounded public id-ordered pages including undated rows without raw reads", async () => {
    const rows = [activity(0), activity(Date.UTC(2025, 0, 1))].map((v,i) => ({...v,id:String(i)}));
    vi.mocked(loadActivityDiscovery).mockResolvedValueOnce({items: [],nextCursor:"ad1.next",exhausted:false} as never).mockResolvedValueOnce({items:rows,nextCursor:null,exhausted:true} as never);
    vi.mocked(getDocs).mockClear();
    const services = {} as FirebaseServices;
    expect(await loadAthleteChartActivities("athlete", false, () => false, services)).toEqual(rows);
    expect(getDocs).not.toHaveBeenCalled();
    expect(loadActivityDiscovery).toHaveBeenLastCalledWith(services,{scope:"athlete",targetUid:"athlete",order:"id_asc",limit:20,cursor:"ad1.next"});
  });
  it("does not publish partial public totals after the ten-page budget", async () => {
    let n=0;vi.mocked(loadActivityDiscovery).mockImplementation(async()=>({items:[],nextCursor:"ad1."+(++n),exhausted:false}) as never);
    await expect(loadAthleteChartActivities("athlete",false,()=>false,{} as FirebaseServices)).rejects.toThrow("incomplete");expect(n).toBe(10);
  });
  it("rejects duplicate rows from changed current seek pages", async () => {
    const item=activity(1);vi.mocked(loadActivityDiscovery).mockResolvedValueOnce({items:[item],nextCursor:"ad1.next",exhausted:false} as never).mockResolvedValueOnce({items:[item],nextCursor:null,exhausted:true} as never);
    await expect(loadAthleteChartActivities("athlete",false,()=>false,{} as FirebaseServices)).rejects.toThrow("changed");
  });

  it("retains summaryless profile inputs and uses only selected-year/recent windows with stable cursors and a mounted cache", async () => {
    const fake = installActivityQueryFake();
    const start = planMonthBounds(2024, 0).start, end = planMonthBounds(2025, 0).start;
    const rows = [ownerActivity("old", Date.UTC(2020, 5, 1)), ownerActivity("a", start + 1000), ownerActivity("summaryless", start + 3600000, { summary: null }), ownerActivity("later", Date.UTC(2025, 5, 1)), ownerActivity("later2", Date.UTC(2025, 5, 2))];
    setCollectionDocs("activities", rows);
    const session = createYearReadSession("athlete");
    const result = await loadAthleteChartActivities("athlete", true, () => false, undefined, 2024, session);
    expect(result!.find(row => row.id === "summaryless")?.summary).toBeNull();
    expect(fake.requests.some(q => q.some(c => c.type === "where" && c.args[0] === "startTime" && c.args[1] === ">=" && c.args[2] === start) && q.some(c => c.type === "where" && c.args[0] === "startTime" && c.args[1] === "<" && c.args[2] === end))).toBe(true);
    expect(fake.requests.some(q => q.some(c => c.type === "where" && c.args[0] === "visibility"))).toBe(false);
    const reads = fake.requests.length;
    await loadAthleteChartActivities("athlete", true, () => false, undefined, 2024, session);
    expect(fake.requests).toHaveLength(reads);
    expect(athleteProfileYears(session, 2024)).toEqual(expect.arrayContaining([2020, 2021, 2022, 2023, 2024, 2025]));
  });
  it("reads a healthy 5,000-activity selected year without a hidden history scan or per-member refetch", async () => {
    const fake = installActivityQueryFake();
    const start = planMonthBounds(2024, 0).start;
    setCollectionDocs("activities", [ownerActivity("old", Date.UTC(2020, 0, 1)), ...Array.from({ length: 5000 }, (_, i) => ownerActivity(`a${String(i).padStart(5, "0")}`, start + i * 60000))]);
    const result = await loadAthleteChartActivities("athlete", true, () => false, undefined, 2024, createYearReadSession("athlete"));
    expect(result!.filter(row => row.startTime >= start && row.startTime < planMonthBounds(2025, 0).start)).toHaveLength(5000);
    expect(fake.documents).toBeLessThan(5100);
    expect(fake.requests.length).toBeLessThan(50);
    expect(fake.requests.some(q => q.some(c => c.type === "startAfter"))).toBe(true);
  });
  it("uses the injected owner database/session and rejects a replaced SDK owner even with the same UID", async () => {
    installActivityQueryFake();
    setCollectionDocs("activities", [ownerActivity("one", Date.UTC(2024, 5, 1))]);
    const services = { firestore: { isolated: true }, auth: { currentUser: { uid: "athlete" } } } as unknown as FirebaseServices;
    auth.currentUser = { uid: "unrelated-global-owner" } as never;
    const session = createYearReadSession("athlete", services);
    const firstCall = vi.mocked(collection).mock.calls.length;
    await expect(loadAthleteChartActivities("athlete", true, () => false, services, 2024, session)).resolves.toBeTruthy();
    expect(vi.mocked(collection).mock.calls.slice(firstCall).filter(args => args[1] === "activities").every(args => args[0] === services.firestore)).toBe(true);
    services.auth.currentUser = { uid: "athlete" } as never;
    await expect(loadAthleteChartActivities("athlete", true, () => false, services, 2024, session)).rejects.toThrow("session-changed");
  });
  it("rejects read failures instead of publishing partial chart data", async () => {
    installActivityQueryFake();
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("offline"));
    await expect(loadAthleteChartActivities("athlete", true, () => false)).rejects.toThrow("offline");
  });
  it("discards an obsolete owner read and does not start the next window", async () => {
    const fake = installActivityQueryFake(); let cancelled = false;
    const original = vi.mocked(getDocs).getMockImplementation()!;
    vi.mocked(getDocs).mockImplementationOnce((async q => { const result = await original(q); cancelled = true; return result; }) as never);
    expect(await loadAthleteChartActivities("athlete", true, () => cancelled)).toBeNull();
    expect(fake.requests).toHaveLength(1);
  });

});

it("월별 모든 지표는 같은 실주행 대표를 사용한다", () => {
  const start = new Date(2026, 8, 1, 12).getTime();
  const native = {...activity(start), id: "native", type: "Ride", source: "orider", summary: createMockSummary({distance: 1000, ridingTimeMillis: 3600000, tss: 100})};
  const imported = {...native, id: "imported", source: "strava", startTime: start + 30000};
  const laterStart = new Date(2026, 9, 1, 12).getTime();
  const later = {...native, id: "later", startTime: laterStart, endTime: laterStart + 3600000, summary: {} as typeof native.summary};
  const rows = aggregateMonthlyActivities([native, imported, later], new Date(2026, 9, 2));
  expect(rows[0]).toMatchObject({week: "2026.09", rides: 1, distance: 1, tss: 100, tssEstimated: false});
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

it("이미 선택한 대표의 부하는 중복 그룹 계산 없이 직접 합산한다", () => {
  const row = activity(new Date(2026, 8, 2).getTime());
  row.summary.tss = 60;
  const input = [row, {...row, id: "already-selected-second", summary: {...row.summary, tss: 10}}] as Activity[];
  // 호출자가 대표 배열을 넘기면 같은 시각의 두 행도 재판정하지 않는다.
  const rows = aggregateMonthlyActivities(input, new Date(2026, 8, 2), true);
  expect(rows[0].rides).toBe(2);
  expect(rows[0].tss).toBe((row.summary.tss ?? 0) + 10);
});

it("거리 통계에서 제외한 Health도 확정 훈련 부하에는 남긴다", () => {
  const start = new Date(2026, 8, 2).getTime();
  const health = {...activity(start), source: "apple_health", statsCountable: false, summary: {...activity(start).summary, distance: 10000, tss: 30}} as Activity;
  expect(aggregateMonthlyActivities([health], new Date(2026, 8, 2))[0]).toMatchObject({rides: 0, distance: 0, tss: 30});
});

it("does not manufacture 1970 or upload-month statistics for undated public records", () => {
 const undated={...activity(0),createdAt:Date.UTC(2026,0,1),discoveryFacts:{}};
 expect(aggregateMonthlyActivities([undated],new Date(2026,0,1),true)).toEqual([]);
});
