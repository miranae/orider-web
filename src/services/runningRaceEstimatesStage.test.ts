import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadRunningRaceEstimates, validRunningRaceRequest, validateRunningRaceResponse } from "./runningRaceEstimatesStage";
import { racePreviewFixture } from "./runningRaceEstimatesStage.fixture";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const stage = { appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" };
function services() {
  const app = {};
  return { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
}
beforeEach(() => { resetRuntimeConfigForTests(stage); mocks.call.mockReset().mockResolvedValue({ data: racePreviewFixture() }); mocks.callable.mockReset().mockReturnValue(mocks.call); });
it("sends only the explicit request, never client qualification flags", async () => {
  const request = { mode: "preview" as const, ...racePreviewFixture().snapshot.inputs };
  expect(validRunningRaceRequest(request)).toBe(true);
  expect(validRunningRaceRequest({ ...request, manualRaces: [{ ...request.manualRaces[0]!, clockVerified: true }] } as any)).toBe(false);
  expect(await loadRunningRaceEstimates(services(), "owner", request)).toEqual(racePreviewFixture());
  expect(mocks.callable).toHaveBeenCalledWith(expect.anything(), "getStageRunRaceEstimates"); expect(mocks.call).toHaveBeenCalledWith(request);
});
it("checks Stage callable context and anonymous/foreign/changed accounts before issuing calls", async () => {
  const request = { mode: "preview" as const, ...racePreviewFixture().snapshot.inputs };
  for (const fault of ["anonymous", "foreign", "context", "duringAppCheck"] as const) {
    const value = services();
    if (fault === "anonymous") Object.assign(value.auth.currentUser!, { isAnonymous: true });
    if (fault === "foreign") Object.assign(value.auth.currentUser!, { uid: "foreign" });
    if (fault === "context") Object.assign(value.functions, { customDomain: "https://production.invalid" });
    if (fault === "duringAppCheck") value.ensureAppCheckReady = async () => { Object.assign(value.auth.currentUser!, { uid: "foreign" }); };
    await expect(loadRunningRaceEstimates(value, "owner", request)).rejects.toThrow();
  }
  expect(mocks.call).not.toHaveBeenCalled();
});
it("validates four rows, unknown unavailable times and actual bounded saved history", () => {
  const preview = racePreviewFixture(), request = { mode: "preview" as const, ...preview.snapshot.inputs };
  expect(validateRunningRaceResponse(preview, request)).toBe(preview);
  const fake = structuredClone(preview); fake.snapshot.estimates[3]!.elapsedSeconds = 0;
  expect(() => validateRunningRaceResponse(fake, request)).toThrow();
  const history = { mode: "history_page" as const, windowMonths: 3 as const, windowDays: 90 as const, scope: "latest_64_actual_snapshots_within_180_days" as const,
    registryRevision: "100:1", snapshots: [{ snapshot: { ...preview.snapshot, snapshotId: "a".repeat(64) }, sourceValidity: "changed_or_unavailable" as const }], nextCursor: null, capped: false };
  expect(validateRunningRaceResponse(history, { mode: "history_page", windowMonths: 3 })).toBe(history);
  expect(() => validateRunningRaceResponse(history, { mode: "history_page", windowMonths: 1 })).toThrow();
});
it.each([NaN, -1, 0])("rejects invalid raw race duration %s", elapsedSeconds => {
  const input = racePreviewFixture().snapshot.inputs;
  input.manualRaces[0]!.elapsedSeconds = elapsedSeconds;
  expect(validRunningRaceRequest({ mode: "preview", ...input })).toBe(false);
});

it("rejects a syntactically valid snapshot for different manual values or activity CAS inputs", () => {
  const preview = racePreviewFixture(); const request = { mode: "preview" as const, ...structuredClone(preview.snapshot.inputs) };
  preview.snapshot.inputs.manualRaces[0]!.elapsedSeconds++;
  expect(() => validateRunningRaceResponse(preview, request)).toThrow("invalid_race_estimate_response");
  const activity = { activityId: "activity-a", target: "5k" as const, maximalEffortAttested: true as const, expectedActivityIncarnation: "50:0", expectedMetricsRevision: "100:1", expectedPreferenceRevision: 0 };
  const response = racePreviewFixture(); response.snapshot.inputs.activities = [activity];
  response.snapshot.sourceWitnesses = [{ activityId: activity.activityId, target: activity.target, activityIncarnation: "50:0", activityRevision: "50:1", metricsRevision: "100:1", preferenceRevision: 0, preferenceDocumentRevision: "missing", qualification: "producer_elapsed_axis_v2", originalSensorClock: "not_independently_verified", reason: null }];
  const actualRequest = { mode: "preview" as const, ...structuredClone(response.snapshot.inputs) };
  expect(validateRunningRaceResponse(response, actualRequest)).toBe(response);
  response.snapshot.inputs.activities[0]!.expectedMetricsRevision = "200:2";
  expect(() => validateRunningRaceResponse(response, actualRequest)).toThrow("invalid_race_estimate_response");
  const mileage = racePreviewFixture(); const mileageRequest = { mode: "preview" as const, ...structuredClone(mileage.snapshot.inputs), typicalMileage: { value: 40, unit: "km_per_week" as const, attestedTypicalTraining: true as const } };
  mileage.snapshot.inputs.typicalMileage = { value: 50, unit: "km_per_week", attestedTypicalTraining: true };
  expect(() => validateRunningRaceResponse(mileage, mileageRequest)).toThrow("invalid_race_estimate_response");
});

it.each(["excluded", "deleted", "unsupported", "unattested", "clock", "basis", "sourceDate", "oldDate", "method", "referenceTime", "referenceDistance"])("rejects contradictory positive source evidence %s", fault => {
  const response = racePreviewFixture(); const request = { mode: "preview" as const, ...structuredClone(response.snapshot.inputs) };
  const source = response.snapshot.estimates[0]!.source!;
  if (fault === "excluded") source.excluded = true;
  if (fault === "deleted") source.deleted = true;
  if (fault === "unsupported") source.supported = false;
  if (fault === "unattested") source.maximalEffortAttested = false;
  if (fault === "clock") source.clockVerified = true;
  if (fault === "basis") source.timeBasis = "elapsed_including_stops";
  if (fault === "sourceDate") source.occurredAt = 8_640_000_000_000_001;
  if (fault === "oldDate") source.occurredAt = response.snapshot.asOf - 24 * 7 * 86400000 - 1;
  if (fault === "method") response.snapshot.estimates[2]!.method = "riegel_race_equivalent_1_07_v1";
  if (fault === "referenceTime") response.snapshot.estimates[2]!.elapsedSeconds!++;
  if (fault === "referenceDistance") source.distanceMeters = 10000;
  expect(() => validateRunningRaceResponse(response, request)).toThrow("invalid_race_estimate_response");
});
it.each([NaN, 8_640_000_000_000_001])("rejects unrepresentable snapshot dates %s", asOf => {
  const response = racePreviewFixture(); response.snapshot.asOf = asOf;
  expect(() => validateRunningRaceResponse(response, { mode: "preview", ...response.snapshot.inputs })).toThrow("invalid_race_estimate_response");
});

it.each(["identity", "incarnation", "metrics", "preference", "activityRevision", "preferenceDocumentRevision", "qualificationReason"])("rejects a witness not bound to the actual request %s", fault => {
  const response = racePreviewFixture();
  const input = { activityId: "activity-a", target: "5k" as const, maximalEffortAttested: true as const, expectedActivityIncarnation: "50:0", expectedMetricsRevision: "100:1", expectedPreferenceRevision: 0 };
  response.snapshot.inputs.activities = [input];
  response.snapshot.sourceWitnesses = [{ activityId: "activity-a", target: "5k", activityIncarnation: "50:0", activityRevision: "50:1", metricsRevision: "100:1", preferenceRevision: 0, preferenceDocumentRevision: "missing", qualification: "producer_elapsed_axis_v2", originalSensorClock: "not_independently_verified", reason: null }];
  const request = { mode: "preview" as const, ...structuredClone(response.snapshot.inputs) };
  const witness = response.snapshot.sourceWitnesses[0]!;
  if (fault === "identity") witness.activityId = "other";
  if (fault === "incarnation") witness.activityIncarnation = "51:0";
  if (fault === "metrics") witness.metricsRevision = "101:1";
  if (fault === "preference") witness.preferenceRevision = 1;
  if (fault === "activityRevision") witness.activityRevision = "opaque";
  if (fault === "preferenceDocumentRevision") witness.preferenceDocumentRevision = "opaque";
  if (fault === "qualificationReason") witness.reason = "excluded";
  expect(() => validateRunningRaceResponse(response, request)).toThrow("invalid_race_estimate_response");
});

it("validates the exact compiled backend manual/native/excluded/save/history wire through the owner transport", async () => {
  const { default: wire } = await import("./runningRaceEstimatesStage.wire.fixture.json");
  for (const scenario of wire.cases) {
    const request = scenario.request as unknown as Parameters<typeof loadRunningRaceEstimates>[2];
    const response = scenario.response as unknown as Parameters<typeof validateRunningRaceResponse>[0];
    expect(validRunningRaceRequest(request)).toBe(true);
    expect(validateRunningRaceResponse(response, request)).toBe(response);
    mocks.call.mockResolvedValueOnce({ data: response });
    expect(await loadRunningRaceEstimates(services(), "owner", request)).toEqual(response);
    expect(mocks.call).toHaveBeenLastCalledWith(request);
    expect(scenario.proof.fakeOnly).toBe(true); expect(scenario.proof.liveDatabaseReads).toBe(0); expect(scenario.proof.liveDatabaseWrites).toBe(0);
  }
  expect(wire.blockedNetworkAttempts).toBe(0);
});
