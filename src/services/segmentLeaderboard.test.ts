import { describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import { loadSegmentLeaderboard, validateSegmentLeaderboard, SEGMENT_LEADERBOARD_TIMEOUT_MS } from "./segmentLeaderboard";
import type { SegmentLeaderboardResponse } from "@shared/types/segment-leaderboard";
const request = { segmentId: "s", scope: "all" as const, fromMs: 1, toMs: 1000 };
const response = (): SegmentLeaderboardResponse => ({ entries: [{ id: "e", segmentId: "s", activityId: "a", userId: "rider", nickname: "Rider", profileImage: null, elapsedTime: 100000, averageSpeed: 36, startDate: 100, averageWatts: null, averageHeartrate: null }], nextCursor: null, scannedCount: 1, limitReached: false, population: "authorized_native_outdoor_bike", comparisonBasis: "best_per_rider_in_page", scopeMemberCount: null, globalRankAvailable: false });
const services = () => ({ auth: { currentUser: { uid: "viewer", isAnonymous: false } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) }) as unknown as FirebaseServices;
describe("verified leaderboard client", () => {
  it("accepts canonical units and rejects private measurements, duplicates and forged global rank", () => {
    expect(validateSegmentLeaderboard(response(), request).entries[0]?.averageSpeed).toBe(36);
    const privateResult = response(); privateResult.entries[0]!.averageHeartrate = 170;
    expect(() => validateSegmentLeaderboard(privateResult, request)).toThrow();
    const duplicate = response(); duplicate.entries.push(duplicate.entries[0]!); duplicate.scannedCount = 2;
    expect(() => validateSegmentLeaderboard(duplicate, request)).toThrow();
    expect(() => validateSegmentLeaderboard({ ...response(), globalRankAvailable: true } as unknown as SegmentLeaderboardResponse, request)).toThrow();
  });
  it("checks the account both after AppCheck and after the callable", async () => {
    const s = services();
    vi.mocked(s.ensureAppCheckReady).mockImplementation(async () => { Object.assign(s.auth.currentUser!, { uid: "other" }); });
    await expect(loadSegmentLeaderboard(s, "viewer", request)).rejects.toThrow("account_changed");
    expect(mockCallableInvocations.filter(c => c.name === "getSegmentLeaderboard")).toHaveLength(0);
    const after = services();
    setCallableImplementation("getSegmentLeaderboard", () => { Object.assign(after.auth.currentUser!, { uid: "other" }); return { data: response() }; });
    await expect(loadSegmentLeaderboard(after, "viewer", request)).rejects.toThrow("account_changed");
  });
  it("only exposes validated current server responses", async () => {
    setCallableResult("getSegmentLeaderboard", { data: response() });
    await expect(loadSegmentLeaderboard(services(), "viewer", request)).resolves.toMatchObject({ globalRankAvailable: false });
  });
});

afterEach(() => vi.useRealTimers());
it("rejects same-UID SDK replacement before dispatch and after response", async () => {
 const before=services();vi.mocked(before.ensureAppCheckReady).mockImplementation(async()=>{Object.assign(before.auth,{currentUser:{uid:"viewer",isAnonymous:false}})});
 await expect(loadSegmentLeaderboard(before,"viewer",request)).rejects.toThrow("account_changed");
 expect(mockCallableInvocations.filter(c=>c.name==="getSegmentLeaderboard")).toHaveLength(0);
 const after=services();setCallableImplementation("getSegmentLeaderboard",()=>{Object.assign(after.auth,{currentUser:{uid:"viewer",isAnonymous:false}});return{data:response()}});
 await expect(loadSegmentLeaderboard(after,"viewer",request)).rejects.toThrow("account_changed");
});
it("deadline includes AppCheck and prevents dispatch after late readiness",async()=>{
 vi.useFakeTimers();const s=services();let ready!:()=>void;vi.mocked(s.ensureAppCheckReady).mockReturnValue(new Promise(r=>{ready=r}));
 const pending=loadSegmentLeaderboard(s,"viewer",request);const rejected=expect(pending).rejects.toThrow("leaderboard_timeout");
 await vi.advanceTimersByTimeAsync(SEGMENT_LEADERBOARD_TIMEOUT_MS);await rejected;ready();await Promise.resolve();
 expect(mockCallableInvocations.filter(c=>c.name==="getSegmentLeaderboard")).toHaveLength(0);
});
it("aborting while preparing does not dispatch a late callable",async()=>{
 const s=services(),controller=new AbortController();let ready!:()=>void;vi.mocked(s.ensureAppCheckReady).mockReturnValue(new Promise(r=>{ready=r}));
 const pending=loadSegmentLeaderboard(s,"viewer",request,controller.signal);const rejected=expect(pending).rejects.toThrow("leaderboard_cancelled");controller.abort();await rejected;ready();await Promise.resolve();
 expect(mockCallableInvocations.filter(c=>c.name==="getSegmentLeaderboard")).toHaveLength(0);
});

it("rejects replacement of the Functions service while AppCheck waits", async()=>{
 const s=services();vi.mocked(s.ensureAppCheckReady).mockImplementation(async()=>{Object.assign(s,{functions:{}})});
 await expect(loadSegmentLeaderboard(s,"viewer",request)).rejects.toThrow("account_changed");
 expect(mockCallableInvocations.filter(c=>c.name==="getSegmentLeaderboard")).toHaveLength(0);
});
