import type { AvailablePowerWindowInput, PowerWindowPoint } from "./powerDurationWindows";
import { calculatePowerWindow, powerDurationGrid, validPowerWindowInput } from "./powerDurationWindows";
export type PowerWindowWorkerRequest = { type: "initialize"; input: AvailablePowerWindowInput } | { type: "duration"; durationSeconds: number; requestId: number };
export type PowerWindowWorkerResponse = { type: "ready"; points: PowerWindowPoint[] } | { type: "duration"; point: PowerWindowPoint | null; requestId: number } | { type: "error" };
let input: AvailablePowerWindowInput | null = null;
self.onmessage = (event: MessageEvent<PowerWindowWorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === "initialize") {
      input = validPowerWindowInput(message.input) ? message.input : null;
      if (!input) { self.postMessage({ type: "error" }); return; }
      const points = powerDurationGrid(input.longestContinuousSeconds).flatMap(duration => {
        const point = calculatePowerWindow(input!, duration); return point ? [point] : [];
      });
      self.postMessage({ type: "ready", points } satisfies PowerWindowWorkerResponse);
    } else if (message.type === "duration" && input) {
      self.postMessage({ type: "duration", requestId: message.requestId, point: calculatePowerWindow(input, message.durationSeconds) } satisfies PowerWindowWorkerResponse);
    }
  } catch { input = null; self.postMessage({ type: "error" }); }
};
