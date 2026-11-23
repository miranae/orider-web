import { useEffect, useRef, useState } from "react";
import { isLocalWorldEventEnabled, isProductionWorldEventEnabled, useWorldEvent } from "../ride-world/useWorldEvent";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { retainNewerSamples } from "./presentation";
import { applyWorldFrame, worldFrameComplete } from "./worldFrame";
import type { MeetingSpectatorSnapshot } from "./types";

interface State { scope: string; data: MeetingSpectatorSnapshot | null; receivedAt: number; loading: boolean; error: unknown }
/** 값은 회원 전용 API로 재검증하고 Firestore는 변경 신호로만 구독한다. */
export function useMeetingSpectator(groupId: string | undefined, eventId: string | undefined, uid: string | undefined, selectedUid: string | null = null) {
  const services = useFirebaseServices();
  const scope = `${uid ?? ""}/${groupId ?? ""}/${eventId ?? ""}`;
  const selectedRef = useRef(selectedUid);
  selectedRef.current = selectedUid;
  const previousSelection = useRef(selectedUid);
  const refreshSelection = useRef<() => void>(() => {});
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({scope, data: null, receivedAt: 0, loading: true, error: null});
  const activeState = state.scope === scope ? state : {data: null, loading: !!uid, error: null, receivedAt: 0};
  // 운영 플래그가 켜지면 월드 위치를 바로 반영하고, 프레임이 없거나 끊기면 기존 콜러블·신호 경로로 돌아간다.
  const worldViews = isProductionWorldEventEnabled();
  const world = useWorldEvent(activeState.data?.status === "LIVE" ? eventId : undefined,
    uid === services.auth.currentUser?.uid ? services.auth.currentUser : null, selectedUid, undefined, undefined, undefined, false, worldViews);
  const worldActive = world !== null;
  // 월드가 보이는 주행자를 모두 보낼 때만 위치 변경 신호(반복 조회)를 멈춘다. 10명 제한에 걸리면 신호를 유지한다.
  const worldCovers = useRef(false);
  worldCovers.current = worldViews && world !== null && worldFrameComplete(world);
  const syncLocationSignal = useRef<() => void>(() => {});
  const spectatorRedis = import.meta.env.VITE_ORIDER_LOCAL_SPECTATOR_REDIS === "1" && isLocalWorldEventEnabled();
  const spectatorSignal = useRef<(code?: number) => void>(() => {});
  const spectatorActiveScope = useRef<string | null>(null);
  const viewer = uid === services.auth.currentUser?.uid ? services.auth.currentUser : null;
  const previousBinding = useRef({ scope, viewer, services });
  if (previousBinding.current.scope !== scope || previousBinding.current.viewer !== viewer ||
      previousBinding.current.services !== services) {
    previousBinding.current = { scope, viewer, services };
    spectatorActiveScope.current = null;
  }
  useWorldEvent(spectatorRedis ? eventId : undefined, viewer, undefined, undefined, {
    topic: "spectator",
    changed: () => { spectatorActiveScope.current = scope; syncLocationSignal.current(); spectatorSignal.current(); },
    disconnected: code => { spectatorActiveScope.current = null; syncLocationSignal.current(); spectatorSignal.current(code); },
  });
  useEffect(() => {
    let disposed = false, inFlight = false, queued = false, blocked = false, generation = 0;
    let lastReadAt = 0, recoveryAttempts = 0;
    let recovery: ReturnType<typeof setTimeout> | undefined;
    let stops: (() => void)[] = [];
    let stopLocationSignal: (() => void) | undefined;
    const readySubscriptions = new Set<string>();
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const viewer = services.auth.currentUser;
    const current = () => !disposed && services.auth.currentUser === viewer && viewer?.uid === uid;
    const clear = (error: unknown = null, loading = false) => setState({scope, data: null, receivedAt: 0, loading, error});
    const stop = () => { stopLocationSignal?.(); stopLocationSignal = undefined; stops.forEach(unsubscribe => unsubscribe()); stops = []; readySubscriptions.clear(); clearTimeout(scheduled); scheduled = undefined; clearTimeout(recovery); recovery = undefined; };
    setState(old => old.scope === scope && old.data ? {...old, error: null} : {scope, data: null, receivedAt: 0, loading: !!uid, error: null});
    if (!uid || !groupId || !eventId || !viewer || viewer.uid !== uid) return;
    const fail = (error: unknown) => {
      if (!current()) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code).replace(/^(functions|firestore)\//, "") : "";
      const temporary = ["unavailable", "deadline-exceeded", "internal", "network-request-failed"].includes(code);
      generation++; queued = false; stop();
      if (temporary) {
        setState(old => old.scope === scope ? {...old, loading: false, error} : {scope, data: null, receivedAt: 0, loading: false, error});
        // Failure-driven, bounded recovery; live updates still come exclusively from change signals.
        if (recoveryAttempts < 3 && !document.hidden) {
          recovery = setTimeout(() => { recovery = undefined; void start(); }, 1000 * 2 ** recoveryAttempts++);
        }
      } else { blocked = true; clear(error); }
      logClientError("ClubMeetingSpectator.read", error, {eventId}, services, viewer);
    };
    const load = async () => {
      if (document.hidden || !current() || blocked) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      lastReadAt = Date.now();
      const ticket = generation;
      const requestedUid = selectedRef.current;
      try {
        await services.ensureAppCheckReady();
        if (!current() || ticket !== generation) return;
        const result = await httpsCallable<{eventId: string; selectedUid: string | null}, MeetingSpectatorSnapshot>(services.functions, "getClubMeetingSpectator", {timeout: 15000})({eventId, selectedUid: requestedUid});
        if (!current() || ticket !== generation || document.hidden || blocked) return;
        if (selectedRef.current !== requestedUid) { queued = true; return; }
        const data = result.data;
        if (data.eventId !== eventId || data.groupId !== groupId || data.selectedUid !== requestedUid || !Number.isFinite(data.serverNowMs) || !Array.isArray(data.locations)) throw new Error("invalid_spectator_response");
        if (readySubscriptions.size === (spectatorActiveScope.current === scope || worldCovers.current ? 3 : 4)) recoveryAttempts = 0;
        setState(old => ({scope, data: retainNewerSamples(old.scope === scope ? old.data : null, data), receivedAt: Date.now(), loading: false, error: null}));
      } catch (error) {
        if (current() && ticket === generation) fail(error);
      } finally {
        inFlight = false;
        if (queued && current() && !document.hidden && !blocked) { queued = false; signal(); }
      }
    };
    const signal = (sensitive = false) => {
      if (!current() || document.hidden || blocked) return;
      if (sensitive) { generation++; clear(null, true); }
      // 변경 신호가 계속 와도 타이머를 미루지 않는다. 최대 5초 창에서 한 번만 재조회한다.
      if (scheduled === undefined) scheduled = setTimeout(() => {
        scheduled = undefined;
        void load();
      }, Math.max(100, 5000 - (Date.now() - lastReadAt)));
    };
    spectatorSignal.current = code => signal(code === 4003 || code === 4004);
    const syncSignal = () => {
      const path = `events/${eventId}/spectator_signals/latest`;
      if (spectatorActiveScope.current === scope || worldCovers.current) {
        stopLocationSignal?.();
        stopLocationSignal = undefined;
        readySubscriptions.delete(path);
      } else if (!stopLocationSignal && stops.length && current() && !blocked && !document.hidden) {
        try {
          stopLocationSignal = onSnapshot(doc(services.firestore, path), () => {
            readySubscriptions.add(path);
            signal();
          }, fail);
        } catch (error) { fail(error); }
      }
    };
    syncLocationSignal.current = syncSignal;
    let starting: number | null = null;
    const start = async () => {
      if (starting === generation || stops.length) return;
      clearTimeout(recovery); recovery = undefined;
      starting = generation;
      const ticket = generation;
      try {
        await services.ensureAppCheckReady();
        if (!current() || document.hidden || blocked || ticket !== generation) return;
        // 신호 문서에는 위치가 없다. 권한·모임 상태가 바뀌어도 기존 조회로 다시 확인한다.
        const paths = [
          {path: `events/${eventId}`, sensitive: true},
          {path: `groups/${groupId}`, sensitive: true},
          {path: `groups/${groupId}/members/${uid}`, sensitive: true},
        ];
        for (const {path, sensitive} of paths) {
          if (blocked || ticket !== generation) break;
          const unsubscribe = onSnapshot(doc(services.firestore, path), () => { readySubscriptions.add(path); signal(sensitive); }, fail);
          if (blocked || ticket !== generation) unsubscribe(); else stops.push(unsubscribe);
        }
        syncSignal();
        void load();
      } catch (error) { if (ticket === generation) fail(error); }
      finally { if (starting === ticket) starting = null; }
    };
    refreshSelection.current = () => { lastReadAt = 0; void load(); };
    void start();
    const visible = () => { recoveryAttempts = 0; lastReadAt = 0; generation++; queued = false; stop(); clear(null, !document.hidden && !blocked); if (!document.hidden && !blocked) void start(); };
    const focus = () => { if (!document.hidden && !blocked) { recoveryAttempts = 0; if (!stops.length) void start(); else void load(); } };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { disposed = true; spectatorSignal.current = () => {}; syncLocationSignal.current = () => {}; stop(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [services, scope, groupId, eventId, uid, retry, spectatorRedis, viewer]);
  useEffect(() => { syncLocationSignal.current(); if (world && !worldViews) spectatorSignal.current(); }, [world, worldActive, worldViews]);
  useEffect(() => {
    if (!worldViews || !world) return;
    const now = Date.now();
    setState(old => {
      if (old.scope !== scope || !old.data) return old;
      // 화면 시각은 serverNowMs + 경과 시간이므로 둘을 함께 옮겨 서버 기준 시각이 되돌아가지 않게 한다.
      const serverNowMs = old.data.serverNowMs + Math.max(0, now - old.receivedAt);
      const data = applyWorldFrame(old.data, world, serverNowMs);
      return data === old.data ? old : {...old, data: {...data, serverNowMs}, receivedAt: now};
    });
  }, [world, worldViews, scope]);
  useEffect(() => {
    if (previousSelection.current !== selectedUid) {
      previousSelection.current = selectedUid;
      refreshSelection.current();
    }
  }, [selectedUid]);
  return { ...activeState, reload: () => setRetry(v => v + 1) };
}
