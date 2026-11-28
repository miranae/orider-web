import { useEffect, useRef, useState } from "react";
import { isLocalWorldEventEnabled, isProductionWorldEventEnabled, useWorldEvent } from "../ride-world/useWorldEvent";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { retainNewerSamples } from "./presentation";
import { applyWorldFrame, enterWorldMode, retainWorldPositions, worldFrameCoversRiders } from "./worldFrame";
import { useMeetingOutage } from "./useMeetingOutage";
import type { MeetingSpectatorSnapshot } from "./types";

/** 월드 프레임이 이 시간 동안 새로 오지 않으면 연결·준비 상태와 무관하게 위치 변경 신호·콜러블로 따라잡는다. */
export const WORLD_FRAME_STALL_MS = 5000;

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
  // 운영 플래그가 켜지면 월드 위치와 서버 계산 진행·격차를 바로 반영한다. 프레임이 보이는 주행자를 모두 담는 동안에만
  // 위치 변경 신호(=반복 콜러블)를 멈추고, 프레임이 빠지거나 멈추거나 끊기면 신호를 다시 열어 콜러블로 따라잡는다(P11).
  const worldViews = isProductionWorldEventEnabled();
  const world = useWorldEvent(activeState.data?.status === "LIVE" ? eventId : undefined,
    uid === services.auth.currentUser?.uid ? services.auth.currentUser : null, selectedUid, undefined, undefined, undefined, false, worldViews);
  const worldActive = world !== null;
  const worldViewsRef = useRef(worldViews);
  worldViewsRef.current = worldViews;
  // 정지 판정은 새 위치 표본(마커 표본 시각·진행·격차 변경)이 온 시각 기준이다. 시청자 수·명단만 바뀐 delta는 세지 않는다.
  const sampleKey = worldViews && world ? JSON.stringify([world.eventId, world.markers.map(m => [m.id, m.capturedAt, m.progressM, m.gapToLeaderM, m.gapToSelectedM])]) : null;
  const [stalledSamples, setStalledSamples] = useState<string | null>(null);
  useEffect(() => {
    if (sampleKey === null) return;
    const timer = setTimeout(() => setStalledSamples(sampleKey), WORLD_FRAME_STALL_MS);
    return () => clearTimeout(timer);
  }, [sampleKey]);
  // 커버 = 최근 5초 안에 새 표본이 온 프레임이 주행 참가자 전원의 서버 진행을 담고, 선택 대상이 있으면 그 선택 기준이
  // 확인된 프레임일 때. 아니면 위치 신호·콜러블 경로를 유지한다.
  const worldCovers = worldViews && world !== null && stalledSamples !== sampleKey && activeState.data !== null &&
    worldFrameCoversRiders(activeState.data, world, activeState.data.serverNowMs + Math.max(0, Date.now() - activeState.receivedAt), selectedUid);
  const worldCoversRef = useRef(worldCovers);
  worldCoversRef.current = worldCovers;
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
        if (readySubscriptions.size === (locationSignalOff() ? 3 : 4)) recoveryAttempts = 0;
        // 커버 중에는 주행 참가자의 월드 진행·격차를 남기고, 폴백 중에는 콜러블 값을 쓴다.
        const covered = worldCoversRef.current;
        const merge = worldViewsRef.current
          ? (old: MeetingSpectatorSnapshot | null, next: MeetingSpectatorSnapshot) => retainWorldPositions(old, next, covered)
          : retainNewerSamples;
        // 수신 시각은 응답 시점에 고정한다(serverNowMs와 함께 화면 시각의 기준이 된다).
        const receivedAt = Date.now();
        setState(old => ({scope, data: merge(old.scope === scope ? old.data : null, data), receivedAt, loading: false, error: null}));
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
    // 관전 Redis 신호가 준비됐거나 월드 프레임이 보이는 주행자를 모두 담으면 위치 변경 신호 구독을 쉰다.
    // 명단·권한 신호(event·group·member)는 계속 구독해 콜러블로 다시 확인한다.
    const locationSignalOff = () => spectatorActiveScope.current === scope || worldCoversRef.current;
    const syncSignal = () => {
      const path = `events/${eventId}/spectator_signals/latest`;
      if (locationSignalOff()) {
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
  const previousCovers = useRef(worldCovers);
  useEffect(() => {
    if (previousCovers.current === worldCovers) return;
    previousCovers.current = worldCovers;
    syncLocationSignal.current();
    // 월드가 빠지면(누락·정지·끊김) 다시 연 신호를 기다리지 않고 콜러블로 따라잡는다.
    if (!worldCovers) spectatorSignal.current();
  }, [worldCovers]);
  // 위치 신호를 쉬는 동안 명단 상태(완주·이탈·합류)가 바뀌면 콜러블로 한 번 다시 확인한다(5초 창에 묶인다).
  const rosterKey = worldViews && world ? JSON.stringify(world.roster) : null;
  const previousRoster = useRef(rosterKey);
  useEffect(() => {
    const changed = previousRoster.current !== null && rosterKey !== null && previousRoster.current !== rosterKey;
    previousRoster.current = rosterKey;
    if (changed && worldCoversRef.current) spectatorSignal.current();
  }, [rosterKey]);
  const appliedWorld = useRef(false);
  useEffect(() => {
    if (!worldViews || !world || !worldCovers) { appliedWorld.current = false; return; }
    const entering = !appliedWorld.current;
    appliedWorld.current = true;
    const now = Date.now();
    setState(old => {
      if (old.scope !== scope || !old.data) return old;
      // 화면 시각은 serverNowMs + 경과 시간이므로 둘을 함께 옮겨 서버 기준 시각이 되돌아가지 않게 한다.
      const serverNowMs = old.data.serverNowMs + Math.max(0, now - old.receivedAt);
      // 월드가 정상일 때만 반영한다. 커버로 바뀌면 콜러블 진행·격차를 지우고 최신 프레임으로 즉시 덮는다(P11, 출처 단일화).
      const data = applyWorldFrame(entering ? enterWorldMode(old.data) : old.data, world, serverNowMs);
      return data === old.data ? old : {...old, data: {...data, serverNowMs}, receivedAt: now};
    });
  }, [world, worldViews, worldCovers, scope]);
  // 월드 전체 장애(#4203) 동안에는 서버가 확정한 장애 회차의 좌표로 위치만 덮는다(#4215). 월드 프레임이 돌아오면 바로 빠진다.
  const outage = useMeetingOutage(worldViews && world === null && activeState.data?.status === "LIVE", groupId, eventId, viewer, selectedUid);
  useEffect(() => {
    if (previousSelection.current !== selectedUid) {
      previousSelection.current = selectedUid;
      refreshSelection.current();
    }
  }, [selectedUid]);
  const shown = outage && activeState.data ? {...activeState, receivedAt: outage.receivedAt,
    data: {...activeState.data, serverNowMs: outage.data.serverNowMs, locations: outage.data.locations}} : activeState;
  return { ...shown, reload: () => setRetry(v => v + 1) };
}
