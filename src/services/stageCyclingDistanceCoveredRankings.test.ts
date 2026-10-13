import { describe, expect, it, vi } from "vitest";
import { coveredFixture, coveredRequest } from "./stageCyclingDistanceCoveredRankings.fixture";
import { validateCyclingCoveredResponse, validCyclingCoveredRequest } from "./stageCyclingDistanceCoveredRankings";
describe("whole covered cohort", () => {
  it("accepts dense13 snapshot/canonical groups with exact source links and target exclusion", () => {
    for (const excluded of [undefined, "10km"] as const) expect(validateCyclingCoveredResponse(coveredFixture(excluded), coveredRequest, 200000).rows).toHaveLength(3);
  });
  it.each([
    (v: ReturnType<typeof coveredFixture>) => { v.rows[0]!.efforts[0]!.effectiveElapsedSec = 0; },
    (v: ReturnType<typeof coveredFixture>) => { v.rows[0]!.efforts[0]!.effortSourceActivityId = "unloaded"; },
    (v: ReturnType<typeof coveredFixture>) => { v.targets[0]!.top10.reverse(); },
    (v: ReturnType<typeof coveredFixture>) => { v.targets[0]!.nextBest = v.targets[0]!.winner; },
    (v: ReturnType<typeof coveredFixture>) => { v.rows[0]!.startTime = 100000; },
    (v: ReturnType<typeof coveredFixture>) => { v.readTimes.stageFinal.seconds = 100; },
    (v: ReturnType<typeof coveredFixture>) => { v.readTimes.stageFinal.seconds = 103; },
    (v: ReturnType<typeof coveredFixture>) => { v.readTimes.stageFinal.nanoseconds = 1; },
    (v: ReturnType<typeof coveredFixture>) => { v.cohort.hash = ["a".repeat(64)] as unknown as string; },
    (v: ReturnType<typeof coveredFixture>) => { v.coverage.snapshotSupported = 2; },
    (v: ReturnType<typeof coveredFixture>) => { v.io.metadata = 21; },
    (v: ReturnType<typeof coveredFixture>) => { v.requestScope.range.toExclusive++; },
    (v: ReturnType<typeof coveredFixture>) => { delete v.rows[0]!.efforts[0]; },
  ])("rejects the entire cohort on a malformed scalar, scope, stamp, source or rank", mutate => {
    const value = coveredFixture(); mutate(value); expect(() => validateCyclingCoveredResponse(value, coveredRequest, 200000)).toThrow();
  });
  it("rejects foreign owner fields, wrong mode, profile and response size", () => {
    expect(validCyclingCoveredRequest({ ...coveredRequest, ownerUid: "foreign" } as typeof coveredRequest, 200000)).toBe(false);
    expect(validCyclingCoveredRequest({ ...coveredRequest, profile: 50 } as unknown as typeof coveredRequest, 200000)).toBe(false);
    const value = coveredFixture(); value.rows[0]!.source = "x".repeat(524288); expect(() => validateCyclingCoveredResponse(value, coveredRequest, 200000)).toThrow();
  });
});

const mocks = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn(), listener: null as null | ((u: unknown) => void) }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.call }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (_: unknown, listener: (u: unknown) => void) => { mocks.listener = listener; return () => {}; } }));
vi.mock("./stageCyclingDistanceEffortPreference", () => ({ stageCyclingPreferenceAvailable: () => true }));
it("readiness uses the native Source SDK user and passes only the public manual request", async () => {
  const app = { options: { projectId: "miranae-orider-g1" } }, user = { uid: "owner", isAnonymous: false };
  const services = { auth: { app, currentUser: user }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: mocks.ready };
  mocks.ready.mockReset().mockResolvedValue(undefined); mocks.call.mockReset().mockResolvedValue({ data: coveredFixture() });
  const { loadCyclingCoveredRankings } = await import("./stageCyclingDistanceCoveredRankings");
  await loadCyclingCoveredRankings(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices, coveredRequest);
  expect(mocks.ready).toHaveBeenCalledOnce(); expect(mocks.call).toHaveBeenCalledExactlyOnceWith(coveredRequest);
});
it("sameUID SDK user replacement during readiness blocks the callable", async () => {
  const app = { options: { projectId: "miranae-orider-g1" } };
  const services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: mocks.ready };
  mocks.call.mockReset(); mocks.ready.mockReset().mockImplementation(async () => { services.auth.currentUser = { uid: "owner", isAnonymous: false }; });
  const { loadCyclingCoveredRankings } = await import("./stageCyclingDistanceCoveredRankings");
  await expect(loadCyclingCoveredRankings(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices, coveredRequest)).rejects.toThrow("account_changed"); expect(mocks.call).not.toHaveBeenCalled();
});
it("Auth A-B-A and cancellation after dispatch discard the full response", async () => {
  const app = { options: { projectId: "miranae-orider-g1" } }, original = { uid: "owner", isAnonymous: false };
  const services = { auth: { app, currentUser: original }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: mocks.ready };
  mocks.ready.mockReset().mockResolvedValue(undefined);
  mocks.call.mockReset().mockImplementation(async () => { mocks.listener!(original); mocks.listener!({ uid: "other", isAnonymous: false }); mocks.listener!(original); return { data: coveredFixture() }; });
  const { loadCyclingCoveredRankings } = await import("./stageCyclingDistanceCoveredRankings");
  await expect(loadCyclingCoveredRankings(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices, coveredRequest)).rejects.toThrow("account_changed");
  const controller = new AbortController(); mocks.call.mockImplementation(async () => { controller.abort(); return { data: coveredFixture() }; });
  await expect(loadCyclingCoveredRankings(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices, coveredRequest, controller.signal)).rejects.toThrow("account_changed");
});
