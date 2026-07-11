import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, orderBy, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPersonalHeatmapSessionCache, usePersonalHeatmap } from "./usePersonalHeatmap";

const snapshot = (track: string) => ({ docs: [{ data: () => ({ thumbnailTrack: track }) }] });

describe("usePersonalHeatmap", () => {
  beforeEach(() => {
    clearPersonalHeatmapSessionCache();
    vi.mocked(getDocs).mockReset();
    vi.mocked(where).mockClear();
    vi.mocked(orderBy).mockClear();
  });

  it("queries only the owner activity-time range", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(snapshot("37.5,127;37.51,127.01") as never);
    renderHook(() => usePersonalHeatmap("owner-1", true));
    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    expect(where).toHaveBeenCalledWith("userId", "==", "owner-1");
    expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
    expect(where).toHaveBeenCalledWith("startTime", ">=", expect.any(Number));
    expect(orderBy).toHaveBeenCalledWith("startTime", "desc");
    expect(where).not.toHaveBeenCalledWith("createdAt", ">=", expect.any(Number));
  });

  it("fails closed synchronously across uid switch and logout", async () => {
    vi.mocked(getDocs).mockResolvedValue(snapshot("37.5,127;37.51,127.01") as never);
    const { result, rerender } = renderHook(({ uid }) => usePersonalHeatmap(uid, true), {
      initialProps: { uid: "owner-a" as string | undefined },
    });
    await waitFor(() => expect(result.current.points.length).toBeGreaterThan(0));
    rerender({ uid: "owner-b" });
    expect(result.current.points).toEqual([]);
    rerender({ uid: undefined });
    expect(result.current.points).toEqual([]);
  });

  it("ignores a cancelled owner's late response", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(getDocs).mockImplementationOnce(() => new Promise((done) => { resolve = done; }) as never);
    const { result, rerender } = renderHook(({ uid }) => usePersonalHeatmap(uid, true), {
      initialProps: { uid: "owner-a" as string | undefined },
    });
    rerender({ uid: "owner-b" });
    await act(async () => { resolve(snapshot("37.5,127;37.51,127.01")); });
    expect(result.current.points).toEqual([]);
  });
});
