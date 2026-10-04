import { act, render, screen, waitFor } from "@testing-library/react";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateLogin } from "../__tests__/mocks/firebase";
import i18n from "../i18n";

import type { EmbeddedBridge, HostBridgeEnvelope, WebMessageType } from "./bridge";
import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
} from "./trainingSurfaceCache";

const mocks = vi.hoisted(() => {
  const state = {
    currentUser: { uid: "owner-1" } as { uid: string } | null,
    queryProviderMounts: vi.fn(),
    queryClientCreations: vi.fn(),
    surfaceHookMounts: vi.fn(),
    fitnessSurfaceMounts: vi.fn(),
    planSurfaceMounts: vi.fn(),
    /** 실제 마운트/언마운트(렌더 횟수가 아니라 effect 기준). */
    surfaceLifecycle: vi.fn(),
    planRunStarter: undefined as unknown,
    surfaceReadyCallbacks: {
      activityAnalysis: null as (() => void) | null,
      fitness: null as ((status?: "cached" | "fresh" | "error", contentComplete?: boolean) => void) | null,
      plan: null as ((status?: "cached" | "fresh" | "error") => void) | null,
    },
    consumeHandoff: vi.fn().mockResolvedValue(undefined),
    firestore: { instance: "initial" } as object,
    functions: {},
  };
  return {
    ...state,
    embeddedAuth: {
      get currentUser() { return state.currentUser; },
      authStateReady: vi.fn().mockResolvedValue(undefined),
    },
    setCurrentUser(user: { uid: string } | null) {
      state.currentUser = user;
    },
    // 계정 격리 가짜 구현 — 실제 terminate/재생성은 embeddedFirebase.test 가 검증한다.
    account: {
      owner: null as string | null,
      firestore: null as object | null,
      created: 0,
      terminate: vi.fn(),
      isolate: vi.fn(),
      gate: null as Promise<void> | null,
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class {
    constructor() {
      mocks.queryClientCreations();
    }
  },
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => {
    mocks.queryProviderMounts();
    return children;
  },
}));

vi.mock("./embeddedFirebase", () => ({
  initEmbeddedFirebase: () => ({
    app: {},
    auth: mocks.embeddedAuth,
    firestore: mocks.account.firestore ?? mocks.firestore,
    functions: mocks.functions,
  }),
  ensureEmbeddedAppCheckReady: vi.fn().mockResolvedValue(undefined),
  embeddedAccountReady: (uid: string) => mocks.account.owner === null || mocks.account.owner === uid,
  getEmbeddedFirestore: () => mocks.account.firestore ?? mocks.firestore,
  isolateEmbeddedAccount: (uid: string | null) => mocks.account.isolate(uid),
}));

function resetAccountIsolationMock() {
  mocks.account.owner = null;
  mocks.account.firestore = null;
  mocks.account.created = 0;
  mocks.account.gate = null;
  mocks.account.terminate.mockReset();
  mocks.account.isolate.mockReset();
  mocks.account.isolate.mockImplementation(async (uid: string | null) => {
    if (mocks.account.gate) await mocks.account.gate;
    if (mocks.account.owner === uid) return;
    const previous = mocks.account.owner;
    mocks.account.owner = uid;
    if (previous === null) return;
    mocks.account.terminate(mocks.account.firestore ?? mocks.firestore);
    mocks.account.created += 1;
    mocks.account.firestore = { instance: `recreated-${mocks.account.created}` };
  });
}

vi.mock("../services/appHandoff", () => ({
  consumeAppHandoffCode: mocks.consumeHandoff,
}));

vi.mock("./surfaces/ActivityAnalysisSurface", () => ({
  default: ({ onReady }: { onReady: () => void }) => {
    mocks.surfaceHookMounts();
    mocks.surfaceReadyCallbacks.activityAnalysis = onReady;
    return <div data-testid="analysis-surface" />;
  },
}));

vi.mock("./surfaces/FitnessSurface", () => ({
  default: function MockFitnessSurface({ onReady }: {
    onReady: (status?: "cached" | "fresh" | "error", contentComplete?: boolean) => void;
  }) {
    mocks.fitnessSurfaceMounts();
    mocks.surfaceReadyCallbacks.fitness = onReady;
    useEffect(() => {
      mocks.surfaceLifecycle("fitness", "mount");
      return () => mocks.surfaceLifecycle("fitness", "unmount");
    }, []);
    return <div data-testid="fitness-surface" />;
  },
}));

vi.mock("./surfaces/PlanSurface", () => ({
  default: function MockPlanSurface({ onReady, scheduledRunStarter }: {
    onReady: (status?: "cached" | "fresh" | "error") => void;
    scheduledRunStarter?: unknown;
  }) {
    mocks.planSurfaceMounts();
    mocks.planRunStarter = scheduledRunStarter;
    mocks.surfaceReadyCallbacks.plan = onReady;
    useEffect(() => {
      mocks.surfaceLifecycle("plan", "mount");
      return () => mocks.surfaceLifecycle("plan", "unmount");
    }, []);
    return <div data-testid="plan-surface" />;
  },
}));

import EmbeddedBootstrapRoot, { type EmbeddedSurfaceKind } from "./EmbeddedBootstrapRoot";

interface FakeBridge extends EmbeddedBridge {
  emit(message: HostBridgeEnvelope): void;
  sent: Array<{ type: WebMessageType; payload: unknown; requestId?: string }>;
}

function createFakeBridge(): FakeBridge {
  const listeners = new Set<(message: HostBridgeEnvelope) => void>();
  const sent: FakeBridge["sent"] = [];
  return {
    sent,
    send(type, payload, requestId) {
      sent.push({ type, payload, requestId });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn(),
    emit(message) {
      listeners.forEach((listener) => listener(message));
    },
  };
}

function hostMessage(
  type: HostBridgeEnvelope["type"],
  payload: unknown,
  requestId?: string,
): HostBridgeEnvelope {
  return { version: 1, type, payload, requestId };
}

function acceptedPayload() {
  return {
    theme: { mode: "dark" },
    locale: "ko",
    safeInsets: { top: 12, bottom: 24 },
  };
}

function renderBootstrap(
  bridge: FakeBridge,
  path = "/ko/embed/activity/activity-1/analysis",
  surfaceKind: EmbeddedSurfaceKind = "activity-analysis",
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={surfaceKind === "activity-analysis"
            ? "/:lang/embed/activity/:activityId/analysis"
            : "*"}
          element={(
            <EmbeddedBootstrapRoot
              bridgeFactory={() => bridge}
              surfaceKind={surfaceKind}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EmbeddedBootstrapRoot session gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    clearTrainingSurfaceCache();
    resetAccountIsolationMock();
    vi.mocked(doc).mockClear();
    mocks.setCurrentUser({ uid: "owner-1" });
    mocks.queryProviderMounts.mockClear();
    mocks.queryClientCreations.mockClear();
    mocks.surfaceHookMounts.mockClear();
    mocks.fitnessSurfaceMounts.mockClear();
    mocks.planSurfaceMounts.mockClear();
    mocks.surfaceLifecycle.mockClear();
    mocks.surfaceReadyCallbacks.activityAnalysis = null;
    mocks.surfaceReadyCallbacks.fitness = null;
    mocks.surfaceReadyCallbacks.plan = null;
    mocks.consumeHandoff.mockClear();
    vi.mocked(onSnapshot).mockClear();
  });

  it("초기 인증 null은 디스크를 보존하고 실제 승인 후에만 복원한다", async () => {
    const scope = "12345678-1234-1234-1234-123456789abc";
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = scope;
    const diskKey = "orider.trainingSurfaceCache.v2";
    const cacheKey = { uid: "owner-1", surface: "plan" as const, sport: "bike", locale: "ko" };
    const value = { goal: null, weeks: [] };
    const encoded = JSON.stringify({ schema: 2, uid: "owner-1", scope,
      entries: [{ key: cacheKey, expiresAt: Date.now() + 60_000, value }] });
    localStorage.setItem(diskKey, encoded);
    mocks.setCurrentUser(null);
    simulateLogin(null);
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/plan", "plan");
    expect(localStorage.getItem(diskKey)).toBe(encoded);
    expect(getTrainingSurfaceCache(cacheKey)).toBeNull();
    mocks.setCurrentUser({ uid: "owner-1" });
    await act(async () => bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 })));
    expect(getTrainingSurfaceCache(cacheKey)).toBeNull();
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(getTrainingSurfaceCache(cacheKey)).toEqual(value);
    act(() => bridge.emit(hostMessage("host.logout", {})));
    expect(localStorage.getItem(diskKey)).toBeNull();
    delete window.__ORIDER_TRAINING_CACHE_SCOPE__;
  });

  it("mounts no profile listener, React Query provider, or surface hook before sessionAccepted", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge);

    expect(bridge.sent).toContainEqual({
      type: "bootstrap.ready",
      payload: {
        contractVersion: 1,
        capabilities: [
          "host.surfaceSelected",
          "surface-selection-request-id-v1",
          "run-start-scheduled-v1",
        ],
      },
      requestId: undefined,
    });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(mocks.queryProviderMounts).not.toHaveBeenCalled();
    expect(mocks.surfaceHookMounts).not.toHaveBeenCalled();

    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });

    await waitFor(() => expect(bridge.sent).toContainEqual({
      type: "auth.state",
      payload: { uid: "owner-1" },
      requestId: undefined,
    }));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(mocks.queryProviderMounts).not.toHaveBeenCalled();
    expect(mocks.surfaceHookMounts).not.toHaveBeenCalled();

    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.queryProviderMounts).toHaveBeenCalled());
    expect(mocks.surfaceHookMounts).toHaveBeenCalled();
    expect(await screen.findByTestId("analysis-surface")).toBeInTheDocument();
    act(() => mocks.surfaceReadyCallbacks.activityAnalysis?.());
    expect(bridge.sent).toContainEqual({
      type: "surface.ready",
      payload: { activityId: "activity-1" },
      requestId: undefined,
    });
    expect(bridge.sent.some((message) => message.type === "telemetry.event")).toBe(false);
  });

  it.each([
    ["fitness", "/ko/embed/fitness?sport=run", "fitnessSurfaceMounts", "fitness-surface"],
    ["plan", "/ko/embed/plan?sport=swim", "planSurfaceMounts", "plan-surface"],
  ] as const)(
    "keeps %s unmounted until sessionAccepted and mounts only the selected surface",
    async (surfaceKind, path, mountKey, testId) => {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, path, surfaceKind);

      expect(onSnapshot).not.toHaveBeenCalled();
      expect(mocks.queryProviderMounts).not.toHaveBeenCalled();
      expect(mocks.fitnessSurfaceMounts).not.toHaveBeenCalled();
      expect(mocks.planSurfaceMounts).not.toHaveBeenCalled();

      await act(async () => {
        bridge.emit(hostMessage("host.authorize", {
          expectedUid: "owner-1",
          contractVersion: 1,
        }));
      });
      await waitFor(() => expect(bridge.sent).toContainEqual(expect.objectContaining({
        type: "auth.state",
        payload: { uid: "owner-1" },
      })));
      expect(onSnapshot).not.toHaveBeenCalled();
      expect(mocks[mountKey]).not.toHaveBeenCalled();

      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      expect(mocks[mountKey]).toHaveBeenCalledTimes(1);
      const otherMounts = surfaceKind === "fitness"
        ? mocks.planSurfaceMounts
        : mocks.fitnessSurfaceMounts;
      expect(otherMounts).not.toHaveBeenCalled();
      expect(mocks.surfaceHookMounts).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["fitness", "/ko/embed/fitness", "피트니스"],
    ["plan", "/ko/embed/plan", "운동 계획"],
  ] as const)("emits %s shellReady only after the authenticated shell is committed", async (
    surfaceKind,
    path,
    title,
  ) => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, path, surfaceKind);

    expect(screen.queryByRole("heading", { name: title })).not.toBeInTheDocument();
    expect(bridge.sent.some((message) => message.type === "surface.shellReady")).toBe(false);

    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    expect(bridge.sent.some((message) => message.type === "surface.shellReady")).toBe(false);

    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "shell-flow")));

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    await waitFor(() => expect(bridge.sent).toContainEqual({
      type: "surface.shellReady",
      payload: {},
      requestId: undefined,
    }));
    expect(bridge.sent).toContainEqual({
      type: "telemetry.event",
      payload: {
        name: "embedded_surface_loading",
        surface: surfaceKind,
        elapsedMs: expect.any(Number),
        loadState: "cold",
        milestone: "shell_visible",
      },
      requestId: "shell-flow",
    });
  });

  it("does not change the Activity Analysis ready contract", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge);

    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.activityAnalysis).not.toBeNull());
    act(() => mocks.surfaceReadyCallbacks.activityAnalysis?.());

    expect(bridge.sent.some((message) => message.type === "surface.shellReady")).toBe(false);
    expect(bridge.sent).toContainEqual({
      type: "surface.ready",
      payload: { activityId: "activity-1" },
      requestId: undefined,
    });
  });

  it("rejects retained selection before sessionAccepted and on Activity Analysis", async () => {
    const trainingBridge = createFakeBridge();
    renderBootstrap(trainingBridge, "/ko/embed/fitness", "fitness");

    act(() => trainingBridge.emit(hostMessage("host.surfaceSelected", { surface: "plan" }, "early")));
    expect(trainingBridge.sent).toContainEqual({
      type: "surface.error",
      payload: { code: "invalid_host_state" },
      requestId: "early",
    });
    expect(mocks.planSurfaceMounts).not.toHaveBeenCalled();

    const analysisBridge = createFakeBridge();
    renderBootstrap(analysisBridge);
    await act(async () => {
      analysisBridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => analysisBridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    await screen.findByTestId("analysis-surface");
    act(() => analysisBridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "analysis")));

    expect(analysisBridge.sent).toContainEqual({
      type: "surface.error",
      payload: { code: "invalid_host_state" },
      requestId: "analysis",
    });
    expect(screen.getByTestId("analysis-surface")).toBeInTheDocument();
  });

  it("retains shared providers while mounting only the selected training surface", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    expect(mocks.queryClientCreations).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "plan" }, "select-plan")));
    expect(await screen.findByTestId("plan-surface")).toBeInTheDocument();
    expect(screen.queryByTestId("fitness-surface")).not.toBeInTheDocument();
    expect(mocks.queryClientCreations).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(bridge.sent.some((message) => (
      message.type === "telemetry.event"
      && message.requestId === "select-plan"
      && (message.payload as { milestone?: string }).milestone === "session_accepted"
    ))).toBe(false);

    // 비활성(null)은 언마운트 대신 숨긴다.
    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null })));
    await waitFor(() => expect(screen.getByTestId("plan-surface")).not.toBeVisible());
    expect(mocks.queryClientCreations).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("host 언어를 표면 마운트 전에 적용해 언어 변경으로 표면이 다시 열리지 않는다", async () => {
    const previousLanguage = i18n.language;
    await act(async () => {
      await i18n.changeLanguage("ko");
    });
    const languagesAtMount: string[] = [];
    mocks.fitnessSurfaceMounts.mockImplementation(() => {
      languagesAtMount.push(i18n.language);
    });
    // 언어 리소스 로드가 프로필 도착보다 늦는 경우를 재현한다 — 적용이 끝나기 전에는 마운트하지 않아야 한다.
    const changeLanguage = i18n.changeLanguage.bind(i18n);
    const delayedChange = vi.spyOn(i18n, "changeLanguage").mockImplementation((language) => (
      new Promise((resolve, reject) => {
        setTimeout(() => {
          changeLanguage(language).then(resolve, reject);
        }, 20);
      })
    ));
    try {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, "/en/embed/fitness", "fitness");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", {
          expectedUid: "owner-1",
          contractVersion: 1,
        }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", { ...acceptedPayload(), locale: "en" })));
      expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
      expect(languagesAtMount.length).toBeGreaterThan(0);
      expect(new Set(languagesAtMount)).toEqual(new Set(["en"]));
      expect(document.documentElement.lang).toBe("en");
      expect(delayedChange).toHaveBeenCalledWith("en");
    } finally {
      delayedChange.mockRestore();
      mocks.fitnessSurfaceMounts.mockReset();
      await act(async () => {
        await i18n.changeLanguage(previousLanguage);
      });
    }
  });

  it("로그아웃 뒤 다른 계정은 표면이 내려간 다음 terminate 된 Firestore 대신 새 인스턴스로 연다", async () => {
    const surfacePresentAtIsolation: boolean[] = [];
    const isolate = mocks.account.isolate.getMockImplementation()!;
    mocks.account.isolate.mockImplementation((uid: string | null) => {
      surfacePresentAtIsolation.push(screen.queryByTestId("fitness-surface") !== null);
      return isolate(uid);
    });
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    const initialFirestore = mocks.firestore;
    expect(vi.mocked(doc)).toHaveBeenCalledWith(initialFirestore, "users", "owner-1");

    await act(async () => bridge.emit(hostMessage("host.logout", {})));
    await waitFor(() => expect(mocks.account.terminate).toHaveBeenCalledTimes(1));
    expect(mocks.account.terminate).toHaveBeenCalledWith(initialFirestore);
    expect(mocks.account.isolate).toHaveBeenLastCalledWith(null);
    // 리스너가 닫힌 뒤(표면 언마운트 후)에 격리한다.
    expect(surfacePresentAtIsolation.at(-1)).toBe(false);

    vi.mocked(doc).mockClear();
    mocks.setCurrentUser({ uid: "owner-2" });
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-2", contractVersion: 1 }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    expect(mocks.account.terminate).toHaveBeenCalledTimes(1);
    const recreated = mocks.account.firestore;
    expect(recreated).not.toBeNull();
    expect(recreated).not.toBe(initialFirestore);
    const profileReads = vi.mocked(doc).mock.calls.filter(([, collectionName]) => collectionName === "users");
    expect(profileReads.length).toBeGreaterThan(0);
    expect(profileReads.every(([instance, , uid]) => instance === recreated && uid === "owner-2")).toBe(true);
  });

  it("로그아웃 없이 다른 계정으로 재승인하면 격리가 끝날 때까지 표면을 열지 않는다", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    await waitFor(() => expect(mocks.account.owner).toBe("owner-1"));
    const initialFirestore = mocks.firestore;

    let openGate: () => void = () => undefined;
    mocks.account.gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    vi.mocked(doc).mockClear();
    mocks.setCurrentUser({ uid: "owner-2" });
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-2", contractVersion: 1 }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("fitness-surface")).not.toBeInTheDocument();
    expect(vi.mocked(doc).mock.calls.some(([, collectionName]) => collectionName === "users")).toBe(false);

    await act(async () => {
      openGate();
      await mocks.account.gate;
    });
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    expect(mocks.account.terminate).toHaveBeenCalledTimes(1);
    expect(mocks.account.terminate).toHaveBeenCalledWith(initialFirestore);
    const profileReads = vi.mocked(doc).mock.calls.filter(([, collectionName]) => collectionName === "users");
    expect(profileReads.length).toBeGreaterThan(0);
    expect(profileReads.every(([instance, , uid]) => instance === mocks.account.firestore && uid === "owner-2"))
      .toBe(true);
  });

  it("correlates shell readiness across fitness plan inactive and fitness selections without stale signals", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const bridge = createFakeBridge();
    const shellMessages = () => bridge.sent.filter((message) => message.type === "surface.shellReady");
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    await screen.findByTestId("fitness-surface");
    const initialFrame = frames.at(-1)!;
    act(() => initialFrame(performance.now()));
    expect(shellMessages()).toEqual([{ type: "surface.shellReady", payload: {}, requestId: undefined }]);

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "plan" }, "select-plan")));
    await screen.findByTestId("plan-surface");
    const planFrame = frames.at(-1)!;
    act(() => planFrame(performance.now()));
    expect(shellMessages()).toHaveLength(2);
    expect(shellMessages().at(-1)).toEqual({
      type: "surface.shellReady", payload: {}, requestId: "select-plan",
    });

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null })));
    await waitFor(() => expect(screen.getByTestId("plan-surface")).not.toBeVisible());
    act(() => planFrame(performance.now()));
    expect(shellMessages()).toHaveLength(2);

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-fitness")));
    await screen.findByTestId("fitness-surface");
    const fitnessFrame = frames.at(-1)!;
    act(() => {
      initialFrame(performance.now());
      planFrame(performance.now());
    });
    expect(shellMessages()).toHaveLength(2);
    act(() => fitnessFrame(performance.now()));
    expect(shellMessages()).toEqual([
      { type: "surface.shellReady", payload: {}, requestId: undefined },
      { type: "surface.shellReady", payload: {}, requestId: "select-plan" },
      { type: "surface.shellReady", payload: {}, requestId: "select-fitness" },
    ]);
  });

  it("rejects selection when Auth uid no longer matches the accepted session", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    const cacheKey = {
      uid: "owner-1",
      surface: "plan" as const,
      sport: "bike",
      locale: "ko",
    };
    prepareTrainingSurfaceCacheOwner("owner-1");
    setTrainingSurfaceCache(cacheKey, { goal: { id: "private-goal" } });

    mocks.setCurrentUser({ uid: "different-user" });
    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "plan" }, "uid-race")));

    expect(bridge.sent).toContainEqual({
      type: "surface.error",
      payload: { code: "invalid_host_state" },
      requestId: "uid-race",
    });
    expect(screen.queryByTestId("plan-surface")).not.toBeInTheDocument();
    expect(getTrainingSurfaceCache(cacheKey)).toBeNull();
  });

  it.each(["host.logout", "host.sessionRejected"] as const)(
    "clears the in-memory training cache synchronously on %s",
    async (messageType) => {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, "/ko/embed/plan", "plan");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", {
          expectedUid: "owner-1",
          contractVersion: 1,
        }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
      await screen.findByTestId("plan-surface");
      const cacheKey = {
        uid: "owner-1",
        surface: "plan" as const,
        sport: "bike",
        locale: "ko",
      };
      setTrainingSurfaceCache(cacheKey, { goal: { id: "private-goal" } });

      act(() => bridge.emit(hostMessage(
        messageType,
        messageType === "host.logout" ? {} : { reason: "native_session_closed" },
      )));

      expect(getTrainingSurfaceCache(cacheKey)).toBeNull();
    },
  );

  it("drops late callbacks from an older selection generation", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "legacy-flow")));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.fitness).not.toBeNull());
    const staleFitnessReady = mocks.surfaceReadyCallbacks.fitness!;

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "plan" }, "plan-flow")));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.plan).not.toBeNull());
    const messagesBeforeStaleCallback = bridge.sent.length;
    act(() => staleFitnessReady());
    expect(bridge.sent).toHaveLength(messagesBeforeStaleCallback);

    act(() => mocks.surfaceReadyCallbacks.plan?.());
    expect(bridge.sent).toContainEqual({
      type: "telemetry.event",
      payload: {
        name: "embedded_surface_loading",
        surface: "plan",
        elapsedMs: expect.any(Number),
        loadState: "cold",
        milestone: "fresh_complete",
      },
      requestId: "plan-flow",
    });

    const stalePlanReady = mocks.surfaceReadyCallbacks.plan!;
    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null })));
    const messagesBeforeNullCallback = bridge.sent.length;
    act(() => stalePlanReady());
    expect(bridge.sent).toHaveLength(messagesBeforeNullCallback);
  });

  it("drops a queued shell callback after the surface is deselected", async () => {
    let queuedFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      queuedFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "fitness-flow")));
    expect(await screen.findByTestId("fitness-surface")).toBeInTheDocument();
    expect(queuedFrame).not.toBeNull();

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null })));
    const messagesBeforeStaleShell = bridge.sent.length;
    act(() => {
      if (queuedFrame) queuedFrame(performance.now());
    });

    expect(bridge.sent).toHaveLength(messagesBeforeStaleShell);
  });

  it("clamps fresh completion telemetry to the native elapsed upper bound", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");

    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    await waitFor(() => expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "auth.state",
      payload: { uid: "owner-1" },
    })));
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "long-flow")));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.fitness).not.toBeNull());

    now.mockReturnValue(122_000);
    act(() => mocks.surfaceReadyCallbacks.fitness?.());

    expect(bridge.sent).toContainEqual({
      type: "telemetry.event",
      payload: {
        name: "embedded_surface_loading",
        surface: "fitness",
        elapsedMs: 120_000,
        loadState: "cold",
        milestone: "fresh_complete",
      },
      requestId: "long-flow",
    });
  });

  it("correlates cached content and background fresh completion to one selection request", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/plan", "plan");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "cache-flow")));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.plan).not.toBeNull());

    act(() => mocks.surfaceReadyCallbacks.plan?.("cached"));
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "telemetry.event",
      payload: expect.objectContaining({ loadState: "warm", milestone: "cache_hit" }),
      requestId: "cache-flow",
    }));
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "telemetry.event",
      payload: expect.objectContaining({ loadState: "warm", milestone: "cached_content" }),
      requestId: "cache-flow",
    }));

    act(() => mocks.surfaceReadyCallbacks.plan?.("fresh"));
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "telemetry.event",
      payload: expect.objectContaining({ loadState: "warm", milestone: "fresh_complete" }),
      requestId: "cache-flow",
    }));
  });

  it("echoes the retained selection request id for offline cached fitness readiness", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    act(() => bridge.emit(hostMessage(
      "host.surfaceSelected",
      { surface: "fitness" },
      "offline-cache-flow",
    )));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.fitness).not.toBeNull());

    act(() => mocks.surfaceReadyCallbacks.fitness?.("cached"));

    expect(bridge.sent).toContainEqual({
      type: "surface.ready",
      payload: {},
      requestId: "offline-cache-flow",
    });
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "telemetry.event",
      payload: expect.objectContaining({ milestone: "cached_content" }),
      requestId: "offline-cache-flow",
    }));
  });

  it.each([
    ["fitness", "/ko/embed/fitness?sport=run"],
    ["plan", "/ko/embed/plan?sport=swim"],
  ] as const)(
    "emits correlated cold loading milestones for %s without sensitive fields",
    async (surfaceKind, path) => {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, path, surfaceKind);

      await act(async () => {
        bridge.emit(hostMessage("host.authorize", {
          expectedUid: "owner-1",
          contractVersion: 1,
        }));
      });
      await waitFor(() => expect(bridge.sent).toContainEqual(expect.objectContaining({
        type: "auth.state",
        payload: { uid: "owner-1" },
      })));

      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "tab-flow-1")));
      act(() => bridge.emit(hostMessage(
        "host.surfaceSelected",
        { surface: surfaceKind },
        "tab-flow-1",
      )));
      await waitFor(() => expect(mocks.surfaceReadyCallbacks[surfaceKind]).not.toBeNull());

      const acceptedTelemetry = bridge.sent.find((message) => (
        message.type === "telemetry.event"
        && (message.payload as { milestone?: string }).milestone === "session_accepted"
      ));
      expect(acceptedTelemetry).toEqual({
        type: "telemetry.event",
        payload: {
          name: "embedded_surface_loading",
          surface: surfaceKind,
          elapsedMs: 0,
          loadState: "cold",
          milestone: "session_accepted",
        },
        requestId: "tab-flow-1",
      });

      act(() => mocks.surfaceReadyCallbacks[surfaceKind]?.());

      const freshTelemetry = bridge.sent.find((message) => (
        message.type === "telemetry.event"
        && (message.payload as { milestone?: string }).milestone === "fresh_complete"
      ));
      expect(freshTelemetry).toEqual({
        type: "telemetry.event",
        payload: {
          name: "embedded_surface_loading",
          surface: surfaceKind,
          elapsedMs: expect.any(Number),
          loadState: "cold",
          milestone: "fresh_complete",
        },
        requestId: "tab-flow-1",
      });
      expect((freshTelemetry?.payload as { elapsedMs: number }).elapsedMs).toBeGreaterThanOrEqual(0);

      const freshIndex = bridge.sent.indexOf(freshTelemetry!);
      expect(bridge.sent[freshIndex + 1]).toEqual({
        type: "surface.ready",
        payload: {},
        requestId: "tab-flow-1",
      });
      act(() => mocks.surfaceReadyCallbacks[surfaceKind]?.());
      expect(bridge.sent.filter((message) => (
        message.type === "telemetry.event"
        && (message.payload as { milestone?: string }).milestone === "fresh_complete"
      ))).toHaveLength(1);
      expect(bridge.sent.filter((message) => message.type === "surface.ready")).toHaveLength(2);
      const telemetryJson = JSON.stringify([acceptedTelemetry, freshTelemetry]);
      expect(telemetryJson).not.toContain("owner-1");
      expect(telemetryJson).not.toContain("run");
      expect(telemetryJson).not.toContain("swim");
    },
  );

  it("reports Fitness base readiness before derived completion without overstating telemetry", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    await waitFor(() => expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "auth.state",
      payload: { uid: "owner-1" },
    })));
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload(), "fitness-partial-1")));
    act(() => bridge.emit(hostMessage(
      "host.surfaceSelected",
      { surface: "fitness" },
      "fitness-partial-1",
    )));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.fitness).not.toBeNull());

    act(() => mocks.surfaceReadyCallbacks.fitness?.("cached", false));
    act(() => mocks.surfaceReadyCallbacks.fitness?.("fresh", false));

    expect(bridge.sent.filter((message) => message.type === "surface.ready")).toEqual([
      { type: "surface.ready", payload: {}, requestId: "fitness-partial-1" },
      { type: "surface.ready", payload: {}, requestId: "fitness-partial-1" },
    ]);
    expect(bridge.sent.some((message) => (
      message.type === "telemetry.event"
      && (message.payload as { milestone?: string }).milestone === "cache_hit"
    ))).toBe(true);
    expect(bridge.sent.some((message) => (
      message.type === "telemetry.event"
      && ["cached_content", "fresh_complete"].includes(
        (message.payload as { milestone?: string }).milestone ?? "",
      )
    ))).toBe(false);

    act(() => mocks.surfaceReadyCallbacks.fitness?.("cached", true));
    act(() => mocks.surfaceReadyCallbacks.fitness?.("fresh", true));
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "telemetry.event",
      payload: expect.objectContaining({ milestone: "cached_content" }),
      requestId: "fitness-partial-1",
    }));
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "telemetry.event",
      payload: expect.objectContaining({ milestone: "fresh_complete" }),
      requestId: "fitness-partial-1",
    }));
  });

  it.each([
    ["fitness", "/ko/embed/fitness"],
    ["plan", "/ko/embed/plan"],
  ] as const)("keeps %s ready behavior without telemetry when sessionAccepted has no requestId", async (
    surfaceKind,
    path,
  ) => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, path, surfaceKind);

    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    await waitFor(() => expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "auth.state",
      payload: { uid: "owner-1" },
    })));

    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks[surfaceKind]).not.toBeNull());
    act(() => mocks.surfaceReadyCallbacks[surfaceKind]?.());

    expect(bridge.sent.some((message) => message.type === "telemetry.event")).toBe(false);
    expect(bridge.sent).toContainEqual({
      type: "surface.ready",
      payload: {},
      requestId: undefined,
    });
  });

  it("echoes the active retained selection request id on surface errors", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    act(() => bridge.emit(hostMessage(
      "host.surfaceSelected",
      { surface: "fitness" },
      "fitness-selection",
    )));
    await waitFor(() => expect(mocks.surfaceReadyCallbacks.fitness).not.toBeNull());

    act(() => mocks.surfaceReadyCallbacks.fitness?.("error"));

    expect(bridge.sent).toContainEqual({
      type: "surface.error",
      payload: { code: "surface_load_failed" },
      requestId: "fitness-selection",
    });
  });

  it("keeps every data surface unmounted when the current uid differs", async () => {
    mocks.setCurrentUser({ uid: "different-user" });
    const bridge = createFakeBridge();
    renderBootstrap(bridge);

    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    await waitFor(() => expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "auth.state",
      payload: { uid: "different-user" },
    })));
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));

    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "surface.error",
      payload: { code: "auth_uid_mismatch" },
    }));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(mocks.queryProviderMounts).not.toHaveBeenCalled();
    expect(mocks.surfaceHookMounts).not.toHaveBeenCalled();
  });

  it("unmounts the accepted surface if embedded Auth changes uid", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge);
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
    expect(await screen.findByTestId("analysis-surface")).toBeInTheDocument();

    act(() => {
      mocks.setCurrentUser({ uid: "different-user" });
      simulateLogin({ uid: "different-user" });
    });

    await waitFor(() => expect(screen.queryByTestId("analysis-surface")).not.toBeInTheDocument());
    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "surface.error",
      payload: { code: "auth_uid_changed" },
    }));
  });

  it("rejects unknown payload keys and arbitrary CSS values", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge);
    await act(async () => {
      bridge.emit(hostMessage("host.authorize", {
        expectedUid: "owner-1",
        contractVersion: 1,
      }));
    });
    act(() => bridge.emit(hostMessage("host.sessionAccepted", {
      ...acceptedPayload(),
      theme: { mode: "dark", colors: { bg: "red; background:url(https://bad)" } },
      extra: true,
    })));

    expect(bridge.sent).toContainEqual(expect.objectContaining({
      type: "surface.error",
      payload: { code: "invalid_host_payload" },
    }));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(mocks.surfaceHookMounts).not.toHaveBeenCalled();
  });

  describe("scheduled run start negotiation", () => {
    async function acceptPlan(bridge: FakeBridge, payload: Record<string, unknown>) {
      renderBootstrap(bridge, "/ko/embed/plan", "plan");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", payload)));
      await waitFor(() => expect(mocks.planSurfaceMounts).toHaveBeenCalled());
    }

    it("withholds the run starter when the host does not advertise the capability", async () => {
      mocks.planRunStarter = undefined;
      const bridge = createFakeBridge();
      await acceptPlan(bridge, acceptedPayload());
      expect(mocks.planRunStarter).toBeNull();
    });

    it("rejects malformed host capability lists", async () => {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, "/ko/embed/plan", "plan");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", {
        ...acceptedPayload(),
        capabilities: ["run-start-scheduled-v1", 7],
      })));
      expect(bridge.sent).toContainEqual(expect.objectContaining({
        type: "surface.error",
        payload: { code: "invalid_host_payload" },
      }));
      expect(mocks.planSurfaceMounts).not.toHaveBeenCalled();
    });

    it("sends run.startScheduled and resolves only on the echoed requestId", async () => {
      const bridge = createFakeBridge();
      await acceptPlan(bridge, { ...acceptedPayload(), capabilities: ["run-start-scheduled-v1"] });
      const starter = mocks.planRunStarter as { start(id: string): Promise<unknown> };
      expect(starter).toBeTruthy();

      let outcome: unknown;
      void starter.start("ss_abc123").then((value) => { outcome = value; });
      const request = bridge.sent.find((message) => message.type === "run.startScheduled");
      expect(request).toMatchObject({ payload: { scheduledSessionId: "ss_abc123" } });
      expect(request?.requestId).toEqual(expect.any(String));

      await act(async () => {
        bridge.emit(hostMessage("host.runStartResult", { accepted: false, reason: "busy" }, "other-request"));
      });
      expect(outcome).toBeUndefined();
      await act(async () => {
        bridge.emit(hostMessage("host.runStartResult", { accepted: false, reason: "ride-active" }, request?.requestId));
      });
      expect(outcome).toEqual({ accepted: false, reason: "ride-active" });
      expect(bridge.sent).not.toContainEqual(expect.objectContaining({ type: "surface.error" }));
    });

    it("reports malformed run start results as invalid host payloads", async () => {
      const bridge = createFakeBridge();
      await acceptPlan(bridge, { ...acceptedPayload(), capabilities: ["run-start-scheduled-v1"] });
      act(() => bridge.emit(hostMessage("host.runStartResult", { accepted: "yes" }, "req-1")));
      expect(bridge.sent).toContainEqual(expect.objectContaining({
        type: "surface.error",
        payload: { code: "invalid_host_payload" },
        requestId: "req-1",
      }));
    });
  });
  describe("retained training surface keep-alive", () => {
    const mountCount = (surface: "fitness" | "plan") => mocks.surfaceLifecycle.mock.calls
      .filter(([kind, event]) => kind === surface && event === "mount").length;
    const readyFor = (bridge: FakeBridge, requestId: string) => bridge.sent.filter((message) => (
      message.type === "surface.ready" && message.requestId === requestId
    ));

    async function acceptFitnessSession(bridge: FakeBridge) {
      renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
      await screen.findByTestId("fitness-surface");
      // 호스트는 sessionAccepted 직후 같은 표면 선택을 보낸다 — 첫 마운트를 다시 열지 않아야 한다.
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-1")));
      act(() => mocks.surfaceReadyCallbacks.fitness?.("fresh", true));
      expect(readyFor(bridge, "select-1")).toHaveLength(1);
      expect(mountCount("fitness")).toBe(1);
    }

    it("같은 표면 재선택은 재마운트하지 않고 새 requestId 에 즉시 응답한다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);
      const profileListeners = vi.mocked(onSnapshot).mock.calls.length;

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));

      expect(readyFor(bridge, "select-2")).toHaveLength(1);
      expect(bridge.sent).toContainEqual({
        type: "telemetry.event",
        payload: {
          name: "embedded_surface_loading",
          surface: "fitness",
          elapsedMs: expect.any(Number),
          loadState: "warm",
          milestone: "fresh_complete",
        },
        requestId: "select-2",
      });
      expect(mocks.surfaceLifecycle).not.toHaveBeenCalledWith("fitness", "unmount");
      expect(mountCount("fitness")).toBe(1);
      expect(vi.mocked(onSnapshot).mock.calls.length).toBe(profileListeners);
      expect(screen.getByTestId("fitness-surface")).toBeVisible();
    });

    it("비활성(null) 뒤 같은 표면 재선택은 숨겼던 표면을 그대로 다시 보여 준다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null }, "inactive")));
      expect(screen.getByTestId("fitness-surface")).not.toBeVisible();
      expect(bridge.sent.filter((message) => message.requestId === "inactive")).toEqual([]);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));
      expect(screen.getByTestId("fitness-surface")).toBeVisible();
      expect(readyFor(bridge, "select-2")).toHaveLength(1);
      expect(mocks.surfaceLifecycle).not.toHaveBeenCalledWith("fitness", "unmount");
      expect(mountCount("fitness")).toBe(1);
    });

    it("숨긴 동안 끝난 로딩도 기억해 재선택 때 응답한다", async () => {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
      await screen.findByTestId("fitness-surface");
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-1")));
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null }, "inactive")));
      act(() => mocks.surfaceReadyCallbacks.fitness?.("fresh", true));
      expect(bridge.sent.filter((message) => message.type === "surface.ready")).toEqual([]);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));
      expect(readyFor(bridge, "select-2")).toHaveLength(1);
      expect(mountCount("fitness")).toBe(1);
    });

    it("아직 준비 전인 표면을 재선택하면 응답을 미루고 이후 준비를 새 requestId 로 보낸다", async () => {
      const bridge = createFakeBridge();
      renderBootstrap(bridge, "/ko/embed/fitness", "fitness");
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
      await screen.findByTestId("fitness-surface");
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-1")));
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));
      expect(bridge.sent.filter((message) => message.type === "surface.ready")).toEqual([]);

      act(() => mocks.surfaceReadyCallbacks.fitness?.("fresh", true));
      expect(readyFor(bridge, "select-1")).toEqual([]);
      expect(readyFor(bridge, "select-2")).toHaveLength(1);
      expect(bridge.sent).toContainEqual(expect.objectContaining({
        type: "telemetry.event",
        requestId: "select-2",
        payload: expect.objectContaining({ milestone: "fresh_complete", loadState: "cold" }),
      }));
      expect(mountCount("fitness")).toBe(1);
    });

    it("다른 표면 선택과 host.retry 는 지금처럼 다시 마운트한다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "plan" }, "select-plan")));
      await screen.findByTestId("plan-surface");
      expect(screen.queryByTestId("fitness-surface")).not.toBeInTheDocument();
      expect(mountCount("plan")).toBe(1);
      expect(readyFor(bridge, "select-plan")).toEqual([]);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-fitness")));
      await screen.findByTestId("fitness-surface");
      expect(mountCount("fitness")).toBe(2);
      expect(readyFor(bridge, "select-fitness")).toEqual([]);
      act(() => mocks.surfaceReadyCallbacks.fitness?.("fresh", true));
      expect(readyFor(bridge, "select-fitness")).toHaveLength(1);

      act(() => bridge.emit(hostMessage("host.retry", {})));
      await waitFor(() => expect(mountCount("fitness")).toBe(3));
      // 재시도한 인스턴스는 아직 준비를 알리지 않았으므로 재선택에 대신 응답하지 않는다.
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "after-retry")));
      expect(readyFor(bridge, "after-retry")).toEqual([]);
      expect(mountCount("fitness")).toBe(3);
    });

    it("오류를 알린 표면은 재선택 때 새로 마운트한다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);
      act(() => mocks.surfaceReadyCallbacks.fitness?.("error", true));

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));
      await waitFor(() => expect(mountCount("fitness")).toBe(2));
      expect(readyFor(bridge, "select-2")).toEqual([]);
    });

    it("30분 넘게 숨긴 표면은 재사용하지 않고 새로 마운트한다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);
      const start = Date.now();
      const now = vi.spyOn(Date, "now").mockReturnValue(start);
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null }, "inactive")));
      now.mockReturnValue(start + 30 * 60 * 1000);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));
      await waitFor(() => expect(mountCount("fitness")).toBe(2));
      expect(readyFor(bridge, "select-2")).toEqual([]);
    });

    it("숨긴 채 30분이 지나면 표면을 언마운트해 리스너를 놓는다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);
      const releaseTimers: Array<() => void> = [];
      const realSetTimeout = window.setTimeout.bind(window);
      vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay === 30 * 60 * 1000 && typeof handler === "function") {
          releaseTimers.push(handler as () => void);
          return 0;
        }
        return realSetTimeout(handler, delay, ...args);
      }) as typeof window.setTimeout);

      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null }, "inactive")));
      expect(releaseTimers).toHaveLength(1);
      act(() => releaseTimers[0]());

      await waitFor(() => expect(screen.queryByTestId("fitness-surface")).not.toBeInTheDocument());
      expect(mocks.surfaceLifecycle).toHaveBeenCalledWith("fitness", "unmount");
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "select-2")));
      await screen.findByTestId("fitness-surface");
      expect(mountCount("fitness")).toBe(2);
      expect(readyFor(bridge, "select-2")).toEqual([]);
    });

    it("숨긴 표면도 로그아웃·uid 변경이면 언마운트한다", async () => {
      const bridge = createFakeBridge();
      await acceptFitnessSession(bridge);
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null }, "inactive")));
      expect(screen.getByTestId("fitness-surface")).not.toBeVisible();

      act(() => {
        mocks.setCurrentUser({ uid: "different-user" });
        simulateLogin({ uid: "different-user" });
      });

      await waitFor(() => expect(screen.queryByTestId("fitness-surface")).not.toBeInTheDocument());
      expect(mocks.surfaceLifecycle).toHaveBeenCalledWith("fitness", "unmount");
      expect(bridge.sent).toContainEqual(expect.objectContaining({
        type: "surface.error",
        payload: { code: "auth_uid_changed" },
      }));
      // 새 세션의 같은 표면 선택은 이전 인스턴스 준비 상태로 응답하지 않는다.
      mocks.setCurrentUser({ uid: "owner-1" });
      await act(async () => {
        bridge.emit(hostMessage("host.authorize", { expectedUid: "owner-1", contractVersion: 1 }));
      });
      act(() => bridge.emit(hostMessage("host.sessionAccepted", acceptedPayload())));
      await screen.findByTestId("fitness-surface");
      act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: "fitness" }, "new-session")));
      expect(readyFor(bridge, "new-session")).toEqual([]);
      expect(mountCount("fitness")).toBe(2);
    });
  });
});
