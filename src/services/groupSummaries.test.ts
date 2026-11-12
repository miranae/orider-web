import { describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { setCallableResult } from "../__tests__/mocks/firebase";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resolveMyGroupSummaries } from "./groupSummaries";
const services = { auth: { currentUser: null }, functions: { injected: true }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
describe("own club summary client", () => {
  it("uses the injected app session instead of the web singleton", async () => {
    setCallableResult("resolveMyGroupSummaries", { data: { groups: [{ id: "a", name: "A" }] } });
    expect(await resolveMyGroupSummaries(services, ["a"])).toEqual([{ id: "a", name: "A" }]);
    expect(httpsCallable).toHaveBeenCalledWith(services.functions, "resolveMyGroupSummaries");
    expect(services.ensureAppCheckReady).toHaveBeenCalled();
  });
  it.each([{ groups: [{ id: "other" }] }, { groups: [{ id: "a", inviteCode: "secret" }] }, {}])("rejects responses outside its safe contract %j", async data => {
    setCallableResult("resolveMyGroupSummaries", { data });
    await expect(resolveMyGroupSummaries(services, ["a"])).rejects.toThrow("Invalid own club summaries response");
  });
});
