import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAppCheckReady } from "./firebase";
import { setCallableImplementation } from "../__tests__/mocks/firebase";
import {
  callTodaysNarrative,
  clearTodaysNarrativeRequestState,
  NarrativeRequestError,
} from "./todaysNarrativeClient";

const ensureReadyMock = vi.mocked(ensureAppCheckReady);

describe("todaysNarrativeClient", () => {
  beforeEach(() => {
    vi.useRealTimers();
    ensureReadyMock.mockReset().mockResolvedValue(undefined);
    clearTodaysNarrativeRequestState("test:");
  });

  it("shares one callable for concurrent requests with the same semantic key", async () => {
    let resolveRequest!: (value: unknown) => void;
    let calls = 0;
    setCallableImplementation("getTodaysRecommendationNarrative", () => {
      calls++;
      return new Promise((resolve) => { resolveRequest = resolve; });
    });

    const first = callTodaysNarrative<{ cacheOnly: boolean }, { hit: boolean }>({
      requestKey: "test:shared",
      payload: { cacheOnly: true },
    });
    const second = callTodaysNarrative<{ cacheOnly: boolean }, { hit: boolean }>({
      requestKey: "test:shared",
      payload: { cacheOnly: true },
    });

    await vi.waitFor(() => expect(calls).toBe(1));
    resolveRequest({ data: { hit: true } });
    await expect(Promise.all([first, second])).resolves.toEqual([{ hit: true }, { hit: true }]);
    expect(ensureReadyMock).toHaveBeenCalledTimes(1);
  });

  it("force-refreshes App Check once and never exceeds two attempts", async () => {
    vi.useFakeTimers();
    ensureReadyMock
      .mockRejectedValueOnce({ code: "app-check/throttled" })
      .mockResolvedValueOnce(undefined);
    let callableCalls = 0;
    setCallableImplementation("getTodaysRecommendationNarrative", () => {
      callableCalls++;
      return { data: { hit: true } };
    });

    const request = callTodaysNarrative<{}, { hit: boolean }>({
      requestKey: "test:refresh",
      payload: {},
    });
    await vi.advanceTimersByTimeAsync(750);

    await expect(request).resolves.toEqual({ hit: true });
    expect(ensureReadyMock.mock.calls).toEqual([[false], [true]]);
    expect(callableCalls).toBe(1);
    vi.useRealTimers();
  });

  it("retries an unauthenticated callable only once after force refresh", async () => {
    vi.useFakeTimers();
    let callableCalls = 0;
    setCallableImplementation("getTodaysRecommendationNarrative", () => {
      callableCalls++;
      if (callableCalls === 1) return Promise.reject({ code: "functions/unauthenticated" });
      return { data: { hit: true } };
    });

    const request = callTodaysNarrative<{}, { hit: boolean }>({
      requestKey: "test:callable-401",
      payload: {},
    });
    await vi.advanceTimersByTimeAsync(750);

    await expect(request).resolves.toEqual({ hit: true });
    expect(ensureReadyMock.mock.calls).toEqual([[false], [true]]);
    expect(callableCalls).toBe(2);
    vi.useRealTimers();
  });

  it("cools down a failed key instead of starting another automatic request", async () => {
    let callableCalls = 0;
    setCallableImplementation("getTodaysRecommendationNarrative", () => {
      callableCalls++;
      return Promise.reject({ code: "functions/internal" });
    });

    await expect(callTodaysNarrative({
      requestKey: "test:cooldown",
      payload: {},
    })).rejects.toMatchObject({ kind: "request" });

    await expect(callTodaysNarrative({
      requestKey: "test:cooldown",
      payload: {},
    })).rejects.toBeInstanceOf(NarrativeRequestError);
    expect(callableCalls).toBe(1);
  });
});
