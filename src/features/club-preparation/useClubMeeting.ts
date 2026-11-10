import { useCallback, useEffect, useRef, useState } from "react";
import { type ClubMeetingSnapshot } from "../../services/clubMeetings";
import { logClientError } from "../../services/errorLogger";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useClubMeetingsApi } from "./useClubMeetingsApi";

const POLL_MS = 60_000;
const COMPLETION_POLL_MS = 5 * 60_000;

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
  const controller = useRef<(() => Promise<void>) | null>(null);
  const [state, setState] = useState<{
    scope: string;
    data: ClubMeetingSnapshot | null;
    loading: boolean;
    error: unknown;
  }>({ scope, data: null, loading: true, error: null });
  const reload = useCallback(async () => { await controller.current?.(); }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastWakeAt = -Infinity;
    let data: ClubMeetingSnapshot | null = null;
    let denied = false;
    let processingUntil: number | null = null;
    const identity = current.current;
    const valid = () => !disposed && current.current === identity;
    const clearTimer = () => { clearTimeout(timer); };
    const schedule = () => {
      clearTimer();
      if (!valid() || document.hidden || denied || inFlight) return;
      if (data?.runtimeWindow === null || data?.rideStatus === "CANCELLED") return;
      if (data?.rideStatus === "FINISHED") {
        if (data.completion?.state !== "processing" || processingUntil === null ||
          Date.now() + POLL_MS > processingUntil) return;
      } else if (data?.runtimeWindow && Date.now() >= data.runtimeWindow.closesAtMs) return;
      timer = setTimeout(() => {
        if (processingUntil !== null && Date.now() > processingUntil) return;
        if (data?.rideStatus !== "FINISHED" && data?.runtimeWindow &&
          Date.now() >= data.runtimeWindow.closesAtMs) return;
        void request(false).catch(() => {});
      }, POLL_MS);
    };
    // 유효한 요청 실패는 여기서 기록하고 다시 던진다. 자동 호출부는 이미 기록된 거부만 흡수한다.
    const request = async (manual: boolean) => {
      if (!valid() || (!manual && (document.hidden || inFlight))) return;
      clearTimer();
      const generation = ++identity.generation;
      inFlight = true;
      try {
        const next = await getClubMeetingSnapshot(eventId!);
        if (!valid() || generation !== identity.generation) return;
        if (next.groupId !== groupId) throw Object.assign(new Error("Wrong club"), { code: "permission-denied" });
        data = next;
        denied = false;
        if (next.rideStatus === "FINISHED" && next.completion?.state === "processing") {
          processingUntil ??= Date.now() + COMPLETION_POLL_MS;
        } else {
          processingUntil = null;
        }
        setState({ scope, data, loading: false, error: null });
      } catch (error) {
        if (valid() && generation === identity.generation) {
          const code = String((error as { code?: unknown })?.code ?? "");
          const reason = (error as { details?: { reason?: unknown } })?.details?.reason;
          denied = /(?:permission-denied|unauthenticated|not-found)/.test(code) ||
            (code === "functions/failed-precondition" && reason === "account-deleting");
          if (denied) data = null;
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
    controller.current = () => request(true);
    if (!document.hidden) void request(false).catch(() => {});
    // 같은 복귀 전환의 visibility/focus 이벤트를 한 요청으로 합친다.
    const wake = () => {
      if (document.hidden) {
        clearTimer();
        clearTimeout(wakeTimer);
        wakeTimer = undefined;
        lastWakeAt = -Infinity;
        return;
      }
      if (wakeTimer !== undefined || Date.now() - lastWakeAt < 1000) return;
      wakeTimer = setTimeout(() => {
        wakeTimer = undefined;
        lastWakeAt = Date.now();
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
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [scope, uid, groupId, eventId, getClubMeetingSnapshot, services]);
  return {
    data: state.scope === scope ? state.data : null,
    loading: state.scope !== scope || state.loading,
    error: state.scope === scope ? state.error : null,
    reload,
  };
}
