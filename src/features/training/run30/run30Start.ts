import { useCallback, useEffect, useRef, useState } from "react";

import type { RunStartFailure, ScheduledRunStarter } from "../../../embedded/runStartBridge";

/**
 * 오늘 회차 시작 경로.
 * - web: 일반 웹 — 시작은 앱에서만 가능하다는 안내만 보인다.
 * - host-unsupported: 앱 임베드지만 호스트가 run-start-scheduled-v1 을 알리지 않음(구버전 앱).
 * - host: 네이티브에 `run.startScheduled` 로 요청한다.
 */
export type Run30StartMode =
  | { kind: "web" }
  | { kind: "host-unsupported" }
  | { kind: "host"; starter: ScheduledRunStarter };

export type Run30StartState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "accepted" }
  | { status: "error"; reason: RunStartFailure };

export function useRun30Start(mode: Run30StartMode): {
  state: Run30StartState;
  start: (scheduledSessionId: string | undefined) => Promise<void>;
} {
  const [state, setState] = useState<Run30StartState>({ status: "idle" });
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const start = useCallback(async (scheduledSessionId: string | undefined) => {
    if (mode.kind !== "host" || inFlight.current) return;
    if (!scheduledSessionId) {
      setState({ status: "error", reason: "changed" });
      return;
    }
    inFlight.current = true;
    setState({ status: "pending" });
    try {
      const outcome = await mode.starter.start(scheduledSessionId);
      if (!mounted.current) return;
      setState(outcome.accepted ? { status: "accepted" } : { status: "error", reason: outcome.reason });
    } finally {
      inFlight.current = false;
    }
  }, [mode]);

  return { state, start };
}
