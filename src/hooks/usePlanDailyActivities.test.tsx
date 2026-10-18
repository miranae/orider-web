import { act, renderHook, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import * as runtimeConfig from "../services/runtimeConfig";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { mockCallableInvocations, setCallableImplementation, setDocData } from "../__tests__/mocks/firebase";
import * as errorLogger from "../services/errorLogger";
import {
  __resetDailyActivitiesEnsureForTests,
  ensurableMonthsInAnyTimeZone,
  dailyActivitiesUnavailable,
  ensurableMonths,
  readEnsureResponse,
  parseDailyActivityDays,
  planActualProgressPct,
  planActivityMonths,
  sumDailyTss,
  sumDailyTssInRange,
  usePlanDailyActivities,
} from "./usePlanDailyActivities";

const NOW = Date.parse("2026-10-17T12:00:00+09:00");
const kst = (key: string) => Date.parse(`${key}T00:00:00+09:00`);
const planDay = (key: string, workout = "z2") => ({ date: kst(key), dayOfWeek: 0, workout, plannedTSS: 50, plannedDurationMin: 60, completed: false, skipped: false });
const weeks = [
  { id: "w1", weekNumber: 1, phase: "base", startDate: kst("2026-09-28"), plannedTSS: 100, days: [planDay("2026-09-28"), planDay("2026-09-30", "rest")] },
  { id: "w2", weekNumber: 2, phase: "base", startDate: kst("2026-10-12"), plannedTSS: 100, days: [planDay("2026-10-12"), planDay("2026-10-17"), planDay("2026-10-20")] },
] as unknown as PlanWeek[];

const ride = (id: string, tss: number | null, extra = {}) => ({ id, startTime: kst("2026-09-28") + 7 * 3600000, distance: 30000, movingSec: 3600, tss, estimated: false, source: "orider", ...extra });
const monthDoc = (month: string, days: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  uid: "me", discipline: "bike", month, timezone: "Asia/Seoul", schemaVersion: 1, ftp: 250, complete: true, updatedAt: 1, days, dayAsOf: {}, ...extra,
});
const path = (month: string, discipline = "bike") => `users/me/daily_activities/${discipline}_${month}`;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  __resetDailyActivitiesEnsureForTests();
  vi.mocked(onSnapshot).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("daily activity document helpers", () => {
  it("reads server days as-is and drops malformed entries without filling values", () => {
    const days = parseDailyActivityDays({
      "2026-10-01": { tss: 40, tssEstimated: true, activities: [ride("a", 40, { estimated: true }), { id: "" }, null] },
      "2026-10-02": { tss: null, activities: [ride("b", null, { distance: null })] },
      "not-a-date": { tss: 1, activities: [] },
    });
    expect([...days.keys()]).toEqual(["2026-10-01", "2026-10-02"]);
    expect(days.get("2026-10-01")).toEqual({ tss: 40, tssEstimated: true, activities: [expect.objectContaining({ id: "a", tss: 40, estimated: true })] });
    expect(days.get("2026-10-02")?.activities[0]).toMatchObject({ id: "b", tss: null, distance: null });
  });

  it("covers the plan months through today within the server window and lists older ones as uncovered", () => {
    expect(planActivityMonths(weeks, "2026-10-17")).toEqual({ months: ["2026-09", "2026-10"], uncovered: [] });
    expect(planActivityMonths(weeks, "2026-09-01")).toEqual({ months: [], uncovered: [] });
    const long = [{ ...weeks[0], days: [planDay("2025-08-04"), planDay("2026-10-20")] }] as unknown as PlanWeek[];
    const { months, uncovered } = planActivityMonths(long, "2026-10-17");
    expect(months).toHaveLength(13);
    expect(months[0]).toBe("2025-10");
    expect(months[12]).toBe("2026-10");
    expect(uncovered).toEqual(["2025-08", "2025-09"]);
  });

  it("sums server day TSS, keeps estimates visible and leaves unknown load empty", () => {
    const days = parseDailyActivityDays({
      "2026-10-01": { tss: 40.4, tssEstimated: false, activities: [ride("a", 40.4)] },
      "2026-10-02": { tss: 20, tssEstimated: true, activities: [ride("b", 20, { estimated: true })] },
      "2026-10-03": { tss: null, tssEstimated: false, activities: [ride("c", null)] },
    });
    expect(sumDailyTss(days, ["2026-10-01", "2026-10-02", "2026-10-03"])).toEqual({ value: 60, estimated: true });
    expect(sumDailyTss(days, ["2026-10-03"])).toEqual({ value: null, estimated: false });
    // TSS 를 모르는 활동일이 빠진 합계는 추정으로 표시한다.
    expect(sumDailyTss(days, ["2026-10-01", "2026-10-03"])).toEqual({ value: 40, estimated: true });
    expect(sumDailyTss(days, ["2026-10-04"])).toEqual({ value: 0, estimated: false });
    expect(sumDailyTssInRange(days, "2026-10-02", "2026-10-31")).toEqual({ value: 20, estimated: true });
  });
});

describe("ensure request helpers", () => {
  it("keeps only months the server accepts: [this month-12, this month] in the user's time zone", () => {
    expect(ensurableMonths(["2025-09", "2025-10", "2026-10", "2026-11"], "2026-10-31")).toEqual(["2025-10", "2026-10"]);
    expect(ensurableMonths(["2025-12", "2026-01"], "2026-01-01")).toEqual(["2025-12", "2026-01"]);
  });

  it("reads the time zone and basis_changed months from the response", () => {
    expect(readEnsureResponse({ timezone: "Asia/Seoul", months: [{ month: "2026-09", status: "built" }, { month: "2026-10", status: "basis_changed" }, { status: "basis_changed" }] }))
      .toEqual({ timezone: "Asia/Seoul", basisChanged: ["2026-10"] });
    expect(readEnsureResponse(null)).toEqual({ timezone: null, basisChanged: [] });
  });

  it("keeps only months valid in every time zone for the narrowed retry", () => {
    // 2026-11-01 03:00 KST: UTC-12 은 아직 10월, UTC+14 는 11월
    expect(ensurableMonthsInAnyTimeZone(["2025-10", "2025-11", "2026-10", "2026-11"], Date.parse("2026-11-01T03:00:00+09:00"))).toEqual(["2025-11", "2026-10"]);
  });
});

describe("usePlanDailyActivities", () => {
  it("subscribes to the plan months of its discipline only and totals the plan range through today", async () => {
    setDocData(path("2026-09"), monthDoc("2026-09", {
      "2026-09-01": { tss: 99, tssEstimated: false, activities: [ride("before-plan", 99)] },
      "2026-09-30": { tss: 70, tssEstimated: false, activities: [ride("rest-day-ride", 70)] },
    }));
    setDocData(path("2026-10"), monthDoc("2026-10", {
      "2026-10-12": { tss: 30, tssEstimated: true, activities: [ride("est", 30, { estimated: true })] },
      "2026-10-18": { tss: 500, tssEstimated: false, activities: [ride("tomorrow", 500)] },
    }));
    setDocData(path("2026-10", "run"), monthDoc("2026-10", { "2026-10-12": { tss: 80, tssEstimated: false, activities: [ride("run", 80)] } }, { discipline: "run" }));
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(result.current?.days.get("2026-09-30")?.activities.map(a => a.id)).toEqual(["rest-day-ride"]);
    expect(result.current?.days.get("2026-10-12")?.activities.map(a => a.id)).toEqual(["est"]);
    // 계획 첫날 이전·오늘 이후는 상단 합계에서 빠진다.
    expect(result.current?.total).toEqual({ value: 100, estimated: true });
    expect(result.current?.timezone).toBe("Asia/Seoul");
    expect(mockCallableInvocations).toHaveLength(0);
    const paths = vi.mocked(onSnapshot).mock.calls.map(([ref]) => (ref as { path: string }).path);
    expect(paths).toEqual([path("2026-09"), path("2026-10")]);
  });

  it("builds missing, incomplete or outdated months once per session and then reads again", async () => {
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false }));
    setCallableImplementation("ensureDailyActivities", async () => {
      setDocData(path("2026-09"), monthDoc("2026-09", { "2026-09-28": { tss: 55, tssEstimated: false, activities: [ride("built", 55)] } }));
      setDocData(path("2026-10"), monthDoc("2026-10", {}));
      return { data: { timezone: "Asia/Seoul", months: [{ month: "2026-09", status: "built" }, { month: "2026-10", status: "built" }] } };
    });
    const first = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    expect(first.result.current?.loading).toBe(true);
    await waitFor(() => expect(first.result.current?.loading).toBe(false));
    expect(mockCallableInvocations).toEqual([{ name: "ensureDailyActivities", data: { discipline: "bike", months: ["2026-09", "2026-10"] } }]);
    expect(first.result.current?.days.get("2026-09-28")?.activities[0]?.id).toBe("built");
    expect(first.result.current?.total).toEqual({ value: 55, estimated: false });
    first.unmount();

    // 같은 세션에서 다시 열어도 완성 문서면 부르지 않는다.
    const second = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(second.result.current?.loading).toBe(false));
    expect(mockCallableInvocations).toHaveLength(1);
  });

  it("does not repeat ensure while a month stays incomplete after a successful request", async () => {
    setDocData(path("2026-09"), monthDoc("2026-09", {}));
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false }));
    setCallableImplementation("ensureDailyActivities", async () => ({ data: { months: [{ month: "2026-10", status: "current" }] } }));
    const first = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(first.result.current?.loading).toBe(false));
    act(() => setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false, updatedAt: 2 })));
    first.unmount();
    const second = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(second.result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities")).toHaveLength(1);
  });

  it("asks again when the server later invalidates a month that was complete", async () => {
    setDocData(path("2026-09"), monthDoc("2026-09", {}));
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false }));
    setCallableImplementation("ensureDailyActivities", async () => {
      setDocData(path("2026-10"), monthDoc("2026-10", {}));
      return { data: { months: [{ month: "2026-10", status: "built" }] } };
    });
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities")).toHaveLength(1));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    // FTP 변경 등으로 서버가 complete:false 로 내리면 다시 만든다(한 번만).
    act(() => setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false, updatedAt: 3 })));
    await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities")).toHaveLength(2));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities")).toHaveLength(2);
  });

  it("clears a failure once a complete document arrives", async () => {
    vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    setDocData(path("2026-09"), monthDoc("2026-09", {}));
    setCallableImplementation("ensureDailyActivities", async () => { throw new Error("internal"); });
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.failedMonths.has("2026-10")).toBe(true));
    act(() => setDocData(path("2026-10"), monthDoc("2026-10", { "2026-10-12": { tss: 30, tssEstimated: false, activities: [ride("late", 30)] } })));
    await waitFor(() => expect(result.current?.failedMonths.size).toBe(0));
    expect(result.current?.total).toEqual({ value: 30, estimated: false });
  });

  it("builds from a cached incomplete document once and never stays loading", async () => {
    setDocData(path("2026-09"), monthDoc("2026-09", {}));
    const original = vi.mocked(onSnapshot).getMockImplementation()!;
    vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, next: (snap: unknown) => void) => {
      if (ref.path !== path("2026-10")) return (original as (...a: unknown[]) => () => void)(ref, next);
      // 영속 캐시의 미완성 문서. 서버 데이터가 같으면 추가 이벤트가 오지 않는다.
      next({ exists: () => true, data: () => monthDoc("2026-10", {}, { complete: false }), metadata: { fromCache: true, hasPendingWrites: false } });
      return () => undefined;
    }) as unknown as typeof onSnapshot);
    setCallableImplementation("ensureDailyActivities", async () => ({ data: { months: [{ month: "2026-10", status: "current" }] } }));
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => call.data)).toEqual([{ discipline: "bike", months: ["2026-10"] }]);
    vi.mocked(onSnapshot).mockImplementation(original);
  });

  it("extends the subscription to the user's month when their time zone is already past KST", async () => {
    // 2026-10-31 22:30 KST = 2026-11-01 03:30 (Pacific/Kiritimati, UTC+14)
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-31T22:30:00+09:00"));
    const crossing = [{ ...weeks[1], days: [planDay("2026-10-26"), planDay("2026-11-03")] }] as unknown as PlanWeek[];
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { timezone: "Pacific/Kiritimati" }));
    setCallableImplementation("ensureDailyActivities", async () => ({ data: { months: [{ month: "2026-11", status: "built" }] } }));
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks: crossing, enabled: true }));
    await waitFor(() => expect(vi.mocked(onSnapshot).mock.calls.some(([ref]) => (ref as { path: string }).path === path("2026-11"))).toBe(true));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => call.data)).toEqual([{ discipline: "bike", months: ["2026-11"] }]);
    expect(result.current?.todayKey).toBe("2026-11-01");
  });

  it("splits ensure into calls of at most six months and marks months older than the window unavailable", async () => {
    const long = [{ ...weeks[0], days: [planDay("2025-08-04"), planDay("2026-10-20")] }] as unknown as PlanWeek[];
    setCallableImplementation("ensureDailyActivities", async () => ({ data: { months: [] } }));
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks: long, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    const calls = mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => (call.data as { months: string[] }).months);
    expect(calls.map(months => months.length)).toEqual([6, 6, 1]);
    expect(calls.flat()[0]).toBe("2025-10");
    expect(result.current?.failedMonths).toEqual(new Set(["2025-08", "2025-09"]));
    expect(dailyActivitiesUnavailable(result.current!, "2025-08-04")).toBe(true);
    expect(result.current?.total).toBeNull();
  });

  it("retries once with months valid in every time zone after invalid-argument", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-11-01T03:00:00+09:00"));
    const crossing = [{ ...weeks[1], days: [planDay("2026-10-26"), planDay("2026-11-01")] }] as unknown as PlanWeek[];
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false }));
    setCallableImplementation("ensureDailyActivities", async (data) => {
      if ((data as { months: string[] }).months.includes("2026-11")) throw Object.assign(new Error("bad month"), { code: "functions/invalid-argument" });
      return { data: { months: [{ month: "2026-10", status: "built" }] } };
    });
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks: crossing, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => call.data)).toEqual([
      { discipline: "bike", months: ["2026-10", "2026-11"] },
      { discipline: "bike", months: ["2026-10"] },
    ]);
    expect(result.current?.failedMonths.size).toBe(0);
  });

  it("calls ensure for an outdated schema even when the document says complete", async () => {
    setDocData(path("2026-09"), monthDoc("2026-09", {}));
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { schemaVersion: 2 }));
    setCallableImplementation("ensureDailyActivities", async () => ({ data: { months: [{ month: "2026-10", status: "built" }] } }));
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.map(call => call.data)).toEqual([{ discipline: "bike", months: ["2026-10"] }]);
  });

  it("marks a month unavailable and logs when the build request fails, keeping other months", async () => {
    const log = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    setDocData(path("2026-10"), monthDoc("2026-10", { "2026-10-12": { tss: 30, tssEstimated: false, activities: [ride("ok", 30)] } }));
    setCallableImplementation("ensureDailyActivities", async () => { throw new Error("internal"); });
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.failedMonths.has("2026-09")).toBe(true));
    expect(log).toHaveBeenCalledWith("PlanPage.ensureDailyActivities", expect.any(Error), { discipline: "bike", months: ["2026-09"] });
    const actual = result.current!;
    expect(actual.total).toBeNull();
    expect(dailyActivitiesUnavailable(actual, "2026-09-28")).toBe(true);
    expect(dailyActivitiesUnavailable(actual, "2026-10-12")).toBe(false);
    expect(actual.days.get("2026-10-12")?.activities[0]?.id).toBe("ok");
  });

  it("marks a month unavailable when the subscription fails", async () => {
    const log = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
    setDocData(path("2026-10"), monthDoc("2026-10", {}));
    vi.mocked(onSnapshot).mockImplementationOnce(((_ref: unknown, _next: unknown, onError: (error: Error) => void) => {
      onError(new Error("permission-denied"));
      return () => undefined;
    }) as unknown as typeof onSnapshot);
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.failedMonths.has("2026-09")).toBe(true));
    expect(log).toHaveBeenCalledWith("PlanPage.dailyActivities", expect.any(Error), { discipline: "bike", month: "2026-09" });
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it("does not subscribe while disabled and unsubscribes every month on unmount", async () => {
    const disabled = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: false }));
    expect(disabled.result.current).toBeNull();
    expect(onSnapshot).not.toHaveBeenCalled();

    setDocData(path("2026-09"), monthDoc("2026-09", {}));
    setDocData(path("2026-10"), monthDoc("2026-10", {}));
    const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
    const original = vi.mocked(onSnapshot).getMockImplementation()!;
    vi.mocked(onSnapshot).mockImplementation(((...args: Parameters<typeof onSnapshot>) => {
      const unsubscribe = vi.fn((original as (...a: unknown[]) => () => void)(...args));
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    }) as unknown as typeof onSnapshot);
    const view = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(view.result.current?.loading).toBe(false));
    expect(unsubscribes).toHaveLength(2);
    act(() => view.unmount());
    for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledOnce();
    vi.mocked(onSnapshot).mockImplementation(original);
  });

  it("calls the asia-northeast3 callable (the default instance on stage)", async () => {
    setDocData(path("2026-10"), monthDoc("2026-10", {}));
    vi.mocked(httpsCallable).mockClear();
    const first = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(first.result.current?.loading).toBe(false));
    expect(vi.mocked(httpsCallable).mock.calls.find(([, name]) => name === "ensureDailyActivities")?.[0]).toMatchObject({ region: "asia-northeast3" });
    first.unmount();

    __resetDailyActivitiesEnsureForTests();
    vi.mocked(httpsCallable).mockClear();
    const config = runtimeConfig.getRuntimeConfig();
    vi.spyOn(runtimeConfig, "getRuntimeConfig").mockReturnValue({ ...config, appEnvironment: "stage" });
    const second = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(second.result.current?.loading).toBe(false));
    expect(vi.mocked(httpsCallable).mock.calls.find(([, name]) => name === "ensureDailyActivities")?.[0]).not.toHaveProperty("region");
  });

  it("asks again for basis_changed months, at most twice per month", async () => {
    setCallableImplementation("ensureDailyActivities", async (data) => {
      const months = (data as { months: string[] }).months;
      return { data: { timezone: "Asia/Seoul", months: months.map(month => ({ month, status: month === "2026-10" ? "basis_changed" : "built" })) } };
    });
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => call.data)).toEqual([
      { discipline: "bike", months: ["2026-09", "2026-10"] },
      { discipline: "bike", months: ["2026-10"] },
    ]);
  });

  it("does not request months after the user's current month, even when KST is already there", async () => {
    // 2026-11-01 03:00 KST = 2026-10-31 (America/Los_Angeles)
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-11-01T03:00:00+09:00"));
    const crossing = [{ ...weeks[1], days: [planDay("2026-10-26"), planDay("2026-11-01")] }] as unknown as PlanWeek[];
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { complete: false, timezone: "America/Los_Angeles" }));
    const { result } = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks: crossing, enabled: true }));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => call.data)).toEqual([
      { discipline: "bike", months: ["2026-10"] },
    ]);
    expect(result.current?.failedMonths.size).toBe(0);
  });

  it("shares one ensure request between screens mounted in the same tick (plan + goal hub, StrictMode)", async () => {
    setCallableImplementation("ensureDailyActivities", async () => ({ data: { months: [] } }));
    const views = renderHook(() => [
      usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }),
      usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }),
    ]);
    await waitFor(() => expect(views.result.current.every(actual => actual?.loading === false)).toBe(true));
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities").map(call => call.data)).toEqual([
      { discipline: "bike", months: ["2026-09", "2026-10"] },
    ]);
  });

  it("computes the shared plan progress from actual load and plan TSS", () => {
    const actual = { total: { value: 45, estimated: false } } as Parameters<typeof planActualProgressPct>[1];
    expect(planActualProgressPct(180, actual)).toBe(25);
    expect(planActualProgressPct(0, actual)).toBeNull();
    expect(planActualProgressPct(180, { ...actual!, total: null })).toBeNull();
    expect(planActualProgressPct(180, null)).toBeNull();
  });
});
