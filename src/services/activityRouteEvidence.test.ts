import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
import { loadActivityRouteEvidence, validateRouteEvidenceResponse, validRouteComparison } from "./activityRouteEvidence";
import { routeFixture, routeResponse, backendCanonicalWireFixture, currentCanonicalContractFixture } from "./activityRouteEvidence.fixture";
const mocks = vi.hoisted(() => ({ call: vi.fn(), config: { appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" } }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.call) }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => mocks.config }));
beforeEach(() => mocks.call.mockReset().mockResolvedValue({ data: routeResponse() }));
describe("explicit owner route evidence", () => {
  it("calls only explicit route mode with AppCheck and the route revision name", async () => {
    const app = { options: { projectId: "miranae-orider-g1" } }, services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { region: "asia-northeast3", app, customDomain: mocks.config.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn() } as any;
    await loadActivityRouteEvidence(services, "owner", "first", "a".repeat(64));
    expect(services.ensureAppCheckReady).toHaveBeenCalledTimes(1);
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ mode: "route_evidence", activityId: "first", expectedRouteInputRevision: "a".repeat(64) });
    mocks.call.mockImplementationOnce(async () => { services.auth.currentUser.uid = "other"; return { data: routeResponse() }; });
    await expect(loadActivityRouteEvidence(services, "owner", "first")).rejects.toThrow("account_changed");
    expect(mocks.call).toHaveBeenCalledTimes(2);
  });
  it.each(["mode", "activity", "revision", "fingerprint", "axis", "coverage", "negative", "nan", "order", "hole", "count", "bytes"])("fails closed for malformed %s", field => {
    const data: any = routeResponse();
    if (field === "mode") data.mode = undefined;
    if (field === "activity") data.route.activityId = "foreign";
    if (field === "revision") data.route.routeInputRevision = "c".repeat(64);
    if (field === "fingerprint") data.route.routeFingerprint = "unknown";
    if (field === "axis") data.route.timingBasis = "moving";
    if (field === "coverage") data.route.coverage = "inferred";
    if (field === "negative") data.route.points[0].elapsedSec = -1;
    if (field === "nan") data.route.points[0].lat = NaN;
    if (field === "order") data.route.points[1].elapsedSec = 0;
    if (field === "hole") delete data.route.points[1];
    if (field === "count") data.route.points = Array.from({ length: 100001 }, (_, elapsedSec) => ({ lat: 0, lon: 0, elapsedSec }));
    if (field === "bytes") data.route.points = Array.from({ length: 80000 }, (_, elapsedSec) => ({ lat: 37.12345678901234, lon: 127.12345678901234, elapsedSec }));
    if (field === "bytes") expect(() => validateRouteEvidenceResponse(data, "first")).toThrow("route_input_limit");
    else expect(() => validateRouteEvidenceResponse(data, "first")).toThrow();
  });
  it("preserves unknown coverage, valid zero coordinates and explicit pending without filling GPS", () => {
    const data = routeResponse(); if (data.state === "available") { (data.route.points as any)[0] = { lat: 0, lon: 0, elapsedSec: 0 }; }
    expect(validateRouteEvidenceResponse(data, "first")).toBe(data);
    const pending = { mode: "route_evidence", activityId: "first", routeInputRevision: null, state: "pending", reason: "incomplete_input", sourceLayer: null, route: null };
    expect(validateRouteEvidenceResponse(pending, "first")).toBe(pending);
    expect(() => validateRouteEvidenceResponse(data, "first", "c".repeat(64))).toThrow();
  });
  it("requires an epoch for native first-GPS origin while API activity-start may be unknown", () => {
    const data = routeResponse();
    if (data.state !== "available") throw new Error("fixture");
    data.route.originEpochMs = null;
    expect(() => validateRouteEvidenceResponse(data, "first")).toThrow();
    data.sourceLayer = "api_streams"; data.route.sourceLayer = "api_streams"; data.route.timeOrigin = "activity_start";
    expect(validateRouteEvidenceResponse(data, "first")).toBe(data);
  });
  it.each(["zeroLength", "span", "durationSum", "ratio", "insufficient"])("rejects internally inconsistent actual-kernel output: %s", field => {
    const routes = [routeFixture(), routeFixture("second")];
    const result = compareObservedRoutes(routes[0]!, routes[1]!);
    if (result.state === "unavailable") throw new Error("fixture");
    if (field === "zeroLength") result.diagnostics.forEach(item => { item.observedLengthM = 0; });
    if (field === "span") result.diagnostics[0].elapsedSpanSec += 1;
    if (field === "durationSum") result.diagnostics[0].observedElapsedSec -= 1;
    if (field === "ratio") result.lengthRatio = 0.5;
    if (field === "insufficient") { result.state = "insufficient"; result.reason = "insufficient_observed_length"; result.forward = null; result.reverse = null; result.sampleCount = 0; result.shapeGuidance = "insufficient"; result.direction = "undetermined"; }
    expect(validRouteComparison(result, routes)).toBe(false);
  });
  it("preserves genuine insufficient, gap-containing and fractional-time kernel diagnostics", () => {
    for (const variant of ["short", "gaps", "fractional"]) {
      const routes = [routeFixture(), routeFixture("second")];
      routes.forEach(route => { route.points = route.points.map((point, index) => ({ ...point,
        lon: variant === "short" ? 127 + index * 0.000001 : point.lon,
        elapsedSec: variant === "gaps" ? index + (index > 50 ? 40 : 0) : variant === "fractional" ? index * 0.333333333333 : index })); });
      expect(validRouteComparison(compareObservedRoutes(routes[0]!, routes[1]!), routes)).toBe(true);
    }
  });
  it("accepts exact native kernel output and rejects foreign source/result corruption", () => {
    const routes = [routeFixture(), routeFixture("second")], result = compareObservedRoutes(routes[0]!, routes[1]!);
    expect(validRouteComparison(result, routes)).toBe(true);
    if (result.state !== "unavailable") {
      result.sources[1].routeInputRevision = "c".repeat(64);
      expect(validRouteComparison(result, routes)).toBe(false);
      result.sources[1].routeInputRevision = routes[1]!.routeInputRevision;
      result.diagnostics[0].observedLengthM = NaN;
      expect(validRouteComparison(result, routes)).toBe(false);
    }
  });
});

it("adds canonical opt-in only explicitly and keeps default request/response identity", async () => {
  const { routeAverageResponse } = await import("./activityRouteEvidence.fixture");
  const app={options:{projectId:"miranae-orider-g1"}},services={auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{region:'asia-northeast3',app,customDomain:mocks.config.firebaseFunctionsBase},ensureAppCheckReady:vi.fn()} as any;
  const original=routeResponse();expect(validateRouteEvidenceResponse(original,"first")).toBe(original);
  mocks.call.mockResolvedValueOnce({data:routeAverageResponse()});
  const value=await loadActivityRouteEvidence(services,"owner","first",undefined,{includeCanonicalAverage:true,startTime:1700000000000,discipline:"bike"});
  expect(value.canonicalAverage?.state).toBe("available");expect(mocks.call).toHaveBeenCalledExactlyOnceWith({mode:"route_evidence",activityId:"first",includeCanonicalAverage:true});
});
it.each(["colon-revision","version34","version35","futureVersion","negative","nan","infinite","start","discipline","revision","computed","coverage","source","extra","null-channel","state"])("isolates malformed canonical%s without losing GPS", async fault => {
  const { routeAverageResponse }=await import("./activityRouteEvidence.fixture");const value=routeAverageResponse(), a=value.canonicalAverage as any;
  if(fault==="colon-revision")a.metricsRevision="1700000300:2";if(fault==="version34")a.version=34;if(fault==="version35")a.version=35;if(fault==="futureVersion")a.version=ACTIVITY_METRICS_VERSION+1;if(fault==="negative")a.avgSpeedKph=-1;if(fault==="nan")a.avgSpeedKph=NaN;if(fault==="infinite")a.avgSpeedKph=Infinity;
  if(fault==="start")a.startTime++;if(fault==="discipline")a.discipline="run";if(fault==="revision")a.metricsRevision="GPS";if(fault==="computed")a.computedAt=0;
  if(fault==="coverage")a.inputCoverage="pending";if(fault==="source")a.sourceLayer="api_streams";if(fault==="extra")a.guess=true;if(fault==="null-channel")value.canonicalAverage=null as any;if(fault==="state")a.state="changed_input";
  const beforeRoute=value.state==="available"?value.route:null;
  const safe=validateRouteEvidenceResponse(value,"first",undefined,{includeCanonicalAverage:true,startTime:1700000000000,discipline:"bike"});
  expect(safe.canonicalAverage).toBeUndefined();expect(safe.state).toBe("available");if(safe.state==="available")expect(safe.route).toBe(beforeRoute);
});
it("preserves current canonical explicitnull, real0 and partial-terminal; accepts separate honest states and absent oldserver channel", async () => {
  const { routeAverageResponse }=await import("./activityRouteEvidence.fixture");const option={includeCanonicalAverage:true as const,startTime:1700000000000,discipline:"bike" as const};
  for(const speed of [0,null,12]){const value=routeAverageResponse("first",option.startTime,"bike",speed);if(value.canonicalAverage?.state!=="available")throw new Error("fixture");value.canonicalAverage.inputCoverage="partial_terminal";expect(validateRouteEvidenceResponse(value,"first",undefined,option)).toBe(value);expect(value.canonicalAverage.avgSpeedKph).toBe(speed);}
  for(const [state,reason] of [["pending","metrics_pending"],["changed_input","metrics_revision_changed"],["unavailable","missing_metrics"]]){const value={...routeResponse(),canonicalAverage:{state,reason,metricsRevision:null}};expect(validateRouteEvidenceResponse(value,"first",undefined,option).canonicalAverage?.state).toBe(state);}
  const old=routeResponse();expect(validateRouteEvidenceResponse(old,"first",undefined,option)).toBe(old);
});

it.each(currentCanonicalContractFixture(backendCanonicalWireFixture).cases)("accepts current-version synthetic canonical$name derived from archived wire", wire => {
  const option={includeCanonicalAverage:true as const,startTime:1789999970000,discipline:wire.name.startsWith("run_")?"run" as const:"bike" as const};
  const value=validateRouteEvidenceResponse(wire.response,wire.response.activityId,undefined,option);
  expect(value.canonicalAverage).toEqual(wire.response.canonicalAverage);expect(value.state).toBe("available");
  expect(backendCanonicalWireFixture.operationalReads).toBe(0);expect(backendCanonicalWireFixture.emittedFixtureSha256).toBe("cdd3833475e2e9bdae84cdd199349be9a79a8971d4a48d2bd9fb96e93e38913c");
});

it.each(backendCanonicalWireFixture.cases)("keeps archived version41 provenance and isolates its obsolete canonical channel: $name", wire => {
  const option = { includeCanonicalAverage: true as const, startTime: 1789999970000, discipline: wire.name.startsWith("run_") ? "run" as const : "bike" as const };
  const value = validateRouteEvidenceResponse(wire.response, wire.response.activityId, undefined, option);
  if (wire.response.canonicalAverage?.state === "available") {
    expect(wire.response.canonicalAverage.version).toBe(41);
    expect(value.canonicalAverage).toBeUndefined();
    expect(value.state).toBe("available");
    expect(value.route).toBe(wire.response.route);
  } else expect(value.canonicalAverage).toEqual(wire.response.canonicalAverage);
});
