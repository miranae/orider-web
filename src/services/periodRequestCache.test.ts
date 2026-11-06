import { describe, expect, it, vi } from "vitest";
import { cachedPeriodRequest, PERIOD_REQUEST_CACHE_TTL_MS, PERIOD_REQUEST_TODAY_TTL_MS } from "./periodRequestCache";

const NOON = Date.parse("2026-11-06T12:00:00+09:00");
const PAST = { periods: [{ fromInclusive: Date.parse("2026-10-07T00:00:00+09:00"), toExclusive: Date.parse("2026-11-06T00:00:00+09:00") }] };
const TODAY = { periods: [{ fromInclusive: Date.parse("2026-11-01T00:00:00+09:00"), toExclusive: NOON }] };
const call = (load: () => Promise<string>, now: number, extra: Partial<{ uid: string; scope: string; request: typeof PAST }> = {}) =>
  cachedPeriodRequest({ scope: extra.scope ?? "prod", name: "power", uid: extra.uid ?? "uid", request: extra.request ?? PAST, load, validate: value => value as string, now });

describe("period request cache", () => {
  it("reuses the same user's identical request, including one still in flight", async () => {
    const load = vi.fn(async () => "first");
    const a = call(load, NOON), b = call(load, NOON + 1000);
    expect(await a).toBe("first"); expect(await b).toBe("first");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("asks the server again only after the KST date changes or the entry expires", async () => {
    const load = vi.fn(async () => "value");
    await call(load, NOON);
    await call(load, NOON + PERIOD_REQUEST_CACHE_TTL_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await call(load, NOON + PERIOD_REQUEST_CACHE_TTL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    await call(load, Date.parse("2026-11-07T00:00:01+09:00"));
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("keeps a period that includes today only briefly", async () => {
    const load = vi.fn(async () => "value");
    await call(load, NOON, { request: TODAY });
    await call(load, NOON + PERIOD_REQUEST_TODAY_TTL_MS - 1, { request: TODAY });
    await call(load, NOON + PERIOD_REQUEST_TODAY_TTL_MS, { request: TODAY });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("separates users and projects", async () => {
    const load = vi.fn(async () => "value");
    await call(load, NOON); await call(load, NOON, { uid: "other" }); await call(load, NOON, { scope: "stage" });
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("does not keep a failed request so a retry calls the server again", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("resource-exhausted")).mockResolvedValueOnce("ok");
    await expect(call(load, NOON)).rejects.toThrow("resource-exhausted");
    await expect(call(load, NOON + 1)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
