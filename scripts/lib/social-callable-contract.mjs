const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z]+-[a-z]+[0-9]$/;
const FUNCTION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,62}$/;

export function validateSocialCallableConfig({ project, region, accessToken, manifest }) {
  if (!PROJECT_ID_PATTERN.test(project ?? "")) {
    throw new Error("social callable project ID is missing or invalid");
  }
  if (!REGION_PATTERN.test(region ?? "")) {
    throw new Error("social callable region is missing or invalid");
  }
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new Error("social callable access token is missing");
  }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.callables)) {
    throw new Error("social callable contract manifest is invalid");
  }
  if (manifest.callables.length !== 8) {
    throw new Error(`social callable contract must contain exactly 8 entries; got ${manifest.callables.length}`);
  }
  const names = manifest.callables.map((entry) => entry?.name);
  if (names.some((name) => !FUNCTION_NAME_PATTERN.test(name ?? "")) || new Set(names).size !== names.length) {
    throw new Error("social callable contract contains an invalid or duplicate function name");
  }
}

export function functionResourceName(project, region, functionName) {
  return `projects/${project}/locations/${region}/functions/${functionName}`;
}

export function functionApiUrl(project, region, functionName) {
  return `https://cloudfunctions.googleapis.com/v2/${functionResourceName(project, region, functionName)}`;
}

export function callableEndpointUrl(project, region, functionName) {
  return `https://${region}-${project}.cloudfunctions.net/${functionName}`;
}

export function assertActiveFunctionResource(resource, { project, region, functionName }) {
  const expectedName = functionResourceName(project, region, functionName);
  if (!resource || resource.name !== expectedName) {
    throw new Error(`${functionName}: function resource project/region mismatch`);
  }
  if (resource.environment !== "GEN_2") {
    throw new Error(`${functionName}: function is not Gen2 (environment=${resource.environment ?? "MISSING"})`);
  }
  if (resource.state !== "ACTIVE") {
    throw new Error(`${functionName}: function is not ACTIVE (state=${resource.state ?? "MISSING"})`);
  }
  let serviceUri;
  try {
    serviceUri = new URL(resource.serviceConfig?.uri ?? "");
  } catch {
    throw new Error(`${functionName}: function has no valid service URI`);
  }
  if (serviceUri.protocol !== "https:") {
    throw new Error(`${functionName}: function service URI must use HTTPS`);
  }
}

export function classifyCallableProbe(status, payload) {
  if (status === 404) return { ok: false, kind: "missing" };
  const errorStatus = payload?.error?.status;
  if (status === 401 && errorStatus === "UNAUTHENTICATED") {
    return { ok: true, kind: "unauthenticated" };
  }
  if (status === 403 && errorStatus === "PERMISSION_DENIED") {
    return { ok: false, kind: "iam-or-invoker-denied" };
  }
  if (status === 401 || status === 403) {
    return { ok: false, kind: `unexpected-rejection-${status}` };
  }
  if (status >= 200 && status < 300) return { ok: false, kind: "unexpected-success" };
  return { ok: false, kind: `unexpected-http-${status}` };
}

export async function verifySocialCallableContract({
  project,
  region,
  accessToken,
  manifest,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) {
  validateSocialCallableConfig({ project, region, accessToken, manifest });
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("social callable timeout must be an integer between 1000 and 60000 ms");
  }

  const results = [];
  for (const { name } of manifest.callables) {
    const resourceResponse = await fetchWithTimeout(fetchImpl, functionApiUrl(project, region, name), {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, timeoutMs, `${name}: function API request timed out`);
    if (resourceResponse.status === 404) throw new Error(`${name}: function resource is missing`);
    if (!resourceResponse.ok) {
      throw new Error(`${name}: function API returned HTTP ${resourceResponse.status}`);
    }
    const resource = await readJson(resourceResponse, `${name}: invalid function API response`);
    assertActiveFunctionResource(resource, { project, region, functionName: name });

    const probeResponse = await fetchWithTimeout(fetchImpl, callableEndpointUrl(project, region, name), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
      redirect: "error",
    }, timeoutMs, `${name}: endpoint probe timed out`);
    const probePayload = await readOptionalJson(probeResponse);
    const probe = classifyCallableProbe(probeResponse.status, probePayload);
    if (!probe.ok) throw new Error(`${name}: endpoint probe failed (${probe.kind})`);
    results.push({ name, state: "ACTIVE", endpoint: probe.kind });
  }
  return results;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs, timeoutMessage) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error(timeoutMessage);
    throw new Error(`${timeoutMessage.replace(" timed out", " failed")}`);
  }
}

async function readJson(response, message) {
  try {
    return await response.json();
  } catch {
    throw new Error(message);
  }
}

async function readOptionalJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
