import actual from "./__fixtures__/bike-snapshot-1001.json";
import zones from "./__fixtures__/bike-snapshot-zones.json";
import { validateBikeSnapshot, loadBikeSnapshot, loadBikeSnapshotHistory } from "./bikePeriodSnapshot";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
vi.mock("./localTrainingEmulator",()=>({localTrainingEmulatorAvailable:()=>true,matchesLocalTrainingEmulator:()=>true}));
const request={action:"start" as const,period:actual.period};
const services=()=>{const app={options:{projectId:"demo-test"}};return{auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(actual.asOf+60000);});afterEach(()=>vi.useRealTimers());
it("accepts actual 1001-activity and grouped-zone emulator response contracts",()=>{
 expect(validateBikeSnapshot(actual,request).result?.totals.distanceM.totalValue).toBe(1001000);
 expect(validateBikeSnapshot(zones,{action:"zones",runId:zones.runId,period:zones.period}).zoneGroups.length).toBeGreaterThan(0);
});
it("rejects provisional totals and inconsistent population/coverage",()=>{
 for(const bad of [{...actual,state:"scanning"},{...actual,representatives:1002},{...actual,result:{...actual.result,totals:{...actual.result.totals,distanceM:{...actual.result.totals.distanceM,missingActivityCount:1}}}},{...actual,result:{...actual.result,power:{...actual.result.power,coverage:{...actual.result.power.coverage,truncated:true}}}}])expect(()=>validateBikeSnapshot(bad,request)).toThrow("invalid_bike_snapshot");
});
it("rejects changed checkpoint scope and malformed power source links",()=>{
 const prior=validateBikeSnapshot(actual,request);
 expect(()=>validateBikeSnapshot({...actual,version:0},{...request,action:"status",runId:actual.runId},prior)).toThrow();
 const bad=structuredClone(actual);bad.result.power.points[0]!.sourceActivityId="../foreign";expect(()=>validateBikeSnapshot(bad,request)).toThrow();
});
it("uses an exact SDK-user fence before and after dispatch",async()=>{
 const s=services();setCallableResult("progressBikeAnalysisPeriodSnapshot",{data:actual});await expect(loadBikeSnapshot(s,"owner",request)).resolves.toMatchObject({scanned:1001});
 setCallableImplementation("progressBikeAnalysisPeriodSnapshot",()=>{Object.assign(s.auth,{currentUser:{uid:"owner",isAnonymous:false}});return{data:actual};});await expect(loadBikeSnapshot(s,"owner",request)).rejects.toThrow("account_changed");
});
it("never dispatches after replacement during AppCheck readiness",async()=>{
 const s=services(),called=vi.fn(()=>({data:actual}));setCallableImplementation("progressBikeAnalysisPeriodSnapshot",called);
 vi.mocked(s.ensureAppCheckReady).mockImplementation(async()=>{Object.assign(s.auth,{currentUser:{uid:"owner",isAnonymous:false}});});await expect(loadBikeSnapshot(s,"owner",request)).rejects.toThrow("account_changed");expect(called).not.toHaveBeenCalled();
});
it("bounds AppCheck readiness and never dispatches after the deadline",async()=>{
 const s=services(),called=vi.fn(()=>({data:actual}));setCallableImplementation("progressBikeAnalysisPeriodSnapshot",called);let ready!:()=>void;
 vi.mocked(s.ensureAppCheckReady).mockImplementation(()=>new Promise<void>(resolve=>{ready=resolve;}));
 const pending=loadBikeSnapshot(s,"owner",request),rejection=expect(pending).rejects.toThrow("bike_snapshot_timeout");await vi.advanceTimersByTimeAsync(130000);await rejection;ready();await Promise.resolve();expect(called).not.toHaveBeenCalled();
});
it("does not accept a late callable response after its total deadline",async()=>{
 const s=services();let respond!:(v:unknown)=>void;setCallableImplementation("progressBikeAnalysisPeriodSnapshot",()=>new Promise(resolve=>{respond=resolve;}));const pending=loadBikeSnapshot(s,"owner",request),rejection=expect(pending).rejects.toThrow("bike_snapshot_timeout");await vi.advanceTimersByTimeAsync(130000);await rejection;respond({data:actual});await Promise.resolve();
});
it("rejects inconsistent normalized weight coverage independently of W coverage",()=>{
 const bad=structuredClone(actual);bad.result.power.weightNormalized.weightCounts.missingWeightActivityCount=0;expect(()=>validateBikeSnapshot(bad,request)).toThrow("invalid_bike_snapshot");
});
it("validates dense-grid provenance, bounds and independently missing normalized observations",async()=>{
 const {POWER_DURATION_GRID}=await import('./powerCurvePeriods');const value=structuredClone(actual) as unknown as import('@shared/types/bike-period-snapshot').BikePeriodSnapshotResponse;const power=value.result!.power;
 const original={algorithmVersion:'power-duration-grid-v1' as const,gridVersion:1 as const,timingBasis:'sample_owned_elapsed' as const,scope:'observed_power_candidates' as const,fromInclusive:value.period.fromInclusive,toExclusive:value.period.toExclusive,partial:false,scanTruncated:false,inputCandidateCount:1001,counts:{available:1001,missing:0,pending:0,incomplete:0,malformed:0,unavailable:0},unavailableReasonCounts:{incomplete_input:0,virtual_power:0,unknown_provenance:0,unaligned_elapsed_axis:0,missing_power:0,input_limit:0},points:POWER_DURATION_GRID.map(durationSeconds=>({durationSeconds,maxAveragePowerW:250,sourceActivityId:'dense-source',startTime:value.period.fromInclusive,parentRevision:'revision',provenance:'direct_file' as const,observedActivityCount:1001}))};
 power.powerDurationObservations=original;power.weightNormalized!.powerDurationObservations={...original,unit:'W/kg',basis:'calculation_profile_snapshot',partial:true,weightCounts:{includedActivityCount:0,missingWeightActivityCount:1001,invalidWeightActivityCount:0,incompatibleWeightActivityCount:0},counts:{...original.counts,available:0},points:[]};
 expect(validateBikeSnapshot(value,request).result!.power.powerDurationObservations!.points).toHaveLength(POWER_DURATION_GRID.length);
 const bad=structuredClone(value);bad.result!.power.powerDurationObservations!.points[0]!.startTime=value.period.toExclusive;expect(()=>validateBikeSnapshot(bad,request)).toThrow('invalid_bike_snapshot');
});
it("accepts explicitly retained historical results and validates their retention metadata",()=>{
 const historical={...actual,retention:"saved_result",resultFreshness:"historical_as_of",currentWinnerRevisionChanged:true};
 expect(validateBikeSnapshot(historical,request)).toMatchObject({retention:"saved_result",currentWinnerRevisionChanged:true});
 for(const patch of [{retention:"temporary_checkpoint"},{resultFreshness:"current"},{currentWinnerRevisionChanged:"yes"}])expect(()=>validateBikeSnapshot({...historical,...patch},request)).toThrow("invalid_bike_snapshot");
});
it("reads saved-period history without a calculation and fences same-UID session replacement",async()=>{
 const s=services(),history={items:[{runId:actual.runId,asOf:actual.asOf,scanned:1001,representatives:1001}],nextCursor:null};
 setCallableResult("getBikeAnalysisPeriodHistory",{data:history});
 await expect(loadBikeSnapshotHistory(s,"owner",{period:actual.period})).resolves.toEqual(history);
 setCallableImplementation("getBikeAnalysisPeriodHistory",()=>{Object.assign(s.auth,{currentUser:{uid:"owner",isAnonymous:false}});return{data:history};});
 await expect(loadBikeSnapshotHistory(s,"owner",{period:actual.period})).rejects.toThrow("account_changed");
});
it("accepts authoritative snapshot times despite a slightly slow client clock",()=>{
 vi.setSystemTime(actual.asOf-2000);expect(validateBikeSnapshot(actual,request).asOf).toBe(actual.asOf);
});
