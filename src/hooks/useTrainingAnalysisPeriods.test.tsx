import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useTrainingAnalysisPeriods } from "./useTrainingAnalysisPeriods";
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, services: {}, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../services/trainingAnalysisPeriods", async original => ({ ...await original<typeof import("../services/trainingAnalysisPeriods")>(), loadTrainingAnalysisPeriods: mocks.load, trainingAnalysisPeriodsAvailable: () => true }));
const selection = { request: { discipline: "bike" as const, periods: [{ fromInclusive: 1000, toExclusive: 10000 }] }, requestId: 1 };
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.services = {}; mocks.load.mockReset().mockResolvedValue({ inputDigest: "new" }); });
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
  act(() => r.result.current.retry());
  await waitFor(() => expect(r.result.current.state).toBe("ready"));
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.load.mock.lastCall?.[2]).toEqual(selection.request);
});
