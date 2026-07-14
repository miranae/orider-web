import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  callableEndpointUrl,
  classifyCallableProbe,
  functionResourceName,
  validateSocialCallableConfig,
  verifySocialCallableContract,
} from "./lib/social-callable-contract.mjs";

const manifest = JSON.parse(readFileSync("scripts/contracts/social-callables.json", "utf8"));
const project = "miranae-orider-g1";
const region = "asia-northeast3";
const accessToken = "test-access-token";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function activeResource(name) {
  return {
    name: functionResourceName(project, region, name),
    state: "ACTIVE",
    serviceConfig: { uri: `https://${name.toLowerCase()}-revision.a.run.app` },
  };
}

function successfulFetch(overrides = {}) {
  return async (url, init) => {
    const functionName = decodeURIComponent(String(url).split("/").pop());
    if (String(url).startsWith("https://cloudfunctions.googleapis.com/")) {
      assert.equal(init.headers.Authorization, `Bearer ${accessToken}`);
      return overrides.resource?.(functionName, init) ?? jsonResponse(activeResource(functionName));
    }
    assert.equal(url, callableEndpointUrl(project, region, functionName));
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, undefined);
    return overrides.probe?.(functionName, init) ?? jsonResponse({
      error: { status: "UNAUTHENTICATED", message: "Unauthenticated" },
    }, 401);
  };
}

test("manifest pins the eight deployed backend callable names", () => {
  assert.deepEqual(manifest.callables.map(({ name }) => name), [
    "setActivityKudos",
    "postActivityComment",
    "editActivityComment",
    "deleteActivityComment",
    "setActivitySocialBlock",
    "setActivityHidden",
    "reportActivitySocialContent",
    "getActivitySocialFeed",
  ]);
});

test("ACTIVE resources with callable auth rejection pass", async () => {
  const results = await verifySocialCallableContract({
    project, region, accessToken, manifest, fetchImpl: successfulFetch(),
  });
  assert.equal(results.length, 8);
  assert.ok(results.every(({ state, endpoint }) => state === "ACTIVE" && endpoint === "unauthenticated"));
});

test("missing resource, inactive function, and endpoint 404 fail distinctly", async (t) => {
  await t.test("missing function API resource", async () => {
    await assert.rejects(() => verifySocialCallableContract({
      project,
      region,
      accessToken,
      manifest,
      fetchImpl: successfulFetch({ resource: () => jsonResponse({}, 404) }),
    }), /function resource is missing/);
  });
  await t.test("inactive function", async () => {
    await assert.rejects(() => verifySocialCallableContract({
      project,
      region,
      accessToken,
      manifest,
      fetchImpl: successfulFetch({ resource: (name) => jsonResponse({ ...activeResource(name), state: "FAILED" }) }),
    }), /function is not ACTIVE/);
  });
  await t.test("endpoint 404", async () => {
    await assert.rejects(() => verifySocialCallableContract({
      project,
      region,
      accessToken,
      manifest,
      fetchImpl: successfulFetch({ probe: () => jsonResponse({}, 404) }),
    }), /endpoint probe failed \(missing\)/);
  });
});

test("project/region mismatch and malformed config fail closed", async () => {
  assert.throws(() => validateSocialCallableConfig({
    project: "--wrong", region, accessToken, manifest,
  }), /project ID/);
  assert.throws(() => validateSocialCallableConfig({
    project, region: "us", accessToken, manifest,
  }), /region/);
  await assert.rejects(() => verifySocialCallableContract({
    project,
    region,
    accessToken,
    manifest,
    fetchImpl: successfulFetch({ resource: (name) => jsonResponse({
      ...activeResource(name),
      name: functionResourceName("wrong-project", region, name),
    }) }),
  }), /project\/region mismatch/);
});

test("only structured auth/App Check rejection is accepted", () => {
  assert.deepEqual(classifyCallableProbe(401, { error: { status: "UNAUTHENTICATED" } }), {
    ok: true, kind: "unauthenticated",
  });
  assert.deepEqual(classifyCallableProbe(403, { error: { status: "PERMISSION_DENIED" } }), {
    ok: true, kind: "app-check-or-access",
  });
  assert.deepEqual(classifyCallableProbe(403, null), {
    ok: false, kind: "unexpected-rejection-403",
  });
  assert.deepEqual(classifyCallableProbe(200, { data: {} }), {
    ok: false, kind: "unexpected-success",
  });
});

test("network timeout is sanitized and fails closed", async () => {
  const timeout = Object.assign(new Error("secret transport detail"), { name: "TimeoutError" });
  await assert.rejects(() => verifySocialCallableContract({
    project,
    region,
    accessToken,
    manifest,
    fetchImpl: async () => { throw timeout; },
  }), /function API request timed out/);
});
