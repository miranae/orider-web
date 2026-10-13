import {createHash} from "node:crypto";
import actualCompiledText from "./__fixtures__/nativePowerV2Duration.compiled.json?raw";
import {describe,it,expect} from "vitest";
import {nativePowerV2DurationFixture} from "../dev/nativePowerV2DurationFixture";
import {nativePowerV2DurationSeconds,validNativePowerV2DurationRequest,validateNativePowerV2Duration} from "./nativePowerV2Duration";
import type {NativePowerV2ReaderRequest} from "@shared/types/stage-native-power-v2-publication";
const request:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_duration",activityId:"orider_fixture_a",durationSeconds:300,periodBinding:null,session:"opaque"};
describe("V2 arbitrary-duration strict scalar contract",()=>{
 it("accepts metadata and exact duration witness separately",()=>{const metadata:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_metadata",activityId:request.activityId,durationSeconds:300,periodBinding:null};expect(validateNativePowerV2Duration(nativePowerV2DurationFixture(300),metadata).witness).toBeNull();const value=nativePowerV2DurationFixture(300,true);expect(validateNativePowerV2Duration(value,request)).toEqual(value);expect(validateNativePowerV2Duration(value,request)).not.toBe(value);});
 it.each([0,604801,-1,1.5,NaN])("rejects invalid duration %s",durationSeconds=>expect(validNativePowerV2DurationRequest({...request,durationSeconds})).toBe(false));
 it.each(["","0","604801","1.5"," 1","1e3"])("rejects invalid draft %s",draft=>expect(nativePowerV2DurationSeconds(draft)).toBeNull());
 it("accepts 1 and604800 and160char IDs",()=>{expect(nativePowerV2DurationSeconds("1")).toBe(1);expect(nativePowerV2DurationSeconds("604800")).toBe(604800);expect(validNativePowerV2DurationRequest({...request,activityId:`orider_${"x".repeat(153)}`})).toBe(true);});
 it.each(["extra","clock","channel","duration","window","energy","enum","cost"])("rejects %s corruption",kind=>{const v=nativePowerV2DurationFixture(300,true);switch(kind){case"extra":Object.assign(v,{uid:"private"});break;case"clock":v.witness!.originalClockVerified=true as false;break;case"channel":v.comparisonChannel="measured" as never;break;case"duration":v.witness!.durationMs=17000;break;case"window":v.witness!.windowEndElapsedMs++;break;case"energy":v.witness!.energyNumerator="1";break;case"enum":Object.assign(v.witness!,{powerSource:["measured"]});break;case"cost":v.costs.documents=21;}expect(()=>validateNativePowerV2Duration(v,request)).toThrow();});
 it("preserves truezero and tiny positive exact means",()=>{const v=nativePowerV2DurationFixture(30,true),r={...request,durationSeconds:30};v.witness!.maxAveragePowerW=1/30;v.witness!.energyNumerator="1000";expect(validateNativePowerV2Duration(v,r).witness!.maxAveragePowerW).toBe(1/30);v.witness!.maxAveragePowerW=0;v.witness!.energyNumerator="0";expect(validateNativePowerV2Duration(v,r).witness!.maxAveragePowerW).toBe(0);});
 it("returns short-window as null without padding",()=>{const v=nativePowerV2DurationFixture(3601,true);expect(validateNativePowerV2Duration(v,{...request,durationSeconds:3601}).witness).toBeNull();});
 it("rejects contradictory no-window and zero-observation metadata on accepted baselines",()=>{
  const value=nativePowerV2DurationFixture(300,true);expect(()=>validateNativePowerV2Duration(value,request)).not.toThrow();value.state="no_continuous_window";value.witness=null;expect(()=>validateNativePowerV2Duration(value,request)).toThrow();
  const metadata=nativePowerV2DurationFixture(300),query:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_metadata",activityId:request.activityId,durationSeconds:300,periodBinding:null};expect(()=>validateNativePowerV2Duration(metadata,query)).not.toThrow();metadata.bounds={observedMs:0,longestContinuousMs:0};expect(()=>validateNativePowerV2Duration(metadata,query)).toThrow();
 });
 it("preserves desired-duration beyond longest metadata and legitimate 1ms clipped publication",()=>{
  const metadata=nativePowerV2DurationFixture(300);metadata.bounds={observedMs:1,longestContinuousMs:1};const query:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_metadata",activityId:request.activityId,durationSeconds:300,periodBinding:null};expect(()=>validateNativePowerV2Duration(metadata,query)).not.toThrow();
  const short={...metadata,mode:"stage_native_power_v2_duration" as const,state:"no_continuous_window" as const,costs:{...metadata.costs,documents:20}};expect(validateNativePowerV2Duration(short,{...request,durationSeconds:1}).witness).toBeNull();
  const equal=nativePowerV2DurationFixture(3600,true);expect(()=>validateNativePowerV2Duration(equal,{...request,durationSeconds:3600})).not.toThrow();
 });

 it("accepts actual protected single-V2 Node22 compiled metadata/session/duration wire",()=>{
  expect(createHash("sha256").update(actualCompiledText).digest("hex")).toBe("b09331e637f8651f2b4897b551159f1e4d1ed5ce7840542b6e61c393327403e9");
  const wire=JSON.parse(actualCompiledText) as {metadata:import("@shared/types/stage-native-power-v2-publication").NativePowerV2ReaderResponse;duration:import("@shared/types/stage-native-power-v2-publication").NativePowerV2ReaderResponse};
  const metadataRequest:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_metadata",activityId:wire.metadata.activityId,durationSeconds:300,periodBinding:null};
  expect(validNativePowerV2DurationRequest(metadataRequest)).toBe(true);
  const metadata=validateNativePowerV2Duration(wire.metadata,metadataRequest);
  expect(metadata.costs).toEqual({documents:28,metadata:2,auth:2,snapshotBodies:1,raw:0,writes:0});
  const durationRequest:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_duration",activityId:metadata.activityId,durationSeconds:300,periodBinding:null,session:metadata.session!};
  const duration=validateNativePowerV2Duration(wire.duration,durationRequest);
  expect(duration.costs).toEqual({documents:20,metadata:2,auth:2,snapshotBodies:1,raw:0,writes:0});
  expect(duration.witness).toMatchObject({maxAveragePowerW:300,energyNumerator:"90000000",energyDenominator:"1",durationMs:300000,windowStartElapsedMs:0,windowEndElapsedMs:300000,powerSource:"stored_native_watts_unverified",originalClockVerified:false,sensorBucketOriginVerified:false});
  expect(metadata.session).toBe(wire.metadata.session); // opaque 문자열만 전달하며 해석하지 않는다.
 });
 it.each(["duration","bounds","session","cost"])("rejects malformed %s against accepted actual compiled wire",kind=>{
  const wire=JSON.parse(actualCompiledText) as {metadata:import("@shared/types/stage-native-power-v2-publication").NativePowerV2ReaderResponse;duration:import("@shared/types/stage-native-power-v2-publication").NativePowerV2ReaderResponse};
  const query:NativePowerV2ReaderRequest={mode:"stage_native_power_v2_duration",activityId:wire.duration.activityId,durationSeconds:300,periodBinding:null,session:wire.metadata.session!};
  expect(()=>validateNativePowerV2Duration(wire.duration,query)).not.toThrow();
  if(kind==="duration")wire.duration.witness!.durationMs=299000;
  else if(kind==="bounds")wire.duration.bounds!.longestContinuousMs=299999;
  else if(kind==="session")Object.assign(wire.duration,{session:[wire.duration.session]});
  else wire.duration.costs.documents=21;
  expect(()=>validateNativePowerV2Duration(wire.duration,query)).toThrow();
 });

});
