import { auth } from "../services/firebase";
import { simulateLogin as mockLogin, getCurrentUser } from "../__tests__/mocks/firebase";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, orderBy, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPersonalHeatmapSessionCache, usePersonalHeatmap } from "./usePersonalHeatmap";

const snapshot = (track: string, uid = "owner-1") => ({ docs: [{ data: () => ({ thumbnailTrack: track, userId: uid }) }] });

describe("usePersonalHeatmap", () => {
  beforeEach(() => {
    simulateLogin({ uid: "owner-1" });
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
    simulateLogin({ uid: "owner-a" });
    vi.mocked(getDocs).mockResolvedValue(snapshot("37.5,127;37.51,127.01", "owner-a") as never);
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
    simulateLogin({ uid: "owner-a" });
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

function simulateLogin(user: Parameters<typeof mockLogin>[0]) { mockLogin(user); auth.currentUser = getCurrentUser() as typeof auth.currentUser; }

it("discards cached geometry when the same uid signs into a new session", async () => {
  clearPersonalHeatmapSessionCache();
  vi.mocked(getDocs).mockReset();
  simulateLogin({ uid: "reauth-owner" });
  vi.mocked(getDocs).mockResolvedValueOnce(snapshot("37.5,127;37.51,127.01", "reauth-owner") as never);
  const { result, rerender } = renderHook(() => usePersonalHeatmap("reauth-owner", true));
  await waitFor(() => expect(result.current.points.length).toBeGreaterThan(0));
  simulateLogin({ uid: "reauth-owner" });
  vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as never);
  rerender();
  expect(result.current.points.length).toBe(0);
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.points.length).toBe(0);
});
