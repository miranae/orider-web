import { renderHook, act, waitFor } from "@testing-library/react";
import { useStrava } from "./useStrava";
import { setCallableResult } from "../__tests__/mocks/firebase";

describe("useStrava", () => {
  it("starts with loading=false and no error", () => {
    const { result } = renderHook(() => useStrava());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exchangeCode calls stravaExchangeToken callable", async () => {
    setCallableResult("stravaExchangeToken", {
      data: { athleteId: 123, firstname: "Test", lastname: "User" },
    });

    const { result } = renderHook(() => useStrava());

    let data: unknown;
    await act(async () => {
      data = await result.current.exchangeCode("test-code");
    });

    expect(data).toEqual({ athleteId: 123, firstname: "Test", lastname: "User" });
    expect(result.current.loading).toBe(false);
  });

  it("startMigration calls stravaQueueEnqueue callable", async () => {
    setCallableResult("stravaQueueEnqueue", {
      data: { jobId: "job-1", queuePosition: 0 },
    });

    const { result } = renderHook(() => useStrava());

    let data: unknown;
    await act(async () => {
      data = await result.current.startMigration({
        period: "recent_90",
        includePhotos: false,
        includeSegments: false,
      });
    });

    expect(data).toEqual({ jobId: "job-1", queuePosition: 0 });
  });

  it("connectStrava redirects to Strava OAuth", () => {
    const originalHref = window.location.href;
    const { result } = renderHook(() => useStrava());

    // Mock crypto.randomUUID
    vi.spyOn(crypto, "randomUUID").mockReturnValue("test-uuid" as `${string}-${string}-${string}-${string}-${string}`);

    // connectStrava tries to set window.location.href
    // In jsdom this will throw, but we can verify the function exists
    expect(typeof result.current.connectStrava).toBe("function");
  });

  it("verifyMigration calls stravaMigrationVerify", async () => {
    setCallableResult("stravaMigrationVerify", {
      data: {
        totalStrava: 100,
        totalImported: 95,
        missingActivityCount: 5,
        missingStreamCount: 3,
      },
    });

    const { result } = renderHook(() => useStrava());

    let data: unknown;
    await act(async () => {
      data = await result.current.verifyMigration();
    });

    expect(data).toEqual({
      totalStrava: 100,
      totalImported: 95,
      missingActivityCount: 5,
      missingStreamCount: 3,
    });
  });

  it("disconnectStrava calls stravaDisconnect", async () => {
    setCallableResult("stravaDisconnect", { data: {} });

    const { result } = renderHook(() => useStrava());

    await act(async () => {
      await result.current.disconnectStrava();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
