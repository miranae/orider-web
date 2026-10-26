import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { SavedActivityAnalysis } from "../services/activityReanalysis";
import { useSavedActivityAnalysisSelection } from "./useSavedActivityAnalysisSelection";
const f = vi.hoisted(() => { const user = { uid: "owner" }; return { user: user as typeof user | null, services: { auth: { currentUser: user as typeof user | null } } }; });
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: f.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => f.services }));
const saved = { revisionId: "old", metrics: { computedAt: 123, version: 1 } } as SavedActivityAnalysis;
beforeEach(() => { f.user = { uid: "owner" }; f.services = { auth: { currentUser: f.user } }; });
it("rejects late callbacks after activity or exact SDK session changes and never restores an old identity", () => {
  const hook = renderHook(({ id }) => useSavedActivityAnalysisSelection(id), { initialProps: { id: "a" } });
  const oldSelect = hook.result.current.select;
  act(() => oldSelect(saved)); expect(hook.result.current.selected).toBe(saved);
  hook.rerender({ id: "b" }); act(() => oldSelect(saved)); expect(hook.result.current.selected).toBeUndefined();
  hook.rerender({ id: "a" }); expect(hook.result.current.selected).toBeUndefined();
  const firstSession = hook.result.current.select;
  f.services.auth.currentUser = { uid: "owner" };
  act(() => firstSession(saved)); expect(hook.result.current.selected).toBeUndefined();
  hook.rerender({ id: "a" }); act(() => firstSession(saved)); expect(hook.result.current.selected).toBeUndefined();
});
it("keeps stored values across ordinary rerenders without deriving validity from clocks or versions", () => {
  const hook = renderHook(() => useSavedActivityAnalysisSelection("a"));
  act(() => hook.result.current.select(saved)); hook.rerender();
  expect(hook.result.current.selected?.metrics.computedAt).toBe(123);
  expect(hook.result.current.selected?.metrics.version).toBe(1);
  act(() => hook.result.current.select(null)); expect(hook.result.current.selected).toBeUndefined();
});

it("retains an authorized anonymous selection only within the same activity and SDK session",()=>{
 f.user=null;f.services.auth.currentUser=null;
 const hook=renderHook(()=>useSavedActivityAnalysisSelection("a"));const select=hook.result.current.select;
 act(()=>select(saved));expect(hook.result.current.selected).toBe(saved);
 f.user={uid:"visitor"};f.services.auth.currentUser=f.user;hook.rerender();
 expect(hook.result.current.selected).toBeUndefined();act(()=>select(saved));expect(hook.result.current.selected).toBeUndefined();
});
