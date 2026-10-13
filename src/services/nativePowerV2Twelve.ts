import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { NativePowerTwelveRequest, NativePowerTwelveResponse, NativePowerTwelveCandidate, NativePowerTwelveSlot } from "@shared/types/stage-native-power-v2-twelve";
import { NATIVE_POWER_V2_TWELVE_SECONDS } from "@shared/types/stage-native-power-v2-twelve";
import { stageActivityPowerAvailable } from "./stageActivityPowerDuration";
import { nativeTwelveExactPeriods } from "../features/fitness/models/nativePowerTwelve";
function fail(): never { throw Error("invalid_native_twelve_response"); }
const object = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.prototype.hasOwnProperty.call(value,key))) return fail();
  return value as Record<string, unknown>;
};
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const nativeId = (value: unknown) => typeof value === "string" && /^orider_[A-Za-z0-9_-]{0,153}$/u.test(value);
const revision = (value: unknown) => typeof value === "string" && /^\d+:\d+$/u.test(value) && value.length <= 100;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
function equal(left: unknown, right: unknown): boolean {
 if(left===right)return true;
 if(!left||!right||typeof left!=="object"||typeof right!=="object"||Array.isArray(left)!==Array.isArray(right))return false;
 const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
 return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.prototype.hasOwnProperty.call(b,key)&&equal(a[key],b[key]));
}
function roundedRatio(value: bigint, denominator: bigint): number {
 if(value===0n)return 0;
 let exponent=value.toString(2).length-denominator.toString(2).length;
 if(exponent>=0?value<denominator<<BigInt(exponent):value<<BigInt(-exponent)<denominator)exponent--;
 const outputExponent=Math.max(-1074,exponent-52),shift=-outputExponent;
 const numerator=shift>=0?value<<BigInt(shift):value,divisor=shift>=0?denominator:denominator<<BigInt(-shift);
 let coefficient=numerator/divisor;const remainder=numerator%divisor;
 if(remainder*2n>divisor||remainder*2n===divisor&&(coefficient&1n)!==0n)coefficient++;
 return Number(coefficient)*2**outputExponent;
}
function candidate(value: unknown): NativePowerTwelveCandidate {
  const v=object(value,["activityId","activityRevision","baseMetricsRevision","originEpochMs","sourceBinding"]);
  if (!nativeId(v.activityId)||!revision(v.activityRevision)||!revision(v.baseMetricsRevision)||(!integer(v.originEpochMs)||Number(v.originEpochMs)>Date.now()||Number(v.originEpochMs)===0)||!hash(v.sourceBinding)) fail();
  return value as NativePowerTwelveCandidate;
}
function slot(value: unknown, seconds: number, mode: NativePowerTwelveRequest["mode"]): NativePowerTwelveSlot {
 const v=object(value,["durationSeconds","state","witness","wattsPerKg","weightRatio"]);
 if (v.durationSeconds!==seconds || typeof v.state!=="string" || !["available","snapshot_missing","no_continuous_window",...(mode.endsWith("inspect")?["not_requested"]:[])].includes(v.state as string)) fail();
 if(v.state!=="available") {if(v.witness!==null||v.wattsPerKg!==null||v.weightRatio!==null)fail();}
 else {
  const w=object(v.witness,["version","calculatorPolicyVersion","snapshotRevision","powerSource","durationMs","windowStartElapsedMs","windowEndElapsedMs","energyNumerator","energyDenominator","maxAveragePowerW","originalClockVerified","sensorBucketOriginVerified"]);
  if(w.version!==2||w.calculatorPolicyVersion!=="native_power_integer_ms_v2"||!hash(w.snapshotRevision)||typeof w.powerSource!=="string"||!["measured","stored_native_watts_unverified"].includes(w.powerSource as string)||w.durationMs!==seconds*1000||!integer(w.windowStartElapsedMs)||!integer(w.windowEndElapsedMs)||Number(w.windowEndElapsedMs)-Number(w.windowStartElapsedMs)!==w.durationMs||(!finite(w.maxAveragePowerW)||Number(w.maxAveragePowerW)>Number.MAX_SAFE_INTEGER)||w.originalClockVerified!==false||w.sensorBucketOriginVerified!==false||typeof w.energyNumerator!=="string"||!/^\d{1,641}$/u.test(w.energyNumerator)||typeof w.energyDenominator!=="string"||!/^\d{1,324}$/u.test(w.energyDenominator)||BigInt(w.energyDenominator)===0n)fail();
  if(roundedRatio(BigInt(String(w.energyNumerator)),BigInt(String(w.energyDenominator))*BigInt(seconds*1000))!==w.maxAveragePowerW)fail();
  if(v.wattsPerKg!==null&&!finite(v.wattsPerKg))fail();
  if(v.weightRatio!==null){const r=object(v.weightRatio,["numerator","denominator"]);if(typeof r.numerator!=="string"||!/^\d{1,700}$/u.test(r.numerator)||typeof r.denominator!=="string"||!/^\d{1,700}$/u.test(r.denominator)||BigInt(r.denominator)===0n)fail();}
  if((v.wattsPerKg===null)!==(v.weightRatio===null))fail();
 }
 return value as NativePowerTwelveSlot;
}
export function validateNativePowerTwelve(value: unknown, request: NativePowerTwelveRequest): NativePowerTwelveResponse {
 if(new TextEncoder().encode(JSON.stringify(value)).length>65536)fail();
 const v=object(value,["version","mode","scope","timingBasis","comparisonChannel","originalClockVerified","sensorBucketOriginVerified","collectionCompleteness","consumerRuntimeHash","sources","periods","costs"]);
 if(v.version!==1||v.mode!==request.mode||v.scope!=="selected_and_checked_native_activities"||v.timingBasis!=="stored_native_timestamp_one_second_slots"||v.comparisonChannel!=="native_stored_bucket_unverified"||v.originalClockVerified!==false||v.sensorBucketOriginVerified!==false||v.collectionCompleteness!=="unknown"||!hash(v.consumerRuntimeHash)||!Array.isArray(v.sources)||!Array.isArray(v.periods))fail();
 const ids=request.mode==="stage_native_power_v2_twelve_inspect"?[request.activityId]:request.selectedSources.map(s=>s.activityId);
 if(v.sources.length!==ids.length)fail();
 for(const [index, source] of v.sources.entries()){
 const s=object(source,["candidate","powerSource","physicalGroupBinding","unresolvedKnownTwin","state","snapshotRevision","publicationRevision","bounds","weight","slots"]),c=candidate(s.candidate);
 if(c.activityId!==ids[index]||!hash(s.physicalGroupBinding)||typeof s.unresolvedKnownTwin!=="boolean"||typeof s.powerSource!=="string"||typeof s.state!=="string"||!["measured","stored_native_watts_unverified"].includes(s.powerSource as string)||!["available","snapshot_missing"].includes(s.state as string))fail();
 if(request.mode!=="stage_native_power_v2_twelve_inspect"&&!Object.entries(request.selectedSources[index]!).every(([key,value])=>c[key as keyof typeof c]===value))fail();
 if(s.state==="available"? !hash(s.snapshotRevision)||!hash(s.publicationRevision):s.snapshotRevision!==null||s.publicationRevision!==null)fail();
 if((s.state==="available")!==(s.bounds!==null))fail();
 if(s.bounds!==null){const b=object(s.bounds,["observedMs","longestContinuousMs"]);if(!integer(b.observedMs)||!integer(b.longestContinuousMs)||Number(b.longestContinuousMs)>Number(b.observedMs)||Number(b.observedMs)>604800000)fail();}
 const w=object(s.weight,["state","weightKg","computedAtMs"]);if(typeof w.state!=="string")fail();if(w.computedAtMs!==null&&!integer(w.computedAtMs))fail();if(w.state==="available"?typeof w.weightKg!=="number"||!Number.isFinite(w.weightKg)||w.weightKg<25||w.weightKg>250:!["missing","invalid","incompatible"].includes(w.state as string)||w.weightKg!==null)fail();
 if(!Array.isArray(s.slots)||s.slots.length!==12)fail();for(let i=0;i<12;i++){const p=slot(s.slots[i],NATIVE_POWER_V2_TWELVE_SECONDS[i]!,request.mode);if(s.state==="snapshot_missing"?p.state!=="snapshot_missing":request.mode.endsWith("inspect")?p.state!=="not_requested":!["available","no_continuous_window"].includes(p.state))fail();if(p.witness&&(p.witness.snapshotRevision!==s.snapshotRevision||p.witness.powerSource!==s.powerSource))fail();
 if(p.witness){if(w.state!=="available"){if(p.wattsPerKg!==null||p.weightRatio!==null)fail();}else{if(p.wattsPerKg!==p.witness.maxAveragePowerW/Number(w.weightKg)||!p.weightRatio)fail();const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,Number(w.weightKg));const bits=view.getBigUint64(0),exponent=Number((bits>>52n)&2047n)-1023-52;let n=(bits&((1n<<52n)-1n))|(1n<<52n),d=1n;if(exponent<0)d<<=BigInt(-exponent);else n<<=BigInt(exponent);if(BigInt(p.weightRatio.numerator)*BigInt(p.witness.energyDenominator)*BigInt(p.witness.durationMs)*n!==BigInt(p.weightRatio.denominator)*BigInt(p.witness.energyNumerator)*d)fail();}}
}
 }
 const periods=request.mode==="stage_native_power_v2_twelve_inspect"?[]:request.periods;
 if(v.periods.length!==periods.length)fail();
 for(const [index,p] of v.periods.entries()) {
 const p0=object(p,["period","counts","rows"]);object(p0.period,["id","fromInclusiveMs","toExclusiveMs"]);if(!equal(p0.period,periods[index]))fail();
 const counts=object(p0.counts,["selected","checked","available","snapshotMissing","unresolvedPhysicalGroups"]);if(!Object.values(counts).every(integer)||Object.values(counts).some(n=>Number(n)>ids.length))fail();
 if(!Array.isArray(p0.rows)||p0.rows.length!==12)fail();
 for(const [i,row]of p0.rows.entries()){const r=object(row,["durationSeconds","measured","storedNativeUnverified","counts"]);if(r.durationSeconds!==NATIVE_POWER_V2_TWELVE_SECONDS[i])fail();const rc=object(r.counts,["available","shortWindow","snapshotMissing","weightUnavailable"]);if(!Object.values(rc).every(integer)||Object.values(rc).some(n=>Number(n)>ids.length))fail();for(const origin of ["measured","storedNativeUnverified"]){const strata=object(r[origin],["watts","wattsPerKg"]);for(const unit of ["watts","wattsPerKg"]){if(strata[unit]===null)continue;const win=object(strata[unit],["activityId","snapshotRevision","slot"]);const s=(v.sources as NativePowerTwelveResponse['sources']).find(source=>source.candidate.activityId===win.activityId);const p=slot(win.slot,NATIVE_POWER_V2_TWELVE_SECONDS[i]!,request.mode);if(!s||s.unresolvedKnownTwin||s.snapshotRevision!==win.snapshotRevision||s.powerSource!==(origin==="measured"?"measured":"stored_native_watts_unverified")||p.state!=="available"||!equal(p,s.slots[i])||s.candidate.originEpochMs<periods[index]!.fromInclusiveMs||s.candidate.originEpochMs>=periods[index]!.toExclusiveMs||unit==="wattsPerKg"&&p.wattsPerKg===null)fail();}}}
 }
 const costs=object(v.costs,["reserved","delivered","snapshotDecodeCalls","wireFullPublicationDocuments","encodedResponseBytes","queries","raw","writes"]);for(const kind of ["reserved","delivered"]){const c=object(costs[kind],["documents","metadata","auth","snapshotBodies"]);if(!Object.values(c).every(integer)||Number(c.documents)>28*ids.length||Number(c.metadata)>2*ids.length||Number(c.auth)>2||Number(c.snapshotBodies)>ids.length)fail();}if(Object.keys(costs.delivered as object).some(key=>Number((costs.delivered as Record<string,unknown>)[key])>Number((costs.reserved as Record<string,unknown>)[key])))fail();if(!integer(costs.snapshotDecodeCalls)||Number(costs.snapshotDecodeCalls)>ids.length||!integer(costs.wireFullPublicationDocuments)||Number(costs.wireFullPublicationDocuments)>2*ids.length||!integer(costs.encodedResponseBytes)||Number(costs.encodedResponseBytes)>65536||costs.queries!==0||costs.raw!==0||costs.writes!==0)fail();
 if(!equal(v.periods,nativeTwelveExactPeriods(value as NativePowerTwelveResponse)))fail();
 return structuredClone(value) as NativePowerTwelveResponse;
}
export function validNativePowerTwelveRequest(request: NativePowerTwelveRequest, now = Date.now()) {
 try {
  if(request.mode === "stage_native_power_v2_twelve_inspect") { object(request,["version","mode","activityId"]);return request.version===1&&nativeId(request.activityId); }
  object(request,["version","mode","periods","selectedSources"]);
  if(request.version!==1||request.mode!=="stage_native_power_v2_twelve_personal_periods"||request.periods.length<1||request.periods.length>2||request.selectedSources.length<1||request.selectedSources.length>2)return false;
  return new Set(request.selectedSources.map(s=>s.activityId)).size===request.selectedSources.length&&new Set(request.periods.map(p=>p.id)).size===request.periods.length&&request.periods.every(p=>{object(p,["id","fromInclusiveMs","toExclusiveMs"]);return typeof p.id==="string"&&/^[A-Za-z0-9_-]{1,32}$/u.test(p.id)&&integer(p.fromInclusiveMs)&&integer(p.toExclusiveMs)&&p.fromInclusiveMs<p.toExclusiveMs&&p.toExclusiveMs<=now;})&&request.selectedSources.every(s=>{object(s,["activityId","activityRevision","baseMetricsRevision","sourceBinding"]);return nativeId(s.activityId)&&revision(s.activityRevision)&&revision(s.baseMetricsRevision)&&hash(s.sourceBinding);});
 } catch {return false;}
}
export async function loadNativePowerTwelve(services: FirebaseServices, uid: string, request: NativePowerTwelveRequest, active: ()=>boolean) {
 if(services.functions.app!==services.auth.app||services.functions.customDomain!=="https://asia-northeast3-orider-dev.cloudfunctions.net")throw Error("api_unavailable");
 if(!validNativePowerTwelveRequest(request))throw Error("invalid_native_twelve_request");
 const user=services.auth.currentUser;
 const valid=()=>active()&&stageActivityPowerAvailable()&&!!user&&!user.isAnonymous&&user.uid===uid&&services.auth.currentUser===user;
 if(!valid())throw Error("account_changed");
 await services.ensureAppCheckReady();if(!valid())throw Error("account_changed");
 const result=await httpsCallable(services.functions,"getStageNativePowerV2Twelve")(request);if(!valid())throw Error("account_changed");
 const decoded=validateNativePowerTwelve(result.data,request);if(!valid())throw Error("account_changed");return decoded;
}
