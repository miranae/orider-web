import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useYearActivities } from "./useYearActivities";
import { readRecapYears, readYearActivities } from "./yearActivitiesRead";
import { createMockActivity } from "../__tests__/fixtures/mockData";

vi.mock("./yearActivitiesRead", () => ({ readRecapYears: vi.fn(), readYearActivities: vi.fn() }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
function deferred() {
  let resolve!: (value: ReturnType<typeof createMockActivity>[]) => void;
  const promise = new Promise<ReturnType<typeof createMockActivity>[]>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.mocked(readRecapYears).mockReset().mockResolvedValue([2026, 2025, 2024]);
  vi.mocked(readYearActivities).mockReset().mockResolvedValue([createMockActivity({ id: "ride" })]);
});
afterEach(() => vi.useRealTimers());

describe("selected annual activity loading", () => {
  it("defaults to latest calendar year and does not reload calendar on year selection", async () => {
    const h = renderHook(({ year }: { year?: number }) => useYearActivities("owner", year), { initialProps: {} });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(h.result.current.year).toBe(2026);
    expect(readYearActivities).toHaveBeenCalledWith("owner", 2026, expect.any(Function));
    h.rerender({ year: 2024 });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(readYearActivities).toHaveBeenLastCalledWith("owner", 2024, expect.any(Function));
    expect(readRecapYears).toHaveBeenCalledTimes(1);
  });

  it("ends stalled reads and retries without accepting late results or issuing more stale reads", async () => {
    vi.useFakeTimers();
    const old = deferred();
    vi.mocked(readYearActivities).mockReturnValueOnce(old.promise).mockResolvedValueOnce([createMockActivity({ id: "retry" })]);
    const h = renderHook(() => useYearActivities("owner", 2025));
    const cancelled = vi.mocked(readYearActivities).mock.calls[0]![2];
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(h.result.current.error).toBe(true);
    expect(cancelled()).toBe(true);
    await act(async () => h.result.current.retry());
    expect(h.result.current.activities[0]?.id).toBe("retry");
    await act(async () => old.resolve([createMockActivity({ id: "stale" })]));
    expect(h.result.current.activities[0]?.id).toBe("retry");
    expect(readRecapYears).toHaveBeenCalledTimes(1);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a previous year's response and hides the previous year's data immediately", async () => {
    const old = deferred();
    vi.mocked(readYearActivities).mockReturnValueOnce(old.promise).mockResolvedValueOnce([createMockActivity({ id: "new-year" })]);
    const h = renderHook(({ year }) => useYearActivities("owner", year), { initialProps: { year: 2024 } });
    h.rerender({ year: 2025 });
    expect(h.result.current.activities).toEqual([]);
    await waitFor(() => expect(h.result.current.activities[0]?.id).toBe("new-year"));
    await act(async () => old.resolve([createMockActivity({ id: "old-year" })]));
    expect(h.result.current.activities[0]?.id).toBe("new-year");
  });

  it("reports budget/read failures as retryable errors rather than a complete empty year", async () => {
    vi.mocked(readYearActivities).mockRejectedValueOnce(new Error("year-read-budget-exceeded"));
    const h = renderHook(() => useYearActivities("owner", 2025));
    await waitFor(() => expect(h.result.current.error).toBe(true));
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.activities).toEqual([]);
    act(() => h.result.current.retry());
    await waitFor(() => expect(h.result.current.activities[0]?.id).toBe("ride"));
  });

  it("retries failed calendar discovery and guards account changes and sign-out", async () => {
    vi.mocked(readRecapYears).mockRejectedValueOnce(new Error("permission-denied"));
    const h = renderHook(({ uid }: { uid: string | undefined }) => useYearActivities(uid), { initialProps: { uid: "owner" as string | undefined } });
    await waitFor(() => expect(h.result.current.error).toBe(true));
    expect(readYearActivities).not.toHaveBeenCalled();
    act(() => h.result.current.retry());
    await waitFor(() => expect(h.result.current.activities[0]?.id).toBe("ride"));
    h.rerender({ uid: "new-owner" });
    expect(h.result.current.activities).toEqual([]);
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(readYearActivities).toHaveBeenLastCalledWith("new-owner", 2026, expect.any(Function));
    h.rerender({ uid: undefined });
    expect(h.result.current.activities).toEqual([]);
    expect(h.result.current.loading).toBe(false);
  });
});
