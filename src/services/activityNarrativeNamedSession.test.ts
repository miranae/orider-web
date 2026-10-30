import { beforeEach, expect, it, vi } from "vitest";
import type { ActivityNarrativeServices } from "./activityNarrativeSession";
const f = vi.hoisted(() => ({ defaultReady: vi.fn(), invoke: vi.fn(), callable: vi.fn(), config: { aiApiBase: undefined as string | undefined } }));
vi.mock("./firebase", () => ({ auth: undefined, functions: undefined, ensureAppCheckReady: f.defaultReady, getAppCheckToken: vi.fn() }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => f.config }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: () => () => {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: (...args: unknown[]) => { f.callable(...args); return f.invoke; } }));
vi.mock("./analytics", () => ({ track: vi.fn() }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn() }));
import { peekActivityNarrative, generateActivityNarrative } from "./activityNarrativeApi";
import { loadActivityNarrativeHistory } from "./activityNarrativeHistory";
import { captureActivityNarrativeSession, isActivityNarrativeAccessRevoked } from "./activityNarrativeSession";
function named() {
  const app = { name: "named" }, user = { uid: "same-owner", isAnonymous: false, getIdToken: vi.fn().mockResolvedValue("test-only") };
  return { auth: { app, currentUser: user }, functions: { app }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined), getAppCheckToken: vi.fn().mockResolvedValue(null) } as unknown as ActivityNarrativeServices;
}
beforeEach(() => { vi.clearAllMocks(); f.config.aiApiBase = undefined; });
it("reads named cache and history without initializing or requesting default Firebase", async () => {
  const s = named(); f.invoke.mockResolvedValueOnce({ data: { hit: false } }).mockResolvedValueOnce({ data: { items: [], selected: null, nextCursor: null } });
  await expect(peekActivityNarrative({ activityId: "ride", lang: "ko", cacheOnly: true }, s)).resolves.toEqual({ hit: false });
  await loadActivityNarrativeHistory("ride", "ko", undefined, undefined, s);
  expect(f.callable).toHaveBeenNthCalledWith(1, s.functions, "getActivityNarrative");
  expect(f.callable).toHaveBeenNthCalledWith(2, s.functions, "getActivityNarrativeHistory", { timeout: 10000 });
  expect(f.invoke.mock.calls[0][0]).toMatchObject({ cacheOnly: true });
  expect(f.defaultReady).not.toHaveBeenCalled();
});
it("does not coalesce the same UID and activity between distinct Firebase apps", async () => {
  const a = named(), b = named(); let release!: (value: unknown) => void;
  f.invoke.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValueOnce({ data: { hit: false } });
  const first = peekActivityNarrative({ activityId: "same", lang: "ko", cacheOnly: true }, a);
  await vi.waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(1));
  await peekActivityNarrative({ activityId: "same", lang: "ko", cacheOnly: true }, b);
  expect(f.callable.mock.calls.map(c => c[0])).toEqual([a.functions, b.functions]);
  release({ data: { hit: true, summary: "A only" } }); await first;
  expect(captureActivityNarrativeSession(a).key).not.toBe(captureActivityNarrativeSession(b).key);
});
it("blocks dispatch after named AppCheck waits across same UID SDK replacement", async () => {
  const s = named(); let release!: () => void;
  vi.mocked(s.ensureAppCheckReady).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const promise = loadActivityNarrativeHistory("ride", "ko", undefined, undefined, s);
  s.auth.currentUser = { ...s.auth.currentUser! };
  release(); await expect(promise).rejects.toMatchObject({ code: "auth/session-changed" });
  expect(f.invoke).not.toHaveBeenCalled();
});
it("rejects a late named response and only invokes generation when explicitly requested", async () => {
  const s = named();
  f.invoke.mockImplementationOnce(async () => { s.auth.currentUser = { ...s.auth.currentUser! }; return { data: { summary: "old session" } }; });
  await expect(generateActivityNarrative({ activityId: "ride", lang: "ko", forceRefresh: true }, s)).rejects.toMatchObject({ code: "auth/session-changed" });
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith({ activityId: "ride", lang: "ko", forceRefresh: true });
});
it.each(["narrative_streams_not_ready", "narrative_streams_unreadable", "narrative_distance_unreconciled", "narrative_segments_unavailable", "narrative_saved_metrics_unavailable", "narrative_source_changed", "narrative_generation_inputs_changed"])("retains saved text only for classified generation failure %s", reason => {
  expect(isActivityNarrativeAccessRevoked({ code: "functions/failed-precondition", details: { reason } })).toBe(false);
});
it.each([undefined, "account-deleting", "unknown", "owner_changed"])("fails closed for unclassified/deletion precondition %s", reason => {
  expect(isActivityNarrativeAccessRevoked({ code: "failed-precondition", details: { reason } })).toBe(true);
});
