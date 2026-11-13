import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { createPublicActivityClient, isPublicActivityAccessError, type PublicActivityDetail } from "../services/publicActivityDetail";
import { startJourneyMeasurement, type JourneyOutcome } from "../services/journeyMeasurement";
export interface PublicActivitySessionOptions {
 activityId: string; retryKey: number; embedded?: boolean; initialDetail?: PublicActivityDetail;
 detailMeasurement?: (outcome: JourneyOutcome) => void; onDetailRetry?: () => void;
 onReady: () => void; onError: (code: "activity_load_failed") => void;
}
/**
 * 마지막 권한 확인이 이 시간 안이면, 보이는 탭의 포커스 재확인 동안 화면을 가리지 않는다.
 * 주기적 재확인은 두지 않는다 — 띄워 둔 화면이 30초마다 가려졌다 다시 그려지고
 * 탭 하나가 하루 수천 번 함수를 호출했다. 재확인은 탭 복귀·포커스 때만 한다.
 */
export const PUBLIC_ACCESS_VERIFIED_TTL_MS = 5 * 60_000;
function sameJson(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}
function accessWasLost(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return isPublicActivityAccessError(error) || code === "functions/unauthenticated"
    || error instanceof Error && error.message === "account_changed";
}
/** Current-public-access lifecycle; presentation and private owner readers stay outside this hook. */
export function usePublicActivitySession({ activityId, retryKey, embedded = false, initialDetail, onReady, onError, detailMeasurement: routeMeasurement, onDetailRetry }: PublicActivitySessionOptions) {
  const services = useFirebaseServices();
  const { user } = useAuth();
  const client = useMemo(() => createPublicActivityClient(services), [services, user?.uid, services.auth.currentUser]);
  const session = useMemo(() => ({ client, activityId, services, viewer: services.auth.currentUser }), [client, activityId, services]);
  const [storedDetail, setStoredDetail] = useState<{ session: typeof session; value: PublicActivityDetail | null } | null>(null);
  const detail = storedDetail?.session === session ? storedDetail.value : null;
  const setDetail = useCallback((value: PublicActivityDetail | null | ((current: PublicActivityDetail | null) => PublicActivityDetail | null)) => {
    setStoredDetail(current => ({ session, value: typeof value === "function" ? value(current?.session === session ? current.value : null) : value }));
  }, [session]);
  const [loading, setLoading] = useState(true);
  const [mapFresh, setMapFresh] = useState(false);
  const [verifiedMap, setVerifiedMap] = useState<{ client: typeof client; activityId: string; value: PublicActivityDetail["mapPreview"] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [removed, setRemoved] = useState<{ scope: string; action: "hide" | "block" } | null>(null);
  const safetyScope = `${user?.uid ?? "anonymous"}:${activityId}`;
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<{ session: typeof session; text: string } | null>(null);
  const text = draft?.session === session ? draft.text : "";
  const setText = useCallback((value: string) => setDraft({ session, text: value }), [session]);
  const acceptedSession = useRef<typeof session | null>(null);
  const requestSession = useRef<typeof session | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [posted, setPosted] = useState(false);
  const generation = useRef(0);
  const settledGeneration = useRef(0);
  const verifiedAt = useRef<number | null>(null);
  const detailMeasurement = useRef<ReturnType<typeof startJourneyMeasurement> | null>(null);
  const socialMeasurement = useRef<ReturnType<typeof startJourneyMeasurement> | null>(null);
  const inFlight = useRef(false);
  const commentRequest = useRef<{ text: string; id: string } | null>(null);
  const revokeAccess = useCallback(() => {
    socialMeasurement.current?.("access_denied");
    generation.current += 1; inFlight.current = false; commentRequest.current = null; acceptedSession.current = null;
    setDetail(null); setFailed(true); setAccessDenied(true); setText(""); setBusy(false);
  }, [setDetail, setText]);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    const request = ++generation.current;
    const finish = (attempt === 0 ? routeMeasurement : undefined) ?? startJourneyMeasurement("activity_detail_ready", embedded ? "embedded_public_activity" : "web_public_activity", "detail");
    detailMeasurement.current = finish;
    setMapFresh(false); setDetail(null); setLoading(true); setFailed(false); setAccessDenied(false); setPosted(false); setMutationError(false); setBusy(false); inFlight.current = false;
    if (requestSession.current !== session) { commentRequest.current = null; acceptedSession.current = null; }
    requestSession.current = session;
    const load = attempt === 0 && retryKey === 0 && initialDetail?.activity.id === activityId ? Promise.resolve(initialDetail) : client.load(activityId);
    void load.then(data => {
      if (generation.current !== request) return;
      settledGeneration.current = request;
      acceptedSession.current = session; verifiedAt.current = Date.now();
      setDetail(data); setVerifiedMap({ client, activityId, value: data.mapPreview }); setMapFresh(document.visibilityState !== "hidden"); setLoading(false); callbacks.current.onReady();
    }).catch(error => {
      if (generation.current !== request) return;
      settledGeneration.current = request;
      if (accessWasLost(error)) { setText(""); commentRequest.current = null; acceptedSession.current = null; }
      setLoading(false); setFailed(true); setAccessDenied(accessWasLost(error)); callbacks.current.onError("activity_load_failed");
    });
    return () => { generation.current += 1; finish("cancelled"); socialMeasurement.current?.("cancelled"); };
  }, [activityId, client, retryKey, attempt, initialDetail, embedded, setDetail, routeMeasurement, session, setText]);
  useEffect(() => {
    if (loading || settledGeneration.current !== generation.current) return;
    if (failed) detailMeasurement.current?.(accessDenied ? "access_denied" : "error");
    else if (!routeMeasurement && detail?.activity.id === activityId) detailMeasurement.current?.("success");
  }, [loading, failed, accessDenied, detail, activityId, routeMeasurement, attempt]);

  const hasDetail = detail !== null;
  useEffect(() => {
    if (loading || failed || !hasDetail) return;
    let alive = true, sequence = 0, refreshing = false;
    const visible = () => document.visibilityState !== "hidden";
    const refresh = async (fromFocus = false) => {
      // Focusing an already visible WK document can be part of the tap itself.
      // Keep only this session's recently verified content until that read settles;
      // backgrounding and an expired verification still mask at once.
      const age = verifiedAt.current === null ? Infinity : Date.now() - verifiedAt.current;
      const preserveVerified = fromFocus && visible() && age >= 0 && age < PUBLIC_ACCESS_VERIFIED_TTL_MS
        && acceptedSession.current === session && services.auth.currentUser === session.viewer;
      if (!preserveVerified) setMapFresh(false);
      if (!visible() || refreshing) return;
      refreshing = true;
      const request = ++sequence, ownerGeneration = generation.current;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const fresh = await Promise.race([client.load(activityId), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("public_map_refresh_timeout")), preserveVerified ? Math.min(10_000, PUBLIC_ACCESS_VERIFIED_TTL_MS - age) : 10_000); })]);
        if (!alive || request !== sequence || ownerGeneration !== generation.current || !visible()) return;
        // 내용이 같으면 기존 객체를 유지해 분석 화면 전체가 다시 그려지지 않게 한다.
        setDetail(current => {
          if (!current) return current;
          const next = { ...fresh, ...(inFlight.current ? {
            viewerHasKudos: current.viewerHasKudos,
            activity: { ...fresh.activity, kudosCount: current.activity.kudosCount, commentCount: current.activity.commentCount },
          } : {}) };
          return sameJson(current, next) ? current : next;
        });
        verifiedAt.current = Date.now();
        setVerifiedMap(current => current?.client === client && current.activityId === activityId && sameJson(current.value, fresh.mapPreview)
          ? current : { client, activityId, value: fresh.mapPreview });
        setMapFresh(true);
      } catch (reason) {
        if (!alive || request !== sequence || ownerGeneration !== generation.current) return;
        if (accessWasLost(reason)) revokeAccess();
        setMapFresh(false);
        // Network failures retain text/drafts, but never restore the old public geometry.
      } finally { clearTimeout(timeout); if (request === sequence) refreshing = false; }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") { sequence++; refreshing = false; setMapFresh(false); }
      else void refresh();
    };
    const focus = () => { void refresh(true); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    return () => { alive = false; sequence++; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", focus); };
  // Revalidation must not restart its cadence after its own DTO update.
  }, [activityId, client, loading, failed, revokeAccess, hasDetail, setDetail, services, session]);

  const mutate = useCallback(async (action: "kudos" | "comment") => {
    if (!user || user.isAnonymous || !detail || inFlight.current || (action === "comment" && !text.trim())) return;
    inFlight.current = true; setBusy(true); setMutationError(false); setPosted(false);
    const request = generation.current;
    const finish = startJourneyMeasurement("social_action_result", embedded ? "embedded_public_activity" : "web_public_activity", action);
    socialMeasurement.current = finish;
    let outcome: JourneyOutcome = "success";
    try {
      const countKey = action === "kudos" ? "kudosCount" : "commentCount";
      const previousCount = detail.activity[countKey];
      let confirmed = detail;
      if (action === "kudos") {
        const result = await client.setKudos(activityId, !detail.viewerHasKudos);
        if (request !== generation.current) return;
        confirmed = { ...detail, viewerHasKudos: result.enabled, activity: { ...detail.activity,
          kudosCount: Math.max(0, detail.activity.kudosCount + (result.enabled === detail.viewerHasKudos ? 0 : result.enabled ? 1 : -1)) } };
      } else {
        const body = text.trim();
        if (commentRequest.current?.text !== body) commentRequest.current = { text: body, id: crypto.randomUUID() };
        await client.postComment(activityId, body, commentRequest.current.id);
        if (request !== generation.current) return;
        setText(""); setPosted(true); commentRequest.current = null;
        confirmed = { ...detail, activity: { ...detail.activity, commentCount: previousCount + 1 } };
      }
      setDetail(confirmed);
      // Aggregate triggers can lag the confirmed write. Preserve only the unchanged
      // pre-write count while retrying; changed server counts remain authoritative.
      try {
        for (let read = 0; read < 3; read += 1) {
          if (read > 0) await new Promise(resolve => setTimeout(resolve, read * 250));
          if (request !== generation.current) return;
          const refreshed = await client.load(activityId);
          if (request !== generation.current) return;
          const aggregatePending = confirmed.activity[countKey] !== previousCount && refreshed.activity[countKey] === previousCount;
          setDetail(aggregatePending ? { ...refreshed, activity: { ...refreshed.activity, [countKey]: confirmed.activity[countKey] } } : refreshed);
          if (!aggregatePending) break;
        }
      } catch (error) {
        outcome = accessWasLost(error) ? "access_denied" : "readback_error";
        if (request === generation.current) {
          if (accessWasLost(error)) { revokeAccess(); }
          else setMutationError(true);
        }
      }
    } catch (error) {
      outcome = accessWasLost(error) ? "access_denied" : "error";
      if (request === generation.current) {
        if (accessWasLost(error)) {
          revokeAccess();
        } else setMutationError(true);
      }
    } finally {
      finish(request === generation.current ? outcome : "cancelled");
      if (request === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }, [activityId, client, detail, text, user, embedded, setDetail, setText, revokeAccess]);

  const remove = (action: "hide" | "block") => {
    generation.current += 1; inFlight.current = false; commentRequest.current = null;
    socialMeasurement.current?.("cancelled"); setDetail(null); setText(""); setBusy(false); setRemoved({ scope: safetyScope, action });
  };
  return { user, client, detail, setDetail, loading, failed, accessDenied, removed, safetyScope, mapFresh, verifiedMap,
    text, setText, busy, mutationError, posted, mutate, revokeAccess, remove, detailMeasurement: detailMeasurement.current ?? undefined, retry: () => {
      // A route-owned retry unmounts this controller. Keep a known session local
      // through transient failures so its draft and uncertain-write ID survive.
      if (acceptedSession.current === session && !accessDenied) setAttempt(value => value + 1);
      else if (onDetailRetry) onDetailRetry();
      else setAttempt(value => value + 1);
    } };
}
