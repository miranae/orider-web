import { httpsCallable } from "firebase/functions";
import { describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { setCallableImplementation } from "../__tests__/mocks/firebase";
import { getClubCafeSchedule } from "./clubCafeSchedule";
function services() {
  return { auth: { currentUser: { uid: "rider" } }, functions: { app: { name: "isolated" } }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">;
}
describe("cafe schedule session isolation", () => {
  it("does not send a request after the user changes during App Check", async () => {
    const scoped = services();
    let ready!: () => void;
    scoped.ensureAppCheckReady = () => new Promise(resolve => { ready = resolve; });
    const before = vi.mocked(httpsCallable).mock.calls.length;
    const result = getClubCafeSchedule("club-lara", scoped);
    scoped.auth.currentUser = { uid: "rider" } as typeof scoped.auth.currentUser;
    ready();
    await expect(result).rejects.toThrow("account_changed");
    expect(vi.mocked(httpsCallable).mock.calls.length).toBe(before);
  });
  it("rejects a late response from a replaced same-uid user object", async () => {
    const scoped = services();
    let finish!: (value: unknown) => void;
    setCallableImplementation("getClubCafeSchedule", () => new Promise(resolve => { finish = resolve; }));
    const result = getClubCafeSchedule("club-lara", scoped);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    scoped.auth.currentUser = { uid: "rider" } as typeof scoped.auth.currentUser;
    finish({ data: { schedule: null } });
    await expect(result).rejects.toThrow("account_changed");
  });
});
