import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareStoredSegmentWindows, type StoredSegmentWindow } from "@shared/segment-distance-time-gap-kernel";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const call = vi.hoisted(() => vi.fn());
vi.mock("firebase/functions", () => ({ httpsCallable: () => call }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }) }));
import { syntheticRequest, syntheticResponse } from "./segmentDistanceTimeGap.fixture";
import { loadSegmentDistanceTimeGap, validateSegmentGapResponse } from "./segmentDistanceTimeGap";
describe("strict cached segment gap wire", () => {
  beforeEach(() => call.mockReset());
  it("accepts real kernel output including literal zero and unknown accuracy", () => {
    const r = syntheticResponse(); expect(validateSegmentGapResponse(r, syntheticRequest)).toBe(r); expect(r.comparison!.points[0]!.gapSec).toBe(0);
  });
  it("accepts exact native millisecond-normalized fractional elapsed and partial common spans", () => {
    const r = syntheticResponse(), c = r.comparison!;
    for (const s of c.sources) { s.storedElapsedSec = .878; s.observedElapsedSec = .878; }
    const inputs = c.sources.map((source, i): StoredSegmentWindow => ({ source, coordinates: [[0, i ? 0 : .0002], [0, .0005], [0, .001]],
      distanceM: [i ? 0 : 22.24, 55.6, 111.2], elapsedSec: [0, .378, .878] })) as [StoredSegmentWindow, StoredSegmentWindow];
    r.comparison = compareStoredSegmentWindows([[0, 0], [0, .001]], inputs, c.geometryRevision);
    expect(r.comparison.fullCurrentGeometry).toBe(false); expect(r.comparison.sources[0].observedElapsedSec).toBe(.878);
    expect(validateSegmentGapResponse(r, syntheticRequest)).toBe(r);
  });
  it.each(["private", "negativeBudget", "reversedTimestamp", "falseClock", "wrongSource", "wrongGap", "sparse", "mixedMode"])("rejects %s without interpreting malformed data", kind => {
    const r = syntheticResponse();
    if (kind === "private") Object.assign(r, { gcsPath: "private" });
    if (kind === "negativeBudget") r.io.payloads = -1;
    if (kind === "reversedTimestamp") r.verifiedTime = { seconds: 1700100099, nanoseconds: 999999999 };
    if (kind === "falseClock") Object.assign(r.comparison!, { originalClockVerified: true });
    if (kind === "wrongSource") r.comparison!.sources[0].activityId = "other";
    if (kind === "wrongGap") r.comparison!.points[1]!.gapSec = 999;
    if (kind === "sparse") delete r.comparison!.points[3];
    if (kind === "mixedMode") Object.assign(r, { mode: "route_evidence" });
    expect(() => validateSegmentGapResponse(r, syntheticRequest)).toThrow("invalid_segment_gap_response");
  });
  it("changed_input contains no curve and cannot pass as available", () => {
    const r = syntheticResponse(); r.state = "changed_input"; r.reason = "changed_input";
    expect(() => validateSegmentGapResponse(r, syntheticRequest)).toThrow(); r.comparison = null; expect(validateSegmentGapResponse(r, syntheticRequest)).toBe(r);
  });
  it("uses one existing callable and guards auth before and after App Check", async () => {
    const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
    const services = { auth, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
    call.mockResolvedValue({ data: syntheticResponse() });
    await loadSegmentDistanceTimeGap(services, "owner", syntheticRequest); expect(call).toHaveBeenCalledTimes(1); expect(call).toHaveBeenCalledWith(syntheticRequest);
    services.ensureAppCheckReady = vi.fn(async () => { auth.currentUser.uid = "other"; });
    await expect(loadSegmentDistanceTimeGap(services, "owner", syntheticRequest)).rejects.toThrow("account_changed"); expect(call).toHaveBeenCalledTimes(1);
  });
});
