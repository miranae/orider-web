import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import fixture from "../services/stageActivityPowerDuration.fixture.json";
import { useStageActivityPowerDuration } from "./useStageActivityPowerDuration";
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, services: {}, metadata: vi.fn(), duration: vi.fn(), available: true }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/stageActivityPowerDuration", () => ({ stageActivityPowerAvailable: () => mocks.available, loadStagePowerMetadata: mocks.metadata, loadStagePowerDuration: mocks.duration }));
const activity = { id: "a", userId: "owner", type: "Ride", startTime: fixture[0]!.metadata.activityStartEpochMs } as Activity;
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.available = true; mocks.services = {}; mocks.metadata.mockReset().mockResolvedValue(fixture[0]!.metadata); mocks.duration.mockReset().mockResolvedValue(fixture[0]!.result); });
it("performs zero automatic reads and precisely manual metadata then arbitrary-duration calculation", async () => {
  const view = renderHook(({ draft }) => useStageActivityPowerDuration(activity, draft), { initialProps: { draft: "2" } });
  expect(mocks.metadata).not.toHaveBeenCalled(); expect(mocks.duration).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.load(); }); expect(mocks.metadata).toHaveBeenCalledOnce();
  await act(async () => { await view.result.current.calculate(); }); expect(mocks.duration).toHaveBeenCalledWith(mocks.services, "owner", fixture[0]!.metadata, 2);
  view.rerender({ draft: "17" }); expect(view.result.current.response).toBeNull(); expect(mocks.duration).toHaveBeenCalledOnce();
  mocks.metadata.mockResolvedValue({ ...fixture[0]!.metadata, maxIntegerDurationSeconds: 200 }); await act(async () => { await view.result.current.load(); });
  await act(async () => { await view.result.current.calculate(); }); expect(mocks.duration.mock.lastCall?.[3]).toBe(17);
  view.rerender({ draft: "137" }); expect(mocks.duration).toHaveBeenCalledTimes(2);
});
it("blocks foreign/anonymous/bike-invalid context and immediately hides prior data", async () => {
  const view = renderHook(({ current }) => useStageActivityPowerDuration(current, "2"), { initialProps: { current: activity } });
  await act(async () => { await view.result.current.load(); });
  mocks.uid = "other"; view.rerender({ current: activity }); expect(view.result.current.metadata).toBeNull();
  await act(async () => { await view.result.current.load(); }); expect(mocks.metadata).toHaveBeenCalledOnce();
  mocks.uid = "owner"; mocks.anonymous = true; view.rerender({ current: activity }); expect(view.result.current.available).toBe(false);
  mocks.anonymous = false; view.rerender({ current: { ...activity, type: "Run" } }); expect(view.result.current.available).toBe(false);
  view.rerender({ current: { ...activity, deletedAt: 1 } }); expect(view.result.current.available).toBe(false);
});
it("ignores late activity A-B-A metadata and draft A-B-A calculations", async () => {
  let resolve!: (value: unknown) => void;
  mocks.metadata.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = renderHook(({ current, draft }) => useStageActivityPowerDuration(current, draft), { initialProps: { current: activity, draft: "2" } });
  let pending!: Promise<void>; act(() => { pending = view.result.current.load(); });
  view.rerender({ current: { ...activity, id: "b" }, draft: "2" }); view.rerender({ current: activity, draft: "2" });
  await act(async () => { resolve(fixture[0]!.metadata); await pending; }); expect(view.result.current.metadata).toBeNull();
  await act(async () => { await view.result.current.load(); });
  mocks.duration.mockImplementationOnce(() => new Promise(done => { resolve = done; })); act(() => { pending = view.result.current.calculate(); });
  view.rerender({ current: activity, draft: "3" }); view.rerender({ current: activity, draft: "2" });
  await act(async () => { resolve(fixture[0]!.result); await pending; }); expect(view.result.current.response).toBeNull();
});
it("latches source change until manual metadata reload and never retries automatically", async () => {
  const view = renderHook(() => useStageActivityPowerDuration(activity, "2")); await act(async () => { await view.result.current.load(); });
  mocks.duration.mockRejectedValueOnce({ code: "functions/failed-precondition" }); await act(async () => { await view.result.current.calculate(); });
  expect(view.result.current.reloadRequired).toBe(true); expect(view.result.current.canCalculate).toBe(false);
  await act(async () => { await view.result.current.calculate(); }); expect(mocks.duration).toHaveBeenCalledOnce();
  await act(async () => { await view.result.current.load(); }); expect(view.result.current.canCalculate).toBe(true); expect(view.result.current.reloadRequired).toBe(false);
});

it("uses applied period ABA only as a cancellation identity without automatic reload", async () => {
  let resolve!: (value: unknown) => void;
  const view = renderHook(({ scope }) => useStageActivityPowerDuration(activity, "2", scope), { initialProps: { scope: "period-a" } });
  await act(async () => { await view.result.current.load(); });
  mocks.duration.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  let pending!: Promise<void>; act(() => { pending = view.result.current.calculate(); });
  view.rerender({ scope: "period-b" }); view.rerender({ scope: "period-a" });
  await act(async () => { resolve(fixture[0]!.result); await pending; });
  expect(view.result.current.response).toBeNull(); expect(view.result.current.metadata).toBeNull();
  expect(mocks.metadata).toHaveBeenCalledOnce(); expect(mocks.duration).toHaveBeenCalledOnce();
});
it("uses the server's 160-character ID boundary and alphanumeric first character without requests", () => {
  const view = renderHook(({ id }) => useStageActivityPowerDuration({ ...activity, id }, "2"), { initialProps: { id: "a".repeat(160) } });
  expect(view.result.current.available).toBe(true);
  for (const id of ["a".repeat(161), "_a", "-a"]) { view.rerender({ id }); expect(view.result.current.available).toBe(false); }
  expect(mocks.metadata).not.toHaveBeenCalled(); expect(mocks.duration).not.toHaveBeenCalled();
});
it.each(["functions/failed-precondition", "failed-precondition", "functions/unavailable", "functions/unauthenticated", "functions/permission-denied", null])("classifies only the exact source precondition code without guessing other failures: %s", async code => {
  mocks.metadata.mockRejectedValueOnce(code ? { code, message: "private SDK text" } : Error("private SDK text"));
  const view = renderHook(() => useStageActivityPowerDuration(activity, "2"));
  await act(async () => { await view.result.current.load(); });
  expect(view.result.current.failureKind).toBe(code === "functions/failed-precondition" || code === "failed-precondition" ? "source_precondition" : "generic");
  expect(view.result.current.metadata).toBeNull(); expect(mocks.duration).not.toHaveBeenCalled(); expect(mocks.metadata).toHaveBeenCalledOnce();
});

it("preserves a completed calculation through new input, loading, source changes and network failures", async () => {
  const view = renderHook(({ draft }) => useStageActivityPowerDuration(activity, draft), { initialProps: { draft: "2" } });
  await act(async () => { await view.result.current.load(); });
  await act(async () => { await view.result.current.calculate(); });
  const saved = view.result.current.savedResponse;
  expect(saved?.result?.state).toBe("available");
  view.rerender({ draft: "3" });
  expect(view.result.current.response).toBeNull(); expect(view.result.current.savedResponse).toEqual(saved);
  mocks.duration.mockRejectedValueOnce({ code: "functions/failed-precondition" });
  await act(async () => { await view.result.current.calculate(); });
  expect(view.result.current.savedResponse).toEqual(saved);
  mocks.metadata.mockRejectedValueOnce({ code: "functions/unavailable" });
  await act(async () => { await view.result.current.load(); });
  expect(view.result.current.savedResponse).toEqual(saved);
  mocks.metadata.mockRejectedValueOnce({ code: "functions/permission-denied" });
  await act(async () => { await view.result.current.load(); });
  expect(view.result.current.savedResponse).toBeNull();
});
it("clears prior results on an exact SDK session replacement with the same UID", async () => {
  const services = { auth: { currentUser: { uid: "owner" } } }; mocks.services = services;
  const view = renderHook(() => useStageActivityPowerDuration(activity, "2"));
  await act(async () => { await view.result.current.load(); });
  await act(async () => { await view.result.current.calculate(); });
  expect(view.result.current.savedResponse).not.toBeNull();
  services.auth.currentUser = { uid: "owner" }; view.rerender();
  expect(view.result.current.savedResponse).toBeNull();
});
it("allows selecting a previous successful input/result after a new success",async()=>{
 const h=renderHook(({draft})=>useStageActivityPowerDuration(activity,draft),{initialProps:{draft:"2"}});
 await act(async()=>h.result.current.load());await act(async()=>h.result.current.calculate());
 const old=h.result.current.savedResponse;
 h.rerender({draft:"3"});mocks.duration.mockResolvedValueOnce({...fixture[0]!.result,result:{...fixture[0]!.result.result,requestedDurationSeconds:3,maxAveragePowerW:999}});
 await act(async()=>h.result.current.calculate());expect(h.result.current.savedResponse?.result?.requestedDurationSeconds).toBe(3);
 act(()=>h.result.current.selectPrevious(0));expect(h.result.current.selectedResponse).toEqual(old);
 act(()=>h.result.current.selectPrevious(null));expect(h.result.current.selectedResponse).toBeNull();expect(h.result.current.savedResponse?.result?.maxAveragePowerW).toBe(999);
});
