type Listener = (ready: boolean) => void;
const monitors = new Map<string, { subscribe: (listener: Listener) => () => void }>();

/** 같은 월드의 연결은 준비 상태 요청을 공유한다. */
export function watchWorldReadiness(endpoint: string, listener: Listener): () => void {
  const url = new URL(endpoint);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/ready";
  url.search = "";
  url.hash = "";
  const address = url.href;
  let monitor = monitors.get(address);
  if (!monitor) {
    const listeners = new Set<Listener>();
    let ready: boolean | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const check = async () => {
      const controller = new AbortController();
      request = controller;
      const deadline = setTimeout(() => controller.abort(), 1500);
      let next = false;
      try {
        next = (await fetch(address, { signal: controller.signal, cache: "no-store" })).status === 204;
      } catch {
        next = false;
      } finally {
        clearTimeout(deadline);
      }
      if (!listeners.size) return;
      if (next !== ready) {
        ready = next;
        for (const notify of listeners) notify(next);
      }
      if (listeners.size) timer = setTimeout(() => void check(), 1500);
    };
    monitor = {
      subscribe(notify) {
        listeners.add(notify);
        if (ready !== undefined) notify(ready);
        if (!request) void check();
        return () => {
          listeners.delete(notify);
          if (listeners.size) return;
          clearTimeout(timer);
          request?.abort();
          monitors.delete(address);
        };
      },
    };
    monitors.set(address, monitor);
  }
  return monitor.subscribe(listener);
}
