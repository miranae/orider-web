import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadPublicAthleteTotals, parsePublicAthleteTotals, callAthleteProfile, loadAthleteProfilePreview, parseAthleteProfile, type AthletePreviewCursor } from "./athleteProfile";
import { mockCallableInvocations, setCallableResult as setResult, setCallableImplementation } from "../__tests__/mocks/firebase";
import * as errorLogger from "./errorLogger";
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

it("loads public totals without owner authentication and fences guest-to-login transitions", async () => {
  services.auth.currentUser = null;
  setCallableResult("getPublicAthleteTotals", root());
  await expect(loadPublicAthleteTotals(services, "target", () => true)).resolves.toMatchObject({ count: 4 });
  setCallableImplementation("getPublicAthleteTotals", () => { services.auth.currentUser = { uid: "viewer" } as never; return root(); });
  await expect(loadPublicAthleteTotals(services, "target", () => true)).rejects.toThrow("session-changed");
});
it("records a normal web totals callable failure that arrives after the request deadline", async () => {
  vi.useFakeTimers();
  services.auth.currentUser = null;
  let rejectCall!: (reason: Error) => void;
  setCallableImplementation("getPublicAthleteTotals", () => new Promise<never>((_, reject) => { rejectCall = reject; }));
  const log = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);
  try {
    const request = expect(loadPublicAthleteTotals(services, "target", () => true)).rejects.toThrow("athlete-profile-timeout");
    await vi.advanceTimersByTimeAsync(12000);
    await request;
    const failure = Object.assign(new Error("late service failure"), { code: "functions/unavailable" });
    rejectCall(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(log.mock.calls.some(([source, error]) => source === "athleteProfile.publicTotalsLateFailure" && error === failure)).toBe(true);
  } finally { vi.useRealTimers(); log.mockRestore(); }
});
it("sends embedded guest totals without credentials even when the SDK user changes during the request", async () => {
  services.auth.currentUser = null;
  services.scope = "embedded";
  services.isSessionApproved = viewer => viewer === null;
  services.functions = { app: { options: { projectId: "test-project" } } } as FirebaseServices["functions"];
  services.getAppCheckToken = vi.fn().mockResolvedValue("embedded-app-check");
  const lateUser = { uid: "late", getIdToken: vi.fn().mockResolvedValue("unapproved") };
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    services.auth.currentUser = lateUser as never;
    return Response.json({ result: root() });
  });
  try {
    await expect(loadPublicAthleteTotals(services, "target", () => true)).rejects.toThrow("session-changed");
    expect(request).toHaveBeenCalledWith(expect.stringMatching(/\/getPublicAthleteTotals$/), expect.objectContaining({
      method: "POST", credentials: "omit", redirect: "error",
      headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": "embedded-app-check" },
      body: JSON.stringify({ data: { userId: "target" } }),
    }));
    expect(lateUser.getIdToken).not.toHaveBeenCalled();
    expect(mockCallableInvocations).toHaveLength(0);
  } finally {
    request.mockRestore();
  }
});
it("drops an embedded totals request when approval changes while the captured viewer token is pending", async () => {
  let resolveToken!: (value: string) => void;
  const token = new Promise<string>(resolve => { resolveToken = resolve; });
  const approved = { uid: "viewer", getIdToken: vi.fn(() => token) };
  const replacement = { uid: "viewer", getIdToken: vi.fn().mockResolvedValue("new-session") };
  services.auth.currentUser = approved as never;
  services.scope = "embedded";
  services.isSessionApproved = viewer => viewer === (approved as never);
  services.getAppCheckToken = vi.fn().mockResolvedValue("embedded-app-check");
  const request = vi.spyOn(globalThis, "fetch");
  try {
    const pending = loadPublicAthleteTotals(services, "target", () => true);
    await Promise.resolve();
    expect(approved.getIdToken).toHaveBeenCalledOnce();
    services.auth.currentUser = replacement as never;
    resolveToken("previous-session");
    await expect(pending).rejects.toThrow("session-changed");
    expect(request).not.toHaveBeenCalled();
    expect(replacement.getIdToken).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
  }
});
it("validates public pending/failed without inventing zero and rejects malformed ready values", () => {
  for (const state of ["pending", "failed"]) expect(parsePublicAthleteTotals({ schemaVersion: 1, state, revision: 0 })).toEqual({ schemaVersion: 1, state, revision: 0 });
  expect(parsePublicAthleteTotals({ schemaVersion: 1, state: "ready", revision: 0 })).toBeNull();
  expect(parsePublicAthleteTotals({ ...root(), unknownTimeCount: 10 })).toBeNull();
});
