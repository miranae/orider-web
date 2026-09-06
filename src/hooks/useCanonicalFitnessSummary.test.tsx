import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), enabled: true }));
vi.mock("../services/canonicalApi", () => ({
  canonicalConsumersEnabled: () => mocks.enabled,
  fetchCanonicalFitnessSummary: mocks.fetch,
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
import { useCanonicalFitnessSummary } from "./useCanonicalFitnessSummary";

const data = { current: { totalCTL: 0 }, timeseries: { bike: null, run: null, swim: null },
  projections: { bike: null, run: null, swim: null }, summaries: { bike: null, run: null, swim: null } };

describe("canonical Fitness bundle", () => {
  beforeEach(() => { mocks.enabled = true; mocks.fetch.mockReset(); });

  it("keeps the rollout off without a request", () => {
    mocks.enabled = false;
    expect(renderHook(() => useCanonicalFitnessSummary("a")).result.current.enabled).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("accepts real zero and absent optional sport documents", async () => {
    mocks.fetch.mockResolvedValue({ status: "canonical", data });
    const hook = renderHook(() => useCanonicalFitnessSummary("a"));
    await waitFor(() => expect(hook.result.current.status).toBe("canonical"));
    expect(hook.result.current.data?.current.totalCTL).toBe(0);
    expect(mocks.fetch).toHaveBeenCalledWith("a");
  });

  it.each(["stale", "failed", "processing"])("retains the whole accepted bundle on %s, not its newer partial fields", async (status) => {
    mocks.fetch.mockResolvedValueOnce({ status: "canonical", data });
    const hook = renderHook(({ reload }) => useCanonicalFitnessSummary("a", reload), { initialProps: { reload: 0 } });
    await waitFor(() => expect(hook.result.current.status).toBe("canonical"));
    mocks.fetch.mockResolvedValueOnce({ status, data: { ...data, current: { totalCTL: 999 } } });
    hook.rerender({ reload: 1 });
    await waitFor(() => expect(hook.result.current.status).toBe("stale"));
    expect(hook.result.current.data).toEqual(data);
  });

  it("does not turn a first failure into zero or a partial bundle", async () => {
    mocks.fetch.mockResolvedValue({ status: "failed", data: null });
    const hook = renderHook(() => useCanonicalFitnessSummary("a"));
    await waitFor(() => expect(hook.result.current.status).toBe("failed"));
    expect(hook.result.current.data).toBeNull();
  });

  it("clears account-scoped data and ignores late A responses after A-B-A", async () => {
    const old: Array<(value: unknown) => void> = [];
    mocks.fetch.mockImplementation(() => new Promise((resolve) => old.push(resolve)));
    const hook = renderHook(({ uid }) => useCanonicalFitnessSummary(uid), { initialProps: { uid: "a" } });
    hook.rerender({ uid: "b" });
    hook.rerender({ uid: "a" });
    await act(async () => { old[0]({ status: "canonical", data }); old[1]({ status: "canonical", data }); });
    expect(hook.result.current.data).toBeNull();
    await act(async () => old[2]({ status: "canonical", data }));
    expect(hook.result.current.data).toEqual(data);
  });
});
