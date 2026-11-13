import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLifetimeRecapActivities } from "./useLifetimeRecapActivities";
import { readLifetimeActivities } from "./yearActivitiesRead";
import { createMockActivity } from "../__tests__/fixtures/mockData";
vi.mock("./yearActivitiesRead", () => ({ readLifetimeActivities: vi.fn() }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
beforeEach(() => { vi.mocked(readLifetimeActivities).mockReset().mockResolvedValue([createMockActivity({ id: "lifetime" })]); });

describe("explicit lifetime view", () => {
  it("does not load initially; opens once and reuses completion across year/sport changes", async () => {
    const h = renderHook(({ year, sport }) => { void year; void sport; return useLifetimeRecapActivities("owner"); }, { initialProps: { year: 2025, sport: "tri" } });
    expect(readLifetimeActivities).not.toHaveBeenCalled();
    act(() => { h.result.current.load(); h.result.current.load(); });
    await waitFor(() => expect(h.result.current.status).toBe("complete"));
    h.rerender({ year: 2024, sport: "run" });
    act(() => h.result.current.load());
    expect(readLifetimeActivities).toHaveBeenCalledTimes(1);
    expect(h.result.current.activities[0]?.id).toBe("lifetime");
  });

  it("discards cache on account change and does not automatically load the next account", async () => {
    const h = renderHook(({ uid }: { uid?: string }) => useLifetimeRecapActivities(uid), { initialProps: { uid: "owner" as string | undefined } });
    act(() => h.result.current.load());
    await waitFor(() => expect(h.result.current.status).toBe("complete"));
    h.rerender({ uid: undefined });
    expect(h.result.current.activities).toEqual([]);
    h.rerender({ uid: "owner" });
    expect(h.result.current.status).toBe("idle");
    expect(readLifetimeActivities).toHaveBeenCalledTimes(1);
    act(() => h.result.current.load());
    await waitFor(() => expect(readLifetimeActivities).toHaveBeenCalledTimes(2));
  });

  it("exposes budget failure with no partial totals and permits explicit retry", async () => {
    vi.mocked(readLifetimeActivities).mockRejectedValueOnce(new Error("year-read-budget-exceeded"));
    const h = renderHook(() => useLifetimeRecapActivities("owner"));
    act(() => h.result.current.load());
    await waitFor(() => expect(h.result.current.status).toBe("error"));
    expect(h.result.current.activities).toEqual([]);
    act(() => h.result.current.load());
    await waitFor(() => expect(h.result.current.status).toBe("complete"));
  });

  it("ignores a previous account's late result", async () => {
    let resolve!: (value: ReturnType<typeof createMockActivity>[]) => void;
    vi.mocked(readLifetimeActivities).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const h = renderHook(({ uid }) => useLifetimeRecapActivities(uid), { initialProps: { uid: "owner" } });
    act(() => h.result.current.load());
    h.rerender({ uid: "other" });
    act(() => h.result.current.load());
    await waitFor(() => expect(h.result.current.status).toBe("complete"));
    await act(async () => resolve([createMockActivity({ id: "stale" })]));
    expect(h.result.current.activities[0]?.id).toBe("lifetime");
  });
});
