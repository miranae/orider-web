import { cyclingOverlayMatchesHistory } from "../features/activity/detail/cyclingDistanceHistoryOverlay";
import { useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import type { CyclingDistanceHistoryResponse } from "@shared/types/training-cycling-distance-history";
import type { CyclingHistoryOverlayEvidence, CyclingHistoryOverlaySession, StageCyclingDistanceHistoryOverlayRequest as Request } from "@shared/types/stage-cycling-distance-history-overlay";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { CYCLING_HISTORY_OVERLAY_REASON_CODES, type CyclingHistoryOverlayReason, type CyclingHistoryOverlayTiming, safeCyclingHistoryOverlayTiming, cyclingOverlayDigest, loadCyclingHistoryOverlay } from "../services/stageCyclingDistanceHistoryOverlay";
import { cyclingCoveredPreferenceChanges } from "../services/stageCyclingDistanceCoveredRankings";
import { stageCyclingPreferenceAvailable } from "../services/stageCyclingDistanceEffortPreference";
type Status = "idle" | "loading" | "partial" | "ready" | "error" | "invalidated" | "expired";
interface State { generation: number; status: Status; evidence: CyclingHistoryOverlayEvidence[]; session: CyclingHistoryOverlaySession | null; reason: CyclingHistoryOverlayReason | null; timing: CyclingHistoryOverlayTiming | null }
/** 이미 읽은 한 페이지만 수동으로20/20/10 확인한다. 재시도와 페이지 탐색은 자동화하지 않는다. */
export function useCyclingDistanceHistoryOverlay(ownerUid: string, headIdentity: string, pages: CyclingDistanceHistoryResponse[]) {
  const { user } = useAuth(), services = useFirebaseServices(), nativeUser = services.auth.currentUser;
  const first = pages[0];
  const available = stageCyclingPreferenceAvailable() && user?.uid === ownerUid && !user.isAnonymous && nativeUser?.uid === ownerUid && !nativeUser.isAnonymous;
  const identity = JSON.stringify([available, ownerUid, headIdentity, first?.readTime, first?.range, first?.year, first?.rangeBasis]);
  const context = useRef({ identity, services, nativeUser, generation: 0, controller: null as AbortController | null, pages });
  const [state, setState] = useState<State | null>(null);
  const saved = useRef<State | null>(null);
  if (context.current.identity !== identity || context.current.services !== services || context.current.nativeUser !== nativeUser || pages.length < context.current.pages.length || context.current.pages.some((p, i) => pages[i] !== p)) {
    context.current.controller?.abort(); context.current = { identity, services, nativeUser, generation: context.current.generation + 1, controller: null, pages }; saved.current = null;
  } else {
    if (context.current.controller && pages.length !== context.current.pages.length) {
      context.current.controller.abort(); context.current.controller = null; context.current.generation++;
      const value: State = { generation: context.current.generation, status: "partial", evidence: saved.current?.evidence ?? [], session: saved.current?.session ?? null, reason: null, timing: null };
      saved.current = value; setState(value);
    }
    context.current.pages = pages;
  }
  const clear = (status: Status, reason: CyclingHistoryOverlayReason | null = null, timing: CyclingHistoryOverlayTiming | null = null) => { context.current.controller?.abort(); context.current.controller = null; context.current.generation++; saved.current = { generation: context.current.generation, status, evidence: [], session: null, reason, timing }; setState(saved.current); };
  useEffect(() => {
    let observed = false;
    const unsubscribe = onIdTokenChanged(services.auth, next => { if (observed || next !== context.current.nativeUser) clear("invalidated", "auth_epoch"); observed = true; });
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === ownerUid) clear("invalidated", "preference_changed"); };
    cyclingCoveredPreferenceChanges.addEventListener("changed", changed);
    return () => { unsubscribe(); cyclingCoveredPreferenceChanges.removeEventListener("changed", changed); context.current.controller?.abort(); context.current.generation++; };
  }, [services, ownerUid]);
  const visible = state?.generation === context.current.generation && (!first || Date.now() < first.expiresAt) ? state : null;
  useEffect(() => { if (!first) return; const remaining = first.expiresAt - Date.now(); if (remaining <= 0) { clear("expired", "expired"); return; } const timer = setTimeout(() => clear("expired", "expired"), remaining); return () => clearTimeout(timer); }, [first]);
  const confirmPage = async (page: CyclingDistanceHistoryResponse) => {
    if (!available || !first || !context.current.pages.includes(page) || context.current.controller || context.current.identity !== identity || context.current.services !== services || nativeUser !== services.auth.currentUser) return;
    if (Date.now() >= first.expiresAt) { clear("expired", "expired"); return; }
    const prior = saved.current?.generation === context.current.generation ? saved.current : null;
    const checked = new Set(prior?.evidence.map(e => e.row.activityId));
    const pending = page.activities.filter(a => !checked.has(a.activityId));
    if (!pending.length) return;
    const generation = context.current.generation, controller = new AbortController(), pageCount = context.current.pages.length;
    context.current.controller = controller;
    const active = () => !controller.signal.aborted && context.current.generation === generation && context.current.identity === identity && context.current.services === services && context.current.nativeUser === services.auth.currentUser && context.current.pages.length === pageCount && context.current.pages.includes(page);
    let evidence = prior?.evidence ?? [], session = prior?.session ?? null;
    const publish = (status: Status, reason: CyclingHistoryOverlayReason | null = null) => { const value = { generation, status, evidence, session, reason, timing: null }; saved.current = value; setState(value); };
    publish("loading");
    try {
      const pageBinding = await cyclingOverlayDigest([page.readTime, page.range, page.activities.map(a => [a.activityId, a.activityRevision, a.metricsRevision]), page.page]);
      for (let offset = 0; offset < pending.length; offset += 20) {
        if (!active()) return;
        if (Date.now() >= first.expiresAt) { clear("expired", "expired"); return; }
        const request: Request = { version: 1, mode: "stage_cycling_distance_history_overlay_v1", history: { calendarBasis: "Asia/Seoul", rangeBasis: first.rangeBasis, year: first.year, range: first.range, sourceReadTime: first.readTime, includeActivityTotals: true }, pageBinding,
          activities: pending.slice(offset, offset + 20).map(a => ({ activityId: a.activityId, activityRevision: a.activityRevision, metricsRevision: a.metricsRevision })), ...(session ? { session } : {}) };
        const response = await loadCyclingHistoryOverlay(services, request, controller.signal);
        if (!active()) return;
        if (response.evidence.some(e => !page.activities.some(row => cyclingOverlayMatchesHistory(row, e)))) throw Object.assign(new Error("history_overlay_changed_input"), { overlayReason: "history_identity" });
        session = response.session; evidence = [...evidence, ...response.evidence]; publish("loading");
      }
      if (active()) publish(evidence.length === context.current.pages.reduce((n, p) => n + p.activities.length, 0) ? "ready" : "partial");
    } catch (error) {
      if (!active()) return;
      const detail = error as { code?: string; message?: string; details?: { reason?: string }; overlayReason?: CyclingHistoryOverlayReason; overlayTiming?: unknown }, code = detail.code?.replace("functions/", "");
      if (Date.now() >= first.expiresAt || detail.details?.reason === "history_snapshot_expired") clear("expired", "expired");
      else if (["failed-precondition", "permission-denied", "unauthenticated", "invalid-argument"].includes(code ?? "") || ["account_changed", "history_overlay_changed_input", "invalid_cycling_history_overlay_response", "invalid_cycling_covered_rankings_response"].includes(detail.message ?? "")) clear("invalidated", detail.overlayReason && CYCLING_HISTORY_OVERLAY_REASON_CODES.includes(detail.overlayReason) ? detail.overlayReason : "server_input_changed", safeCyclingHistoryOverlayTiming(detail.overlayTiming) ? detail.overlayTiming : null);
      else publish("error", "transport");
    } finally { if (active()) context.current.controller = null; else if (context.current.controller === controller) context.current.controller = null; }
  };
  return { available, status: visible?.status ?? "idle", evidence: visible?.evidence ?? [], session: visible?.session ?? null, reason: visible?.reason ?? null, timing: visible?.timing ?? null, confirmPage, cancel: () => clear("invalidated", "history_identity") };
}
