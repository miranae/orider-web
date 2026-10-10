import { describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { MySegmentHistoryResponse } from "@shared/types/segment-history";
import { loadMySegmentHistory, validateSegmentHistoryResponse } from "./segmentHistory";
const mocks = vi.hoisted(() => ({ callable: vi.fn(), send: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const request = { segmentId: "s", currentActivityId: "a", currentEffortId: "e" };
export function historyResponse(): MySegmentHistoryResponse {
  const row = { effortId: "e", activityId: "a", segmentId: "s", elapsedMs: 90000, startDateMs: null, averageSpeedKph: null, averageHeartrate: null, averageWatts: 0, averageCadence: null, isVirtualPower: false, source: "orider", matchAlgorithmVersion: null, direction: "unknown" as const, geometryRevision: null };
  return { ...request, state: "available", inputRevision: "a".repeat(64), currentAttempt: row, attempts: [row], nextCursor: null, coverage: { complete: true, scannedCount: 1, verifiedCount: 1, hasMore: false, reason: "complete" }, comparison: null, comparisonUnavailableReason: "invalid_chronology", records: { state: "unavailable", topThree: [], rawTotalEfforts: null, authorityUpdatedAtMs: null, totalBasis: "persisted_snapshot" }, alignment: "geometry_and_direction_unknown" };
}
describe("owner segment history transport", () => {
  it("requires current UID and AppCheck before exact callable", async () => {
    const ensure = vi.fn().mockResolvedValue(undefined); const services = { auth: { currentUser: { uid: "u" } }, functions: {}, ensureAppCheckReady: ensure } as unknown as FirebaseServices;
    mocks.callable.mockReturnValue(mocks.send); mocks.send.mockResolvedValue({ data: historyResponse() });
    const r = await loadMySegmentHistory(services, "u", request); expect(r.currentAttempt?.averageWatts).toBe(0); expect(ensure).toHaveBeenCalled(); expect(mocks.callable).toHaveBeenCalledWith(services.functions, "getMySegmentHistory");
    await expect(loadMySegmentHistory(services, "foreign", request)).rejects.toThrow("account_changed");
  });
  it("rejects changed account after AppCheck before sending", async () => {
    mocks.send.mockClear(); const services = { auth: { currentUser: { uid: "u" } }, functions: {}, ensureAppCheckReady: async () => { services.auth.currentUser.uid = "other"; } };
    await expect(loadMySegmentHistory(services as unknown as FirebaseServices, "u", request)).rejects.toThrow("account_changed"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects duplicate and misordered authoritative top-three transport", () => {
    const r = historyResponse(); const best = r.currentAttempt!;
    for (const topThree of [[best, best], [{ ...best, effortId: "slow", elapsedMs: 100000 }, best]]) expect(() => validateSegmentHistoryResponse({ ...r, records: { ...r.records, state: "authoritative_snapshot", topThree } }, request)).toThrow();
    expect(() => validateSegmentHistoryResponse({ ...r, records: { ...r.records, state: "authoritative_snapshot", topThree: [best, { ...best, effortId: "tie" }] } }, request)).not.toThrow();
  });
  it("rejects scope, nonfinite, duplicate, cursor-complete and comparison partial mismatches", () => {
    for (const r of [{ ...historyResponse(), segmentId: "foreign" }, { ...historyResponse(), attempts: [{ ...historyResponse().attempts[0]!, elapsedMs: Infinity }] }, { ...historyResponse(), coverage: { ...historyResponse().coverage, verifiedCount: 2 }, attempts: [historyResponse().attempts[0]!, historyResponse().attempts[0]!] }]) expect(() => validateSegmentHistoryResponse(r, request)).toThrow();
    expect(() => validateSegmentHistoryResponse(historyResponse(), { ...request, cursor: "cursor" })).toThrow();
    expect(() => validateSegmentHistoryResponse({ ...historyResponse(), currentAttempt: null }, request)).toThrow();
  });
});
