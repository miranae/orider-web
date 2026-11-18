import { classifyCallableProbe } from "./social-callable-contract.mjs";

/** 브라우저 SDK의 Origin·인증 헤더 preflight와 익명 거부 계약을 함께 확인한다. */
export async function verifyBundledCallable({ base, origin, name, fetcher }) {
  const url = `${base}/${name}`;
  const request = async (method, init) => {
    try { return await fetcher(url, { ...init, method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`bundled callable ${name} ${method} transport failed at ${url}`); }
  };
  const preflight = await request("OPTIONS", { headers: { Origin: origin, "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type,x-firebase-appcheck" } });
  const allowed = key => (preflight.headers.get(key) || "").toLowerCase().split(",").map(value => value.trim());
  const allowedOrigin = preflight.headers.get("access-control-allow-origin");
  if (!preflight.ok || ![origin, "*"].includes(allowedOrigin) || !allowed("access-control-allow-methods").includes("post") ||
    !["authorization", "content-type", "x-firebase-appcheck"].every(value => allowed("access-control-allow-headers").includes(value))) {
    await preflight.body?.cancel();
    throw new Error(`bundled callable ${name} browser preflight rejected origin ${origin} at ${url} HTTP ${preflight.status}`);
  }
  await preflight.body?.cancel();
  const response = await request("POST", { headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ data: {} }) });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`bundled callable ${name} returned invalid JSON at ${url}`); }
  if (![origin, "*"].includes(response.headers.get("access-control-allow-origin")) || !classifyCallableProbe(response.status, payload).ok) {
    throw new Error(`bundled callable ${name} rejected unauthenticated browser contract at ${url} HTTP ${response.status}`);
  }
}
