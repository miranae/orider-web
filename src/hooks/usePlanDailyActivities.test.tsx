import { act, renderHook, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { mockCallableInvocations, setCallableImplementation, setDocData } from "../__tests__/mocks/firebase";
import * as errorLogger from "../services/errorLogger";
import {
  __resetDailyActivitiesEnsureForTests,
  dailyActivitiesUnavailable,
  parseDailyActivityDays,
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

  it("covers only the plan months through today and caps the subscription", () => {
    expect(planActivityMonths(weeks, "2026-10-17")).toEqual(["2026-09", "2026-10"]);
    expect(planActivityMonths(weeks, "2026-09-01")).toEqual([]);
    const long = [{ ...weeks[0], days: [planDay("2026-01-05"), planDay("2026-10-20")] }] as unknown as PlanWeek[];
    expect(planActivityMonths(long, "2026-10-17")).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("sums server day TSS, keeps estimates visible and leaves unknown load empty", () => {
    const days = parseDailyActivityDays({
      "2026-10-01": { tss: 40.4, tssEstimated: false, activities: [ride("a", 40.4)] },
      "2026-10-02": { tss: 20, tssEstimated: true, activities: [ride("b", 20, { estimated: true })] },
      "2026-10-03": { tss: null, tssEstimated: false, activities: [ride("c", null)] },
    });
    expect(sumDailyTss(days, ["2026-10-01", "2026-10-02", "2026-10-03"])).toEqual({ value: 60, estimated: true });
    expect(sumDailyTss(days, ["2026-10-03"])).toEqual({ value: null, estimated: false });
    expect(sumDailyTss(days, ["2026-10-04"])).toEqual({ value: 0, estimated: false });
    expect(sumDailyTssInRange(days, "2026-10-02", "2026-10-31")).toEqual({ value: 20, estimated: true });
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

    // 같은 세션에서 다시 열어도(문서가 여전히 미완성이어도) 같은 달은 다시 부르지 않는다.
    setDocData(path("2026-10"), monthDoc("2026-10", {}, { schemaVersion: 0 }));
    const second = renderHook(() => usePlanDailyActivities({ uid: "me", discipline: "bike", weeks, enabled: true }));
    await waitFor(() => expect(second.result.current?.loading).toBe(false));
    expect(mockCallableInvocations).toHaveLength(1);
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
});
