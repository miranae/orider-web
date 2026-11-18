import { randomBytes } from "node:crypto";
import { classifyCallableProbe } from "./social-callable-contract.mjs";

/** 브라우저 SDK의 Origin·인증 헤더 preflight와 익명 거부 계약을 함께 확인한다. */
export async function verifyBundledCallable({ base, origin, name, fetcher, requestBody = { data: {} }, responseContract }) {
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
  const response = await request("POST", { headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`bundled callable ${name} returned invalid JSON at ${url}`); }
  if (![origin, "*"].includes(response.headers.get("access-control-allow-origin")) || !(responseContract ? response.status === responseContract.status && payload?.error?.[responseContract.field] === responseContract.value : classifyCallableProbe(response.status, payload).ok)) {
    throw new Error(`bundled callable ${name} rejected unauthenticated browser contract at ${url} HTTP ${response.status}`);
  }
}

/** 정상 경로의401이 전역 인증 middleware의 가짜 성공 증거가 아닌지 확인한다. */
export async function verifyBundledRouteControl({ base, origin, fetcher }) {
  const name = `oriderReadinessMissing${randomBytes(12).toString("hex")}`;
  const url = `${base}/${name}`;
  let response;
  try { response = await fetcher(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`bundled missing-route control POST transport failed at ${url}`); }
  let body;
  try { body = await response.json(); } catch { throw new Error(`bundled missing-route control POST invalid JSON at ${url}`); }
  if (response.status !== 404 || body?.error !== "unknown-bundle-function") {
    throw new Error(`bundled missing-route control POST failed at ${url}: expected=404/unknown-bundle-function actual=HTTP${response.status}`);
  }
}
