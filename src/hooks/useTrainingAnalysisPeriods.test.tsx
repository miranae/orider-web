import { track } from "../services/analytics";
import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useTrainingAnalysisPeriods, type TrainingAnalysisPeriodsSelection } from "./useTrainingAnalysisPeriods";
vi.mock("../services/analytics", () => ({ track: vi.fn() }));
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, services: {}, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../services/trainingAnalysisPeriods", async original => ({ ...await original<typeof import("../services/trainingAnalysisPeriods")>(), loadTrainingAnalysisPeriods: mocks.load, trainingAnalysisPeriodsAvailable: () => true }));
const selection = { request: { discipline: "bike" as const, periods: [{ fromInclusive: 1000, toExclusive: 10000 }] }, requestId: 1 };
beforeEach(() => { vi.mocked(track).mockClear(); mocks.uid = "owner"; mocks.anonymous = false; mocks.services = {}; mocks.load.mockReset().mockResolvedValue({ inputDigest: "new" }); });
it("makes zero calls by default, without selection, or for foreign/anonymous owner", () => {
  const r = renderHook(props => useTrainingAnalysisPeriods(props.owner, props.selection, props.enabled), { initialProps: { owner: "owner", selection, enabled: false } });
  expect(r.result.current.state).toBe("preparing");
  r.rerender({ owner: "foreign", selection, enabled: true }); expect(r.result.current.state).toBe("idle");
  mocks.anonymous = true; r.rerender({ owner: "owner", selection, enabled: true });
  expect(mocks.load).not.toHaveBeenCalled();
});
it.each(["owner", "selection", "services"])("rejects stale responses through %s A→B→A", async field => {
  let resolveOld!: (value: any) => void;
  mocks.load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const firstServices = mocks.services;
  const r = renderHook(props => useTrainingAnalysisPeriods("owner", props, true), { initialProps: selection });
  if (field === "owner") mocks.uid = "other";
  if (field === "services") mocks.services = {};
  r.rerender(field === "selection" ? { ...selection, requestId: 2 } : selection);
  if (field === "owner") mocks.uid = "owner";
  if (field === "services") mocks.services = firstServices;
  r.rerender(selection);
  await waitFor(() => expect(r.result.current.response?.inputDigest).toBe("new"));
  await act(async () => resolveOld({ inputDigest: "old" }));
  expect(r.result.current.response?.inputDigest).toBe("new");
  expect(track).toHaveBeenCalledWith("analysis_ready", expect.objectContaining({ outcome: "cancelled" }));
});

it("does not load until a valid explicit selection is submitted", () => {
  const r = renderHook(() => useTrainingAnalysisPeriods("owner", null, true));
  expect(r.result.current.state).toBe("idle"); expect(mocks.load).not.toHaveBeenCalled();
});

it("does not refetch when the parent recreates an equivalent request object", async () => {
  const r = renderHook(props => useTrainingAnalysisPeriods("owner", props, true), { initialProps: selection });
  await waitFor(() => expect(r.result.current.state).toBe("ready"));
  r.rerender({ ...selection, request: { ...selection.request, periods: selection.request.periods.map(period => ({ ...period })) } });
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it("reuses the same in-flight read during StrictMode setup replay", async () => {
  const r = renderHook(() => useTrainingAnalysisPeriods("owner", selection, true), { wrapper: StrictMode });
  await waitFor(() => expect(r.result.current.state).toBe("ready"));
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it("retries a failed read once without changing the submitted period", async () => {
  mocks.load.mockRejectedValueOnce(new Error("network"));
  const r = renderHook(() => useTrainingAnalysisPeriods("owner", selection, true));
  await waitFor(() => expect(r.result.current.state).toBe("error"));
  expect(track).toHaveBeenCalledWith("analysis_ready", expect.objectContaining({ outcome: "error" }));
  act(() => r.result.current.retry());
  await waitFor(() => expect(r.result.current.state).toBe("ready"));
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(track).toHaveBeenCalledWith("analysis_ready", expect.objectContaining({ outcome: "success" }));
  expect(mocks.load.mock.lastCall?.[2]).toEqual({ ...selection.request, includeCyclingDistanceObservations: true });
});

it("adds cycling distance opt-in to the one existing request, remains stable on rerender and leaves run/swim request bytes unchanged", async () => {
  const view = renderHook(props => useTrainingAnalysisPeriods("owner", props, true), {initialProps:selection});
  await waitFor(() => expect(view.result.current.state).toBe("ready"));
  expect(mocks.load).toHaveBeenCalledOnce();expect(mocks.load.mock.calls[0]![2]).toEqual({...selection.request,includeCyclingDistanceObservations:true});
  view.rerender({...selection,request:{...selection.request,periods:[...selection.request.periods]}});expect(mocks.load).toHaveBeenCalledOnce();view.unmount();
  for (const discipline of ["run","swim"] as const) {const value={...selection,request:{...selection.request,discipline}};const other=renderHook(()=>useTrainingAnalysisPeriods("owner",value,true));await waitFor(()=>expect(other.result.current.state).toBe("ready"));expect(mocks.load.mock.lastCall?.[2]).toEqual(value.request);other.unmount();}
});

it("keeps GAP pace opt-in manual and fences late responses after date selection changes", async () => {
  let resolveOld!: (value: any) => void;
  mocks.load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const r = renderHook((selected: TrainingAnalysisPeriodsSelection | null) => useTrainingAnalysisPeriods("owner", selected, true), { initialProps: null as TrainingAnalysisPeriodsSelection | null });
  expect(mocks.load).not.toHaveBeenCalled();
  const pace = { request: { discipline: "run" as const, includeRunningPaceZones: true as const, periods: selection.request.periods }, requestId: 1 };
  r.rerender(pace);
  expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, "owner", pace.request);
  r.rerender(null);
  await act(async () => resolveOld({ inputDigest: "old-date" }));
  expect(r.result.current.response).toBeNull();
  const next = { ...pace, request: { ...pace.request, periods: [{ fromInclusive: 2000, toExclusive: 9000 }] }, requestId: 2 };
  r.rerender(next);
  await waitFor(() => expect(r.result.current.response?.inputDigest).toBe("new"));
  expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, "owner", next.request);
});
