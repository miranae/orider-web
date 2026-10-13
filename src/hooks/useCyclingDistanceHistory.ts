import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { CyclingDistanceHistoryRequest, CyclingDistanceHistoryResponse } from "@shared/types/training-cycling-distance-history";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { trainingAnalysisPeriodsAvailable } from "../services/trainingAnalysisPeriods";
import { CYCLING_HISTORY_CAP, loadCyclingDistanceHistory, validateCyclingDistanceHistoryResponse, validCyclingDistanceHistoryRequest } from "../services/trainingCyclingDistanceHistory";

type Status = "idle" | "loading" | "partial" | "complete" | "capped" | "error" | "expired" | "invalidated" | "unsupported";
interface Session { scope: string; epoch: number; pages: CyclingDistanceHistoryResponse[]; status: Status }
/** SDK 계정 전환과 실제 선택 범위를 고정한다. 수동 버튼만 한 페이지를 읽는다. */
export function useCyclingDistanceHistory(ownerUid: string, activityId: string, selection: CyclingDistanceHistoryRequest | null, headIdentity: string) {
  const { user } = useAuth(), services = useFirebaseServices();
  const sdkUser = services.auth.currentUser;
  const eligible = !!selection && validCyclingDistanceHistoryRequest(selection) && !selection.cursor && trainingAnalysisPeriodsAvailable()
    && !!user && !user.isAnonymous && user.uid === ownerUid && !!sdkUser && !sdkUser.isAnonymous && sdkUser.uid === ownerUid;
  const scope = eligible ? JSON.stringify([ownerUid, activityId, headIdentity, selection!.rangeBasis, selection!.rangeBasis === "calendar_year" ? selection!.year : selection!.range, selection!.includeActivityTotals === true]) : null;
  const identity = useRef({ scope, services }), epoch = useRef(0), busy = useRef(false), session = useRef<Session | null>(null);
  if (identity.current.scope !== scope || identity.current.services !== services) {
    identity.current = { scope, services }; epoch.current++; busy.current = false; session.current = null;
  }
  const [result, setResult] = useState<Session | null>(null);
  const visible = result && result.scope === scope && result.epoch === epoch.current ? result : null;
  useEffect(() => {
    let authKey = `${services.auth.currentUser?.uid}:${services.auth.currentUser?.isAnonymous}`;
    return onAuthStateChanged(services.auth, authUser => {
      const next = `${authUser?.uid}:${authUser?.isAnonymous}`;
      if (next === authKey) return;
      authKey = next; epoch.current++; busy.current = false; session.current = null; setResult(null);
    });
  }, [services]);
  useEffect(() => () => { epoch.current++; busy.current = false; session.current = null; }, []);
  const expire = useCallback(() => {
    if (!scope || identity.current.scope !== scope || identity.current.services !== services) return;
    const tail = session.current?.pages[session.current.pages.length - 1];
    if (!tail || Date.now() < tail.expiresAt) return;
    epoch.current++; busy.current = false;
    const value: Session = { scope, epoch: epoch.current, pages: [], status: "expired" };
    session.current = value; setResult(value);
  }, [scope, services]);
  const last = visible?.pages[visible.pages.length - 1];
  useEffect(() => {
    if (!last) return;
    const delay = last.expiresAt - Date.now();
    if (delay <= 0) { expire(); return; }
    const timer = setTimeout(expire, delay); return () => clearTimeout(timer);
  }, [last, expire]);
  const run = useCallback(async (restart: boolean) => {
    if (!scope || !selection || busy.current || services.auth.currentUser?.uid !== ownerUid || services.auth.currentUser.isAnonymous) return;
    const previous = restart ? null : session.current;
    if (!restart && (!previous || ["complete", "capped", "expired", "invalidated", "unsupported"].includes(previous.status))) return;
    const pages = previous?.pages ?? [], before = pages[pages.length - 1];
    if (before && Date.now() >= before.expiresAt) { expire(); return; }
    if (restart) epoch.current++;
    const requestEpoch = epoch.current;
    const current = () => epoch.current === requestEpoch && identity.current.scope === scope && identity.current.services === services
      && services.auth.currentUser?.uid === ownerUid && !services.auth.currentUser.isAnonymous;
    const request = { ...selection, ...(before?.page.nextCursor ? { cursor: before.page.nextCursor } : {}) };
    busy.current = true;
    const loading: Session = { scope, epoch: requestEpoch, pages, status: "loading" };
    session.current = loading; setResult(loading);
    try {
      const response = validateCyclingDistanceHistoryResponse(await loadCyclingDistanceHistory(services, ownerUid, request), request);
      if (!current()) return;
      const next = [...pages, response], rows = next.flatMap(page => page.activities), scanned = next.reduce((sum, page) => sum + page.page.scannedActivityCount, 0);
      if (new Set(rows.map(row => row.activityId)).size !== rows.length) throw new Error("history_repeated_activity");
      if (scanned > CYCLING_HISTORY_CAP || rows.length > CYCLING_HISTORY_CAP) throw new Error("history_memory_cap");
      const value: Session = { scope, epoch: requestEpoch, pages: next, status: response.page.exhausted ? "complete" : scanned >= CYCLING_HISTORY_CAP ? "capped" : "partial" };
      session.current = value; setResult(value);
    } catch (error) {
      if (!current()) return;
      const detail = error as { code?: string; message?: string; details?: { reason?: string } }, code = detail.code?.replace("functions/", "");
      const expired = detail.details?.reason === "history_snapshot_expired" || detail.message === "history_snapshot_expired";
      const invalidated = !expired && code === "failed-precondition" || code === "permission-denied" || code === "unauthenticated" || detail.message === "account_changed" || detail.message === "history_repeated_activity";
      const unsupported = detail.message === "invalid_cycling_distance_history_response" || code === "invalid-argument" || code === "unimplemented" || code === "not-found";
      const value: Session = { scope, epoch: requestEpoch, pages: expired || invalidated || unsupported ? [] : pages, status: expired ? "expired" : invalidated ? "invalidated" : unsupported ? "unsupported" : "error" };
      session.current = value; setResult(value);
    } finally { if (current()) busy.current = false; }
  }, [scope, selection, services, ownerUid, expire]);
  return { available: scope !== null, status: visible?.status ?? "idle", pages: visible?.pages ?? [], start: () => run(true), loadMore: () => run(false), restart: () => run(true) };
}
