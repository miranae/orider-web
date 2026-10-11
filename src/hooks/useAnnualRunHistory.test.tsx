import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyNow, historyPage, historyRow } from "../services/trainingAnalysisHistory.fixture";
import { useAnnualRunHistory } from "./useAnnualRunHistory";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, available: true, services: {} as object, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/trainingAnalysisPeriods", () => ({ trainingAnalysisPeriodsAvailable: () => mocks.available }));
vi.mock("../services/trainingAnalysisHistory", async original => ({ ...await original<typeof import("../services/trainingAnalysisHistory")>(), loadTrainingAnalysisHistory: mocks.load }));
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(historyNow); mocks.user = { uid: "owner", isAnonymous: false }; mocks.available = true; mocks.services = {}; mocks.load.mockReset().mockResolvedValue(historyPage()); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("opt-in sequential annual history", () => {
  it("makes no initial/draft request, one page per manual click and no terminal follow-up", async () => {
    const first = historyPage([], false); mocks.load.mockResolvedValueOnce(first).mockResolvedValueOnce(historyPage([historyRow("next", 50000)]));
    const view = renderHook(({ year }) => useAnnualRunHistory("owner", "activity", year), { initialProps: { year: 2026 } });
    expect(mocks.load).not.toHaveBeenCalled();
    await act(async () => { await view.result.current.start(); });
    expect(mocks.load).toHaveBeenCalledTimes(1); expect(view.result.current.status).toBe("partial");
    expect(view.result.current.pages[0]!.activities).toHaveLength(0);
    await act(async () => { await view.result.current.loadMore(); });
    expect(mocks.load.mock.calls[1]![2].cursor).toEqual(first.page.nextCursor);
    expect(mocks.load).toHaveBeenCalledTimes(2); expect(view.result.current.status).toBe("complete");
    await act(async () => { await view.result.current.loadMore(); }); expect(mocks.load).toHaveBeenCalledTimes(2);
    view.rerender({ year: 2025 }); expect(view.result.current.pages).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("preserves a failed partial page and retries the same cursor only manually", async () => {
    const first = historyPage([historyRow()], false); mocks.load.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(historyPage([historyRow("next", 50000)]));
    const { result } = renderHook(() => useAnnualRunHistory("owner", "activity", 2026));
    await act(async () => { await result.current.start(); }); await act(async () => { await result.current.loadMore(); });
    expect(result.current.status).toBe("error"); expect(result.current.pages).toHaveLength(1); expect(mocks.load).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current.loadMore(); });
    expect(mocks.load.mock.calls[1]![2]).toEqual(mocks.load.mock.calls[2]![2]); expect(result.current.pages).toHaveLength(2);
  });
  it.each(["activity", "account", "services", "year"])("hides rows immediately and ignores ABA stale requests on %s changes", async axis => {
    let resolve!: (value: ReturnType<typeof historyPage>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const initialServices = mocks.services;
    const view = renderHook(({ id, year }) => useAnnualRunHistory("owner", id, year), { initialProps: { id: "A", year: 2026 } });
    let pending!: Promise<void>;
    act(() => { pending = view.result.current.start(); });
    if (axis === "account") mocks.user = { uid: "other", isAnonymous: false };
    if (axis === "services") mocks.services = {};
    view.rerender({ id: axis === "activity" ? "B" : "A", year: axis === "year" ? 2025 : 2026 });
    expect(view.result.current.pages).toHaveLength(0);
    mocks.user = { uid: "owner", isAnonymous: false }; mocks.services = initialServices;
    view.rerender({ id: "A", year: 2026 });
    await act(async () => { resolve(historyPage()); await pending; });
    expect(view.result.current.pages).toHaveLength(0); expect(view.result.current.status).toBe("idle");
    await act(async () => { await view.result.current.start(); }); expect(view.result.current.status).toBe("complete"); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("invalidates changed-source sessions and requires an explicit restart", async () => {
    mocks.load.mockResolvedValueOnce(historyPage([historyRow()], false)).mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "history_source_changed" } });
    const { result } = renderHook(() => useAnnualRunHistory("owner", "A", 2026));
    await act(async () => { await result.current.start(); }); await act(async () => { await result.current.loadMore(); });
    expect(result.current.status).toBe("invalidated"); expect(result.current.pages).toHaveLength(0);
    await act(async () => { await result.current.loadMore(); }); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("expires using returned expiresAt and never follows an expired snapshot", async () => {
    const { result } = renderHook(() => useAnnualRunHistory("owner", "A", 2026));
    mocks.load.mockResolvedValueOnce(historyPage([], false)); await act(async () => { await result.current.start(); });
    vi.spyOn(Date, "now").mockReturnValue(historyNow + 1800000);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.status).toBe("expired"); expect(result.current.pages).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("rejects old endpoint payloads without automatic retry and blocks public/unsupported reads", async () => {
    mocks.load.mockResolvedValueOnce({ version: 1, periods: [] });
    const view = renderHook(() => useAnnualRunHistory("owner", "A", 2026));
    await act(async () => { await view.result.current.start(); }); expect(view.result.current.status).toBe("unsupported");
    await act(async () => { await view.result.current.loadMore(); }); expect(mocks.load).toHaveBeenCalledTimes(1);
    mocks.user = null; view.rerender(); await act(async () => { await view.result.current.start(); });
    mocks.user = { uid: "owner", isAnonymous: false }; mocks.available = false; view.rerender(); await act(async () => { await view.result.current.start(); });
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("stops at the 5000 scanned bound even when every run page is empty", async () => {
    let pageIndex = 0; mocks.load.mockImplementation(async () => historyPage([], false, pageIndex++ * 50000));
    const { result } = renderHook(() => useAnnualRunHistory("owner", "A", 2026));
    await act(async () => { await result.current.start(); });
    for (let i = 1; i < 100; i++) await act(async () => { await result.current.loadMore(); });
    expect(result.current.status).toBe("capped"); expect(mocks.load).toHaveBeenCalledTimes(100);
    await act(async () => { await result.current.loadMore(); }); expect(mocks.load).toHaveBeenCalledTimes(100);
  });
  it("serializes double clicks and fences unmounted request completion", async () => {
    let resolve!: (value: ReturnType<typeof historyPage>) => void; mocks.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = renderHook(() => useAnnualRunHistory("owner", "A", 2026)); let pending!: Promise<void>;
    act(() => { pending = view.result.current.start(); }); act(() => { void view.result.current.start(); }); expect(mocks.load).toHaveBeenCalledTimes(1);
    view.unmount(); await act(async () => { resolve(historyPage()); await pending; });
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
});
