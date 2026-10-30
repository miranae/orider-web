import { httpsCallable } from "firebase/functions";
import type { BikePeriodSnapshotRequest, BikePeriodSnapshotResponse, BikePeriodHistoryRequest, BikePeriodHistoryResponse } from "@shared/types/bike-period-snapshot";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { matchesAnalysisCapability } from "./analysisCapability";
import { validateBikeSnapshotPower } from "./bikeSnapshotPowerValidation";
const count=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const number=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=20&&v.every(s=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(s))&&new Set(v).size===v.length;
export function validateBikeSnapshot(value:unknown,request:BikePeriodSnapshotRequest,previous?:BikePeriodSnapshotResponse):BikePeriodSnapshotResponse{
 const r=value as BikePeriodSnapshotResponse,fail=():never=>{throw Error("invalid_bike_snapshot");};
 if(!r||!/^[a-f0-9-]{36}$/.test(r.runId)||!count(r.version)||!["scanning","identity","flattening","selecting","aggregating","complete","invalidated","expired"].includes(r.state)
  ||!number(r.asOf)||!Number.isFinite(new Date(r.asOf).getTime())||r.expiresAt!==Math.floor(r.asOf)+3000000||r.period?.fromInclusive!==request.period.fromInclusive||r.period.toExclusive!==request.period.toExclusive
  ||r.scope!=="owner_canonical_records_at_snapshot"||r.sourceFreshness!=="checked_at_each_step_not_continuously_current"
  ||![r.scanned,r.candidates,r.representatives].every(count)||r.representatives>r.candidates||r.candidates>r.scanned
  ||request.action!=="start"&&r.runId!==request.runId
  ||previous&&(r.version<previous.version||r.asOf!==previous.asOf||r.expiresAt!==previous.expiresAt||r.scanned<previous.scanned)
  ||!Array.isArray(r.zoneGroups)||r.zoneGroups.length>20||r.nextZone!==null&&(!/^[a-f0-9]{64}$/.test(r.nextZone)||request.afterZone!==undefined&&r.nextZone<=request.afterZone))fail();
 if(r.retention!==undefined&&r.retention!==(r.state==="complete"?"saved_result":"temporary_checkpoint")||r.resultFreshness!==undefined&&r.resultFreshness!=="historical_as_of"||r.currentWinnerRevisionChanged!==undefined&&typeof r.currentWinnerRevisionChanged!=="boolean")fail();
 if(r.state!=="complete"){if(r.result!==null||r.zoneGroups.length||r.nextZone!==null)fail();return r;}
 const result=r.result;if(!result||result.pageSize!==20||result.sourceExamplesLimit!==20)return fail();
 for(const key of ["distanceM","movingTimeSec","elevationGainM"] as const){
  const t=result.totals?.[key];if(!t||![t.knownActivityCount,t.missingActivityCount,t.summaryFallbackCount].every(count)||t.knownActivityCount+t.missingActivityCount!==r.representatives||t.summaryFallbackCount>t.knownActivityCount
   ||t.observedValue!==null&&!number(t.observedValue)||t.totalValue!==null&&!number(t.totalValue)||t.missingActivityCount>0&&t.totalValue!==null
   ||t.missingActivityCount===0&&t.totalValue!==(t.observedValue??0)||!ids(t.sourceActivityIds)||!["canonical_metrics","activity_summary","mixed","unavailable"].includes(t.sourceBasis))fail();
 }
 for(const coverage of [result.heartRate,result.powerZones])if(!coverage||![coverage.candidateActivityCount,coverage.eligibleActivityCount,coverage.missingSensorActivityCount,coverage.contextUnknownActivityCount].every(count)||coverage.candidateActivityCount!==r.representatives||coverage.eligibleActivityCount+coverage.missingSensorActivityCount+coverage.contextUnknownActivityCount!==coverage.candidateActivityCount||!number(coverage.observedSeconds))fail();
 const p=result.power;
 if(!p||p.fromInclusive!==r.period.fromInclusive||p.toExclusive!==r.period.toExclusive)return fail();
 for(const curve of [p,...(p.weightNormalized?[p.weightNormalized]:[])]){
  const c=curve.coverage;
  if(!["complete","partial"].includes(curve.status)||!c||c.truncated!==false||c.candidateCountKnown!==true||c.scannedActivityCount!==r.scanned
   ||![c.scannedActivityCount,c.candidateActivityCount,c.includedActivityCount,c.pendingActivityCount,c.missingActivityCount,c.incompleteActivityCount,c.ineligibleActivityCount,c.skippedActivityCount].every(count)
   ||c.candidateActivityCount+c.skippedActivityCount!==c.scannedActivityCount||c.includedActivityCount>c.candidateActivityCount||!Array.isArray(curve.points)||curve.points.length>100)fail();
  const durations=new Set<number>();
  for(const point of curve.points){if(!number(point.watts)||!number(point.durationSeconds)||point.durationSeconds<=0||durations.has(point.durationSeconds)||!ids([point.sourceActivityId])||!number(point.startTime)||point.startTime<r.period.fromInclusive||point.startTime>=r.period.toExclusive||typeof point.metricsRevision!=="string"||typeof point.cohortEligible!=="boolean"||!["strava_api","direct_file","orider_native","apple_health","health_connect","samsung_health","unknown"].includes(point.source))fail();durations.add(point.durationSeconds);
   if("wattsPerKg" in point&&(!number(point.wattsPerKg)||!number(point.weightKg)||point.weightKg<=0||Math.abs(point.watts/point.weightKg-point.wattsPerKg)>1e-6||typeof point.weightRevision!=="string"))fail();}
 }
 validateBikeSnapshotPower(p);
 for(const zone of r.zoneGroups){if(!zone||!/^[a-f0-9]{64}$/.test(zone.id)||!["heartRate","power"].includes(zone.kind)||!zone.group||!Array.isArray(zone.group.seconds)||!zone.group.seconds.length||zone.group.seconds.length>10||!zone.group.seconds.every(number)||!number(zone.group.observedSeconds)||!ids(zone.group.activityIds))fail();
  if(zone.group.seconds.length!==(zone.kind==="heartRate"?5:7)||Math.abs(zone.group.seconds.reduce((a,b)=>a+b,0)-zone.group.observedSeconds)>Math.max(1,zone.group.observedSeconds)*1e-9)fail();
  if(zone.kind==="heartRate"&&(!zone.group.boundaries||!number(zone.group.boundaries.referenceBpm)||zone.group.boundaries.referenceBpm<=0))fail();
  if(zone.kind==="power"&&(!number(zone.group.ftp)||zone.group.ftp<=0||!["measured","virtual"].includes(zone.group.powerSource)))fail();
 }
 return r;
}
export async function loadBikeSnapshot(services:FirebaseServices,uid:string,request:BikePeriodSnapshotRequest,previous?:BikePeriodSnapshotResponse){
 const {auth,functions}=services,user=auth.currentUser,app=auth.app;
 const current=()=>!!user&&!user.isAnonymous&&user.uid===uid&&auth.currentUser===user&&services.auth===auth&&auth.app===app&&services.functions===functions&&functions.app===app;
 if(!current())throw Error("account_changed");if(!matchesAnalysisCapability(services,"bikePeriods"))throw Error("bike_snapshot_unavailable");
 const deadlineMs=130000;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const work=async()=>{await services.ensureAppCheckReady();if(!matchesAnalysisCapability(services,"bikePeriods"))throw Error("bike_snapshot_unavailable");if(expired)throw Error("bike_snapshot_timeout");if(!current())throw Error("account_changed");
  const response=await httpsCallable<BikePeriodSnapshotRequest,unknown>(functions,"progressBikeAnalysisPeriodSnapshot",{timeout:deadlineMs})(request);
  if(expired)throw Error("bike_snapshot_timeout");if(!current())throw Error("account_changed");if(!matchesAnalysisCapability(services,"bikePeriods"))throw Error("bike_snapshot_unavailable");return validateBikeSnapshot(response.data,request,previous);};
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error("bike_snapshot_timeout"));},deadlineMs);})]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}

export async function loadBikeSnapshotHistory(services:FirebaseServices,uid:string,request:BikePeriodHistoryRequest):Promise<BikePeriodHistoryResponse>{
 const {auth,functions}=services,user=auth.currentUser,app=auth.app;
 const current=()=>!!user&&!user.isAnonymous&&user.uid===uid&&auth.currentUser===user&&services.auth===auth&&auth.app===app&&services.functions===functions&&functions.app===app;
 if(!current())throw Error("account_changed");
 if(!matchesAnalysisCapability(services,"bikePeriods"))throw Error("bike_snapshot_unavailable");
 let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const work=async()=>{
  await services.ensureAppCheckReady();if(expired)throw Error("bike_snapshot_timeout");if(!current())throw Error("account_changed");
  if(!matchesAnalysisCapability(services,"bikePeriods"))throw Error("bike_snapshot_unavailable");
  const response=await httpsCallable<BikePeriodHistoryRequest,BikePeriodHistoryResponse>(functions,"getBikeAnalysisPeriodHistory",{timeout:10000})(request);
  if(expired)throw Error("bike_snapshot_timeout");if(!current())throw Error("account_changed");
  const r=response.data;
  if(!r||!Array.isArray(r.items)||r.items.length>20||new Set(r.items.map(i=>i.runId)).size!==r.items.length||r.items.some(i=>!i||!/^[a-f0-9-]{36}$/.test(i.runId)||!number(i.asOf)||!Number.isFinite(new Date(i.asOf).getTime())||!count(i.scanned)||!count(i.representatives)||i.representatives>i.scanned)||r.nextCursor!==null&&(typeof r.nextCursor!=="string"||r.nextCursor.length<1||r.nextCursor.length>256||[...r.nextCursor].some(character=>character.charCodeAt(0)<32)||r.nextCursor===request.cursor))throw Error("invalid_bike_snapshot");
  return r;
 };
 try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error("bike_snapshot_timeout"));},10000);})]);}finally{if(timer!==undefined)clearTimeout(timer);}
}
