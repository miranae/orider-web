import { act, renderHook, waitFor } from "@testing-library/react";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  dashboardPreferencesStorageKey,
  parseDashboardPreferences,
  readDashboardPreferences,
  updateDashboardPreferences,
  useDashboardPreferences,
} from "./useDashboardPreferences";

describe("dashboard preferences", () => {
  beforeEach(() => localStorage.clear());

  it("validates restored values and falls back field by field", () => {
    expect(parseDashboardPreferences({
      sportFilter: "invalid",
      feedScope: "friends",
      datePreset: 30,
      workoutNarrativeExpanded: false,
    })).toEqual({
      sportFilter: "all",
      feedScope: "friends",
      datePreset: "all",
      workoutNarrativeExpanded: false,
    });
    expect(parseDashboardPreferences({ datePreset: "year" }).datePreset).toBe("year");
    localStorage.setItem(dashboardPreferencesStorageKey("broken"), "not-json");
    expect(readDashboardPreferences("broken")).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
  });

  it("keeps each UID separate and never persists during auth hydration", async () => {
    updateDashboardPreferences("rider-a", { sportFilter: "run", feedScope: "self", datePreset: "30d" });
    updateDashboardPreferences("rider-b", { sportFilter: "swim", feedScope: "friends", datePreset: "7d" });

    const { result, rerender } = renderHook(
      ({ uid, loading }: { uid: string | null; loading: boolean }) => useDashboardPreferences(uid, loading),
      { initialProps: { uid: "rider-a", loading: false } },
    );
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.preferences).toMatchObject({ sportFilter: "run", feedScope: "self", datePreset: "30d" });

    rerender({ uid: "rider-b", loading: true });
    expect(result.current.preferences).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
    act(() => result.current.update({ sportFilter: "bike" }));
    expect(readDashboardPreferences("rider-a").sportFilter).toBe("run");
    expect(readDashboardPreferences("rider-b").sportFilter).toBe("swim");

    rerender({ uid: "rider-b", loading: false });
    await waitFor(() => expect(result.current.preferences.sportFilter).toBe("swim"));
    act(() => result.current.update({ datePreset: "90d" }));
    expect(readDashboardPreferences("rider-a").datePreset).toBe("30d");
    expect(readDashboardPreferences("rider-b").datePreset).toBe("90d");
  });

  it("restores the workout collapse state and preserves filters on partial writes", () => {
    updateDashboardPreferences("rider", { sportFilter: "bike", workoutNarrativeExpanded: false });
    updateDashboardPreferences("rider", { datePreset: "90d" });
    expect(readDashboardPreferences("rider")).toEqual({
      sportFilter: "bike",
      feedScope: "all",
      datePreset: "90d",
      workoutNarrativeExpanded: false,
    });
  });

  it("survives unavailable storage", () => {
    const throwingStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readDashboardPreferences("rider", throwingStorage)).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
    expect(updateDashboardPreferences("rider", { feedScope: "self" }, throwingStorage)).toBe(false);
  });

  it("keeps mounted consumers in sync after a same-tab update without mixing accounts", () => {
    updateDashboardPreferences("rider-a", { feedScope: "self", workoutNarrativeExpanded: false });
    const first = renderHook(() => useDashboardPreferences("rider-a", false));
    const second = renderHook(() => useDashboardPreferences("rider-a", false));
    const other = renderHook(() => useDashboardPreferences("rider-b", false));
    act(() => updateDashboardPreferences("rider-a", { feedScope: "all", datePreset: "30d" }));
    expect(first.result.current.preferences).toMatchObject({ feedScope: "all", datePreset: "30d", workoutNarrativeExpanded: false });
    expect(second.result.current.preferences).toEqual(first.result.current.preferences);
    expect(other.result.current.preferences).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
    act(() => second.result.current.update({ sportFilter: "run" }));
    expect(first.result.current.preferences).toMatchObject({ feedScope: "all", datePreset: "30d", sportFilter: "run" });
  });

  it("restores other-tab writes and storage clearing for the active account only", () => {
    const h = renderHook(() => useDashboardPreferences("rider", false));
    localStorage.setItem(dashboardPreferencesStorageKey("other"), JSON.stringify({ feedScope: "self" }));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: dashboardPreferencesStorageKey("other") })));
    expect(h.result.current.preferences.feedScope).toBe("all");
    localStorage.setItem(dashboardPreferencesStorageKey("rider"), JSON.stringify({ feedScope: "self" }));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: dashboardPreferencesStorageKey("rider") })));
    expect(h.result.current.preferences.feedScope).toBe("self");
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(h.result.current.preferences).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
  });

  it("survives a browser that throws while resolving localStorage", () => {
    const localStorageGetter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access denied", "SecurityError");
    });
    try {
      expect(readDashboardPreferences("rider")).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
      expect(updateDashboardPreferences("rider", { feedScope: "self" })).toBe(false);
    } finally {
      localStorageGetter.mockRestore();
    }
  });
});
