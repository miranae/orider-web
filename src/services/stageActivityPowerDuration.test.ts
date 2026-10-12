import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { StageActivityPowerDurationResponse, StageActivityPowerSourceMetadataResponse } from "@shared/types/stage-activity-power-snapshot";
import fixture from "./stageActivityPowerDuration.fixture.json";
import { loadStagePowerDuration, loadStagePowerMetadata, stagePowerDurationRequest, validateStagePowerDuration, validateStagePowerMetadata } from "./stageActivityPowerDuration";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: (...args: unknown[]) => { mocks.callable(...args); return mocks.call; } }));
const metadata = fixture[0]!.metadata as StageActivityPowerSourceMetadataResponse;
const result = fixture[0]!.result as StageActivityPowerDurationResponse;
const services = () => { const app = {}; return { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices; };
beforeEach(() => { mocks.call.mockReset(); mocks.callable.mockReset(); resetRuntimeConfigForTests({ appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }); });
it("strictly accepts actual compiled modern and legacy scalar responses with server bindings", () => {
  for (const f of fixture) {
    const meta = f.metadata as StageActivityPowerSourceMetadataResponse, response = f.result as StageActivityPowerDurationResponse;
    expect(validateStagePowerMetadata(meta, "a", meta.activityStartEpochMs)).toBe(meta);
    expect(validateStagePowerDuration(response, stagePowerDurationRequest(meta, 2), meta)).toBe(response);
  }
  expect(() => validateStagePowerDuration(result, { ...stagePowerDurationRequest(metadata, 2), expectedSnapshotRevision: "b".repeat(64) }, metadata)).toThrow();
  const zero = structuredClone(result); if (zero.result?.state === "available") zero.result.maxAveragePowerW = 0;
  expect(validateStagePowerDuration(zero, stagePowerDurationRequest(metadata, 2), metadata)).toBe(zero);
});
it("rejects wrong activity/date/unit/binding/revision/provenance/arrays/window and invented source flags", () => {
  for (const patch of [(v: any) => { v.activityId = "other"; }, (v: any) => { v.activityStartEpochMs++; }, (v: any) => { v.source.originalClockVerified = true; }, (v: any) => { v.maxIntegerDurationSeconds = 5; }, (v: any) => { v.source.snapshotRevision = "a".repeat(64); }, (v: any) => { v.intervals = []; }]) {
    const value = structuredClone(metadata); patch(value); expect(() => validateStagePowerMetadata(value, "a", metadata.activityStartEpochMs)).toThrow();
  }
  for (const patch of [(v: any) => { v.source.baseMetricsRevision = "2:1"; }, (v: any) => { v.result.unit = "W/kg"; }, (v: any) => { v.result.windowEndElapsedSec += 0.01; }, (v: any) => { v.result.maxAveragePowerW = -1; }, (v: any) => { v.result.maxAveragePowerW = NaN; }, (v: any) => { v.source.sensorBucketOriginVerified = true; }, (v: any) => { v.result.intervals = []; }]) {
    const value = structuredClone(result); patch(value); expect(() => validateStagePowerDuration(value, stagePowerDurationRequest(metadata, 2), metadata)).toThrow();
  }
});
it("keeps missing and subsecond-only sources unavailable without invented zero power", () => {
  const missing: StageActivityPowerSourceMetadataResponse = { ...metadata, state: "unavailable", reason: "snapshot_missing", source: null, snapshotRevision: null, observedMilliseconds: null, longestContinuousMilliseconds: null, maxIntegerDurationSeconds: null };
  expect(validateStagePowerMetadata(missing, "a", missing.activityStartEpochMs)).toBe(missing);
  expect(() => stagePowerDurationRequest(missing, 1)).toThrow();
  const short = { ...metadata, observedMilliseconds: 500, longestContinuousMilliseconds: 500, maxIntegerDurationSeconds: 0 };
  expect(validateStagePowerMetadata(short, "a", short.activityStartEpochMs)).toBe(short); expect(() => stagePowerDurationRequest(short, 1)).toThrow();
  for (const duration of [0, 1.5, NaN, Infinity, 5]) expect(() => stagePowerDurationRequest(metadata, duration)).toThrow();
});
it("uses exactly one metadata click and one duration call on the same Stage callable", async () => {
  const context = services(); mocks.call.mockResolvedValueOnce({ data: metadata }).mockResolvedValueOnce({ data: result });
  const loaded = await loadStagePowerMetadata(context, "owner", "a", metadata.activityStartEpochMs);
  await loadStagePowerDuration(context, "owner", loaded, 2);
  expect(mocks.call).toHaveBeenCalledTimes(2); expect(mocks.call.mock.calls[0]![0]).toEqual({ mode: "stage_activity_source_metadata", activityId: "a" });
  expect(mocks.call.mock.calls[1]![0]).toEqual(stagePowerDurationRequest(metadata, 2));
  expect(mocks.callable.mock.calls.every(call => call[1] === "getPowerCurvePeriods")).toBe(true);
});
it("blocks foreign/anonymous/production and changed authentication before or after AppCheck", async () => {
  const context = services(); await expect(loadStagePowerMetadata(context, "other", "a", metadata.activityStartEpochMs)).rejects.toThrow("account_changed");
  resetRuntimeConfigForTests({ appEnvironment: "production" }); await expect(loadStagePowerMetadata(context, "owner", "a", metadata.activityStartEpochMs)).rejects.toThrow("api_unavailable");
  resetRuntimeConfigForTests({ appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" });
  vi.mocked(context.ensureAppCheckReady).mockImplementation(async () => { Object.assign(context.auth.currentUser!, { uid: "other" }); });
  await expect(loadStagePowerMetadata(context, "owner", "a", metadata.activityStartEpochMs)).rejects.toThrow("account_changed"); expect(mocks.call).not.toHaveBeenCalled();
});

it("rejects enormous finite windows and metadata beyond the server seven-day envelope", () => {
  for (const [start, end] of [[1e308, 1.0000000000000002e308], [604799, 604801], [604801, 604803]]) {
    const response = structuredClone(result); if (response.result?.state === "available") Object.assign(response.result, { windowStartElapsedSec: start, windowEndElapsedSec: end });
    expect(() => validateStagePowerDuration(response, stagePowerDurationRequest(metadata, 2), metadata)).toThrow();
  }
  for (const changed of [{ ...metadata, observedMilliseconds: 604800001 }, { ...metadata, observedMilliseconds: 604801000, longestContinuousMilliseconds: 604801000, maxIntegerDurationSeconds: 604801 }]) {
    expect(() => validateStagePowerMetadata(changed, "a", metadata.activityStartEpochMs)).toThrow();
  }
  const capped = { ...metadata, observedMilliseconds: 604800000, longestContinuousMilliseconds: 604800000, maxIntegerDurationSeconds: 604800 };
  const atEnd = structuredClone(result); if (atEnd.result?.state === "available") Object.assign(atEnd.result, { observedSeconds: 604800, longestContinuousSeconds: 604800, windowStartElapsedSec: 604798, windowEndElapsedSec: 604800 });
  expect(validateStagePowerDuration(atEnd, stagePowerDurationRequest(capped, 2), capped)).toBe(atEnd);
  const fractional = structuredClone(result); if (fractional.result?.state === "available") Object.assign(fractional.result, { windowStartElapsedSec: 0.001, windowEndElapsedSec: 2.001 });
  expect(validateStagePowerDuration(fractional, stagePowerDurationRequest(metadata, 2), metadata)).toBe(fractional);
});
it("matches server activity IDs at 160 characters and rejects 161 or a leading underscore", () => {
  const boundary = { ...metadata, activityId: "a".repeat(160) };
  expect(validateStagePowerMetadata(boundary, boundary.activityId, boundary.activityStartEpochMs)).toBe(boundary);
  for (const activityId of ["a".repeat(161), "_a", "-a"]) expect(() => validateStagePowerMetadata({ ...metadata, activityId }, activityId, metadata.activityStartEpochMs)).toThrow();
});

it("accepts safe scalar watt precision and rejects power outside the stored-slot numeric envelope", () => {
  for (const watts of [0, 250.125, Number.MAX_SAFE_INTEGER]) {
    const value = structuredClone(result); if (value.result?.state === "available") value.result.maxAveragePowerW = watts;
    expect(validateStagePowerDuration(value, stagePowerDurationRequest(metadata, 2), metadata)).toBe(value);
  }
  for (const watts of [Number.MAX_SAFE_INTEGER + 1, 1e308]) {
    const value = structuredClone(result); if (value.result?.state === "available") value.result.maxAveragePowerW = watts;
    expect(() => validateStagePowerDuration(value, stagePowerDurationRequest(metadata, 2), metadata)).toThrow();
  }
});

it("accepts the actual compiled stored-origin fixture only with aligned explicit source and result markers", async () => {
  const { default: stored } = await import("./stageActivityPowerStoredOrigin.fixture.json");
  const meta = stored.metadataResponse as StageActivityPowerSourceMetadataResponse, value = stored.response as StageActivityPowerDurationResponse;
  expect(validateStagePowerMetadata(meta, meta.activityId, meta.activityStartEpochMs)).toBe(meta);
  const request = stagePowerDurationRequest(meta, stored.request.durationSeconds);
  expect(request).toEqual(stored.request); expect(validateStagePowerDuration(value, request, meta)).toBe(value);
  for (const patch of [(v: any) => { delete v.result.powerSource; }, (v: any) => { delete v.source.powerSource; }, (v: any) => { v.result.powerSource = "measured"; }, (v: any) => { v.source.powerSource = "future"; }, (v: any) => { delete v.result.powerSource; delete v.source.powerSource; }, (v: any) => { v.source.originalClockVerified = true; }]) {
    const changed = structuredClone(value); patch(changed); expect(() => validateStagePowerDuration(changed, request, meta)).toThrow();
  }
  for (const powerSource of ["measured", "future", null, undefined]) {
    const changed = structuredClone(meta); Object.assign(changed.source!, { powerSource });
    expect(() => validateStagePowerMetadata(changed, changed.activityId, changed.activityStartEpochMs)).toThrow();
  }
  const noMarker = structuredClone(meta); delete noMarker.source!.powerSource;
  expect(() => validateStagePowerDuration(value, request, noMarker)).toThrow();
});
it("returns qualified measured metadata and scalar objects byte-identically with no marker addition", () => {
  for (const f of fixture) {
    const meta = f.metadata as StageActivityPowerSourceMetadataResponse, value = f.result as StageActivityPowerDurationResponse;
    const before = JSON.stringify({ metadata: meta, response: value });
    expect(validateStagePowerMetadata(meta, meta.activityId, meta.activityStartEpochMs)).toBe(meta);
    expect(validateStagePowerDuration(value, stagePowerDurationRequest(meta, 2), meta)).toBe(value);
    expect(JSON.stringify({ metadata: meta, response: value })).toBe(before);
    expect(meta.source).not.toHaveProperty("powerSource"); expect(value.result).not.toHaveProperty("powerSource");
  }
});
