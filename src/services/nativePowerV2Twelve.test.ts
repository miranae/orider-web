import { createHash } from "node:crypto";
import compiledFixtureText from "./__fixtures__/nativePowerV2Twelve.compiled.json?raw";
import { describe,it,expect } from "vitest";
import { nativeTwelveExactPeriods } from "../features/fitness/models/nativePowerTwelve";
import { validateNativePowerTwelve, validNativePowerTwelveRequest } from "./nativePowerV2Twelve";
import { nativeTwelveFixture } from "../dev/nativeTwelveFixture";
import type { NativePowerTwelveRequest } from "@shared/types/stage-native-power-v2-twelve";
const periods=[{id:"recent",fromInclusiveMs:0,toExclusiveMs:Date.UTC(2026,9,13)},{id:"all",fromInclusiveMs:0,toExclusiveMs:Date.UTC(2026,9,13)}];
const request:NativePowerTwelveRequest={version:1,mode:"stage_native_power_v2_twelve_personal_periods",periods,selectedSources:[{activityId:"orider_fixture_a",activityRevision:"1:0",baseMetricsRevision:"1:0",sourceBinding:"a".repeat(64)}]};
describe("native12 strict scalar decoding",()=>{
 it("accepts synthetic scalar fixture and detaches it",()=>{const value=nativeTwelveFixture(periods);const result=validateNativePowerTwelve(value,request);expect(result).toEqual(value);expect(result).not.toBe(value);});
 it.each(["extra","duration","clock","owner","revision","raw","origin","lateSource","twin"])("rejects %s corruption",kind=>{const v=nativeTwelveFixture(periods);switch(kind){case"extra":Object.assign(v,{privateUid:"secret"});break;case"duration":v.sources[0]!.slots[0]!.durationSeconds=30;break;case"clock":Object.assign(v,{originalClockVerified:true});break;case"owner":v.sources[0]!.candidate.activityId="orider_other";break;case"revision":v.sources[0]!.candidate.baseMetricsRevision="2:0";break;case"raw":Object.assign(v.sources[0]!,{raw:[1]});break;case"origin":v.sources[0]!.powerSource="stored_native_watts_unverified";break;case"lateSource":v.sources[0]!.candidate.originEpochMs=periods[0]!.toExclusiveMs;break;case"twin":v.sources[0]!.unresolvedKnownTwin=true;}expect(()=>validateNativePowerTwelve(v,request)).toThrow();});
 it("keeps real zero available and missing null",()=>{const v=nativeTwelveFixture(periods);const s=v.sources[0]!.slots[0]!;s.witness!.maxAveragePowerW=0;s.witness!.energyNumerator="0";s.wattsPerKg=0;s.weightRatio!.numerator="0";expect(validateNativePowerTwelve(v,request).sources[0]!.slots[0]!.state).toBe("available");});
 it.each(["nullWinner","count0","rowCount0"])("rejects incorrect derived %s",kind=>{const v=nativeTwelveFixture(periods);if(kind==="nullWinner")v.periods[0]!.rows[0]!.measured.watts=null;else if(kind==="count0")v.periods[0]!.counts.checked=0;else v.periods[0]!.rows[0]!.counts.available=0;expect(()=>validateNativePowerTwelve(v,request)).toThrow();});
 it.each(["powerSource","weightState","slotState","sourceState"])("rejects coercible inspect %s enum on valid baseline",kind=>{const v=nativeTwelveFixture(periods);v.mode="stage_native_power_v2_twelve_inspect";v.periods=[];v.sources[0]!.slots=v.sources[0]!.slots.map(s=>({...s,state:"not_requested",witness:null,wattsPerKg:null,weightRatio:null}));const inspect={version:1 as const,mode:"stage_native_power_v2_twelve_inspect" as const,activityId:"orider_fixture_a"};expect(()=>validateNativePowerTwelve(v,inspect)).not.toThrow();if(kind==="powerSource")Object.assign(v.sources[0]!,{powerSource:["measured"]});else if(kind==="weightState")Object.assign(v.sources[0]!.weight,{state:["missing"],weightKg:null});else if(kind==="slotState")Object.assign(v.sources[0]!.slots[0]!,{state:["not_requested"]});else Object.assign(v.sources[0]!,{state:["available"]});expect(()=>validateNativePowerTwelve(v,inspect)).toThrow();});

 it.each(["slower","wrongGroup","wrongWkg"])("rejects %s winner using valid two-source baseline",kind=>{const v=nativeTwelveFixture(periods),b=structuredClone(v.sources[0]!);b.candidate.activityId="orider_fixture_b";b.physicalGroupBinding=kind==="wrongGroup"?v.sources[0]!.physicalGroupBinding:"b".repeat(64);b.weight={state:"available",weightKg:25,computedAtMs:null};for(const slot of b.slots){if(!slot.witness)continue;slot.witness.maxAveragePowerW/=2;slot.witness.energyNumerator=(BigInt(slot.witness.energyNumerator)/2n).toString();slot.wattsPerKg=slot.witness.maxAveragePowerW/25;slot.weightRatio={numerator:String(slot.witness.maxAveragePowerW),denominator:"25"};}v.sources.push(b);v.periods=nativeTwelveExactPeriods(v);const req={...request,selectedSources:v.sources.map(({candidate:{activityId,activityRevision,baseMetricsRevision,sourceBinding}})=>({activityId,activityRevision,baseMetricsRevision,sourceBinding}))};expect(()=>validateNativePowerTwelve(v,req)).not.toThrow();const wrong=kind==="wrongWkg"?v.sources[0]!:b;v.periods[0]!.rows[0]!.measured[kind==="wrongWkg"?"wattsPerKg":"watts"]={activityId:wrong.candidate.activityId,snapshotRevision:wrong.snapshotRevision!,slot:wrong.slots[0]!};expect(()=>validateNativePowerTwelve(v,req)).toThrow();});

 it("accepts exact backend Node22 compiled two-source wire and independent W/Wkg winners",()=>{
  expect(createHash("sha256").update(compiledFixtureText).digest("hex")).toBe("39f2034d9988378208be6c06068d5a3671c747e99113e94026a61773ef73c7b3");
  const wire=JSON.parse(compiledFixtureText) as {request:NativePowerTwelveRequest;response:unknown;inspectResponse:unknown};
  const result=validateNativePowerTwelve(wire.response,wire.request);
  expect(result.sources).toHaveLength(2);expect(result.sources.every(source=>source.slots.length===12)).toBe(true);
  expect(result.costs.reserved.documents).toBe(56);expect(result.costs.delivered.documents).toBe(52);
  expect(result.costs.snapshotDecodeCalls).toBe(2);expect(result.costs.wireFullPublicationDocuments).toBe(4);
  const row=result.periods[0]!.rows.find(row=>row.durationSeconds===300)!;
  expect(row.measured.watts?.activityId).toBe("orider_fixture_a");expect(row.measured.watts?.slot.witness?.maxAveragePowerW).toBe(300);
  expect(row.measured.wattsPerKg?.activityId).toBe("orider_fixture_b");expect(row.measured.wattsPerKg?.slot.wattsPerKg).toBe(290/70.1);
  const inspected=validateNativePowerTwelve(wire.inspectResponse,{version:1,mode:"stage_native_power_v2_twelve_inspect",activityId:"orider_fixture_a"});
  expect(inspected.periods).toEqual([]);expect(inspected.sources[0]!.slots.every(slot=>slot.state==="not_requested"&&slot.witness===null)).toBe(true);
  result.periods[0]!.rows.find(row=>row.durationSeconds===300)!.measured.watts=null;
  expect(()=>validateNativePowerTwelve(result,wire.request)).toThrow();
 });

 it.each([0,1,152,153])("matches backend native-ID admission for %s suffix characters",suffixLength=>{
  const activityId=`orider_${"a".repeat(suffixLength)}`;
  expect(validNativePowerTwelveRequest({version:1,mode:"stage_native_power_v2_twelve_inspect",activityId})).toBe(true);
  const wire=JSON.parse(compiledFixtureText) as {inspectResponse:import("@shared/types/stage-native-power-v2-twelve").NativePowerTwelveResponse};
  wire.inspectResponse.sources[0]!.candidate.activityId=activityId;
  expect(()=>validateNativePowerTwelve(wire.inspectResponse,{version:1,mode:"stage_native_power_v2_twelve_inspect",activityId})).not.toThrow();
 });
 it.each([`orider_${"a".repeat(154)}`,"orider_a/b","strava_a","orider_é"])("rejects native-ID outside backend admission: %s",activityId=>{
  expect(validNativePowerTwelveRequest({version:1,mode:"stage_native_power_v2_twelve_inspect",activityId})).toBe(false);
  const wire=JSON.parse(compiledFixtureText) as {inspectResponse:import("@shared/types/stage-native-power-v2-twelve").NativePowerTwelveResponse};
  wire.inspectResponse.sources[0]!.candidate.activityId=activityId;
  expect(()=>validateNativePowerTwelve(wire.inspectResponse,{version:1,mode:"stage_native_power_v2_twelve_inspect",activityId})).toThrow();
 });

});
