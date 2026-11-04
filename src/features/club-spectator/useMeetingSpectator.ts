import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { retainNewerSamples } from "./presentation";
import type { MeetingSpectatorSnapshot } from "./types";

interface State { scope: string; data: MeetingSpectatorSnapshot | null; receivedAt: number; loading: boolean; error: unknown }
/** 값은 회원 전용 API로 재검증하고 Firestore는 변경 신호로만 구독한다. */
export function useMeetingSpectator(groupId: string | undefined, eventId: string | undefined, uid: string | undefined) {
  const services = useFirebaseServices();
  const scope = `${uid ?? ""}/${groupId ?? ""}/${eventId ?? ""}`;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({scope, data: null, receivedAt: 0, loading: true, error: null});
  useEffect(() => {
    let disposed = false, inFlight = false, queued = false, blocked = false, generation = 0;
    let stops: (() => void)[] = [];
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const viewer = services.auth.currentUser;
    const current = () => !disposed && services.auth.currentUser === viewer && viewer?.uid === uid;
    const clear = (error: unknown = null) => setState({scope, data: null, receivedAt: 0, loading: false, error});
    const stop = () => { stops.forEach(unsubscribe => unsubscribe()); stops = []; clearTimeout(scheduled); };
    setState({scope, data: null, receivedAt: 0, loading: !!uid, error: null});
    if (!uid || !groupId || !eventId || !viewer || viewer.uid !== uid) return;
    const fail = (error: unknown) => {
      if (!current()) return;
      generation++; blocked = true; queued = false; stop(); clear(error);
      logClientError("ClubMeetingSpectator.read", error, {eventId});
    };
    const load = async () => {
      if (document.hidden || !current() || blocked) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      const ticket = generation;
      try {
        await services.ensureAppCheckReady();
        if (!current() || ticket !== generation) return;
        const result = await httpsCallable<{eventId: string}, MeetingSpectatorSnapshot>(services.functions, "getClubMeetingSpectator", {timeout: 15000})({eventId});
        if (!current() || ticket !== generation || document.hidden || blocked) return;
        const data = result.data;
        if (data.eventId !== eventId || data.groupId !== groupId || !Number.isFinite(data.serverNowMs) || !Array.isArray(data.locations)) throw new Error("invalid_spectator_response");
        setState(old => ({scope, data: retainNewerSamples(old.scope === scope ? old.data : null, data), receivedAt: Date.now(), loading: false, error: null}));
      } catch (error) {
        if (current() && ticket === generation) fail(error);
      } finally {
        inFlight = false;
        if (queued && current() && !document.hidden && !blocked) { queued = false; void load(); }
      }
    };
    const signal = (sensitive = false) => {
      if (!current() || document.hidden || blocked) return;
      generation++;
      if (sensitive) clear();
      clearTimeout(scheduled);
      scheduled = setTimeout(() => void load(), 100);
    };
    const start = async () => {
      const ticket = generation;
      try {
        await services.ensureAppCheckReady();
        if (!current() || document.hidden || blocked || ticket !== generation) return;
        // 신호 문서에는 위치가 없다. 권한·모임 상태가 바뀌어도 기존 조회로 다시 확인한다.
        const paths = [
          {path: `events/${eventId}/spectator_signals/latest`, sensitive: false},
          {path: `events/${eventId}`, sensitive: true},
          {path: `groups/${groupId}`, sensitive: true},
          {path: `groups/${groupId}/members/${uid}`, sensitive: true},
        ];
        for (const {path, sensitive} of paths) {
          if (blocked) break;
          const unsubscribe = onSnapshot(doc(services.firestore, path), () => signal(sensitive), fail);
          if (blocked) unsubscribe(); else stops.push(unsubscribe);
        }
        void load();
      } catch (error) { fail(error); }
    };
    void start();
    const visible = () => { generation++; queued = false; stop(); clear(); if (!document.hidden && !blocked) void start(); };
    const focus = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { disposed = true; stop(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [services, scope, groupId, eventId, uid, retry]);
  return { ...(state.scope === scope ? state : {data: null, loading: !!uid, error: null, receivedAt: 0}), reload: () => setRetry(v => v + 1) };
}
