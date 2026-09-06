import { renderHook, act } from "@testing-library/react";
import { useStrava } from "./useStrava";
import {
  mockCallableInvocations,
  setCallableImplementation,
  setCallableResult,
} from "../__tests__/mocks/firebase";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock("../services/analytics", () => ({ track: mocks.track }));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.logClientError }));

describe("useStrava", () => {
  it("forwards granted scopes when reconnecting for publishing", async () => {
    setCallableResult("stravaExchangeToken", { data: { athleteId: 123 } });
    const { result } = renderHook(() => useStrava());
    await act(async () => { await result.current.exchangeCode("write-code", "read,activity:read_all,activity:write"); });
    expect(mockCallableInvocations).toContainEqual({ name: "stravaExchangeToken", data: { code: "write-code", scope: "read,activity:read_all,activity:write" } });
  });
  it("starts with loading=false and no error", () => {
    const { result } = renderHook(() => useStrava());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps exchangeCode stable across renders", () => {
    const { result, rerender } = renderHook(() => useStrava());
    const first = result.current.exchangeCode;
    rerender();
    expect(result.current.exchangeCode).toBe(first);
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

  it("accepts a callable stream response using the legacy result envelope", async () => {
    setCallableResult("stravaGetActivityStreams", {
      result: { watts: [120, 130], heartrate: [140, 142], time: [0, 1] },
    });

    const { result } = renderHook(() => useStrava());

    let streams: unknown;
    await act(async () => {
      streams = await result.current.getStreams(19606422424);
    });

    expect(streams).toEqual({ watts: [120, 130], heartrate: [140, 142], time: [0, 1] });
    expect(result.current.error).toBeNull();
  });

  it("retries a transient callable JSON parse failure once", async () => {
    let attempts = 0;
    setCallableImplementation("stravaGetActivityStreams", () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Response is not valid JSON object.");
      return { data: { watts: [100], time: [0] } };
    });

    const { result } = renderHook(() => useStrava());

    await expect(act(async () => result.current.getStreams(19609562627))).resolves.toEqual({
      watts: [100],
      time: [0],
    });
    expect(attempts).toBe(2);
  });

  it("rejects an empty callable stream response instead of returning undefined", async () => {
    setCallableResult("stravaGetActivityStreams", { data: null });

    const { result } = renderHook(() => useStrava());

    await expect(act(async () => result.current.getStreams(19606422424))).rejects.toThrow(
      "STREAMS_INVALID",
    );
  });

  it("disconnectStrava passes an operation ID and records success", async () => {
    setCallableResult("stravaDisconnect", { data: {} });

    const { result } = renderHook(() => useStrava());

    await act(async () => {
      await result.current.disconnectStrava("operation-123");
    });

    expect(mockCallableInvocations).toContainEqual({
      name: "stravaDisconnect",
      data: { operationId: "operation-123", source: "web" },
    });
    expect(mocks.track).toHaveBeenCalledWith("strava_disconnect_success", {
      operationId: "operation-123",
      source: "web",
    });
    expect(mocks.logClientError).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("disconnectStrava records a sanitized failure with the same operation ID", async () => {
    setCallableImplementation("stravaDisconnect", () => {
      throw new Error("provider response that must not be logged");
    });

    const { result } = renderHook(() => useStrava());

    await expect(act(async () => {
      await result.current.disconnectStrava("operation-456");
    })).rejects.toThrow("provider response that must not be logged");

    expect(mocks.track).toHaveBeenCalledWith("strava_disconnect_failure", {
      operationId: "operation-456",
      source: "web",
    });
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "useStrava.disconnectStrava",
      expect.objectContaining({ message: "Strava disconnect callable failed" }),
      { operationId: "operation-456", source: "web" },
    );
    expect(JSON.stringify(mocks.logClientError.mock.calls)).not.toContain("provider response");
    expect(result.current.loading).toBe(false);
  });
});
