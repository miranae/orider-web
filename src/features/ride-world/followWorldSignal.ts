import { watchWorldReadiness } from "./worldReadiness";

/** 기본 경로는 호출자가 유지하며, 준비된 월드의 첫 유효 신호 뒤에만 가속 경로를 활성화한다. */
export function followWorldSignal(
  url: string,
  subscribe: () => Promise<unknown>,
  receive: (data: unknown) => boolean,
  disconnected: (code: number) => void,
): () => void {
  let active = true, ready = false, denied = false, generation = 0, backoff = 500;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let initial: ReturnType<typeof setTimeout> | undefined;
  function close() {
    generation++;
    clearTimeout(timer); clearTimeout(initial);
    const previous = socket;
    socket = undefined;
    previous?.close();
  }
  function lost(code: number) {
    close();
    denied = code === 4003 || code === 4004;
    disconnected(code);
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
      initial = setTimeout(() => { if (socket === connection) lost(1013); }, 3000);
      connection.addEventListener("open", () => connection.send(JSON.stringify(request)));
      connection.addEventListener("close", event => { if (socket === connection) lost(event.code); });
      connection.addEventListener("error", () => { if (socket === connection) lost(1013); });
      connection.addEventListener("message", ({ data }) => {
        if (socket !== connection) return;
        try {
          if (receive(JSON.parse(String(data)))) {
            clearTimeout(initial);
            backoff = 500;
          }
        } catch {
          lost(1013);
        }
      });
    } catch {
      if (active && ticket === generation) lost(1013);
    }
  }
  const unwatch = watchWorldReadiness(url, available => {
    ready = available;
    if (available) void open();
    else if (!denied) lost(1013);
  });
  return () => { active = false; unwatch(); close(); };
}
