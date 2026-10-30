import { act, renderHook, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { usePeriodControls } from "./usePeriodControls";
import { validPowerPeriodControls, validTrainingPeriodControls, type PowerPeriodControls } from "../features/fitness/components/periodControls";
const mock = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "owner", isAnonymous: false, metadata: { creationTime: "2026-01-01" } }, app: { name: "demo", options: { projectId: "demo-periods" } } } } }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mock.services }));
const initial = (): PowerPeriodControls => ({ skillsMode: false, comparison: null, drafts: [{ preset: "custom", from: "2025-01-01", through: "2025-02-01" }], unit: "W", duration: 300 });
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("crypto", webcrypto); mock.services.auth.currentUser = { uid: "owner", isAnonymous: false, metadata: { creationTime: "2026-01-01" } }; });
it("restores only controls across source navigation/unmount and refresh, scoped to account", async () => {
 const first = renderHook(() => usePeriodControls("owner", "power", initial, validPowerPeriodControls));
 await act(async () => { first.result.current[1](v => ({ ...v, unit: "W/kg", duration: 60 })); });
 await waitFor(() => expect(sessionStorage.length).toBe(1)); first.unmount();
 const stored = sessionStorage.getItem(sessionStorage.key(0)!)!;
 expect(sessionStorage.key(0)).not.toContain("owner"); expect(Object.keys(JSON.parse(stored)).sort()).toEqual(["comparison", "drafts", "duration", "skillsMode", "unit"]);
 const back = renderHook(() => usePeriodControls("owner", "power", initial, validPowerPeriodControls));
 await waitFor(() => expect(back.result.current[0].unit).toBe("W/kg")); expect(back.result.current[0].duration).toBe(60); back.unmount();
 mock.services.auth.currentUser = { ...mock.services.auth.currentUser, uid: "other" };
 const other = renderHook(() => usePeriodControls("other", "power", initial, validPowerPeriodControls));
 await act(async () => {}); expect(other.result.current[0].unit).toBe("W");
});
it("invalid dates, future ranges, unknown fields and duration bounds cannot restore", () => {
 for (const patch of [{duration: 0}, {duration: Infinity}, {unit:"watts"}, {metrics: { watts:300 }}, {drafts:[{preset:"custom",from:"2025-02-30",through:"2025-03-01"}]}, {drafts:[{preset:"custom",from:"2999-01-01",through:"2999-01-02"}]}]) expect(validPowerPeriodControls({...initial(),...patch})).toBeNull();
 expect(validTrainingPeriodControls({preset:null,ranges:[{from:"2025-02-01",through:"2025-01-01"},{from:"2025-01-01",through:"2025-02-01"}]})).toBeNull();
});
it("storage failure keeps direct entry controls usable", async () => {
 const spy = vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => { throw new Error("disabled"); });
 const view = renderHook(() => usePeriodControls("owner", "power", initial, validPowerPeriodControls));
 await act(async () => view.result.current[1](v => ({...v,duration: 60}))); expect(view.result.current[0].duration).toBe(60); spy.mockRestore();
});
it("late restore cannot replace a newer explicit control edit", async () => {
 let finish!: (v: ArrayBuffer) => void;
 vi.stubGlobal("crypto", { subtle: { digest: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) } });
 const key = `orider-period-controls-v1-${"00".repeat(32)}`;
 sessionStorage.setItem(key, JSON.stringify({...initial(),unit:"W/kg"}));
 const view = renderHook(() => usePeriodControls("owner", "power", initial, validPowerPeriodControls));
 act(() => view.result.current[1](value => ({...value,duration:60})));
 await act(async () => finish(new ArrayBuffer(32)));
 expect(view.result.current[0]).toMatchObject({unit:"W",duration:60});
 expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({unit:"W",duration:60});
});
