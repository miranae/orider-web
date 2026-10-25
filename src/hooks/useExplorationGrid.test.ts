import { auth } from "../services/firebase";
import { simulateLogin as mockLogin, getCurrentUser } from "../__tests__/mocks/firebase";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, orderBy, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearExplorationGridSessionCache, useExplorationGrid } from "./useExplorationGrid";

const snapshot = (track: string, uid = "owner-1") => ({ docs: [{ data: () => ({ thumbnailTrack: track, userId: uid }) }] });

describe("useExplorationGrid", () => {
  beforeEach(() => {
    simulateLogin({ uid: "owner-1" });
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
    simulateLogin({ uid: "owner-a" });
    vi.mocked(getDocs).mockResolvedValue(snapshot("37.5,127;37.51,127.01", "owner-a") as never);
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
    simulateLogin({ uid: "owner-a" });
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

function simulateLogin(user: Parameters<typeof mockLogin>[0]) { mockLogin(user); auth.currentUser = getCurrentUser() as typeof auth.currentUser; }

it("discards cached geometry when the same uid signs into a new session", async () => {
  clearExplorationGridSessionCache();
  vi.mocked(getDocs).mockReset();
  simulateLogin({ uid: "reauth-owner" });
  vi.mocked(getDocs).mockResolvedValueOnce(snapshot("37.5,127;37.51,127.01", "reauth-owner") as never);
  const { result, rerender } = renderHook(() => useExplorationGrid("reauth-owner", true));
  await waitFor(() => expect(result.current.result.tileCount).toBeGreaterThan(0));
  simulateLogin({ uid: "reauth-owner" });
  vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as never);
  rerender();
  expect(result.current.result.tileCount).toBe(0);
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.result.tileCount).toBe(0);
});
