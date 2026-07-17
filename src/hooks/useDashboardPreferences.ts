import { useCallback, useEffect, useRef, useState } from "react";

export type DashboardSportFilter = "all" | "bike" | "run" | "swim";
export type DashboardFeedScope = "all" | "friends" | "self";
export type DashboardDatePreset = "all" | "7d" | "30d" | "90d";

export interface DashboardPreferences {
  sportFilter: DashboardSportFilter;
  feedScope: DashboardFeedScope;
  datePreset: DashboardDatePreset;
  workoutNarrativeExpanded: boolean;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  sportFilter: "all",
  feedScope: "all",
  datePreset: "all",
  workoutNarrativeExpanded: true,
};

const STORAGE_PREFIX = "orider.dashboardPreferences.v1";

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function parseDashboardPreferences(value: unknown): DashboardPreferences {
  if (!value || typeof value !== "object") return DEFAULT_DASHBOARD_PREFERENCES;
  const candidate = value as Record<string, unknown>;
  return {
    sportFilter: isOneOf(candidate.sportFilter, ["all", "bike", "run", "swim"])
      ? candidate.sportFilter
      : DEFAULT_DASHBOARD_PREFERENCES.sportFilter,
    feedScope: isOneOf(candidate.feedScope, ["all", "friends", "self"])
      ? candidate.feedScope
      : DEFAULT_DASHBOARD_PREFERENCES.feedScope,
    datePreset: isOneOf(candidate.datePreset, ["all", "7d", "30d", "90d"])
      ? candidate.datePreset
      : DEFAULT_DASHBOARD_PREFERENCES.datePreset,
    workoutNarrativeExpanded: typeof candidate.workoutNarrativeExpanded === "boolean"
      ? candidate.workoutNarrativeExpanded
      : DEFAULT_DASHBOARD_PREFERENCES.workoutNarrativeExpanded,
  };
}

export function dashboardPreferencesStorageKey(uid: string): string {
  return `${STORAGE_PREFIX}.${encodeURIComponent(uid)}`;
}

export function readDashboardPreferences(
  uid: string,
  storage?: Pick<Storage, "getItem">,
): DashboardPreferences {
  try {
    const resolvedStorage = storage ?? window.localStorage;
    const raw = resolvedStorage.getItem(dashboardPreferencesStorageKey(uid));
    return raw == null ? DEFAULT_DASHBOARD_PREFERENCES : parseDashboardPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
}

export function updateDashboardPreferences(
  uid: string,
  patch: Partial<DashboardPreferences>,
  storage?: Pick<Storage, "getItem" | "setItem">,
): boolean {
  try {
    const resolvedStorage = storage ?? window.localStorage;
    const current = readDashboardPreferences(uid, resolvedStorage);
    resolvedStorage.setItem(dashboardPreferencesStorageKey(uid), JSON.stringify({ ...current, ...patch }));
    return true;
  } catch {
    return false;
  }
}

/**
 * 인증 확인이 끝난 뒤에만 해당 UID의 값을 복원한다. UID가 바뀌는 렌더에서는 기본값을
 * 노출하고, 새 UID hydration 전에는 저장하지 않아 이전 계정 값이 섞이지 않는다.
 */
export function useDashboardPreferences(uid: string | null, authLoading: boolean) {
  const [preferences, setPreferences] = useState(DEFAULT_DASHBOARD_PREFERENCES);
  const [hydratedIdentity, setHydratedIdentity] = useState<string | "guest" | null>(null);
  const preferencesRef = useRef(preferences);
  const expectedIdentity = authLoading ? null : (uid ?? "guest");
  const isHydrated = hydratedIdentity === expectedIdentity && expectedIdentity !== null;

  useEffect(() => {
    if (authLoading) {
      setHydratedIdentity(null);
      return;
    }
    const next = uid ? readDashboardPreferences(uid) : DEFAULT_DASHBOARD_PREFERENCES;
    preferencesRef.current = next;
    setPreferences(next);
    setHydratedIdentity(uid ?? "guest");
  }, [authLoading, uid]);

  const update = useCallback((patch: Partial<DashboardPreferences>) => {
    if (authLoading || !isHydrated) return;
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferences(next);
    if (uid) updateDashboardPreferences(uid, patch);
  }, [authLoading, isHydrated, uid]);

  return {
    preferences: isHydrated ? preferences : DEFAULT_DASHBOARD_PREFERENCES,
    isHydrated,
    update,
  };
}
