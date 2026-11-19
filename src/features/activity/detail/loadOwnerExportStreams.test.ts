import { FirebaseError } from "firebase/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Activity, ActivityStreams } from "@shared/types";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { markVerifiedStreamCadence, readStreamCadenceUnit } from "../../../services/activityStreamSource";
import { logClientError } from "../../../services/errorLogger";
import { resetRuntimeConfigForTests } from "../../../services/runtimeConfig";
import { loadOwnerExportStreams } from "./loadOwnerExportStreams";

const mocks = vi.hoisted(() => ({ streams: vi.fn() }));
vi.mock("../../../services/publicActivityDetail", async importOriginal => ({
  ...await importOriginal<typeof import("../../../services/publicActivityDetail")>(),
  createPublicActivityClient: () => mocks,
}));
vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));

const run = { id: "orider_run", userId: "owner", source: "orider", type: "Run" } as Activity;
const displayed: ActivityStreams = { time: [0, 2], cadence: [85, 86] };
const ownerServices = () => ({ auth: { currentUser: { uid: "owner" } } }) as FirebaseServices;
const revision = "a".repeat(64);

beforeEach(() => {
  mocks.streams.mockReset();
  vi.mocked(logClientError).mockClear();
  resetRuntimeConfigForTests({ appEnvironment: "production", publicActivityDetailEnabled: true });
});
afterEach(() => resetRuntimeConfigForTests());

it.each(["orider", "apple_health", "health_connect"] as const)("exports the cadence unit and samples from the same owner %s response", async source => {
  const streams = markVerifiedStreamCadence({ time: [0, 1], cadence: [170, 172] }, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "api_streams", streams });
  const result = await loadOwnerExportStreams({ ...run, source }, displayed, "fit", ownerServices());
  expect(result).toBe(streams);
  expect(readStreamCadenceUnit(result)).toBe("spm");
  expect(mocks.streams).toHaveBeenCalledExactlyOnceWith(run.id);
});

it("exports sparse raw-parts cadence with coordinates aligned by observed timestamps", async () => {
  const origin = 1700000000000;
  const streams = markVerifiedStreamCadence({
    time: [0, 1, 2], cadence: [170, null, 172],
    activityRouteGeometryV1: {
      version: 1, timingBasis: "elapsed", originEpochMs: origin + 250, timeOrigin: "relative_to_first_gps_observation",
      routeInputRevision: revision, time: [0, 2], latlng: [[37, 127], [38, 128]],
    },
  } as unknown as ActivityStreams, revision, "spm");
  mocks.streams.mockResolvedValue({ activityId: run.id, state: "available", sourceLayer: "raw_parts", routeTimeOriginEpochMs: origin, streams });
  const services = ownerServices();
  const result = await loadOwnerExportStreams(run, displayed, "tcx", services);
  expect(result.cadence).toEqual([170, null, 172]);
  expect(readStreamCadenceUnit(result)).toBe("spm");
  expect(result.latlng?.[0]).toEqual([37, 127]);
  expect(result.latlng?.[1]).toBeUndefined();
  expect(result.latlng?.[2]).toEqual([38, 128]);
  expect(await loadOwnerExportStreams(run, displayed, "csv", services)).toBe(displayed);
  expect(mocks.streams).toHaveBeenCalledOnce();
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
