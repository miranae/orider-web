import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityPowerWindowInput } from "@shared/types/activity-range-analysis";
import type { PowerWindowPoint } from "../utils/powerDurationWindows";
import type { PowerWindowWorkerRequest, PowerWindowWorkerResponse } from "../utils/powerDurationWindows.worker";
import { validPowerWindowInput } from "../utils/powerDurationWindows";

/** Worker에는 입력을 한 번만 보낸다. 지속시간 변경은 추가 데이터 요청을 만들지 않는다. */
export function usePowerDurationWindows(input: ActivityPowerWindowInput | undefined, identity: string, durationSeconds: number) {
  const validInput = useMemo(() => !!input && input.state === "available" && validPowerWindowInput(input), [input]);
  const ownership = useRef({ input, identity, generation: 0 });
  if (ownership.current.input !== input || ownership.current.identity !== identity) ownership.current = { input, identity, generation: ownership.current.generation + 1 };
  const generation = ownership.current.generation;
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const requestedDuration = useRef(durationSeconds);
  const [result, setResult] = useState<{ generation: number; input: typeof input; identity: string; points: PowerWindowPoint[]; error: boolean } | null>(null);
  const [selected, setSelected] = useState<{ generation: number; input: typeof input; identity: string; duration: number; point: PowerWindowPoint | null } | null>(null);
  useEffect(() => {
    if (!input || input.state !== "available" || !validInput) return;
    let active = true;
    let worker: Worker;
    try { worker = new Worker(new URL("../utils/powerDurationWindows.worker.ts", import.meta.url), { type: "module" }); }
    catch { setResult({ generation, input, identity, points: [], error: true }); return; }
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<PowerWindowWorkerResponse>) => {
      if (!active || ownership.current.generation !== generation) return;
      if (event.data.type === "ready") setResult({ generation, input, identity, points: event.data.points, error: false });
      else if (event.data.type === "error") setResult({ generation, input, identity, points: [], error: true });
      else if (event.data.requestId === requestRef.current) setSelected({ generation, input, identity, duration: requestedDuration.current, point: event.data.point });
    };
    worker.onerror = () => { if (active && ownership.current.generation === generation) setResult({ generation, input, identity, points: [], error: true }); };
    worker.postMessage({ type: "initialize", input } satisfies PowerWindowWorkerRequest);
    return () => { active = false; requestRef.current += 1; worker.terminate(); if (workerRef.current === worker) workerRef.current = null; };
  }, [input, identity, generation, validInput]);
  useEffect(() => {
    const requestId = ++requestRef.current;
    requestedDuration.current = durationSeconds;
    if (!input || input.state !== "available" || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > input.longestContinuousSeconds) return;
    workerRef.current?.postMessage({ type: "duration", durationSeconds, requestId } satisfies PowerWindowWorkerRequest);
  }, [input, identity, durationSeconds]);
  const current = result && result.generation === generation && result.input === input && result.identity === identity ? result : null;
  const point = selected && selected.generation === generation && selected.input === input && selected.identity === identity && selected.duration === durationSeconds ? selected.point : null;
  const settled = !!selected && selected.generation === generation && selected.input === input && selected.identity === identity && selected.duration === durationSeconds;
  return { points: current?.points ?? [], point, selectedState: settled ? point ? "available" : "unavailable" : "loading", state: !validInput || current?.error ? "unavailable" : current ? "available" : "loading" };
}
