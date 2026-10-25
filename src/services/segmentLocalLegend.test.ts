import { expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import { loadSegmentLocalLegend } from "./segmentLocalLegend";
const response = { windowStartMs: 1, windowEndMs: 100, windowWeeks: 13, population: "authorized_native_outdoor_bike", coverage: "complete", scannedCount: 3, scanLimit: 500, riderCount: 1, totalEfforts: 3, leader: { userId: "u", nickname: "", effortCount: 3 }, minimumEfforts: 3, globalRankAvailable: false };
const services = () => ({ auth: { currentUser: { uid: "viewer", isAnonymous: false } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) }) as unknown as FirebaseServices;
it("accepts anonymous verified leader but rejects a winner in incomplete coverage", async () => {
  setCallableResult("getSegmentLocalLegend", { data: response });
  await expect(loadSegmentLocalLegend(services(), "viewer", "s")).resolves.toMatchObject({ leader: { nickname: "" } });
  setCallableResult("getSegmentLocalLegend", { data: { ...response, coverage: "partial" } });
  await expect(loadSegmentLocalLegend(services(), "viewer", "s")).rejects.toThrow("invalid_local_legend");
});
it("drops a response if the signed in account changed", async () => {
  const s = services();
  setCallableImplementation("getSegmentLocalLegend", () => { Object.assign(s.auth.currentUser!, { uid: "other" }); return { data: response }; });
  await expect(loadSegmentLocalLegend(s, "viewer", "s")).rejects.toThrow("account_changed");
});
