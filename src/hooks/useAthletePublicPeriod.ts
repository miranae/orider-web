import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { Activity } from "@shared/types";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityDiscovery } from "../services/activityDiscovery";

export function publicPeriodBounds(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00+09:00`), last = Date.parse(`${to}T00:00:00+09:00`);
  const valid = (day: string, time: number) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(time) && new Date(time + 32400000).toISOString().slice(0, 10) === day;
  return valid(from, start) && valid(to, last) && start <= last && last - start < 366 * 86400000 ? { start, end: last + 86400000 } : null;
}
type Result = { items: Activity[]; cursor: string | null; expiresAt: number; authorizedUntil: number; pages: number; status: "loading" | "partial" | "complete" | "error" | "restart" | "stale" | "limit" };
const empty = (): Result => ({ items: [], cursor: null, expiresAt: 0, authorizedUntil: 0, pages: 0, status: "loading" });
/** One explicit page per action. No public activity payload or cursor is persisted. */
export function useAthletePublicPeriod(targetUid: string, from: string, to: string, enabled = true, global = false) {
  const services = useFirebaseServices(), auth = services.auth, sdkUser = auth.currentUser, app = auth.app;
  const scope = `${targetUid}|${from}|${to}|${enabled}|${global}`, generation = useRef(0), busy = useRef(false);
  const identity = useRef({ scope, services, sdkUser, app });
  const session = useRef<Result>(empty()), controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ generation: number; result: Result }>();
  if (identity.current.scope !== scope || identity.current.services !== services || identity.current.sdkUser !== sdkUser || identity.current.app !== app) {
    controller.current?.abort(); identity.current = { scope, services, sdkUser, app }; generation.current++; busy.current = false; session.current = empty();
  }
  const clear = useCallback(() => {
    controller.current?.abort(); controller.current = null; generation.current++; busy.current = false; session.current = empty();
    setState({ generation: generation.current, result: session.current });
  }, []);
  const read = useCallback(async (fresh = false) => {
    if (!enabled || busy.current || document.visibilityState === "hidden") return;
    const bounds = publicPeriodBounds(from, to);
    if (!global && !bounds) return;
    if (fresh) clear();
    const previous = session.current;
    if (previous.authorizedUntil && Date.now() >= previous.authorizedUntil) {
      clear(); session.current = { ...empty(), status: "stale" }; setState({ generation: generation.current, result: session.current }); return;
    }
    const seq = generation.current, user = auth.currentUser;
    const current = () => seq === generation.current && identity.current.services === services && auth.currentUser === user && auth.app === app;
    if (previous.cursor && Date.now() >= previous.expiresAt) {
      session.current = { ...empty(), status: "restart" }; setState({ generation: seq, result: session.current }); return;
    }
    const requestedAt = Date.now();
    const requestController = new AbortController(); controller.current = requestController;
    busy.current = true;
    session.current = { ...previous, status: "loading" }; setState({ generation: seq, result: session.current });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const page = await Promise.race([loadActivityDiscovery(services, { scope: "athlete", targetUid, ...(global ? { order: "id_asc" as const } : { fromInclusive: bounds!.start, toExclusive: bounds!.end }), limit: 20, ...(previous.cursor ? { cursor: previous.cursor } : {}) }, requestController.signal), new Promise<never>((_, reject) => { deadline = setTimeout(() => { requestController.abort(); reject(Error("request_timeout")); }, 15000); })]);
      if (!current()) return;
      if (page.nextCursor && page.nextCursor === previous.cursor) throw Error("invalid_activity_discovery");
      const items = new Map(previous.items.map(item => [item.id, item]));
      for (const item of page.items) items.set(item.id, item);
      session.current = { items: [...items.values()], cursor: page.nextCursor, expiresAt: page.expiresAt, authorizedUntil: previous.authorizedUntil || requestedAt + 30000, pages: previous.pages + 1, status: page.exhausted ? "complete" : global && previous.pages + 1 >= 10 ? "limit" : "partial" };
    } catch (error) {
      if (!current()) return;
      const code = String((error as {code?: string}).code ?? (error as Error).message);
      const restart = /permission-denied|unauthenticated|not-found|failed-precondition|invalid-argument|account_changed|invalid_activity_discovery/.test(code);
      session.current = restart ? { ...empty(), status: "restart" } : { ...previous, status: "error" };
    } finally {
      clearTimeout(deadline);
      if (current()) { busy.current = false; setState({ generation: seq, result: session.current }); }
    }
  }, [services, auth, app, scope, targetUid, from, to, enabled, global, clear]);
  useEffect(() => {
    clear(); void read();
    let currentUser = auth.currentUser;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (currentUser === user) return;
      currentUser = user; clear(); void read();
    });
    const visibility = () => { clear(); if (document.visibilityState !== "hidden") void read(); };
    const focus = () => { if (!busy.current && document.visibilityState !== "hidden") void read(true); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("focus", focus);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", focus); clear(); };
  }, [read, clear, auth, sdkUser]);
  useEffect(() => {
    if (!state?.result.authorizedUntil) return;
    const invalidate = () => {
      clear(); session.current = { ...empty(), status: "stale" };
      setState({ generation: generation.current, result: session.current });
    };
    const timer = window.setTimeout(invalidate, Math.max(0, state.result.authorizedUntil - Date.now()));
    window.addEventListener("orider:activity-content-changed", invalidate);
    return () => { window.clearTimeout(timer); window.removeEventListener("orider:activity-content-changed", invalidate); };
  }, [state, clear]);
  return { ...(state?.generation === generation.current ? state.result : empty()), generation: generation.current, valid: global || !!publicPeriodBounds(from, to), more: () => read(), refresh: () => read(true) };
}
