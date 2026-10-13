import { afterEach, describe, expect, it, vi } from "vitest";
import { getActivityStreamsWithAuth, validatedRunEffortFacts } from "./personalDataApi";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import type { Auth } from "firebase/auth";
import type { Functions } from "firebase/functions";
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.call) }));
afterEach(() => { resetRuntimeConfigForTests(); vi.unstubAllGlobals(); mocks.call.mockReset(); });
function setup() {
  resetRuntimeConfigForTests({ appEnvironment: "stage" });
  const app = { options: { projectId: "miranae-orider-g1" } };
  const auth = { app, currentUser: { uid: "owner" } } as unknown as Auth;
  const services = { functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" } as Functions, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) };
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  return { auth, services, fetchMock };
}
const available = { activityId: "native_1", state: "available", streamInputRevision: "a".repeat(64), sourceLayer: "raw_parts", streams: { userId: "owner", time: [1791000000000, 1791000001000], sensorStreamsV1: { version: 1 } } };
describe("shared-data stage stream callable", () => {
  it("uses the matching Auth/AppCheck app and returns exact raw data without REST fallback", async () => {
    const { auth, services, fetchMock } = setup(); mocks.call.mockResolvedValue({ data: available });
    expect(await getActivityStreamsWithAuth(auth, "native_1", services)).toEqual(available.streams);
    expect(services.ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(mocks.call).toHaveBeenCalledWith({ activityId: "native_1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["pending", "changed_input", "unavailable"])("does not expose streams or fallback for %s", async state => {
    const { auth, services, fetchMock } = setup(); mocks.call.mockResolvedValue({ data: { ...available, state } });
    await expect(getActivityStreamsWithAuth(auth, "native_1", services)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects an account change during App Check readiness", async () => {
    const { auth, services } = setup(); services.ensureAppCheckReady.mockImplementation(async () => { Object.assign(auth, { currentUser: { uid: "other" } }); });
    await expect(getActivityStreamsWithAuth(auth, "native_1", services)).rejects.toThrow("account_changed");
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("rejects an account change while the callable is in flight", async () => {
    const { auth, services } = setup(); mocks.call.mockImplementation(async () => { Object.assign(auth, { currentUser: { uid: "other" } }); return { data: available }; });
    await expect(getActivityStreamsWithAuth(auth, "native_1", services)).rejects.toThrow("account_changed");
  });
  it.each([{ activityId: "wrong" }, { streamInputRevision: null }, { sourceLayer: "wrong" }, { streams: [] }])("rejects mismatched response %j", async patch => {
    const { auth, services } = setup(); mocks.call.mockResolvedValue({ data: { ...available, ...patch } });
    await expect(getActivityStreamsWithAuth(auth, "native_1", services)).rejects.toThrow("INVALID_PERSONAL_API_RESPONSE");
  });
  it("rejects a Functions instance for a different Firebase app", async () => {
    const { auth, services } = setup(); services.functions = { ...services.functions, app: {} } as Functions;
    await expect(getActivityStreamsWithAuth(auth, "native_1", services)).rejects.toThrow("stage/callable-context-mismatch");
    expect(mocks.call).not.toHaveBeenCalled();
  });
});

const effortFacts = { state: "available" as const, reason: null, streamInputRevision: available.streamInputRevision, metricsRevision: "b".repeat(64), facts: [{ distance: "1km" as const, distanceM: 1000, elapsedSec: 220, exactElapsedSec: 220, startOffsetSec: 10, endOffsetSec: 230, axis: "canonical_distance_observations" as const, startIndex: 0, endBeforeIndex: 219, endIndex: 220, endFraction: 1 }] };
it("opts into canonical effort facts in the same stream read and preserves the raw arrays", async () => {
  const { auth, services } = setup(); mocks.call.mockResolvedValue({ data: { ...available, runningBestEffortsFacts: effortFacts } });
  const result = await getActivityStreamsWithAuth(auth, "native_1", services, { includeRunEffortFacts: true });
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith({ activityId: "native_1", includeRunEffortFacts: true });
  expect(result.time).toBe(available.streams.time);
  expect(result.runningBestEffortsFacts).toEqual(effortFacts);
});
it("withholds invalid anchors or changed revisions without inventing a fallback", () => {
  expect(validatedRunEffortFacts({ ...effortFacts, streamInputRevision: "c".repeat(64) }, available.streamInputRevision)).toBeNull();
  expect(validatedRunEffortFacts({ ...effortFacts, state: "changed_input", facts: [] }, available.streamInputRevision)?.facts).toEqual([]);
  for (const patch of [{ endOffsetSec: Number.NaN }, { distanceM: 5000 }, { endBeforeIndex: 220 }, { exactElapsedSec: 200 }, { axis: "gps" }]) {
    const value = structuredClone(effortFacts); Object.assign(value.facts[0]!, patch);
    expect(validatedRunEffortFacts(value, available.streamInputRevision)).toBeNull();
  }
});
