import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { ActivityRouteIndexPageRequest, ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "../services/activityRouteEvidence";
import { loadActivityRouteIndexPage, ROUTE_INDEX_SCAN_CAP, validActivityRouteIndexPageRequest } from "../services/activityRouteIndexPage";

type Status = "idle" | "loading" | "partial" | "complete" | "capped" | "error" | "expired" | "invalidated" | "unsupported" | "index_missing" | "budget";
interface Session { scope: string; generation: number; pages: ActivityRouteIndexPageResponse[]; status: Status }
/** 선택 범위와 실제 SDK 계정이 일치할 때 명시 버튼으로만 한 페이지를 읽는다. */
export function useActivityRouteIndexHistory(ownerUid: string, activityId: string, discipline: "bike" | "run" | null, headIdentity: string) {
  const { user } = useAuth(), services = useFirebaseServices(), auth = services.auth, app = auth.app, sdkUser = auth.currentUser;
  const eligible = !!discipline && observedRouteAvailable() && !!user && !user.isAnonymous && user.uid === ownerUid
    && !!sdkUser && !sdkUser.isAnonymous && sdkUser.uid === ownerUid;
  const scope = eligible ? JSON.stringify([ownerUid, activityId, discipline, headIdentity]) : null;
  const identity = useRef({ scope, services, sdkUser, auth, app }), generation = useRef(0), busy = useRef(false), session = useRef<Session | null>(null);
  if (identity.current.scope !== scope || identity.current.services !== services || identity.current.sdkUser !== sdkUser || identity.current.auth !== auth || identity.current.app !== app) {
    identity.current = { scope, services, sdkUser, auth, app }; generation.current++; busy.current = false; session.current = null;
  }
  const [result, setResult] = useState<Session | null>(null);
  const visible = result?.scope === scope && result.generation === generation.current ? result : null;
  const tail = visible?.pages[visible.pages.length - 1], expired = !!tail && Date.now() >= tail.expiresAt;
  useEffect(() => {
    let authKey = auth.currentUser;
    return onAuthStateChanged(auth, authUser => {
      const next = authUser;
      if (next === authKey) return;
      authKey = next; generation.current++; busy.current = false; session.current = null; setResult(null);
    });
  }, [services, auth]);
  useEffect(() => () => { generation.current++; busy.current = false; session.current = null; }, []);
  const expire = useCallback(() => {
    if (!scope || identity.current.scope !== scope || identity.current.services !== services) return;
    const last = session.current?.pages[session.current.pages.length - 1];
    if (!last || Date.now() < last.expiresAt) return;
    generation.current++; busy.current = false;
    const value: Session = { scope, generation: generation.current, pages: [], status: "expired" };
    session.current = value; setResult(value);
  }, [scope, services]);
  useEffect(() => {
    if (!tail) return;
    const delay = tail.expiresAt - Date.now();
    if (delay <= 0) { expire(); return; }
    const timer = setTimeout(expire, delay); return () => clearTimeout(timer);
  }, [tail, expire]);
  useEffect(() => {
    const invalidate = () => {
      if (!scope || identity.current.scope !== scope || !session.current) return;
      generation.current++; busy.current = false;
      const value: Session = { scope, generation: generation.current, pages: [], status: "invalidated" };
      session.current = value; setResult(value);
    };
    window.addEventListener("orider:activity-content-changed", invalidate);
    return () => window.removeEventListener("orider:activity-content-changed", invalidate);
  }, [scope]);
  const run = useCallback(async (restart: boolean) => {
    if (!scope || !discipline || busy.current || identity.current.scope !== scope || identity.current.services !== services
      || !sdkUser || sdkUser.uid !== ownerUid || sdkUser.isAnonymous || services.auth !== auth || auth.app !== app || auth.currentUser !== sdkUser) return;
    const previous = restart ? null : session.current, pages = previous?.pages ?? [], before = pages[pages.length - 1];
    if (!restart && (!previous || !before?.nextCursor || !["partial", "error"].includes(previous.status))) return;
    if (before && Date.now() >= before.expiresAt) { expire(); return; }
    if (restart) generation.current++;
    const requestGeneration = generation.current;
    const current = () => requestGeneration === generation.current && identity.current.scope === scope && identity.current.services === services
      && identity.current.sdkUser === sdkUser && services.auth === auth && auth.app === app && auth.currentUser === sdkUser
      && sdkUser.uid === ownerUid && !sdkUser.isAnonymous;
    const request: ActivityRouteIndexPageRequest = { mode: "route_index_page", anchorActivityId: activityId, discipline, ...(before?.nextCursor ? { cursor: before.nextCursor } : {}) };
    if (!validActivityRouteIndexPageRequest(request)) { expire(); return; }
    busy.current = true;
    const loading: Session = { scope, generation: requestGeneration, pages, status: "loading" };
    session.current = loading; setResult(loading);
    try {
      const response = await loadActivityRouteIndexPage(services, ownerUid, request);
      if (!current()) return;
      if (response.state === "changed_input") throw new Error("route_index_changed_input");
      const next = [...pages, response], candidates = next.flatMap(page => page.candidates);
      if (new Set(candidates.map(row => row.activityId)).size !== candidates.length) throw new Error("route_index_repeated_activity");
      if (response.scannedCount > ROUTE_INDEX_SCAN_CAP || candidates.length > ROUTE_INDEX_SCAN_CAP || next.length > ROUTE_INDEX_SCAN_CAP) throw new Error("route_index_memory_cap");
      const status: Status = response.state === "index_missing" ? "index_missing" : response.state === "unsupported_source" ? "unsupported"
        : response.scanCapReached ? "capped" : response.exhausted ? "complete" : response.nextCursor ? "partial" : "budget";
      const value: Session = { scope, generation: requestGeneration, pages: next, status };
      session.current = value; setResult(value);
    } catch (error) {
      if (!current()) return;
      const detail = error as { code?: string; message?: string; details?: { reason?: string } }, code = detail.code?.replace("functions/", "");
      const timeout = detail.message === "route_index_expired" || detail.details?.reason === "snapshot_expired";
      const invalidated = ["failed-precondition", "permission-denied", "unauthenticated"].includes(code ?? "") || ["account_changed", "route_index_changed_input", "route_index_repeated_activity", "route_index_memory_cap"].includes(detail.message ?? "");
      const unsupported = ["invalid-argument", "unimplemented", "not-found"].includes(code ?? "") || ["invalid_route_index_page", "route_index_not_supported"].includes(detail.message ?? "");
      const value: Session = { scope, generation: requestGeneration, pages: timeout || invalidated || unsupported ? [] : pages,
        status: timeout ? "expired" : invalidated ? "invalidated" : unsupported ? "unsupported" : "error" };
      session.current = value; setResult(value);
    } finally { if (current()) busy.current = false; }
  }, [scope, discipline, services, auth, app, sdkUser, ownerUid, activityId, expire]);
  return { available: scope !== null, status: expired ? "expired" as const : visible?.status ?? "idle", pages: expired ? [] : visible?.pages ?? [],
    start: () => run(true), loadMore: () => run(false), restart: () => run(true) };
}
