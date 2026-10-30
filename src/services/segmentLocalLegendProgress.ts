import { httpsCallable } from "firebase/functions";
import type { SegmentLegendProgressRequest, SegmentLegendProgressResponse } from "@shared/types/segment-local-legend-progress";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { matchesLocalTrainingEmulator } from "./localTrainingEmulator";
const legendStart=(ms:number)=>{const day=Math.floor((ms+9*3600000)/86400000);return (day-((day+3)%7+7)%7)*86400000-9*3600000-12*7*86400000;};
const count = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
export function validateLegendProgress(value: unknown, request: SegmentLegendProgressRequest, previous?: SegmentLegendProgressResponse): SegmentLegendProgressResponse {
 const r=value as SegmentLegendProgressResponse;
 const fail=():never=>{throw Error("invalid_legend_progress");};
 if(!r||!/^[a-f0-9-]{36}$/.test(r.runId)||!count(r.version)||!["census","ready","complete","limit","expired"].includes(r.state)
  ||!Number.isFinite(r.censusAsOf)||r.censusAsOf<=0||r.censusAsOf>Date.now()||!Number.isFinite(r.windowEndMs)||r.windowEndMs<=0||r.windowEndMs>r.censusAsOf
  ||!Number.isFinite(r.expiresAt)||r.expiresAt!==r.windowEndMs+50*60000||r.expiresAt<=r.censusAsOf||r.preparationOnly!==true||!count(r.steps)
  ||r.limits?.candidates!==2000||r.limits.documentReads!==30000||r.limits.inputBytes!==33554432||r.limits.milliseconds!==90000
  ||request.action!=="start"&&r.runId!==request.runId
  ||previous&&(r.version<previous.version||r.censusAsOf!==previous.censusAsOf||r.windowEndMs!==previous.windowEndMs||r.expiresAt!==previous.expiresAt))fail();
 if(r.state==="limit"?!["candidate_limit","document_limit","byte_limit","time_limit"].includes(r.reason??""):r.reason!==null)fail();
 if(r.validation&&(![r.validation.documentReads,r.validation.inputBytes].every(count)||!Number.isFinite(r.validation.elapsedMs)||r.validation.elapsedMs<0||r.validation.documentReads>30000||r.validation.inputBytes>33554432||r.validation.elapsedMs>90000))fail();
 if(r.state!=="complete"){if(r.result!==null||r.finalAsOf!==null||r.validation!==null)fail();}
 else{
  const v=r.result;
  if(!v||!Number.isFinite(r.finalAsOf)||Number(r.finalAsOf)<r.censusAsOf||Number(r.finalAsOf)>Date.now()||Number(r.finalAsOf)>=r.expiresAt||!r.validation)return fail();
  if(v.scanLimit!==2000||v.coverage!=="complete"||v.windowWeeks!==13||v.minimumEfforts!==3||v.globalRankAvailable!==false||v.population!=="authorized_native_outdoor_bike"
   ||v.windowEndMs!==r.windowEndMs||!Number.isFinite(v.windowStartMs)||v.windowStartMs!==legendStart(r.windowEndMs)
   ||![v.scannedCount,v.totalEfforts,v.riderCount].every(count)||v.scannedCount>2000||v.totalEfforts>v.scannedCount||v.riderCount>v.totalEfforts
   ||v.leader!==null&&(!v.leader||typeof v.leader.userId!=="string"||!v.leader.userId||v.leader.userId.includes("/")||typeof v.leader.nickname!=="string"||!count(v.leader.effortCount)||v.leader.effortCount<3||v.leader.effortCount>v.totalEfforts))fail();
 }
 return r;
}
export async function loadLegendProgress(services:FirebaseServices,uid:string,request:SegmentLegendProgressRequest,previous?:SegmentLegendProgressResponse){
 const {auth,functions}=services,user=auth.currentUser,app=auth.app;
 const current=()=>!!user&&!user.isAnonymous&&user.uid===uid&&auth.currentUser===user&&services.auth===auth&&auth.app===app&&services.functions===functions&&functions.app===app;
 if(!current())throw Error("account_changed");
 // This unshipped continuation is available only on the explicitly configured local demo.
 if(!matchesLocalTrainingEmulator(services))throw Error("legend_progress_unavailable");
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(request.segmentId))throw Error("invalid_legend_progress_request");
 let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const operation=async()=>{await services.ensureAppCheckReady();if(expired)throw Error("legend_progress_timeout");if(!current())throw Error("account_changed");
 const response=await httpsCallable<SegmentLegendProgressRequest,unknown>(functions,"progressSegmentLocalLegend",{timeout:130000})(request);
 if(expired)throw Error("legend_progress_timeout");if(!current())throw Error("account_changed");return validateLegendProgress(response.data,request,previous);};
 try{return await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error("legend_progress_timeout"));},130000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
