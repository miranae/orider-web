import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const app = {}, user = { uid: "owner", isAnonymous: false };
  return { app, user, auth: { app, currentUser: user as typeof user | null }, functions: { app }, ready: vi.fn(), invoke: vi.fn() };
});
vi.mock("./firebase", () => ({ auth: mocks.auth, functions: mocks.functions, ensureAppCheckReady: mocks.ready, getAppCheckToken: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.invoke }));
import { loadActivityNarrativeHistory } from "./activityNarrativeHistory";
beforeEach(() => { mocks.auth.currentUser = mocks.user; mocks.ready.mockReset().mockResolvedValue(undefined); mocks.invoke.mockReset(); });
describe("saved narrative reads", () => {
  it("reads a bounded history without invoking analysis generation", async () => {
    const data = { items: [{ revisionId: "a".repeat(64), generatedAt: 1, version: "legacy" }], selected: null, nextCursor: null };
    mocks.invoke.mockResolvedValue({ data });
    expect(await loadActivityNarrativeHistory("ride", "ko")).toEqual(data);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith({ activityId: "ride", lang: "ko" });
  });
  it("rejects a selected revision that does not match the request", async () => {
    mocks.invoke.mockResolvedValue({ data: { items: [], nextCursor: null, selected: { revisionId: "b".repeat(64), narrative: { summary: "old", segments: [], overall: { flags: [] } } } } });
    await expect(loadActivityNarrativeHistory("ride", "ko", "a".repeat(64))).rejects.toThrow("invalid_narrative_history");
  });
  it("rejects a response after replacement of the same user's SDK session", async () => {
    mocks.invoke.mockImplementation(async () => {
      mocks.auth.currentUser = { ...mocks.user };
      return { data: { items: [], nextCursor: null, selected: null } };
    });
    await expect(loadActivityNarrativeHistory("ride", "ko")).rejects.toMatchObject({ code: "auth/session-changed" });
  });
  it("does not request private history while signed out", async () => {
    mocks.auth.currentUser = null;
    await expect(loadActivityNarrativeHistory("ride", "ko")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
