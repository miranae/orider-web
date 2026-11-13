import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import { readLifetimeActivities } from "./yearActivitiesRead";
import { logClientError } from "../services/errorLogger";

/** 수동 누적 보기 전용. 연도·종목과 무관하며 계정이 바뀌면 완료 캐시도 폐기한다. */
export function useLifetimeRecapActivities(uid: string | null | undefined) {
  const session = useRef({ uid, generation: 0 });
  if (session.current.uid !== uid) session.current = { uid, generation: session.current.generation + 1 };
  const [state, setState] = useState<{ session: typeof session.current; status: "idle" | "loading" | "complete" | "error"; activities: Activity[] }>({ session: session.current, status: "idle", activities: [] });
  const active = useRef<typeof session.current | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);
  const current = state.session === session.current ? state : { status: "idle" as const, activities: [] };
  const load = useCallback(() => {
    const request = session.current;
    if (!request.uid || active.current === request || (state.session === request && state.status === "complete")) return;
    active.current = request;
    setState({ session: request, status: "loading", activities: [] });
    let expired = false;
    const cancelled = () => expired || session.current !== request;
    const fail = (err: unknown) => {
      if (cancelled()) return;
      expired = true;
      active.current = null;
      setState({ session: request, status: "error", activities: [] });
      logClientError("useLifetimeRecapActivities.load", err, { uid: request.uid });
    };
    const timer = globalThis.setTimeout(() => fail(new Error("lifetime-read-timeout")), 12_000);
    timerRef.current = timer;
    void readLifetimeActivities(request.uid, cancelled).then((activities) => {
      if (!cancelled()) {
        active.current = null;
        setState({ session: request, status: "complete", activities });
      }
    }, fail).finally(() => globalThis.clearTimeout(timer));
  }, [state]);
  useEffect(() => () => {
    session.current = { ...session.current, generation: session.current.generation + 1 };
    globalThis.clearTimeout(timerRef.current);
  }, []);
  return { ...current, load };
}
