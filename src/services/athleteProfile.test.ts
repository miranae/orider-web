import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { callAthleteProfile, loadAthleteProfilePreview, parseAthleteProfile, type AthletePreviewCursor } from "./athleteProfile";
import { mockCallableInvocations, setCallableResult as setResult, setCallableImplementation } from "../__tests__/mocks/firebase";
const setCallableResult = (name: string, data: unknown) => setResult(name, { data: name === "getAthleteProfilePreview" ? { pendingCount: 0, coverageComplete: true, retryCursor: null, ...(data as object) } : data });
let services: FirebaseServices;
beforeEach(() => { services = { auth: { currentUser: { uid: "owner" } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices; });
const root = () => ({ schemaVersion: 1, ownerUid: "owner", epoch: "epoch", state: "ready", revision: 1, count: 4, distance: 1000, timeDisplayMillis: 2000, elevation: 3, unknownDistanceCount: 0, unknownTimeCount: 1, unknownElevationCount: 0 });
const cursor = (id: string, order: "all" | "recent" = "all", startTime: number | null = null): AthletePreviewCursor => ({ epoch: "epoch", id, order, startTime });
it("validates owner numeric totals without computing a replacement from activity records", () => {
  expect(parseAthleteProfile(root(), "owner")).toEqual(root());
  expect(parseAthleteProfile({ ...root(), state: "pending" }, "owner")?.state).toBe("pending");
  expect(parseAthleteProfile({ ...root(), state: "failed" }, "owner")?.state).toBe("failed");
  for (const patch of [{ ownerUid: "other" }, { count: NaN }, { unknownTimeCount: 5 }, { epoch: "" }, { timeDisplayMillis: Infinity }, { revision: -1 }]) expect(parseAthleteProfile({ ...root(), ...patch }, "owner")).toBeNull();
});
it("accepts empty sparse pages and forwards only one explicit raw inspection request", async () => {
  const data = { pendingCount: 0, coverageComplete: true, retryCursor: null, items: [], scope: "all", complete: false, nextCursor: cursor("legacy:한글.기록") };
  setCallableResult("getAthleteProfilePreview", data);
  expect(await loadAthleteProfilePreview(services, "owner", "photos", "epoch", null, true, () => true)).toEqual(data);
  expect(mockCallableInvocations).toEqual([{ name: "getAthleteProfilePreview", data: { kind: "photos", all: true } }]);
});
it.each(["legacy:한글.기록", "a".repeat(1000), "é".repeat(750)])("round trips valid Firestore ID %#", async id => {
  const next = cursor(id);
  setCallableResult("getAthleteProfilePreview", { items: [], scope: "all", complete: false, nextCursor: next });
  await loadAthleteProfilePreview(services, "owner", "photos", "epoch", null, true, () => true);
  setCallableResult("getAthleteProfilePreview", { items: [], scope: "all", complete: true, nextCursor: null });
  await loadAthleteProfilePreview(services, "owner", "photos", "epoch", next, true, () => true);
  expect(mockCallableInvocations[1]!.data).toEqual({ kind: "photos", cursor: next, all: true });
});
it.each([".", "..", "a/b", "é".repeat(751)])("rejects invalid Firestore cursor ID %#", async id => {
  setCallableResult("getAthleteProfilePreview", { items: [], scope: "all", complete: false, nextCursor: cursor(id) });
  await expect(loadAthleteProfilePreview(services, "owner", "photos", "epoch", null, true, () => true)).rejects.toThrow("invalid-page");
});
it("keeps recent/all cursor namespaces isolated and checks both timestamp and ID advance", async () => {
  await expect(loadAthleteProfilePreview(services, "owner", "photos", "epoch", cursor("a"), false, () => true)).rejects.toThrow("invalid-cursor");
  expect(mockCallableInvocations).toHaveLength(0);
  for (const next of [cursor("a", "recent", 10), cursor("z", "recent", 11), { ...cursor("a", "recent", 9), epoch: "other" }]) {
    setCallableResult("getAthleteProfilePreview", { items: [], scope: "recent", complete: false, nextCursor: next });
    await expect(loadAthleteProfilePreview(services, "owner", "photos", "epoch", cursor("a", "recent", 10), false, () => true)).rejects.toThrow("invalid-page");
  }
});
it("accepts supplementary Unicode advance in raw ID order", async () => {
  setCallableResult("getAthleteProfilePreview", { items: [], scope: "all", complete: false, nextCursor: cursor("\u{10000}") });
  await expect(loadAthleteProfilePreview(services, "owner", "photos", "epoch", cursor("\ue000"), true, () => true)).resolves.toBeTruthy();
});
it("rejects payload overflow and false completion without a fallback read", async () => {
  for (const patch of [{ complete: true }, { items: Array.from({ length: 31 }, () => ({ activityId: "a", id: "p", url: "https://image.test/p", caption: null })) }]) {
    setCallableResult("getAthleteProfilePreview", { items: [], scope: "all", complete: false, nextCursor: cursor("z"), ...patch });
    await expect(loadAthleteProfilePreview(services, "owner", "photos", "epoch", null, true, () => true)).rejects.toThrow("invalid-page");
  }
  expect(mockCallableInvocations).toHaveLength(2);
});
it("never sends a callable after abandoned/timed-out AppCheck and fences same-UID replacement responses", async () => {
  vi.useFakeTimers(); let release!: () => void;
  vi.mocked(services.ensureAppCheckReady).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  try {
    const pending = expect(callAthleteProfile(services, "owner", "ensureAthleteProfile", {}, () => true)).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(12000); await pending; release(); await Promise.resolve();
    expect(mockCallableInvocations).toHaveLength(0);
    await expect(callAthleteProfile(services, "owner", "ensureAthleteProfile", {}, () => false)).rejects.toThrow("session-changed");
    expect(mockCallableInvocations).toHaveLength(0);
    setCallableImplementation("ensureAthleteProfile", () => { services.auth.currentUser = { uid: "owner" } as never; return root(); });
    await expect(callAthleteProfile(services, "owner", "ensureAthleteProfile", {}, () => true)).rejects.toThrow("session-changed");
  } finally { vi.useRealTimers(); }
});
