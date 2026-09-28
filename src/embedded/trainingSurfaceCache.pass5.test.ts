import { expect, it, vi } from "vitest";

it("admits summary-null owner-bound canonical load after persistent restart", async () => {
  window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
  localStorage.clear();
  vi.resetModules();
  const first = await import("./trainingSurfaceCache");
  const key = {uid:"owner",surface:"fitness" as const,sport:"bike",locale:"ko",range:90};
  const value = {activities:[{id:"strava_1",userId:"owner",type:"Ride",startTime:Date.now(),summary:null,
    serverDerivedLoad:{schemaVersion:1,userId:"owner",inputBinding:"published",streamTss:100}}]};
  first.prepareTrainingSurfaceCacheOwner("owner");
  first.setTrainingSurfaceCache(key,value);
  expect(localStorage.getItem("orider.trainingSurfaceCache.v2")).toContain("streamTss");
  vi.resetModules();
  const restarted = await import("./trainingSurfaceCache");
  restarted.prepareTrainingSurfaceCacheOwner("owner");
  expect(restarted.getTrainingSurfaceCache(key)).toEqual(value);
  restarted.clearTrainingSurfaceCache();
  delete window.__ORIDER_TRAINING_CACHE_SCOPE__;
});
