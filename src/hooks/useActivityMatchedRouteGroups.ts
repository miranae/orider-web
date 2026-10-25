import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { MatchedRouteGeometryPolicy, ActivityMatchedRouteGroupRequest, ActivityMatchedRouteGroupResponse } from "@shared/activity-matched-route-groups";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "../services/activityRouteEvidence";
import { loadActivityMatchedRouteGroups, validateMatchedRouteGroupAppend, validActivityMatchedRouteGroupRequest } from "../services/activityMatchedRouteGroups";

type Status = "idle" | "loading" | "partial" | "complete" | "error" | "expired" | "invalidated" | "unsupported" | "index_missing" | "budget";
interface Session { scope: string; generation: number; pages: ActivityMatchedRouteGroupResponse[]; status: Status }
/** 선택 범위와 실제 SDK 계정이 일치할 때 명시 버튼으로만 한 페이지를 읽는다. */
export function useActivityMatchedRouteGroups(ownerUid: string, activityId: string, discipline: "bike" | "run" | null, headIdentity: string, geometryPolicy: MatchedRouteGeometryPolicy = "complete") {
  const { user } = useAuth(), services = useFirebaseServices(), auth = services.auth, app = auth.app, sdkUser = auth.currentUser;
  const eligible = !!discipline && observedRouteAvailable() && !!user && !user.isAnonymous && user.uid === ownerUid
    && !!sdkUser && !sdkUser.isAnonymous && sdkUser.uid === ownerUid;
  const scope = eligible ? JSON.stringify([ownerUid, activityId, discipline, headIdentity, geometryPolicy]) : null;
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
    const request: ActivityMatchedRouteGroupRequest = { mode: "matched_route_group_page", anchorActivityId: activityId, discipline, ...(geometryPolicy === "observed_native" ? { geometryPolicy } : {}), ...(before?.nextCursor ? { cursor: before.nextCursor } : {}) };
    if (!validActivityMatchedRouteGroupRequest(request)) { expire(); return; }
    busy.current = true;
    const loading: Session = { scope, generation: requestGeneration, pages, status: "loading" };
    session.current = loading; setResult(loading);
    try {
      const response = await loadActivityMatchedRouteGroups(services, ownerUid, request);
      if (!current()) return;
      if (response.state === "changed_input") throw new Error("matched_route_group_changed_input");
      if (response.state === "expired") throw new Error("matched_route_group_expired");
      validateMatchedRouteGroupAppend(pages, response);
      const next = [...pages, response];
      const status: Status = response.state === "index_missing" ? "index_missing" : response.state === "anchor_unsupported" ? "unsupported"
        : response.nextCursor ? "partial" : response.state === "budget_partial" ? "budget" : "complete";
      const value: Session = { scope, generation: requestGeneration, pages: next, status };
      session.current = value; setResult(value);
    } catch (error) {
      if (!current()) return;
      const detail = error as { code?: string; message?: string; details?: { reason?: string } }, code = detail.code?.replace("functions/", "");
      const timeout = detail.message === "matched_route_group_expired" || detail.details?.reason === "snapshot_expired";
      const invalidated = ["failed-precondition", "permission-denied", "unauthenticated"].includes(code ?? "") || ["account_changed", "matched_route_group_changed_input", "matched_route_group_continuity"].includes(detail.message ?? "");
      const unsupported = ["invalid-argument", "unimplemented", "not-found"].includes(code ?? "") || ["invalid_matched_route_group_response", "matched_route_group_unsupported"].includes(detail.message ?? "");
      const value: Session = { scope, generation: requestGeneration, pages: timeout || invalidated || unsupported ? [] : pages,
        status: timeout ? "expired" : invalidated ? "invalidated" : unsupported ? "unsupported" : "error" };
      session.current = value; setResult(value);
    } finally { if (current()) busy.current = false; }
  }, [scope, discipline, services, auth, app, sdkUser, ownerUid, activityId, expire, geometryPolicy]);
  return { available: scope !== null, status: expired ? "expired" as const : visible?.status ?? "idle", pages: expired ? [] : visible?.pages ?? [],
    start: () => run(true), loadMore: () => run(false), restart: () => run(true) };
}
