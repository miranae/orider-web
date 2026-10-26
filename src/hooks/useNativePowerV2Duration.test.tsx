import {act,renderHook} from "@testing-library/react";
import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import type {Activity} from "@shared/types";
import {useNativePowerV2Duration} from "./useNativePowerV2Duration";
import {nativePowerV2DurationFixture} from "../dev/nativePowerV2DurationFixture";
const mock=vi.hoisted(()=>{const app={};return {load:vi.fn(),authChanged:null as (()=>void)|null,services:{auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"}}};});
vi.mock("../contexts/AuthContext",()=>({useAuth:()=>({user:{uid:"owner",isAnonymous:false}})}));
vi.mock("../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>mock.services}));
vi.mock("../services/stageActivityPowerDuration",()=>({stageActivityPowerAvailable:()=>true}));
vi.mock("firebase/auth",()=>({onIdTokenChanged:(_:unknown,callback:()=>void)=>{mock.authChanged=callback;return()=>{};}}));
vi.mock("../services/nativePowerV2Duration",async()=>{const original=await vi.importActual<typeof import("../services/nativePowerV2Duration")>("../services/nativePowerV2Duration");return {...original,loadNativePowerV2Duration:mock.load};});
const activity={id:"orider_fixture_a",userId:"owner",type:"Ride",startTime:1791800000000,endTime:1791803600000,source:"orider",summary:{elapsedTimeMillis:3600000}} as Activity;
beforeEach(()=>{mock.load.mockReset();mock.services.auth.currentUser={uid:"owner",isAnonymous:false};});
afterEach(()=>vi.useRealTimers());
describe("V2 arbitrary-duration manual opaque session",()=>{
 it("mount, draft and activity-head changes perform no request",()=>{const {rerender}=renderHook(({draft,head})=>useNativePowerV2Duration({...activity,contentRevision:head},draft),{initialProps:{draft:"300",head:1}});rerender({draft:"17",head:1});rerender({draft:"17",head:2});expect(mock.load).not.toHaveBeenCalled();});
 it("requires explicit confirmation and keeps opaque duration-bound session",async()=>{mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.calculate());expect(mock.load).not.toHaveBeenCalled();await act(()=>result.current.confirm());expect(result.current.canCalculate).toBe(true);await act(()=>result.current.calculate());expect(mock.load).toHaveBeenCalledTimes(2);expect(mock.load.mock.calls[1]![2]).toMatchObject({mode:"stage_native_power_v2_duration",durationSeconds:300,session:"synthetic_opaque_session_not_a_credential"});expect(result.current.result?.witness?.maxAveragePowerW).toBe(300);});
 it("draft change clears uncomputed session without fetching",async()=>{mock.load.mockResolvedValue(nativePowerV2DurationFixture(300));const {result,rerender}=renderHook(({draft})=>useNativePowerV2Duration(activity,draft),{initialProps:{draft:"300"}});await act(()=>result.current.confirm());rerender({draft:"301"});expect(result.current.metadata).toBeNull();expect(result.current.result).toBeNull();expect(mock.load).toHaveBeenCalledOnce();});
 it("deduplicates clicks and cancels a late confirmation",async()=>{let resolve!:(v:unknown)=>void;mock.load.mockImplementation(()=>new Promise(done=>{resolve=done;}));const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));let pending!:Promise<void>;act(()=>{pending=result.current.confirm();void result.current.confirm();});expect(mock.load).toHaveBeenCalledOnce();act(()=>result.current.cancel());await act(async()=>{resolve(nativePowerV2DurationFixture(300));await pending;});expect(result.current.metadata).toBeNull();expect(result.current.result).toBeNull();});
 it("native SDK replacement and same-user token renewal invalidate calculation eligibility",async()=>{mock.load.mockResolvedValue(nativePowerV2DurationFixture(300));const {result,rerender}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());mock.services.auth.currentUser={uid:"owner",isAnonymous:false};rerender();expect(result.current.metadata).toBeNull();await act(()=>result.current.confirm());act(()=>mock.authChanged!());expect(result.current.metadata).toBeNull();});
 it("failed or server-expired compute clears all state and requires manual reconfirmation",async()=>{mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockRejectedValueOnce(Error("failed-precondition"));const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());await act(()=>result.current.calculate());expect(result.current.metadata).toBeNull();expect(result.current.result).toBeNull();expect(result.current.failure).toBe(true);expect(result.current.canCalculate).toBe(false);expect(mock.load).toHaveBeenCalledTimes(2);});
 it("expires local calculation eligibility without renewing or requesting",async()=>{vi.useFakeTimers();mock.load.mockResolvedValue(nativePowerV2DurationFixture(300));const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());act(()=>vi.advanceTimersByTime(1800000));expect(result.current.metadata).toBeNull();expect(result.current.canCalculate).toBe(false);expect(mock.load).toHaveBeenCalledOnce();});
 it("hides unavailable metadata truthfully and retains no usable session",async()=>{const missing={...nativePowerV2DurationFixture(300),state:"snapshot_missing" as const,session:null,bounds:null};mock.load.mockResolvedValue(missing);const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());expect(result.current.metadata?.state).toBe("snapshot_missing");expect(result.current.canCalculate).toBe(false);expect(result.current.result).toBeNull();});
 it.each(["activity","draft","scope","head","token","cancel"])("retired confirm and calculate cannot dispatch after %s change",async change=>{
  mock.load.mockResolvedValue(nativePowerV2DurationFixture(300));
  const {result,rerender}=renderHook(({id,draft,scope,head})=>useNativePowerV2Duration({...activity,id,contentRevision:head},draft,scope),{initialProps:{id:activity.id,draft:"300",scope:"a",head:1}});
  await act(()=>result.current.confirm());const oldConfirm=result.current.confirm,oldCalculate=result.current.calculate;
  if(change==="token")act(()=>mock.authChanged!());else if(change==="cancel")act(()=>result.current.cancel());else rerender({id:change==="activity"?"orider_fixture_b":activity.id,draft:change==="draft"?"301":"300",scope:change==="scope"?"b":"a",head:change==="head"?2:1});
  await act(async()=>{await oldConfirm();await oldCalculate();});expect(mock.load).toHaveBeenCalledOnce();expect(result.current.result).toBeNull();
  await act(()=>result.current.confirm());expect(mock.load).toHaveBeenCalledTimes(2);
 });
 it("retired callbacks after unmount perform zero additional transport",async()=>{
  mock.load.mockResolvedValue(nativePowerV2DurationFixture(300));const {result,unmount}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());const old=result.current;unmount();await old.confirm();await old.calculate();old.cancel();expect(mock.load).toHaveBeenCalledOnce();
 });

 it("keeps completed original-duration result through draft, head, period and same-user token renewal",async()=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));
  const {result,rerender}=renderHook(({draft,head,scope})=>useNativePowerV2Duration({...activity,contentRevision:head,updatedAt:head} as Activity,draft,scope),{initialProps:{draft:"300",head:1,scope:"month"}});
  await act(()=>result.current.confirm());await act(()=>result.current.calculate());
  rerender({draft:"600",head:2,scope:"year"});
  expect(result.current.result?.witness?.durationMs).toBe(300000);expect(result.current.previousResult).toBe(true);
  expect(result.current.canCalculate).toBe(false);expect(result.current.metadata).toBeNull();
  act(()=>mock.authChanged!());expect(result.current.result?.witness?.durationMs).toBe(300000);
  expect(mock.load).toHaveBeenCalledTimes(2);
 });
 it("retains completed values on local eligibility expiry and a failed explicit lookup",async()=>{
  vi.useFakeTimers();mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));
  const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));
  await act(()=>result.current.confirm());await act(()=>result.current.calculate());
  act(()=>vi.advanceTimersByTime(1800000));expect(result.current.canCalculate).toBe(false);
  expect(result.current.result?.witness?.maxAveragePowerW).toBe(300);
  let reject!:(e:unknown)=>void;mock.load.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
  let pending!:Promise<void>;act(()=>{pending=result.current.confirm();});
  expect(result.current.busy).toBe(true);expect(result.current.result?.witness?.maxAveragePowerW).toBe(300);
  await act(async()=>{reject(Object.assign(Error("network"),{code:"functions/unavailable"}));await pending;});
  expect(result.current.failure).toBe(true);expect(result.current.result?.witness?.maxAveragePowerW).toBe(300);
 });
 it("keeps both completed results selectable after a new explicit calculation succeeds",async()=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true))
   .mockResolvedValueOnce(nativePowerV2DurationFixture(600)).mockResolvedValueOnce(nativePowerV2DurationFixture(600,true));
  const {result,rerender}=renderHook(({draft})=>useNativePowerV2Duration(activity,draft),{initialProps:{draft:"300"}});
  await act(()=>result.current.confirm());await act(()=>result.current.calculate());const first=result.current.selectedResultId;
  rerender({draft:"600"});await act(()=>result.current.confirm());await act(()=>result.current.calculate());const latest=result.current.selectedResultId;
  expect(result.current.history).toHaveLength(2);expect(result.current.result?.witness?.durationMs).toBe(600000);
  act(()=>result.current.selectResult(first));expect(result.current.result?.witness?.durationMs).toBe(300000);expect(result.current.previousResult).toBe(true);
  act(()=>result.current.selectResult(latest));expect(result.current.result?.witness?.durationMs).toBe(600000);
 });
 it.each(["permission-denied","unauthenticated","not-found","failed-precondition"])("clears completed results after server authority failure %s",async(code)=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true))
   .mockRejectedValueOnce(Object.assign(Error(code),{code:`functions/${code}`}));
  const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());await act(()=>result.current.calculate());await act(()=>result.current.confirm());
  expect(result.current.result).toBeNull();expect(result.current.history).toEqual([]);
 });
 it.each(["activity","user","deleted","cancel"])("does not expose retained results across %s boundary",async(change)=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));
  const {result,rerender}=renderHook(({value})=>useNativePowerV2Duration(value,"300"),{initialProps:{value:activity}});
  await act(()=>result.current.confirm());await act(()=>result.current.calculate());
  if(change==="cancel")act(()=>result.current.cancel());else {
   if(change==="user")mock.services.auth.currentUser={uid:"owner",isAnonymous:false};
   rerender({value:{...activity,...(change==="activity"?{id:"orider_other"}:change==="visibility"?{visibility:"private" as const}:change==="deleted"?{deletedAt:1}:{})}});
  }
  expect(result.current.result).toBeNull();expect(result.current.history).toEqual([]);
 });
 it("discards late new results after input change without losing the prior completed result",async()=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));
  const {result,rerender}=renderHook(({draft})=>useNativePowerV2Duration(activity,draft),{initialProps:{draft:"300"}});
  await act(()=>result.current.confirm());await act(()=>result.current.calculate());
  let resolve!:(v:unknown)=>void;mock.load.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));let pending!:Promise<void>;
  act(()=>{pending=result.current.calculate();});rerender({draft:"600"});
  await act(async()=>{resolve(nativePowerV2DurationFixture(300,true));await pending;});
  expect(result.current.history).toHaveLength(1);expect(result.current.result?.witness?.durationMs).toBe(300000);expect(result.current.busy).toBe(false);
 });

 it("does not erase a completed result while a repeated calculation fails",async()=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));
  const {result}=renderHook(()=>useNativePowerV2Duration(activity,"300"));await act(()=>result.current.confirm());await act(()=>result.current.calculate());
  let reject!:(e:unknown)=>void;mock.load.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));let pending!:Promise<void>;
  act(()=>{pending=result.current.calculate();});expect(result.current.result?.witness?.durationMs).toBe(300000);
  await act(async()=>{reject(Object.assign(Error("timeout"),{code:"functions/deadline-exceeded"}));await pending;});
  expect(result.current.result?.witness?.durationMs).toBe(300000);expect(result.current.failure).toBe(true);expect(result.current.canCalculate).toBe(false);
 });

 it("keeps owner results when visibility changes without revoking owner access",async()=>{
  mock.load.mockResolvedValueOnce(nativePowerV2DurationFixture(300)).mockResolvedValueOnce(nativePowerV2DurationFixture(300,true));
  const {result,rerender}=renderHook(({visibility})=>useNativePowerV2Duration({...activity,visibility},"300"),{initialProps:{visibility:"everyone" as Activity["visibility"]}});
  await act(()=>result.current.confirm());await act(()=>result.current.calculate());rerender({visibility:"private"});
  expect(result.current.result?.witness?.durationMs).toBe(300000);expect(result.current.canCalculate).toBe(false);expect(mock.load).toHaveBeenCalledTimes(2);
 });

});
