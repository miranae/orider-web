import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { usePowerCurvePeriods, type PowerCurvePeriodsSelection } from "./usePowerCurvePeriods";
const mocks = vi.hoisted(() => ({ uid: "owner", anonymous: false, services: { auth: { currentUser: { uid: "owner", isAnonymous: false } } }, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: mocks.uid, isAnonymous: mocks.anonymous } }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../services/powerCurvePeriods", async original => ({ ...await original<typeof import("../services/powerCurvePeriods")>(), loadPowerCurvePeriods: mocks.load }));
const selection = { request: { unit: "W" as const, periods: [{ fromInclusive: 1000, toExclusive: 10000 }] }, requestId: 1 };
beforeEach(() => { mocks.uid = "owner"; mocks.anonymous = false; mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } }; mocks.load.mockReset().mockResolvedValue({ inputDigest: "new" }); });
it("makes zero calls by default, without selection, or for foreign/anonymous owner", () => {
  const r = renderHook(props => usePowerCurvePeriods(props.owner, props.selection, props.enabled), { initialProps: { owner: "owner", selection, enabled: false } });
  expect(r.result.current.state).toBe("preparing");
  r.rerender({ owner: "foreign", selection, enabled: true }); expect(r.result.current.state).toBe("idle");
  mocks.anonymous = true; r.rerender({ owner: "owner", selection, enabled: true });
  expect(mocks.load).not.toHaveBeenCalled();
});
it.each(["owner", "selection", "services", "session"])("rejects stale responses through %s A→B→A", async field => {
  let resolveOld!: (value: any) => void;
  mocks.load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const firstServices = mocks.services;
  const r = renderHook(props => usePowerCurvePeriods("owner", props, true), { initialProps: selection });
  if (field === "owner") mocks.uid = "other";
  if (field === "session") mocks.services.auth.currentUser = { uid: "owner", isAnonymous: false };
  if (field === "services") mocks.services = { auth: { currentUser: { uid: "owner", isAnonymous: false } } };
  r.rerender(field === "selection" ? { ...selection, requestId: 2 } : selection);
  if (field === "owner") mocks.uid = "owner";
  if (field === "services") mocks.services = firstServices;
  r.rerender(selection);
  await waitFor(() => expect(r.result.current.response?.inputDigest).toBe("new"));
  await act(async () => resolveOld({ inputDigest: "old" }));
  expect(r.result.current.response?.inputDigest).toBe("new");
});

it("does not load until a valid explicit selection is submitted", () => {
  const r = renderHook(() => usePowerCurvePeriods("owner", null, true));
  expect(r.result.current.state).toBe("idle"); expect(mocks.load).not.toHaveBeenCalled();
});

it("binds opt-in to explicit selection and fences a late W response after W/kg selection", async () => {
  let resolveWatts!: (value: any) => void;
  mocks.load.mockReturnValueOnce(new Promise(resolve => { resolveWatts = resolve; }));
  const r = renderHook((selected: PowerCurvePeriodsSelection | null) => usePowerCurvePeriods("owner", selected, true), { initialProps: selection as PowerCurvePeriodsSelection | null });
  expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, "owner", selection.request);
  const normalized = { request: { ...selection.request, includeWeightNormalized: true }, requestId: 2 };
  r.rerender(normalized);
  await waitFor(() => expect(r.result.current.response?.inputDigest).toBe("new"));
  expect(mocks.load).toHaveBeenLastCalledWith(mocks.services, "owner", normalized.request);
  await act(async () => resolveWatts({ inputDigest: "old-watts" }));
  expect(r.result.current.response?.inputDigest).toBe("new");
  const count = mocks.load.mock.calls.length;
  r.rerender(null);
  expect(r.result.current.state).toBe("idle");
  expect(mocks.load).toHaveBeenCalledTimes(count);
});
