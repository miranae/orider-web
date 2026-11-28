import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import type { MeetingSpectatorSnapshot } from "./types";

/** 가용성 확인·장애 스냅샷 조회 간격. 앱(MeetingRideFeed·EventLocationFirestoreClient)과 같다. */
export const OUTAGE_POLL_MS = 4000;
const SUCCESS_VALID_MS = 12_000, HANDSHAKE_TIMEOUT_MS = 3000, FAILURE_WINDOW_MS = 30_000, MAX_ATTEMPT_GAP_MS = 15_000;
const INGRESS = "wss://world.orider.co.kr/events";

/**
 * 공개 월드 입구 WS 핸드셰이크 확인(앱 shared MeetingWorldIngress 와 같은 규칙). 인증·구독 없이 열리면 바로 닫는다.
 * 실패 자체는 장애 승인이 아니다. 30초 넘게 끊김 없이(시도 간격 15초 이내) 실패할 때만 서버 가용성 확인이 필요하다고 본다.
 */
export function createIngressProbe(open: (url: string) => WebSocket = url => new WebSocket(url), clock: () => number = Date.now) {
  let lastSuccess = -Infinity, nextProbe = 0, recovery = 0;
  let failures: {first: number; latest: number} | null = null;
  const reachable = () => { recovery++; lastSuccess = clock(); failures = null; };
  const fail = (at: number) => {
    if (lastSuccess >= at) return;
    failures = failures && at - failures.latest <= MAX_ATTEMPT_GAP_MS ? {first: failures.first, latest: at} : {first: at, latest: at};
  };
  return {
    reachable,
    /** 복구(핸드셰이크 성공·서버 available)마다 올라간다. 장애 회차를 받은 뒤 바뀌면 그 회차를 버린다. */
    recovery: () => recovery,
    needsAuthority(): boolean {
      const now = clock();
      if (now - lastSuccess < SUCCESS_VALID_MS) return false;
      if (now >= nextProbe) {
        nextProbe = now + OUTAGE_POLL_MS;
        let settled = false;
        let socket: WebSocket | undefined;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ok) reachable(); else fail(now);
          try { socket?.close(); } catch { /* 이미 닫힘 */ }
        };
        const timer = setTimeout(() => settle(false), HANDSHAKE_TIMEOUT_MS);
        try {
          socket = open(INGRESS);
          socket.onopen = () => settle(true);
          socket.onerror = () => settle(false);
          socket.onclose = () => settle(false);
        } catch { settle(false); }
      }
      return failures !== null && now - failures.latest <= MAX_ATTEMPT_GAP_MS && failures.latest - failures.first >= FAILURE_WINDOW_MS;
    },
  };
}

const ingress = createIngressProbe();

interface Availability { status?: string; episode?: string | null; expiresAtMs?: number; serverNowMs?: number }
export interface MeetingOutageView { scope: string; episode: string; data: MeetingSpectatorSnapshot; receivedAt: number }

/**
 * 월드 전체 장애(#4203) 동안 웹 관전 좌표를 서버 장애 회차 스냅샷으로 채운다(#4215).
 * - active: 운영 월드 관전이 켜져 있고 모임이 LIVE 인데 월드 프레임이 없을 때만 true 로 넘긴다.
 * - 공개 핸드셰이크가 계속 실패할 때만 getMeetingWorldAvailability 를 4초 간격으로 확인한다.
 * - 서버가 회차를 확정한 동안에만 그 회차로 getClubMeetingSpectator 를 4초 이상 간격, 한 번에 하나만 조회한다.
 * - 복구(available·핸드셰이크 성공·회차 만료·월드 프레임 복귀)되면 즉시 멈추고 값을 지운다.
 */
export function useMeetingOutage(active: boolean, groupId: string | undefined, eventId: string | undefined, viewer: User | null,
  selectedUid: string | null, probe = ingress): MeetingOutageView | null {
  const services = useFirebaseServices();
  const scope = `${viewer?.uid ?? ""}/${groupId ?? ""}/${eventId ?? ""}`;
  const selectedRef = useRef(selectedUid);
  selectedRef.current = selectedUid;
  const [view, setView] = useState<MeetingOutageView | null>(null);
  useEffect(() => {
    setView(null);
    if (!active || !groupId || !eventId || !viewer) return;
    let disposed = false, pending = false, timer: ReturnType<typeof setTimeout> | undefined;
    let episode: string | null = null, expiresAt = 0, recovery = 0, lastPoll = -Infinity;
    const current = () => !disposed && services.auth.currentUser === viewer;
    const clear = () => { episode = null; expiresAt = 0; setView(null); };
    const report = (stage: string, error: unknown) => logClientError("ClubMeetingSpectator.outage", error, {eventId, stage}, services, viewer);
    const poll = async (requested: string) => {
      pending = true;
      lastPoll = Date.now();
      const selected = selectedRef.current;
      try {
        const result = await httpsCallable<{eventId: string; selectedUid: string | null; outageEpisode: string}, MeetingSpectatorSnapshot & {outageEpisode?: string | null}>(
          services.functions, "getClubMeetingSpectator", {timeout: 15000})({eventId, selectedUid: selected, outageEpisode: requested});
        const data = result.data;
        if (!current() || episode !== requested || selectedRef.current !== selected) return;
        if (data.outageEpisode !== requested || data.eventId !== eventId || data.groupId !== groupId || data.status !== "LIVE" ||
            data.selectedUid !== selected || !Number.isFinite(data.serverNowMs) || !Array.isArray(data.locations)) { setView(null); return; }
        setView({scope, episode: requested, data, receivedAt: Date.now()});
      } catch (error) {
        if (current()) { setView(null); report("outage_snapshot", error); }
      } finally { pending = false; }
    };
    const tick = async () => {
      timer = undefined;
      const started = Date.now();
      try {
        if (episode && (started >= expiresAt || probe.recovery() !== recovery)) clear();
        if (document.hidden || (!episode && !probe.needsAuthority())) return;
        const ticket = probe.recovery();
        let status: Availability | null = null;
        try {
          await services.ensureAppCheckReady();
          status = (await httpsCallable<Record<string, never>, Availability>(services.functions, "getMeetingWorldAvailability", {timeout: OUTAGE_POLL_MS})({})).data;
        } catch (error) { if (current()) report("availability", error); }
        if (!current()) return;
        if (probe.recovery() !== ticket) { clear(); return; }
        if (status?.status === "available") { probe.reachable(); clear(); return; }
        const ttl = (status?.expiresAtMs ?? 0) - (status?.serverNowMs ?? 0);
        const next = status?.status === "outage" && typeof status.episode === "string" && status.episode ? status.episode : null;
        if (!next || !(ttl >= 1 && ttl <= 90_000) || Date.now() >= started + ttl) { clear(); return; }
        if (episode !== next) setView(null);
        episode = next;
        expiresAt = started + ttl;
        recovery = ticket;
        if (!pending && Date.now() - lastPoll >= OUTAGE_POLL_MS) void poll(next);
      } finally {
        if (!disposed) timer = setTimeout(() => void tick(), Math.max(1, OUTAGE_POLL_MS - (Date.now() - started)));
      }
    };
    void tick();
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, groupId, eventId, viewer, services, scope, probe]);
  return view?.scope === scope && active ? view : null;
}
