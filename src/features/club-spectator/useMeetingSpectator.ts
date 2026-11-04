import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { retainNewerSamples } from "./presentation";
import type { MeetingSpectatorSnapshot } from "./types";

export const SPECTATOR_POLL_MS = 10000;
interface State { scope: string; data: MeetingSpectatorSnapshot | null; receivedAt: number; loading: boolean; error: unknown }
/** 회원 권한은 매 조회 서버가 확인한다. 숨김·계정/모임 전환·오류에는 이전 위치를 지운다. */
export function useMeetingSpectator(groupId: string | undefined, eventId: string | undefined, uid: string | undefined) {
  const services = useFirebaseServices();
  const scope = `${uid ?? ""}/${groupId ?? ""}/${eventId ?? ""}`;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({scope, data: null, receivedAt: 0, loading: true, error: null});
  useEffect(() => {
    let disposed = false, inFlight = false, generation = 0;
    const viewer = services.auth.currentUser;
    const current = () => !disposed && services.auth.currentUser === viewer && viewer?.uid === uid;
    const clear = (error: unknown = null) => setState({scope, data: null, receivedAt: 0, loading: false, error});
    setState({scope, data: null, receivedAt: 0, loading: !!uid, error: null});
    if (!uid || !groupId || !eventId || !viewer || viewer.uid !== uid) return;
    const poll = async () => {
      if (inFlight || document.hidden || !current()) return;
      inFlight = true;
      const ticket = generation;
      try {
        await services.ensureAppCheckReady();
        if (!current() || ticket !== generation) return;
        const result = await httpsCallable<{eventId: string}, MeetingSpectatorSnapshot>(services.functions, "getClubMeetingSpectator")({eventId});
        if (!current() || ticket !== generation || document.hidden) return;
        const data = result.data;
        if (data.eventId !== eventId || data.groupId !== groupId || !Number.isFinite(data.serverNowMs) || !Array.isArray(data.locations)) throw new Error("invalid_spectator_response");
        setState(old => ({scope, data: retainNewerSamples(old.scope === scope ? old.data : null, data), receivedAt: Date.now(), loading: false, error: null}));
      } catch (error) {
        if (current() && ticket === generation) {
          clear(error);
          logClientError("ClubMeetingSpectator.read", error, {eventId});
        }
      } finally {
        inFlight = false;
        if (current() && ticket !== generation && !document.hidden) void poll();
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), SPECTATOR_POLL_MS);
    const visible = () => {
      generation++;
      clear();
      if (!document.hidden) void poll();
    };
    const focus = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [services, scope, groupId, eventId, uid, retry]);
  return { ...(state.scope === scope ? state : {data: null, loading: !!uid, error: null, receivedAt: 0}), reload: () => setRetry(v => v + 1) };
}
