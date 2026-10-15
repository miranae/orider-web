import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { logClientError } from "../../../services/errorLogger";
import { clearTrainingSurfaceCache, prepareTrainingSurfaceCacheOwner, removeTrainingSurfaceCacheForSport, trainingSurfaceCacheScope } from "../../../embedded/trainingSurfaceCache";
import { invalidatePlanSnapshot, readPlanSnapshot, run30SnapshotKey, writePlanSnapshot } from "../../../embedded/planSnapshotCache";
import { createRun30Api, type Run30Api, type Run30Program } from "./run30Api";

export type Run30LoadStatus = "idle" | "loading" | "ready" | "error";

export interface Run30ProgramState {
  api: Run30Api;
  status: Run30LoadStatus;
  program: Run30Program | null;
  error: unknown;
  /** 변경 후 갱신은 기본 강제 조회, 단순 탭 복귀는 false로 3분 캐시를 사용한다. */
  refresh: (force?: boolean) => Promise<void>;
  retry: () => void;
  cacheHit: boolean;
}

/** host 승인 뒤 last-good를 먼저 표시한다. null도 성공한 프로그램 부재 상태다. */
export function useRun30Program(enabled: boolean, visible = true): Run30ProgramState {
  const { functions, ensureAppCheckReady } = useFirebaseServices();
  const { user } = useAuth();
  const active = enabled && user != null && user.isAnonymous !== true;
  const scope = trainingSurfaceCacheScope();
  const key = active ? `${user.uid}\u0000${scope ?? ""}` : null;
  const rawApi = useMemo(() => createRun30Api(functions, ensureAppCheckReady), [ensureAppCheckReady, functions]);
  const [initial] = useState(() => active && prepareTrainingSurfaceCacheOwner(user.uid)
    ? readPlanSnapshot<Run30Program | null>(run30SnapshotKey(user.uid)) : null);
  const [dataKey, setDataKey] = useState(key);
  const [status, setStatus] = useState<Run30LoadStatus>(initial ? "ready" : active ? "loading" : "idle");
  const [program, setProgram] = useState<Run30Program | null>(initial?.data ?? null);
  const [cacheHit, setCacheHit] = useState(initial !== null);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const handledReloadKey = useRef(0);
  const generation = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;

  // 성공한 변경 직후에는 다른 마운트에서도 이전 프로그램을 fresh로 쓰지 않는다.
  const api = useMemo<Run30Api>(() => ({
    ...rawApi,
    async enroll(request) {
      const result = await rawApi.enroll(request);
      if (active && currentKey.current === key && scope === trainingSurfaceCacheScope()) removeTrainingSurfaceCacheForSport(user.uid, "run");
      return result;
    },
    async confirmChange(request) {
      const result = await rawApi.confirmChange(request);
      if (active && currentKey.current === key && scope === trainingSurfaceCacheScope()) removeTrainingSurfaceCacheForSport(user.uid, "run");
      return result;
    },
  }), [active, key, rawApi, scope, user?.uid]);

  useEffect(() => {
    const current = ++generation.current;
    const forced = handledReloadKey.current !== reloadKey;
    handledReloadKey.current = reloadKey;
    if (!active) {
      if (!user || user.isAnonymous === true) clearTrainingSurfaceCache();
      setDataKey(null);
      setStatus("idle");
      setProgram(null);
      setError(null);
      setCacheHit(false);
      return undefined;
    }
    prepareTrainingSurfaceCacheOwner(user.uid);
    const snapshotKey = run30SnapshotKey(user.uid);
    const cached = readPlanSnapshot<Run30Program | null>(snapshotKey);
    setDataKey(key);
    setProgram(cached?.data ?? null);
    setCacheHit(cached !== null);
    setStatus(cached ? "ready" : "loading");
    setError(null);
    if (cached?.fresh && !forced) return () => { generation.current += 1; };
    if (forced) invalidatePlanSnapshot(snapshotKey);
    rawApi.getCurrentProgram().then((next) => {
      if (generation.current !== current || currentKey.current !== key) return;
      setProgram(next);
      setStatus("ready");
      setCacheHit(false);
      writePlanSnapshot(snapshotKey, next);
      setSnapshotRevision(value => value + 1);
    }).catch((loadError: unknown) => {
      if (generation.current !== current || currentKey.current !== key) return;
      if (!cached) {
        setProgram(null);
        setError(loadError);
        setStatus("error");
      }
      logClientError("Run30.getCurrentProgram", loadError);
    });
    return () => { generation.current += 1; };
  }, [active, key, rawApi, reloadKey, user?.uid]);

  const refresh = useCallback(async (force = true) => {
    if (!active) return;
    const snapshotKey = run30SnapshotKey(user.uid);
    if (!force && readPlanSnapshot(snapshotKey)?.fresh) return;
    invalidatePlanSnapshot(snapshotKey);
    setCacheHit(status === "ready");
    const current = ++generation.current;
    try {
      const next = await rawApi.getCurrentProgram();
      if (generation.current !== current || currentKey.current !== key) return;
      setDataKey(key);
      setProgram(next);
      setError(null);
      setStatus("ready");
      setCacheHit(false);
      writePlanSnapshot(snapshotKey, next);
      setSnapshotRevision(value => value + 1);
    } catch (refreshError) {
      if (generation.current !== current || currentKey.current !== key) return;
      logClientError("Run30.refresh", refreshError);
      if (status !== "ready") {
        setError(refreshError);
        setStatus("error");
      }
    }
  }, [active, key, rawApi, status, user?.uid]);
  useEffect(() => {
    if (!active || !visible) return;
    const cached = readPlanSnapshot(run30SnapshotKey(user.uid));
    if (!cached?.fresh) return;
    const timer = setTimeout(() => setReloadKey(value => value + 1), Math.max(0, cached.freshUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [active, cacheHit, key, program, reloadKey, snapshotRevision, status, user?.uid, visible]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);
  const matches = dataKey === key;
  return { api, status: matches ? status : active ? "loading" : "idle", program: matches ? program : null,
    error: matches ? error : null, refresh, retry, cacheHit: matches && cacheHit };
}
