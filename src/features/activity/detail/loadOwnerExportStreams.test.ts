import { FirebaseError } from "firebase/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { markVerifiedStreamCadence, readStreamCadenceUnit } from "../../../services/activityStreamSource";
import { logClientError, reportPreviousAccountFailure } from "../../../services/errorLogger";
import { resetRuntimeConfigForTests } from "../../../services/runtimeConfig";
import { loadOwnerExportStreams } from "./loadOwnerExportStreams";

const mocks = vi.hoisted(() => ({ streams: vi.fn() }));
vi.mock("../../../services/publicActivityDetail", async importOriginal => ({
  ...await importOriginal<typeof import("../../../services/publicActivityDetail")>(),
  createPublicActivityClient: () => mocks,
}));
vi.mock("../../../services/errorLogger", async importOriginal => ({
  ...await importOriginal<typeof import("../../../services/errorLogger")>(),
  logClientError: vi.fn(), debugLog: vi.fn(), reportPreviousAccountFailure: vi.fn(),
}));

const run = { id: "orider_run", userId: "owner", source: "orider", type: "Run" } as Activity;
const displayed: ActivityStreams = { time: [0, 2], cadence: [170, 172] };
const ownerServices = () => ({ auth: { currentUser: { uid: "owner" } } }) as FirebaseServices;
const revision = "a".repeat(64);

beforeEach(() => {
  mocks.streams.mockReset();
  vi.mocked(logClientError).mockClear();
  resetRuntimeConfigForTests({ appEnvironment: "production", publicActivityDetailEnabled: true });
});
afterEach(() => resetRuntimeConfigForTests());

it.each(["orider", "apple_health", "health_connect"] as const)("binds a verified unit to identical %s legacy samples", async source => {
  const streams = markVerifiedStreamCadence({ time: [0, 1, 2], cadence: [170, null, 172] } as unknown as ActivityStreams, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "api_streams", streams });
  const result = await loadOwnerExportStreams({ ...run, source }, displayed, "fit", ownerServices());
  expect(result.time).toEqual([0, 2]);
  expect(result.cadence).toEqual([170, 172]);
  expect(readStreamCadenceUnit(result)).toBe("spm");
  expect(mocks.streams).toHaveBeenCalledExactlyOnceWith(run.id);
});

it("adds only cadence from the matching revision and omits candidate samples without timestamps", async () => {
  const streams = markVerifiedStreamCadence({
    time: [0, null, 1, 60], cadence: [170, 174, 172, null], heartrate: [222, 223, 224, null],
  } as unknown as ActivityStreams, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "api_streams", streams });
  const existing = markVerifiedStreamCadence({
    ...displayed, latlng: [[37, 127], [38, 128]], heartrate: [150, 152], watts: [100, 105],
  } as ActivityStreams, revision, null);
  const result = await loadOwnerExportStreams(run, existing, "tcx", ownerServices());
  expect(result.time).toEqual([0, 1, 2]);
  expect(result.latlng?.[2]).toEqual([38, 128]);
  expect(result.heartrate?.[2]).toBe(152);
  expect(result.heartrate?.[1]).toBeUndefined();
  expect(result.watts?.[2]).toBe(105);
  expect(result.cadence?.filter(Number.isFinite)).toEqual([170, 172, 172]);
  expect(readStreamCadenceUnit(result)).toBe("spm");
});

it("retains the stored export on a revision mismatch", async () => {
  const streams = markVerifiedStreamCadence({ time: [0, 2], cadence: [170, 172] }, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "api_streams", streams });
  const existing = markVerifiedStreamCadence(displayed, "b".repeat(64), null);
  expect(await loadOwnerExportStreams(run, existing, "tcx", ownerServices())).toBe(existing);
});

it.each([{ time: [0], cadence: [] }, { cadence: [170] }])("keeps existing file data if cadence cannot be placed on the candidate timeline", async data => {
  const streams = markVerifiedStreamCadence(data as ActivityStreams, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "raw_parts", streams });
  expect(await loadOwnerExportStreams(run, displayed, "tcx", ownerServices())).toBe(displayed);
});

it("uses displayed streams for CSV without querying the cadence source", async () => {
  expect(await loadOwnerExportStreams(run, displayed, "csv", ownerServices())).toBe(displayed);
  expect(mocks.streams).not.toHaveBeenCalled();
});

it("keeps the legacy file source while the rollout flag is disabled", async () => {
  resetRuntimeConfigForTests({ appEnvironment: "production", publicActivityDetailEnabled: false });
  expect(await loadOwnerExportStreams(run, displayed, "fit", ownerServices())).toBe(displayed);
  expect(mocks.streams).not.toHaveBeenCalled();
});

it("uses the legacy file source for an unmounted callable endpoint", async () => {
  mocks.streams.mockRejectedValue(new FirebaseError("functions/not-found", "not-found"));
  expect(await loadOwnerExportStreams(run, displayed, "fit", ownerServices())).toBe(displayed);
});

it.each([
  new FirebaseError("functions/not-found", "활동을 찾을 수 없습니다."),
  new FirebaseError("functions/permission-denied", "permission denied"),
  new Error("invalid_activity_streams"),
])("fails closed on explicit denial or malformed data (%s)", async failure => {
  mocks.streams.mockRejectedValue(failure);
  await expect(loadOwnerExportStreams(run, displayed, "fit", ownerServices())).rejects.toBe(failure);
  expect(logClientError).toHaveBeenCalledWith("ActivityStreams.ownerExport", failure,
    expect.objectContaining({ activityId: run.id, source: "orider" }), expect.anything());
});

it("refuses files after the account changes during a lookup", async () => {
  const services = ownerServices();
  mocks.streams.mockImplementation(() => {
    Object.assign(services.auth, { currentUser: { uid: "different" } });
    return Promise.resolve({ activityId: run.id, state: "available", streams: displayed });
  });
  await expect(loadOwnerExportStreams(run, displayed, "fit", services)).rejects.toThrow("account_changed");
});


it("does not submit previous account diagnostics under the replacement account", async () => {
  const services = ownerServices();
  mocks.streams.mockImplementation(() => {
    Object.assign(services.auth, { currentUser: { uid: "different" } });
    return Promise.reject(new Error("network error"));
  });
  await expect(loadOwnerExportStreams(run, displayed, "fit", services)).rejects.toThrow("account_changed");
  expect(logClientError).not.toHaveBeenCalled();
  expect(reportPreviousAccountFailure).toHaveBeenCalledWith("ActivityStreams.ownerExportPreviousAccount", expect.any(Error), {
    format: "fit", source: "orider",
  });
});


it("does not apply a legacy unit to cadence observations with missing timestamps", async () => {
  const streams = markVerifiedStreamCadence({ time: [0, 2], cadence: [170, 172] }, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "api_streams", streams });
  const existing = { time: [0, null, 2], cadence: [170, 85, 172] } as unknown as ActivityStreams;
  expect(await loadOwnerExportStreams(run, existing, "tcx", ownerServices())).toBe(existing);
});
