import { useCallback, useEffect, useRef, useState } from "react";
import {
  getClubMeetingSnapshot,
  type ClubMeetingSnapshot,
} from "../../services/clubMeetings";
export function useClubMeeting(
  eventId: string | undefined,
  uid: string | undefined,
  groupId: string | undefined,
) {
  const scope = `${uid ?? ""}/${groupId ?? ""}/${eventId ?? ""}`;
  const requestGeneration = useRef(0);
  const current = useRef(scope);
  current.current = scope;
  const [state, setState] = useState<{
    scope: string;
    data: ClubMeetingSnapshot | null;
    loading: boolean;
    error: unknown;
  }>({ scope, data: null, loading: true, error: null });
  const reload = useCallback(async () => {
    if (!uid || !groupId || !eventId) {
      setState({ scope, data: null, loading: false, error: null });
      return;
    }
    const generation = ++requestGeneration.current;
    try {
      const data = await getClubMeetingSnapshot(eventId);
      if (current.current !== scope || generation !== requestGeneration.current)
        return;
      if (data.groupId !== groupId) throw new Error("Wrong club");
      setState({ scope, data, loading: false, error: null });
    } catch (error) {
      if (current.current === scope && generation === requestGeneration.current)
        setState((old) => ({
          scope,
          data: old.scope === scope ? old.data : null,
          loading: false,
          error,
        }));
      throw error;
    }
  }, [scope, uid, groupId, eventId]);
  useEffect(() => {
    setState({ scope, data: null, loading: true, error: null });
    if (!uid || !groupId || !eventId) {
      setState({ scope, data: null, loading: false, error: null });
      return;
    }
    void reload().catch(() => {});
    const timer = window.setInterval(
      () => void reload().catch(() => {}),
      15000,
    );
    const focus = () => void reload().catch(() => {});
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [scope, uid, groupId, eventId, reload]);
  return {
    data: state.scope === scope ? state.data : null,
    loading: state.scope !== scope || state.loading,
    error: state.scope === scope ? state.error : null,
    reload,
  };
}
