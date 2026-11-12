import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocs, query } from "firebase/firestore";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { computeYearRecap } from "../utils/yearRecap";
import { localYearBounds, readRecapYears, readYearActivities, readLifetimeActivities } from "./yearActivitiesRead";
import type { Activity } from "@shared/types";

type Constraint = { type: string; args: unknown[] };
let records: Activity[];
let calls: Constraint[][];
let returned: number;
function field(row: Activity, path: string): unknown {
  if (path === "__name__") return row.id;
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], row);
}
function doc(row: Activity) { return { id: row.id, data: () => row }; }
function ride(id: string, startTime: number, extra: Partial<Activity> = {}) {
  return createMockActivity({ id, userId: "owner", type: "Ride", startTime, endTime: startTime + 3600000,
    deletedAt: null, summary: createMockSummary({ distance: 1000, movingTimeMillis: 3600000 }), ...extra });
}
beforeEach(() => {
  records = [];
  calls = [];
  returned = 0;
  vi.mocked(query).mockImplementation(((ref: unknown, ...constraints: Constraint[]) => ({ ref, constraints })) as never);
  vi.mocked(getDocs).mockImplementation((async (q: { constraints: Constraint[] }) => {
    calls.push(q.constraints);
    let result = [...records];
    for (const { type, args } of q.constraints) {
      if (type !== "where") continue;
      const [key, op, value] = args as [string, string, never];
      result = result.filter((row) => {
        const actual = field(row, key) as never;
        if (op === "==") return actual === value;
        if (op === "in") return (value as unknown[]).includes(actual);
        if (actual == null) return false;
        if (op === ">=") return actual >= value;
        if (op === ">") return actual > value;
        if (op === "<") return actual < value;
        throw new Error(`Unhandled ${op}`);
      });
    }
    const order = q.constraints.filter((c) => c.type === "orderBy");
    result = result.filter((row) => order.every((c) => field(row, c.args[0] as string) !== undefined));
    result.sort((a, b) => {
      for (const c of order) {
        const av = field(a, c.args[0] as string) as number;
        const bv = field(b, c.args[0] as string) as number;
        if (av !== bv) return (av < bv ? -1 : 1) * (c.args[1] === "desc" ? -1 : 1);
      }
      return 0;
    });
    const cursor = q.constraints.find((c) => c.type === "startAfter")?.args[0] as { id: string } | undefined;
    if (cursor) result = result.slice(result.findIndex((row) => row.id === cursor.id) + 1);
    const count = q.constraints.find((c) => c.type === "limit")!.args[0] as number;
    result = result.slice(0, count);
    returned += result.length;
    return { docs: result.map(doc) };
  }) as never);
});

describe("bounded year reads", () => {
  it("uses local Jan 1 bounds and stable snapshot cursors even for equal timestamps", async () => {
    const { start, end } = localYearBounds(2025);
    expect(start).toBe(new Date(2025, 0, 1).getTime());
    expect(end).toBe(new Date(2026, 0, 1).getTime());
    records = [ride("before", start - 1, { endTime: start }), ride("a", start), ride("b", start), ride("last", end - 1), ride("after", end)];
    const result = await readYearActivities("owner", 2025, () => false, { documents: 100, requests: 100, pageSize: 2 });
    expect(result.map((a) => a.id)).toEqual(expect.arrayContaining(["a", "b", "last"]));
    expect(calls[0]).toEqual(expect.arrayContaining([
      { type: "where", args: ["startTime", ">=", start] }, { type: "where", args: ["startTime", "<", end] },
      { type: "orderBy", args: ["__name__", "asc"] },
    ]));
    expect(calls[1]).toContainEqual({ type: "startAfter", args: [expect.objectContaining({ id: "b" })] });
    expect(computeYearRecap(result, 2025)).toEqual(computeYearRecap(records, 2025));
  });

  it("uses only two point queries to derive a calendar including empty intermediate years", async () => {
    records = [ride("first", new Date(2020, 6, 1).getTime()), ride("last", new Date(2025, 6, 1).getTime())];
    expect(await readRecapYears("owner", () => false)).toEqual([2025, 2024, 2023, 2022, 2021, 2020]);
    expect(calls).toHaveLength(2);
    expect(returned).toBe(2);
    expect(calls.every((c) => c.some((x) => x.type === "limit" && x.args[0] === 1))).toBe(true);
  });

  it("never presents an exact budget-sized page as complete without EOF verification", async () => {
    records = [ride("a", new Date(2025, 2, 1).getTime()), ride("b", new Date(2025, 3, 1).getTime())];
    await expect(readYearActivities("owner", 2025, () => false, { documents: 2, requests: 20, pageSize: 2 })).rejects.toThrow("budget-exceeded");
    expect(returned).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it("enforces the shared request budget across empty pages and duration/boundary lookups", async () => {
    records = [ride("a", new Date(2025, 2, 1).getTime())];
    await expect(readYearActivities("owner", 2025, () => false, { documents: 100, requests: 2, pageSize: 2 })).rejects.toThrow("budget-exceeded");
    expect(calls).toHaveLength(2);
  });

  it("keeps long cross-New-Year overlap and remote explicit identity winners before filtering the year", async () => {
    const { start, end } = localYearBounds(2025);
    records = [
      ride("long-strava", start - 10 * 86400000, { source: "strava", endTime: start + 10 * 86400000 }),
      ride("native", start + 3600000, { source: "orider" }),
      ride("native-linked", end - 86400000, { source: "orider", stravaTwinActivityId: 123 }),
      ride("strava-linked", end + 3 * 86400000, { source: "strava", stravaActivityId: 123 }),
    ];
    const loaded = await readYearActivities("owner", 2025, () => false);
    expect(loaded.map((a) => a.id)).toEqual(expect.arrayContaining(["long-strava", "strava-linked"]));
    expect(computeYearRecap(loaded, 2025)).toEqual(computeYearRecap(records, 2025));
    expect(computeYearRecap(loaded, 2025).totalCount).toBe(0);
  });

  it("proves fallback-duration coverage instead of assuming one day of padding", async () => {
    const { start } = localYearBounds(2025);
    records = [
      ride("long-fallback", start - 5 * 86400000, { source: "strava", endTime: undefined, summary: createMockSummary({ movingTimeMillis: 10 * 86400000, distance: 5000 }) }),
      ride("native", start + 3600000, { source: "orider" }),
    ];
    const loaded = await readYearActivities("owner", 2025, () => false);
    expect(loaded.map((a) => a.id)).toContain("long-fallback");
    expect(computeYearRecap(loaded, 2025)).toEqual(computeYearRecap(records, 2025));
  });

  it("stops after cancellation and treats query errors as failure", async () => {
    await expect(readYearActivities("owner", 2025, () => true)).rejects.toThrow("cancelled");
    expect(calls).toHaveLength(0);
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("missing-index"));
    await expect(readYearActivities("owner", 2025, () => false)).rejects.toThrow("missing-index");
  });

  it("batches identity lookups so ordinary yearly histories do not exhaust the request budget", async () => {
    records = Array.from({ length: 300 }, (_, index) => ride(`ride-${index}`, new Date(2025, 0, 1).getTime() + index * 86400000, { stravaActivityId: index + 1 }));
    const loaded = await readYearActivities("owner", 2025, () => false);
    expect(loaded).toHaveLength(300);
    expect(calls.length).toBeLessThan(60);
    const identities = calls.flat().filter((c) => c.type === "where" && c.args[1] === "in");
    expect(identities.length).toBe(40);
    expect(identities.every((c) => (c.args[2] as unknown[]).length <= 30)).toBe(true);
  });

  it("finishes a 5000-record year without refetching that year through identities, preserving a remote winner", async () => {
    const start = new Date(2025, 0, 1).getTime();
    records = Array.from({ length: 5000 }, (_, index) => ride(`ride-${index}`, start + index * 3600000, {
      source: "orider", stravaTwinActivityId: index + 1,
      summary: createMockSummary({ distance: 1000, movingTimeMillis: 60000 }), endTime: start + index * 3600000 + 60000,
    }));
    records.push(ride("remote-winner", new Date(2026, 1, 1).getTime(), { source: "strava", stravaActivityId: 1 }));
    const loaded = await readYearActivities("owner", 2025, () => false);
    expect(loaded.map((a) => a.id)).toContain("remote-winner");
    expect(loaded).toHaveLength(5001);
    expect(returned).toBeLessThan(5020);
    expect(calls.length).toBeLessThan(750);
  });

  it("does not return a partial lifetime record set when its hard budget is reached", async () => {
    records = [ride("a", 1000), ride("b", 2000), ride("c", 3000)];
    await expect(readLifetimeActivities("owner", () => false, { documents: 2, requests: 20, pageSize: 2 })).rejects.toThrow("budget-exceeded");
    expect(returned).toBe(2);
  });
});
