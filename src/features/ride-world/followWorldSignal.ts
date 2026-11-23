import { logClientError } from "../../services/errorLogger";
import { watchWorldReadiness, type WorldErrorReporter } from "./worldReadiness";

/** 기본 경로는 호출자가 유지하며, 준비된 월드의 첫 유효 신호 뒤에만 가속 경로를 활성화한다. */
export function followWorldSignal(
  url: string,
  subscribe: () => Promise<unknown>,
  receive: (data: unknown) => boolean,
  disconnected: (code: number) => void,
  report: WorldErrorReporter = logClientError,
  renewAt?: (request: unknown) => number,
): () => void {
  let active = true, ready = false, denied = false, generation = 0, backoff = 500;
  let socket: WebSocket | undefined;
  let accepted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let initial: ReturnType<typeof setTimeout> | undefined;
  let renewal: ReturnType<typeof setTimeout> | undefined;
  function close() {
    generation++;
    clearTimeout(timer); clearTimeout(initial); clearTimeout(renewal);
    const previous = socket;
    socket = undefined;
    previous?.close();
  }
  function lost(code: number) {
    close();
    denied = code === 4003 || code === 4004;
    if (accepted || denied) disconnected(code);
    accepted = false;
    if (active && ready && !denied) {
      timer = setTimeout(() => void open(), backoff);
      backoff = Math.min(backoff * 2, 5000);
    }
  }
  async function open() {
    if (!active || !ready || denied) return;
    const ticket = ++generation;
    try {
      const request = await subscribe();
      if (!active || ticket !== generation || !ready) return;
      const connection = new WebSocket(url);
      socket = connection;
      if (renewAt) renewal = setTimeout(() => lost(1013), Math.max(0, renewAt(request) - Date.now()));
      const failed = (phase: string, error: unknown) => {
        if (socket !== connection) return;
        report("RideWorld.signal", error, { endpoint: url, phase });
        lost(1013);
      };
      initial = setTimeout(() => failed("first-frame", new Error("World signal timed out")), 3000);
      connection.addEventListener("open", () => {
        if (socket !== connection) return;
        try { connection.send(JSON.stringify(request)); }
        catch (error) { failed("subscribe", error); }
      });
      connection.addEventListener("close", ({ code }) => {
        if (socket !== connection) return;
        if (code !== 1000 || !accepted) {
          report("RideWorld.signalClosed", new Error("World signal socket closed"), { endpoint: url, code });
        }
        lost(code);
      });
      connection.addEventListener("error", () => failed("transport", new Error("World WebSocket error")));
      connection.addEventListener("message", ({ data }) => {
        if (socket !== connection) return;
        try {
          if (!receive(JSON.parse(String(data)))) {
            failed("validate", new Error("Invalid World signal frame"));
            return;
          }
          clearTimeout(initial);
          accepted = true;
          backoff = 500;
        } catch (error) {
          failed("decode", error);
        }
      });
    } catch (error) {
      if (active && ticket === generation) {
        report("RideWorld.signal", error, { endpoint: url, phase: "connect" });
        lost(1013);
      }
    }
  }
  const unwatch = watchWorldReadiness(url, available => {
    ready = available;
    if (available) void open();
    else if (!denied) lost(1013);
  }, report);
  return () => { active = false; unwatch(); close(); };
}
