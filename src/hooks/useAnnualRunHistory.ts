import { useCallback, useEffect, useRef, useState } from "react";
import type { TrainingAnalysisHistoryResponse, TrainingAnalysisHistoryRequest } from "@shared/types/training-analysis-history";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadTrainingAnalysisHistory, validateTrainingAnalysisHistoryResponse } from "../services/trainingAnalysisHistory";
import { trainingAnalysisPeriodsAvailable } from "../services/trainingAnalysisPeriods";
import { ANNUAL_HISTORY_CAP } from "../features/activity/detail/annualRunHistory";

type Status = "idle" | "loading" | "partial" | "complete" | "capped" | "error" | "expired" | "invalidated" | "unsupported";
interface Session { scope: string; epoch: number; pages: TrainingAnalysisHistoryResponse[]; status: Status }
/** 수동 버튼만 한 페이지를 요청한다. 계정·활동·연도·서비스 변경 시 이전 응답을 버린다. */
export function useAnnualRunHistory(ownerUid: string, activityId: string, year: number, includeExpandedRunDistances = true) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const scope = user && !user.isAnonymous && user.uid === ownerUid && trainingAnalysisPeriodsAvailable() ? JSON.stringify([ownerUid, activityId, year, includeExpandedRunDistances ? "run-distance-v2" : "legacy-v1"]) : null;
  const identity = useRef({ scope, services });
  const epoch = useRef(0);
  const session = useRef<Session | null>(null);
  const busy = useRef(false);
  if (identity.current.scope !== scope || identity.current.services !== services) {
    identity.current = { scope, services }; epoch.current++; session.current = null; busy.current = false;
  }
  const [result, setResult] = useState<Session | null>(null);
  const visible = result && result.scope === scope && result.epoch === epoch.current ? result : null;
  const expire = useCallback(() => {
    if (!scope || identity.current.scope !== scope || identity.current.services !== services) return;
    const tail = session.current?.pages[session.current.pages.length - 1];
    if (!tail || Date.now() < tail.expiresAt) return;
    epoch.current++; busy.current = false;
    const value: Session = { scope, epoch: epoch.current, pages: [], status: "expired" };
    session.current = value; setResult(value);
  }, [scope, services]);
  useEffect(() => () => { epoch.current++; session.current = null; busy.current = false; }, []);
  const last = visible?.pages[visible.pages.length - 1];
  useEffect(() => {
    if (!last) return;
    const delay = last.expiresAt - Date.now();
    if (delay <= 0) { expire(); return; }
    const timer = setTimeout(expire, delay);
    return () => clearTimeout(timer);
  }, [last, expire]);
  const run = useCallback(async (restart: boolean) => {
    if (!scope || busy.current) return;
    const previous = restart ? null : session.current;
    if (!restart && (!previous || ["complete", "capped", "expired", "invalidated", "unsupported"].includes(previous.status))) return;
    const pages = previous?.pages ?? [];
    const before = pages[pages.length - 1];
    if (before && Date.now() >= before.expiresAt) { expire(); return; }
    if (restart) epoch.current++;
    const currentEpoch = epoch.current;
    const current = () => identity.current.scope === scope && identity.current.services === services && epoch.current === currentEpoch;
    const request: TrainingAnalysisHistoryRequest = { mode: "history_page", discipline: "run", calendarBasis: "Asia/Seoul", year, ...(includeExpandedRunDistances ? { includeExpandedRunDistances: true as const } : {}), ...(before?.page.nextCursor ? { cursor: before.page.nextCursor } : {}) };
    busy.current = true;
    const loading: Session = { scope, epoch: currentEpoch, pages, status: "loading" };
    session.current = loading; setResult(loading);
    try {
      const response = validateTrainingAnalysisHistoryResponse(await loadTrainingAnalysisHistory(services, ownerUid, request), request);
      if (!current()) return;
      if (before && (response.expiresAt !== before.expiresAt || response.range.fromInclusive !== before.range.fromInclusive)) throw new Error("history_chain_changed");
      const next = [...pages, response], rows = next.flatMap(page => page.activities);
      const scanned = next.reduce((sum, page) => sum + page.page.scannedActivityCount, 0);
      if (new Set(rows.map(row => row.activityId)).size !== rows.length) throw new Error("history_repeated_activity");
      if (scanned > ANNUAL_HISTORY_CAP || rows.length > ANNUAL_HISTORY_CAP) throw new Error("history_memory_cap");
      const value: Session = { scope, epoch: currentEpoch, pages: next, status: response.page.exhausted ? "complete" : scanned >= ANNUAL_HISTORY_CAP ? "capped" : "partial" };
      session.current = value; setResult(value);
    } catch (error) {
      if (!current()) return;
      const details = error as { code?: string; message?: string; details?: { reason?: string } };
      const reason = details.details?.reason;
      const code = details.code?.replace("functions/", "");
      const expired = reason === "history_snapshot_expired" || details.message === "history_snapshot_expired";
      const invalidated = reason === "history_source_changed" || code === "failed-precondition" && !expired || code === "permission-denied" || code === "unauthenticated" || details.message === "account_changed" || details.message === "history_chain_changed" || details.message === "history_repeated_activity";
      const unsupported = details.message === "invalid_training_analysis_history_response" || code === "invalid-argument" || code === "unimplemented" || code === "not-found";
      const value: Session = { scope, epoch: currentEpoch, pages: expired || invalidated || unsupported ? [] : pages, status: expired ? "expired" : invalidated ? "invalidated" : unsupported ? "unsupported" : "error" };
      session.current = value; setResult(value);
    } finally { if (current()) busy.current = false; }
  }, [scope, services, year, ownerUid, expire, includeExpandedRunDistances]);
  return { available: scope !== null, status: visible?.status ?? "idle", pages: visible?.pages ?? [], start: () => run(true), loadMore: () => run(false), restart: () => run(true) };
}
