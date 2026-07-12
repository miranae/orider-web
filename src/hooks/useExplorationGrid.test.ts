import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, orderBy, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearExplorationGridSessionCache, useExplorationGrid } from "./useExplorationGrid";

const snapshot = (track: string) => ({ docs: [{ data: () => ({ thumbnailTrack: track }) }] });

describe("useExplorationGrid", () => {
  beforeEach(() => {
    clearExplorationGridSessionCache();
    vi.mocked(getDocs).mockReset();
    vi.mocked(where).mockClear();
    vi.mocked(orderBy).mockClear();
  });

  it("queries only the owner activity-time range", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(snapshot("37.5,127;37.51,127.01") as never);
    renderHook(() => useExplorationGrid("owner-1", true));
    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    expect(where).toHaveBeenCalledWith("userId", "==", "owner-1");
    expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
    expect(where).toHaveBeenCalledWith("startTime", ">=", expect.any(Number));
    expect(orderBy).toHaveBeenCalledWith("startTime", "desc");
  });

  it("resolves tileCount and maxSquare from the aggregated tracks", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(snapshot("37.5,127;37.51,127.01") as never);
    const { result } = renderHook(() => useExplorationGrid("owner-1", true));
    await waitFor(() => expect(result.current.result.tileCount).toBeGreaterThan(0));
    expect(result.current.result.maxSquare).toBeGreaterThanOrEqual(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it("fails closed synchronously across uid switch and logout", async () => {
    vi.mocked(getDocs).mockResolvedValue(snapshot("37.5,127;37.51,127.01") as never);
    const { result, rerender } = renderHook(({ uid }) => useExplorationGrid(uid, true), {
      initialProps: { uid: "owner-a" as string | undefined },
    });
    await waitFor(() => expect(result.current.result.tileCount).toBeGreaterThan(0));
    rerender({ uid: "owner-b" });
    expect(result.current.result.tileCount).toBe(0);
    rerender({ uid: undefined });
    expect(result.current.result.tileCount).toBe(0);
  });

  it("ignores a cancelled owner's late response", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(getDocs).mockImplementationOnce(() => new Promise((done) => { resolve = done; }) as never);
    const { result, rerender } = renderHook(({ uid }) => useExplorationGrid(uid, true), {
      initialProps: { uid: "owner-a" as string | undefined },
    });
    rerender({ uid: "owner-b" });
    await act(async () => { resolve(snapshot("37.5,127;37.51,127.01")); });
    expect(result.current.result.tileCount).toBe(0);
  });

  it("does nothing when disabled", () => {
    renderHook(() => useExplorationGrid("owner-1", false));
    expect(getDocs).not.toHaveBeenCalled();
  });
});
