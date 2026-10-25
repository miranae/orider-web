import { act, renderHook, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { useRouteHistoryControls, validRouteHistoryControls } from "./useRouteHistoryControls";
const mock = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "owner", isAnonymous: false, metadata: { creationTime: "2026-01-01" } }, app: { name: "demo", options: { projectId: "demo-routes" } } } } }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mock.services }));
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("crypto", webcrypto); mock.services.auth.currentUser = { uid: "owner", isAnonymous: false, metadata: { creationTime: "2026-01-01" } }; });
it.each(["group", "index"] as const)("restores %s controls on return, but not a replaced SDK session", async kind => {
 const first = renderHook(() => useRouteHistoryControls("owner", "anchor", kind));
 await act(async () => first.result.current[1]({ open: true, observed: true, year: 2025 }));
 await waitFor(() => expect(sessionStorage.length).toBe(1)); first.unmount();
 const raw = sessionStorage.getItem(sessionStorage.key(0)!)!;
 expect(JSON.parse(raw)).toEqual({ open: true, observed: true, year: 2025 }); expect(sessionStorage.key(0)).not.toContain("anchor");
 const back = renderHook(() => useRouteHistoryControls("owner", "anchor", kind));
 await waitFor(() => expect(back.result.current[0].year).toBe(2025)); expect(back.result.current[0].open).toBe(true);
 mock.services.auth.currentUser = { ...mock.services.auth.currentUser }; back.rerender();
 expect(back.result.current[0]).toEqual({ open: false, observed: false, year: null });
 await act(async () => {}); expect(back.result.current[0].year).toBeNull();
});
it("rejects future years, extra payloads and malformed control state", () => {
 for(const patch of [{year:2999},{year:0},{year:2025.5},{open:1},{members:[]},{geometry:[]}]) expect(validRouteHistoryControls({open:true,observed:false,year:2025,...patch})).toBeNull();
});
