/** Covers App Check preparation as well as transport. Expired work cannot dispatch a late write. */
export function withActivityMapDeadline<T>(work: (assertLive: () => void) => Promise<T>, timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(Error("map_request_timeout")); }, timeoutMs);
    const assertLive = () => { if (expired) throw Error("map_request_timeout"); };
    void Promise.resolve().then(() => work(assertLive)).then(value => { if (!expired) resolve(value); }, error => { if (!expired) reject(error); }).finally(() => clearTimeout(timer));
  });
}
