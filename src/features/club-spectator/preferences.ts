import { useCallback, useEffect, useMemo, useState } from "react";
import { logClientError } from "../../services/errorLogger";
export interface SpectatorPreferences {
  selectedUid: string | null;
  followed: string[];
  search: string;
  followingOnly: boolean;
  mapMode: "course" | "rider";
}
export const emptySpectatorPreferences = (): SpectatorPreferences => ({selectedUid: null, followed: [], search: "", followingOnly: false, mapMode: "course"});
function validId(id: unknown): id is string { return typeof id === "string" && id.length > 0 && id.length <= 128 && !id.includes("/"); }
function read(key: string | null): SpectatorPreferences {
  if (!key) return emptySpectatorPreferences();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptySpectatorPreferences();
    const value = JSON.parse(raw) as Partial<SpectatorPreferences>;
    return {selectedUid: validId(value.selectedUid) ? value.selectedUid : null,
      followed: Array.isArray(value.followed) ? [...new Set(value.followed.filter(validId))].slice(0, 200) : [],
      search: typeof value.search === "string" ? value.search.slice(0, 200) : "",
      followingOnly: value.followingOnly === true, mapMode: value.mapMode === "rider" ? "rider" : "course"};
  } catch (error) { logClientError("ClubMeetingSpectator.preferences.read", error); return emptySpectatorPreferences(); }
}
/** 저장하는 것은 관전 설정뿐이다. 참가자 정보·위치·파워·코스 본문은 캐시하지 않는다. */
export function useSpectatorPreferences(uid: string | undefined, groupId: string | undefined, eventId: string | undefined) {
  const key = uid && groupId && eventId ? `orider.spectator.v1:${encodeURIComponent(uid)}:${encodeURIComponent(groupId)}:${encodeURIComponent(eventId)}` : null;
  const initial = useMemo(() => read(key), [key]);
  const [state, setState] = useState(() => ({key, value: initial}));
  const value = state.key === key ? state.value : initial;
  const update = useCallback((patch: Partial<SpectatorPreferences>) => {
    if (!key) return;
    setState(old => ({key, value: {...(old.key === key ? old.value : initial), ...patch}}));
  }, [key, initial]);
  useEffect(() => {
    if (!key || state.key !== key) return;
    try { localStorage.setItem(key, JSON.stringify(state.value)); }
    catch (error) { logClientError("ClubMeetingSpectator.preferences.write", error); }
  }, [key, state]);
  return {value, update};
}
