import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectionsTimeoutError, fetchCyclingRoute } from "./mapboxDirections";
afterEach(() => vi.unstubAllGlobals());
describe("fetchCyclingRoute", () => {
  it("validates count before network", async () => { await expect(fetchCyclingRoute([], "token")).rejects.toThrow("Waypoint count"); });
  it("uses lng,lat order and parses a typed route", async () => { const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [[127, 37], [128, 38]] }, distance: 1000, duration: 100 }] }) }); vi.stubGlobal("fetch", fetchMock); await expect(fetchCyclingRoute([{ lat: 37, lng: 127 }, { lat: 38, lng: 128 }], "secret")).resolves.toMatchObject({ distance: 1000 }); expect(fetchMock.mock.calls[0][0]).toContain("127,37;128,38"); });
  it("maps status without exposing the token in errors", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 })); await expect(fetchCyclingRoute([{ lat: 37, lng: 127 }, { lat: 38, lng: 128 }], "secret-token")).rejects.toThrow("429"); });
  it("rejects invalid input and untrusted response geometry", async () => { await expect(fetchCyclingRoute([{ lat: 99, lng: 0 }, { lat: 1, lng: 1 }], "token")).rejects.toThrow("Invalid waypoint"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [[127, 37], [999, 38]] }, distance: -1, duration: 1 }] }) })); await expect(fetchCyclingRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "token")).rejects.toThrow("Invalid cycling"); });
  it("does not call fetch for a pre-aborted external signal", async () => { const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const controller = new AbortController(); controller.abort(); await expect(fetchCyclingRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "token", controller.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(fetchMock).not.toHaveBeenCalled(); });
  it("distinguishes timeout and cleans up the external listener", async () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const remove = vi.spyOn(external.signal, "removeEventListener");
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const promise = fetchCyclingRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], "token", external.signal);
    const rejection = expect(promise).rejects.toBeInstanceOf(DirectionsTimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    vi.useRealTimers();
  });
});
