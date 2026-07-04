import { renderHook, act, waitFor } from "@testing-library/react";
import { useActivities, useWeeklyStats, useActivitySearch } from "./useActivities";
import { simulateLogin, simulateLogout, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import React from "react";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      AuthProvider,
      null,
      React.createElement(ToastProvider, null, children),
    ),
  );
}

describe("useActivities", () => {
  it("returns empty activities initially for guest", async () => {
    const { result } = renderHook(() => useActivities(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it("returns activities from collection data", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1" }) },
      { id: "a2", ...createMockActivity({ id: "a2" }) },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // summary 가 있는 문서는 fetchPage 의 `summary != null` 필터를 통과해 노출된다.
    expect(result.current.activities).toHaveLength(2);
    expect(result.current.activities.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("fills missing activity avatar from the public profile photo", async () => {
    setDocData("users_public/user-1", {
      nickname: "테스트 라이더",
      photoURL: "https://example.com/profile-avatar.jpg",
    });
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ id: "a1", userId: "user-1", profileImage: null }) },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities[0]?.profileImage).toBe("https://example.com/profile-avatar.jpg");
  });

  it("filters out documents without a summary field", async () => {
    setCollectionDocs("activities", [
      { id: "ok", ...createMockActivity({ id: "ok" }) },
      // summary 누락 문서 — 다운스트림 통계 크래시 방지 위해 제외돼야 함
      { id: "broken", userId: "u", visibility: "everyone", startTime: 0 },
    ]);

    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0]?.id).toBe("ok");
  });
});

describe("useWeeklyStats", () => {
  it("returns empty stats for guest", async () => {
    const { result } = renderHook(() => useWeeklyStats(), { wrapper });
    expect(result.current.thisWeek.rides).toBe(0);
    expect(result.current.weeklyStats).toEqual([]);
  });
});

describe("useActivitySearch", () => {
  it("starts in inactive state", () => {
    const { result } = renderHook(() => useActivitySearch(), { wrapper });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("activates search when search() is called", async () => {
    setCollectionDocs("activities", [
      { id: "a1", ...createMockActivity({ description: "한강 라이딩" }) },
    ]);

    const { result } = renderHook(() => useActivitySearch(), { wrapper });

    act(() => { result.current.search("한강"); });

    await waitFor(() => {
      expect(result.current.active).toBe(true);
    });
  });

  it("resets search state on reset()", async () => {
    const { result } = renderHook(() => useActivitySearch(), { wrapper });

    act(() => { result.current.search("test"); });
    expect(result.current.active).toBe(true);

    act(() => { result.current.reset(); });
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
  });
});
