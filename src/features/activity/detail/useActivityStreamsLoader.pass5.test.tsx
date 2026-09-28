import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getDoc } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { useActivityStreamsLoader } from "./useActivityStreamsLoader";

const t = (key: string) => key;
const make = (id: string, source = "strava") => ({id,userId:"owner",source,stravaActivityId:Number(id.split("_")[1])}) as Activity;
const payload = (value: number) => ({time:[0,1],distance:[0,value],userId:"owner"});
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes,no) => {resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(["success","failure","malformed"])("ignores stale provider %s and finally while current request remains loading", async kind => {
  vi.useFakeTimers();
  const a=deferred(); const b=deferred();
  const getStreams=vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const A=make("strava_111"); const B=make("strava_222");
  const {result,rerender,unmount}=renderHook(({activity,userId})=>useActivityStreamsLoader({activityId:activity.id,activity,userId,getStreams,t}),{initialProps:{activity:A,userId:"owner"}});
  rerender({activity:B,userId:"owner"});
  await act(async()=>{if(kind === "failure") a.reject(new Error("old failure")); else a.resolve(kind === "malformed" ? null : payload(111));});
  expect(result.current.streams).toBeNull();
  expect(result.current.streamsError).toBeNull();
  expect(result.current.loadingStreams).toBe(true);
  act(()=>vi.advanceTimersByTime(501));
  expect(result.current.showStreamSpinner).toBe(true);
  await act(async()=>b.resolve(payload(222)));
  expect(result.current.streams?.distance).toEqual([0,222]);
  expect(result.current.loadingStreams).toBe(false);
  unmount();
});
it("guards retry generation and account change", async()=>{
  const old=deferred(); const retry=deferred(); const nextUser=deferred();
  const getStreams=vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(retry.promise).mockReturnValueOnce(nextUser.promise);
  const activity=make("strava_111");
  const {result,rerender}=renderHook(({userId})=>useActivityStreamsLoader({activityId:activity.id,activity,userId,getStreams,t}),{initialProps:{userId:"owner"}});
  await act(async()=>result.current.retryStreams());
  await act(async()=>old.resolve(payload(10)));
  expect(result.current.streams).toBeNull();
  await act(async()=>retry.resolve(payload(20)));
  expect(result.current.streams?.distance).toEqual([0,20]);
  rerender({userId:"viewer"});
  expect(result.current.streams).toBeNull();
  await act(async()=>nextUser.resolve(payload(30)));
  expect(result.current.streams?.distance).toEqual([0,30]);
});
it.each(["success","failure"])("ignores delayed canonical %s after navigation", async kind => {
  const a=deferred();const b=deferred();
  vi.mocked(getDoc).mockImplementationOnce(()=>a.promise as ReturnType<typeof getDoc>).mockImplementationOnce(()=>b.promise as ReturnType<typeof getDoc>);
  const A=make("orider_a","orider");const B=make("orider_b","orider");
  const getStreams=vi.fn();
  const {result,rerender}=renderHook(({activity})=>useActivityStreamsLoader({activityId:activity.id,activity,userId:"owner",getStreams,t}),{initialProps:{activity:A}});
  rerender({activity:B});
  const snap=(value:number)=>({exists:()=>true,data:()=>({json:JSON.stringify(payload(value))})});
  await act(async()=>b.resolve(snap(222)));
  await act(async()=>{if(kind === "failure") a.reject(new Error("old canonical"));else a.resolve(snap(111));});
  expect(result.current.streams?.distance).toEqual([0,222]);
  expect(result.current.streamsError).toBeNull();
});
it("cancels spinner and pending writes on unmount", async()=>{
  vi.useFakeTimers();
  const request=deferred(); const getStreams=vi.fn().mockReturnValue(request.promise);
  const activity=make("strava_111");
  const {unmount}=renderHook(()=>useActivityStreamsLoader({activityId:activity.id,activity,userId:"owner",getStreams,t}));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  await act(async()=>request.reject(new Error("after unmount")));
  expect(vi.getTimerCount()).toBe(0);
});
