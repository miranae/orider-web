import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { httpsCallable } from "firebase/functions";
import * as runtimeConfig from "./runtimeConfig";
import { captureError } from "./sentry";
import * as sentry from "./sentry";
import { mockCallableInvocations } from "../__tests__/mocks/firebase";
import { __resetClientErrorDedupeForTests, logClientError } from "./errorLogger";
import { ensureAppCheckReady } from "./firebase";

// Global cache setup already imports the logger, so spy on its existing binding.
vi.spyOn(sentry, "captureError").mockImplementation(() => undefined);

describe("logClientError", () => {
  beforeEach(() => {
    __resetClientErrorDedupeForTests();
    vi.mocked(captureError).mockClear();
    vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  });

  it("keeps Sentry diagnostics without touching uninitialized injected Firebase services", () => {
    const services = { auth: undefined, functions: undefined, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
    expect(() => logClientError("fixture.mapbox", new Error("mapbox_http_failure_401"), {}, services)).not.toThrow();
    expect(captureError).toHaveBeenCalledOnce();
    expect(services.ensureAppCheckReady).not.toHaveBeenCalled();
    expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(0);
  });

  it("stage retains deduplicated Sentry diagnostics without a server backup request", async () => {
    const runtime = vi.spyOn(runtimeConfig, "getRuntimeConfig").mockReturnValue({ ...runtimeConfig.getRuntimeConfig(), appEnvironment: "stage" });
    try {
      logClientError("stage.failure", new Error("stage error"));
      logClientError("stage.failure", new Error("stage error"));
      await Promise.resolve();
      expect(captureError).toHaveBeenCalledTimes(1);
      expect(ensureAppCheckReady).not.toHaveBeenCalled();
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(0);
    } finally { runtime.mockRestore(); }
  });

  it("keeps a new sign-in's first error when Firebase reuses the same User object", async () => {
    let finishOldAppCheck!: () => void;
    const user = { uid: "owner", metadata: { lastSignInTime: "old" } };
    const appCheck = vi.fn().mockResolvedValue(undefined)
      .mockReturnValueOnce(new Promise<void>(resolve => { finishOldAppCheck = resolve; }));
    const services = { auth: { currentUser: user }, functions: {}, ensureAppCheckReady: appCheck } as unknown as FirebaseServices;
    const error = new Error("map image failed");
    logClientError("map.image.signed-in", error, {}, services);
    user.metadata.lastSignInTime = "new";
    logClientError("map.image.signed-in", error, {}, services);
    finishOldAppCheck();

    expect(captureError).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(1));
  });

  it("sends an identical immediate error only once", async () => {
    const error = new Error("INTERNAL ASSERTION FAILED: Unexpected state");

    for (let i = 0; i < 20; i += 1) {
      logClientError("useActivities.initialLoad.first", error, { attempt: i });
    }

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(ensureAppCheckReady).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(1);
    });
  });

  it("does not merge different sources", async () => {
    const error = new Error("same message");

    logClientError("source.a", error);
    logClientError("source.b", error);

    expect(captureError).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(2);
    });
  });

  it("waits for App Check without blocking the caller before invoking the callable", async () => {
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValueOnce(new Promise<void>((resolve) => { resolveReady = resolve; }));

    logClientError("source.pending", new Error("pending"));

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(0);

    resolveReady();
    await vi.waitFor(() => {
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(1);
    });
  });

  it("keeps Sentry-only logging when App Check readiness rejects", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValueOnce(new Error("app-check/token-timeout"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logClientError("source.rejected", new Error("rejected"));

    expect(captureError).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});


it("uses injected logging transport and drops a stale SDK user after AppCheck", async () => {
  let ready!: () => void;
  const services = { auth: { currentUser: { uid: "owner" } }, functions: { app: { name: "named" } },
    ensureAppCheckReady: vi.fn(() => new Promise<void>(resolve => { ready = resolve; })) } as unknown as FirebaseServices;
  logClientError("named.pending", new Error("pending"), {}, services);
  services.auth.currentUser = { ...services.auth.currentUser! };
  ready(); await Promise.resolve(); await Promise.resolve();
  expect(httpsCallable).not.toHaveBeenCalledWith(services.functions, "logClientError");
  vi.mocked(services.ensureAppCheckReady).mockResolvedValue(undefined);
  logClientError("named.current", new Error("current"), {}, services);
  await vi.waitFor(() => expect(httpsCallable).toHaveBeenCalledWith(services.functions, "logClientError"));
});

it("keeps contextual diagnostics when a request's auth session ended before it failed", () => {
  const services = { auth: { currentUser: { uid: "new" } }, functions: {}, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
  const viewer = { uid: "old" } as FirebaseServices["auth"]["currentUser"];
  const error = new Error("course read failed");
  logClientError("course.oldSession", error, { courseId: "course" }, services, viewer);
  expect(captureError).toHaveBeenCalledWith(error, { tags: { source: "course.oldSession" }, extra: { courseId: "course" } });
  expect(services.ensureAppCheckReady).not.toHaveBeenCalled();
});

it("keeps diagnostics but skips the old callable when its request scope expires during App Check", async () => {
  let resolveReady!: () => void;
  const services = { auth: { currentUser: { uid: "owner" } }, functions: { app: { name: "old-map" } },
    ensureAppCheckReady: vi.fn(() => new Promise<void>(resolve => { resolveReady = resolve; })) } as unknown as FirebaseServices;
  let current = true;
  logClientError("map.superseded", new Error("map failure"), {}, services, services.auth.currentUser, "", () => current);
  current = false;
  resolveReady();
  await Promise.resolve();
  await Promise.resolve();
  expect(captureError).toHaveBeenCalled();
  expect(httpsCallable).not.toHaveBeenCalledWith(services.functions, "logClientError");
});

it("does not suppress the first identical error from a new injected app", () => {
  __resetClientErrorDedupeForTests();
  vi.mocked(captureError).mockClear();
  const first = { auth: { currentUser: null }, functions: {}, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
  const next = { ...first, functions: {} as FirebaseServices["functions"], ensureAppCheckReady: vi.fn() };
  const error = new Error("same map failure");
  logClientError("map.sdk", error, {}, first, null, "", () => false);
  logClientError("map.sdk", error, {}, next, null, "", () => true);
  expect(captureError).toHaveBeenCalledTimes(2);
  expect(first.ensureAppCheckReady).not.toHaveBeenCalled();
  expect(next.ensureAppCheckReady).toHaveBeenCalledOnce();
});

it("uses only the approved viewer's token for the embedded backup when Sentry is unconfigured", async () => {
  __resetClientErrorDedupeForTests();
  vi.mocked(captureError).mockClear();
  const viewer = { uid: "embedded", getIdToken: vi.fn().mockResolvedValue("approved-token") };
  const services = { auth: { currentUser: viewer }, functions: { app: { options: { projectId: "test-project" } } },
    ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
    getAppCheckToken: vi.fn().mockResolvedValue("embed-appcheck"),
    isSessionApproved: () => true } as unknown as FirebaseServices;
  const config = vi.spyOn(runtimeConfig, "getRuntimeConfig").mockReturnValue({
    appEnvironment: "production", firebaseFunctionsRegion: "asia-northeast3",
  });
  const post = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ result: { success: true } }));
  try {
    logClientError("embedded.approved", new Error("pending"), {}, services, services.auth.currentUser);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(
      "https://asia-northeast3-test-project.cloudfunctions.net/logClientError",
      expect.objectContaining({ headers: {
        "Content-Type": "application/json", "X-Firebase-AppCheck": "embed-appcheck", Authorization: "Bearer approved-token",
      } }),
    ));
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(httpsCallable).not.toHaveBeenCalledWith(services.functions, "logClientError");
  } finally { config.mockRestore(); post.mockRestore(); }
});

it("retains approved-session diagnostics when approval is revoked during token acquisition", async () => {
  __resetClientErrorDedupeForTests();
  vi.mocked(captureError).mockClear();
  let resolveToken!: (token: string) => void;
  const viewer = { uid: "embedded", getIdToken: vi.fn(() => new Promise<string>(resolve => { resolveToken = resolve; })) };
  let approved = true;
  const services = { auth: { currentUser: viewer }, functions: { app: { options: { projectId: "test-project" } } },
    getAppCheckToken: vi.fn().mockResolvedValue("embed-appcheck"),
    isSessionApproved: () => approved } as unknown as FirebaseServices;
  const post = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  try {
    logClientError("embedded.revoked", new Error("pending"), {}, services, services.auth.currentUser);
    await vi.waitFor(() => expect(viewer.getIdToken).toHaveBeenCalledOnce());
    approved = false;
    const replacement = { uid: "embedded", getIdToken: vi.fn() };
    services.auth.currentUser = replacement as never;
    resolveToken("previous-token");
    await Promise.resolve();
    await Promise.resolve();
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(replacement.getIdToken).not.toHaveBeenCalled();
  } finally { post.mockRestore(); }
});

it.each([
  { phase: "app-check", status: undefined },
  { phase: "http", status: 403 },
  { phase: "body", status: 200 },
] as const)("reports $phase failures of the embedded backup without logging credentials", async ({ phase, status }) => {
  __resetClientErrorDedupeForTests();
  const appCheck = vi.fn().mockResolvedValue("app-check-token");
  if (phase === "app-check") appCheck.mockRejectedValue(new Error("private-token-error"));
  const services = { auth: { currentUser: null }, functions: { app: { options: { projectId: "test-project" } } },
    getAppCheckToken: appCheck, isSessionApproved: () => true } as unknown as FirebaseServices;
  const post = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { status: "FAILED" } }, { status: status ?? 403 }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    logClientError("embedded.test", new Error("initial failure"), {}, services, null);
    const diagnostic = { source: "embedded.test", phase, status };
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("[errorLogger] 서버 에러 로깅 실패:", diagnostic));
    expect(captureError).toHaveBeenCalledWith(new Error("embedded-error-backup-failed"), {
      tags: { source: "errorLogger.embeddedBackup" }, extra: diagnostic,
    });
    expect(post).toHaveBeenCalledTimes(phase === "app-check" ? 0 : 1);
  } finally { post.mockRestore(); warn.mockRestore(); }
});

it("bounds a stalled embedded backup and records its timeout", async () => {
  vi.useFakeTimers();
  __resetClientErrorDedupeForTests();
  const services = { auth: { currentUser: null }, functions: { app: { options: { projectId: "test-project" } } },
    getAppCheckToken: vi.fn().mockResolvedValue("app-check"), isSessionApproved: () => true } as unknown as FirebaseServices;
  const post = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    logClientError("embedded.stalled", new Error("initial failure"), {}, services, null);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(post).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[errorLogger] 서버 에러 로깅 실패:", {
      source: "embedded.stalled", phase: "timeout", status: undefined,
    });
  } finally { vi.useRealTimers(); post.mockRestore(); warn.mockRestore(); }
});

it("sends a fixed cache reset diagnostic without borrowing credentials after revocation", async () => {
  __resetClientErrorDedupeForTests();
  const lateViewer = { uid: "unapproved", getIdToken: vi.fn() };
  const services = { auth: { currentUser: lateViewer }, functions: { app: { options: { projectId: "test-project" } } },
    getAppCheckToken: vi.fn().mockResolvedValue("app-check"), isSessionApproved: () => false } as unknown as FirebaseServices;
  const post = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ result: { success: true } }));
  try {
    logClientError("embedded.authChangeCacheReset", new Error("private cache path"), { viewer: "unapproved" }, services);
    await vi.waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": "app-check" },
      body: JSON.stringify({ data: { source: "embedded.authChangeCacheReset", message: "embedded-cache-reset-failed" } }),
    });
    expect(post.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
    expect(lateViewer.getIdToken).not.toHaveBeenCalled();
  } finally { post.mockRestore(); }
});
