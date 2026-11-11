import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ClubMeetingSnapshot } from "../../services/clubMeetings";
import { logClientError } from "../../services/errorLogger";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useClubMeetingsApi } from "./useClubMeetingsApi";

const RETRY_DELAYS = [1000, 5000, 15_000];

export function useClubMeeting(
  eventId: string | undefined,
  uid: string | undefined,
  groupId: string | undefined,
) {
  const { getClubMeetingSnapshot } = useClubMeetingsApi();
  const services = useFirebaseServices();
  const scope = `${uid ?? ""}/${groupId ?? ""}/${eventId ?? ""}`;
  const current = useRef({ scope, generation: 0 });
  if (current.current.scope !== scope) {
    current.current = { scope, generation: current.current.generation + 1 };
  }
  const controller = useRef<((cursor?: string) => Promise<void>) | null>(null);
  const [state, setState] = useState<{
    scope: string;
    data: ClubMeetingSnapshot | null;
    loading: boolean;
    error: unknown;
  }>({ scope, data: null, loading: true, error: null });
  const reload = useCallback(async () => { await controller.current?.(); }, []);
  const loadOlderNotices = useCallback(async () => {
    if (state.scope === scope && state.data?.noticeNextCursor) await controller.current?.(state.data.noticeNextCursor);
  }, [scope, state]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastWakeAt = -Infinity;
    let data: ClubMeetingSnapshot | null = null;
    let denied = false;
    let dirty = false;
    let signalVersion: string | null | undefined;
    let consumedSignalVersion: string | null | undefined;
    let failures = 0;
    let signalFailures = 0;
    let subscription = 0;
    let signalFailed = false;
    let retrySignalTimer: ReturnType<typeof setTimeout> | undefined;
    let stops: (() => void)[] = [];
    const newerSignal = (candidate: string | null | undefined, previous: string | null | undefined) => {
      if (!candidate) return false;
      if (!previous) return true;
      const [seconds, nanos] = candidate.split(":").map(Number);
      const [readSeconds, readNanos] = previous.split(":").map(Number);
      return seconds! > readSeconds! || seconds === readSeconds && nanos! > readNanos!;
    };
    const hasNewerSignal = () => newerSignal(signalVersion, consumedSignalVersion);
    const automatic = () => !document.hidden && !denied && data?.runtimeWindow !== null &&
      data?.rideStatus !== "CANCELLED" && (!data?.runtimeWindow ||
        Date.now() >= data.runtimeWindow.opensAtMs && Date.now() < data.runtimeWindow.closesAtMs);
    const identity = current.current;
    const valid = () => !disposed && current.current === identity;
    const clearTimer = () => { clearTimeout(timer); };
    const schedule = () => {
      clearTimer();
      if (valid() && !document.hidden && !denied && !inFlight && data?.runtimeWindow &&
        Date.now() < data.runtimeWindow.opensAtMs && data.rideStatus !== "CANCELLED") {
        timer = setTimeout(() => {
          dirty = true;
          if (automatic()) void request(false).catch(() => {});
          else schedule();
        }, Math.min(2_147_483_647, data.runtimeWindow.opensAtMs - Date.now()));
        return;
      }
      if (!valid() || !automatic() || inFlight) return;
      const delay = failures ? RETRY_DELAYS[failures - 1] : dirty ? 0 : undefined;
      if (delay === undefined) return;
      timer = setTimeout(() => {
        if (automatic()) void request(false).catch(() => {});
      }, delay);
    };
    // 유효한 요청 실패는 여기서 기록하고 다시 던진다. 자동 호출부는 이미 기록된 거부만 흡수한다.
    const request = async (manual: boolean, cursor?: string) => {
      if (!valid() || (!manual && (document.hidden || inFlight || denied))) return;
      clearTimer();
      const generation = ++identity.generation;
      const dispatchedSignalVersion = signalVersion;
      inFlight = true;
      dirty = false;
      try {
        const next = await getClubMeetingSnapshot(eventId!, cursor);
        if (!valid() || generation !== identity.generation) return;
        if (next.groupId !== groupId) throw Object.assign(new Error("Wrong club"), { code: "permission-denied" });
        data = next;
        denied = false;
        failures = 0;
        // 성공한 현재 요청의 시작 신호까지만 소비한다. 응답에 버전이 없거나
        // 오래된 버전이 반복돼도 같은 신호를 무한 재조회하지 않는다.
        if (newerSignal(dispatchedSignalVersion, consumedSignalVersion)) consumedSignalVersion = dispatchedSignalVersion;
        if (newerSignal(next.snapshotSignalVersion, consumedSignalVersion)) consumedSignalVersion = next.snapshotSignalVersion;
        if (hasNewerSignal()) dirty = true;
        setState({ scope, data, loading: false, error: null });
      } catch (error) {
        if (valid() && generation === identity.generation) {
          const code = String((error as { code?: unknown })?.code ?? "");
          const reason = (error as { details?: { reason?: unknown } })?.details?.reason;
          denied = /(?:permission-denied|unauthenticated|not-found)/.test(code) ||
            (code === "functions/failed-precondition" && reason === "account-deleting");
          if (denied) data = null;
          failures++;
          const diagnosticCode = /^(?:functions\/)?(?:cancelled|unknown|invalid-argument|deadline-exceeded|not-found|already-exists|permission-denied|resource-exhausted|failed-precondition|aborted|out-of-range|unimplemented|internal|unavailable|data-loss|unauthenticated)$/.test(code)
            ? code.replace(/^functions\//, "") : "unknown";
          logClientError("ClubMeetingSnapshot.read", new Error("모임 스냅샷 읽기 실패"),
            { code: diagnosticCode, terminal: denied }, services);
          setState({ scope, data, loading: false, error });
        }
        throw error;
      } finally {
        if (valid() && generation === identity.generation) {
          inFlight = false;
          schedule();
        }
      }
    };
    setState({ scope, data: null, loading: Boolean(uid && groupId && eventId), error: null });
    if (!uid || !groupId || !eventId) return;
    controller.current = async cursor => {
      await request(true, cursor);
      if (!stops.length) { signalFailures = 0; subscribe(); }
    };
    const changed = () => {
      if (!valid()) return;
      dirty = true;
      schedule();
    };
    const subscribe = () => {
      clearTimeout(retrySignalTimer);
      const attempt = ++subscription;
      const subscribed = () => valid() && attempt === subscription;
      stops.forEach(stop => stop());
      stops = [];
      if (!valid() || document.hidden || denied) return;
      const failed = (error: unknown) => {
        if (!subscribed()) return;
        subscription++;
        stops.forEach(stop => stop());
        stops = [];
        const code = String((error as {code?: unknown})?.code ?? "");
        const terminal = /^(?:permission-denied|unauthenticated|not-found)$/.test(code);
        logClientError("ClubMeetingSnapshot.signal", new Error("모임 변경 신호 읽기 실패"),
          { code: terminal ? code : "unknown", terminal }, services);
        if (terminal) {
          denied = true;
          data = null;
          identity.generation++;
          inFlight = false;
          clearTimer();
          setState({ scope, data: null, loading: false, error });
          return;
        }
        signalFailed = true;
        setState({ scope, data, loading: false, error });
        const delay = RETRY_DELAYS[signalFailures++];
        if (delay !== undefined) retrySignalTimer = setTimeout(subscribe, delay);
      };
      try {
        stops.push(onSnapshot(doc(services.firestore, `events/${eventId}/meeting_snapshot_signals/latest`), { includeMetadataChanges: true }, snapshot => {
          if (!subscribed() || snapshot.metadata.fromCache) return;
          signalFailures = 0;
          const stamp = snapshot.data()?.updatedAt;
          signalVersion = stamp ? `${stamp.seconds}:${stamp.nanoseconds}` : null;
          if (signalFailed) { signalFailed = false; changed(); }
          else if (data && !inFlight && hasNewerSignal()) changed();
        }, failed));
        for (const path of [`events/${eventId}`, `groups/${groupId}`, `groups/${groupId}/members/${uid}`]) {
          let previous: string | undefined;
          let previousContext: string | undefined;
          stops.push(onSnapshot(doc(services.firestore, path), { includeMetadataChanges: true }, snapshot => {
            if (!subscribed() || snapshot.metadata.fromCache || denied) return;
            const value = snapshot.data();
            // 카운터·heartbeat와 위치 갱신은 준비 화면을 다시 읽지 않는다.
            const signature = JSON.stringify(path.startsWith("events/") ?
              [snapshot.exists(), value?.deletedAt, value?.info?.deletedAt, value?.info?.status,
                value?.info?.kind, value?.info?.groupId, value?.info?.creatorId,
                value?.info?.startTime, value?.info?.endTime, value?.info?.resultRevision] :
              path === `groups/${groupId}` ?
                [snapshot.exists(), value?.isActive !== false, value?.membershipVersion ?? 0, value?.memberCount ?? 0] :
                [snapshot.exists(), ["active", "approved"].includes(value?.status)]);
            if (path.startsWith("events/")) {
              const context = JSON.stringify([snapshot.exists(), value?.deletedAt, value?.info?.deletedAt,
                value?.info?.kind, value?.info?.groupId, value?.info?.creatorId]);
              const unavailable = !snapshot.exists() || value?.deletedAt || value?.info?.deletedAt ||
                value?.info?.kind !== "CLUB_MEETING" || value?.info?.groupId !== groupId;
              if (previousContext === undefined && unavailable || previousContext !== undefined && previousContext !== context) {
                // 문맥 변경 전 요청이 예전 명단·주최 권한을 복원하지 못하게 한다.
                identity.generation++;
                inFlight = false;
                data = null;
                setState({scope, data: null, loading: true, error: null});
                void request(false).catch(() => {});
                previous = signature;
                previousContext = context;
                return;
              }
              previousContext = context;
            }
            if (previous !== undefined && previous !== signature) {
              if (inFlight) changed();
              else void request(false).catch(() => {});
            }
            previous = signature;
          }, failed));
        }
      } catch (error) { failed(error); }
    };
    subscribe();
    if (!document.hidden) void request(false).catch(() => {});
    // 같은 복귀 전환의 visibility/focus 이벤트를 한 요청으로 합친다.
    const wake = () => {
      if (document.hidden) {
        clearTimer();
        clearTimeout(wakeTimer);
        wakeTimer = undefined;
        lastWakeAt = -Infinity;
        subscription++;
        stops.forEach(stop => stop());
        stops = [];
        clearTimeout(retrySignalTimer);
        return;
      }
      if (wakeTimer !== undefined || Date.now() - lastWakeAt < 1000) return;
      wakeTimer = setTimeout(() => {
        wakeTimer = undefined;
        lastWakeAt = Date.now();
        signalFailures = 0;
        subscribe();
        void request(false).catch(() => {});
      }, 0);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      disposed = true;
      controller.current = null;
      clearTimer();
      clearTimeout(wakeTimer);
      clearTimeout(retrySignalTimer);
      stops.forEach(stop => stop());
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [scope, uid, groupId, eventId, getClubMeetingSnapshot, services]);
  return {
    data: state.scope === scope ? state.data : null,
    loading: state.scope !== scope || state.loading,
    error: state.scope === scope ? state.error : null,
    reload,
    loadOlderNotices,
  };
}
