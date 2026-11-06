import { describe, expect, it, vi } from "vitest";
import { cachedPeriodRequest, PERIOD_REQUEST_CACHE_TTL_MS } from "./periodRequestCache";

describe("period request cache", () => {
  it("reuses the same user's identical request, including one still in flight", async () => {
    const scope = {}, load = vi.fn(async () => "first");
    const a = cachedPeriodRequest(scope, "power", "uid", { periods: [1] }, load, 0);
    const b = cachedPeriodRequest(scope, "power", "uid", { periods: [1] }, load, 1000);
    expect(await a).toBe("first"); expect(await b).toBe("first");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("calls again for a different user, request, service scope or after the TTL", async () => {
    const scope = {}, load = vi.fn(async () => "value");
    await cachedPeriodRequest(scope, "power", "uid", { periods: [1] }, load, 0);
    await cachedPeriodRequest(scope, "power", "other", { periods: [1] }, load, 0);
    await cachedPeriodRequest(scope, "power", "uid", { periods: [2] }, load, 0);
    await cachedPeriodRequest({}, "power", "uid", { periods: [1] }, load, 0);
    await cachedPeriodRequest(scope, "power", "uid", { periods: [1] }, load, PERIOD_REQUEST_CACHE_TTL_MS);
    expect(load).toHaveBeenCalledTimes(5);
  });
  it("does not keep a failed request so a retry calls the server again", async () => {
    const scope = {}, load = vi.fn().mockRejectedValueOnce(new Error("resource-exhausted")).mockResolvedValueOnce("ok");
    await expect(cachedPeriodRequest(scope, "power", "uid", { periods: [1] }, load, 0)).rejects.toThrow("resource-exhausted");
    await expect(cachedPeriodRequest(scope, "power", "uid", { periods: [1] }, load, 1)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
