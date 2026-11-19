import { randomBytes } from "node:crypto";
import { classifyCallableProbe } from "./social-callable-contract.mjs";

/** 브라우저 SDK의 Origin·인증 헤더 preflight와 익명 거부 계약을 함께 확인한다. */
export async function verifyBundledCallable({ base, origin, name, fetcher, requestBody = { data: {} }, responseContract, requestHeaders = ["authorization", "content-type", "x-firebase-appcheck"] }) {
  const url = `${base}/${name}`;
  const request = async (method, init) => {
    try { return await fetcher(url, { ...init, method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`bundled callable ${name} ${method} transport failed at ${url}`); }
  };
  const preflight = await request("OPTIONS", { headers: { Origin: origin, "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": requestHeaders.join(",") } });
  const allowed = key => (preflight.headers.get(key) || "").toLowerCase().split(",").map(value => value.trim());
  const allowedOrigin = preflight.headers.get("access-control-allow-origin");
  const rejected = !preflight.ok || ![origin, "*"].includes(allowedOrigin) || !allowed("access-control-allow-methods").includes("post") ||
    !requestHeaders.every(value => allowed("access-control-allow-headers").includes(value));
  const context = `origin ${origin} at ${url} HTTP ${preflight.status}`;
  try {
    await preflight.body?.cancel();
  } catch (cause) {
    const failure = rejected ? "rejected" : "response cleanup failed for";
    throw new Error(`bundled callable ${name} browser preflight ${failure} ${context}`, { cause });
  }
  if (rejected) throw new Error(`bundled callable ${name} browser preflight rejected ${context}`);
  const response = await request("POST", { headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`bundled callable ${name} returned invalid JSON at ${url}`); }
  const matches = responseContract
    ? [responseContract].flat().some(({ status, field, value }) => response.status === status && payload?.error?.[field] === value)
    : classifyCallableProbe(response.status, payload).ok;
  if (![origin, "*"].includes(response.headers.get("access-control-allow-origin")) || !matches) {
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

/** 고정 Hosting alias는 인증 없는 읽기/잘못된 검증 GET만 보낸다. 사용자 데이터나 webhook 이벤트를 쓰지 않는다. */
export async function verifyBundledHttpAliases({ base, fetcher = fetch }) {
  await Promise.all([["/api/v1/profile", 401], ["/api/strava/webhook", 403]].map(async ([path, status]) => {
    const url = base + path; let response;
    try { response = await fetcher(url, { method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`bundled HTTP alias GET transport failed at ${url}`); }
    let valid = false;
    try { valid = status === 401 ? (await response.json())?.error?.code === "UNAUTHENTICATED" : (await response.text()).trim() === "Forbidden"; }
    catch { throw new Error(`bundled HTTP alias GET invalid response at ${url}`); }
    if (response.status !== status || !valid) throw new Error(`bundled HTTP alias GET rejected at ${url}: expected=HTTP${status} actual=HTTP${response.status}`);
  }));
}
