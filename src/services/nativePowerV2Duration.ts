import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { NativePowerV2ReaderRequest, NativePowerV2ReaderResponse } from "@shared/types/stage-native-power-v2-publication";
import { stageActivityPowerAvailable } from "./stageActivityPowerDuration";
function invalid(): never { throw Error("invalid_native_power_v2_response"); }
function exact(value: unknown, fields: string[]): Record<string,unknown> {
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==fields.length||!fields.every(field=>Object.prototype.hasOwnProperty.call(value,field)))invalid();
 return value as Record<string,unknown>;
}
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const digest=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/u.test(v);
export function nativePowerV2DurationSeconds(draft:string):number|null {
 if(!/^\d{1,6}$/u.test(draft))return null;const value=Number(draft);return Number.isSafeInteger(value)&&value>=1&&value<=604800?value:null;
}
export function validNativePowerV2DurationRequest(request:NativePowerV2ReaderRequest):boolean {
 try {
  const metadata=request.mode==="stage_native_power_v2_metadata";
  exact(request,metadata?["mode","activityId","durationSeconds","periodBinding"]:["mode","activityId","durationSeconds","periodBinding","session"]);
  return (metadata||request.mode==="stage_native_power_v2_duration")&&typeof request.activityId==="string"&&/^orider_[A-Za-z0-9_-]{0,153}$/u.test(request.activityId)
   &&(metadata&&request.durationSeconds===null||integer(request.durationSeconds)&&request.durationSeconds>=1&&request.durationSeconds<=604800)
   &&(request.periodBinding===null||digest(request.periodBinding))&&(metadata||typeof request.session==="string"&&request.session.length>0&&new TextEncoder().encode(request.session).length<=16384);
 }catch{return false;}
}
function roundedRatio(n:bigint,d:bigint):number {
 if(n===0n)return 0;let exponent=n.toString(2).length-d.toString(2).length;
 if(exponent>=0?n<d<<BigInt(exponent):n<<BigInt(-exponent)<d)exponent--;
 const output=Math.max(-1074,exponent-52),shift=-output,a=shift>=0?n<<BigInt(shift):n,b=shift>=0?d:d<<BigInt(-shift);
 let c=a/b;const remainder=a%b;if(remainder*2n>b||remainder*2n===b&&(c&1n)!==0n)c++;
 return Number(c)*2**output;
}
export function validateNativePowerV2Duration(value:unknown,request:NativePowerV2ReaderRequest):NativePowerV2ReaderResponse {
 if(!validNativePowerV2DurationRequest(request)||new TextEncoder().encode(JSON.stringify(value)).length>65536)invalid();
 const v=exact(value,["version","mode","activityId","scope","collectionCompleteness","timingBasis","comparisonChannel","state","session","witness","bounds","costs"]);
 if(v.version!==2||v.mode!==request.mode||v.activityId!==request.activityId||v.scope!=="whole_activity_observed_intervals"||v.collectionCompleteness!=="unknown"||v.timingBasis!=="stored_native_timestamp_one_second_slots"||v.comparisonChannel!=="native_stored_bucket_unverified"||typeof v.state!=="string"||!["available","no_continuous_window","snapshot_missing","input_policy_limit"].includes(v.state))invalid();
 const present=v.state==="available"||v.state==="no_continuous_window";
 if(present){if(typeof v.session!=="string"||v.session.length===0||new TextEncoder().encode(v.session).length>16384)invalid();const b=exact(v.bounds,["observedMs","longestContinuousMs"]);if(!integer(b.observedMs)||b.observedMs<1||!integer(b.longestContinuousMs)||b.longestContinuousMs<1||b.observedMs>604800000||b.longestContinuousMs>b.observedMs)invalid();}
 else if(v.session!==null||v.bounds!==null||v.witness!==null)invalid();
 if(request.mode==="stage_native_power_v2_metadata"){if(v.state==="no_continuous_window"||v.witness!==null)invalid();}
 else if(v.state==="available") {
  const w=exact(v.witness,["version","calculatorPolicyVersion","snapshotRevision","powerSource","durationMs","windowStartElapsedMs","windowEndElapsedMs","energyNumerator","energyDenominator","maxAveragePowerW","originalClockVerified","sensorBucketOriginVerified"]);
  if(w.version!==2||w.calculatorPolicyVersion!=="native_power_integer_ms_v2"||!digest(w.snapshotRevision)||typeof w.powerSource!=="string"||!["measured","stored_native_watts_unverified"].includes(w.powerSource)||w.durationMs!==request.durationSeconds*1000||!integer(w.windowStartElapsedMs)||!integer(w.windowEndElapsedMs)||w.windowEndElapsedMs-w.windowStartElapsedMs!==w.durationMs||w.windowEndElapsedMs>604800000||typeof w.maxAveragePowerW!=="number"||!Number.isFinite(w.maxAveragePowerW)||w.maxAveragePowerW<0||w.maxAveragePowerW>Number.MAX_SAFE_INTEGER||w.originalClockVerified!==false||w.sensorBucketOriginVerified!==false||typeof w.energyNumerator!=="string"||!/^(0|[1-9]\d{0,640})$/u.test(w.energyNumerator)||typeof w.energyDenominator!=="string"||!/^[1-9]\d{0,323}$/u.test(w.energyDenominator))invalid();
  if(roundedRatio(BigInt(w.energyNumerator),BigInt(w.energyDenominator)*BigInt(request.durationSeconds*1000))!==w.maxAveragePowerW||request.durationSeconds*1000>Number((v.bounds as Record<string,unknown>).longestContinuousMs))invalid();
 }else if(v.witness!==null||v.state==="no_continuous_window"&&request.durationSeconds*1000<=Number((v.bounds as Record<string,unknown>).longestContinuousMs))invalid();
 const c=exact(v.costs,["documents","metadata","auth","snapshotBodies","raw","writes"]);
 if(!integer(c.documents)||c.documents>(request.mode==="stage_native_power_v2_metadata"?28:20)||!integer(c.metadata)||c.metadata>2||!integer(c.auth)||c.auth>2||!integer(c.snapshotBodies)||c.snapshotBodies>1||c.raw!==0||c.writes!==0)invalid();
 return structuredClone(value) as NativePowerV2ReaderResponse;
}
export async function loadNativePowerV2Duration(services:FirebaseServices,uid:string,request:NativePowerV2ReaderRequest,active:()=>boolean):Promise<NativePowerV2ReaderResponse> {
 const auth=services.auth,functions=services.functions,authRealm=auth.app,functionsRealm=functions.app,endpoint=functions.customDomain,user=auth.currentUser;
 const valid=()=>active()&&stageActivityPowerAvailable()&&!!user&&user.uid===uid&&!user.isAnonymous&&services.auth===auth&&services.functions===functions&&auth.currentUser===user&&auth.app===authRealm&&functions.app===functionsRealm&&functionsRealm===authRealm&&functions.customDomain===endpoint&&endpoint==="https://asia-northeast3-orider-dev.cloudfunctions.net";
 if(!valid()||!validNativePowerV2DurationRequest(request))throw Error("native_power_v2_unavailable");
 await services.ensureAppCheckReady();if(!valid())throw Error("account_changed");
 const reply=await httpsCallable(functions,"getStageNativePowerV2")(request);if(!valid())throw Error("account_changed");
 const result=validateNativePowerV2Duration(reply.data,request);if(!valid())throw Error("account_changed");return result;
}
