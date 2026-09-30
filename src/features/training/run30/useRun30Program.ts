import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { logClientError } from "../../../services/errorLogger";
import { createRun30Api, type Run30Api, type Run30Program } from "./run30Api";

export type Run30LoadStatus = "idle" | "loading" | "ready" | "error";

export interface Run30ProgramState {
  api: Run30Api;
  status: Run30LoadStatus;
  program: Run30Program | null;
  error: unknown;
  /** 오류·재시도 표시와 무관하게 조용히 최신 상태를 다시 읽는다(변경 확인 뒤). */
  refresh: () => Promise<void>;
  retry: () => void;
}

/**
 * 러닝 계획 표면이 쓰는 Run30 프로그램 상태. `enabled=false`(러닝 외 종목)이면 호출하지 않는다.
 * 호출 결과가 프로그램 없음이면 program=null + status=ready 다.
 */
export function useRun30Program(enabled: boolean): Run30ProgramState {
  const { functions, ensureAppCheckReady } = useFirebaseServices();
  const { user } = useAuth();
  const api = useMemo(() => createRun30Api(functions, ensureAppCheckReady), [ensureAppCheckReady, functions]);
  const active = enabled && user != null && user.isAnonymous !== true;
  const [status, setStatus] = useState<Run30LoadStatus>(active ? "loading" : "idle");
  const [program, setProgram] = useState<Run30Program | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!active) {
      setStatus("idle");
      setProgram(null);
      setError(null);
      return undefined;
    }
    setStatus("loading");
    setError(null);
    api.getCurrentProgram().then((next) => {
      if (generation.current !== current) return;
      setProgram(next);
      setStatus("ready");
    }).catch((loadError: unknown) => {
      if (generation.current !== current) return;
      setProgram(null);
      setError(loadError);
      setStatus("error");
      logClientError("Run30.getCurrentProgram", loadError);
    });
    return () => {
      generation.current += 1;
    };
  }, [active, api, reloadKey, user?.uid]);

  const refresh = useCallback(async () => {
    if (!active) return;
    const current = ++generation.current;
    try {
      const next = await api.getCurrentProgram();
      if (generation.current !== current) return;
      setProgram(next);
      setError(null);
      setStatus("ready");
    } catch (refreshError) {
      if (generation.current !== current) return;
      // 이미 보이는 프로그램은 유지하고, 다음 조작에서 서버가 다시 검증한다.
      logClientError("Run30.refresh", refreshError);
      if (program === null) {
        setError(refreshError);
        setStatus("error");
      }
    }
  }, [active, api, program]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { api, status, program, error, refresh, retry };
}
