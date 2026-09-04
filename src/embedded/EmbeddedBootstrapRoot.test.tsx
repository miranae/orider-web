import { act, render, screen, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateLogin } from "../__tests__/mocks/firebase";

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
    surfaceReadyCallbacks: {
      activityAnalysis: null as (() => void) | null,
      fitness: null as ((status?: "cached" | "fresh" | "error", contentComplete?: boolean) => void) | null,
      plan: null as ((status?: "cached" | "fresh" | "error") => void) | null,
    },
    consumeHandoff: vi.fn().mockResolvedValue(undefined),
    firestore: {},
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
    firestore: mocks.firestore,
    functions: mocks.functions,
  }),
  ensureEmbeddedAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));

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
  default: ({ onReady }: {
    onReady: (status?: "cached" | "fresh" | "error", contentComplete?: boolean) => void;
  }) => {
    mocks.fitnessSurfaceMounts();
    mocks.surfaceReadyCallbacks.fitness = onReady;
    return <div data-testid="fitness-surface" />;
  },
}));

vi.mock("./surfaces/PlanSurface", () => ({
  default: ({ onReady }: { onReady: (status?: "cached" | "fresh" | "error") => void }) => {
    mocks.planSurfaceMounts();
    mocks.surfaceReadyCallbacks.plan = onReady;
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
    mocks.setCurrentUser({ uid: "owner-1" });
    mocks.queryProviderMounts.mockClear();
    mocks.queryClientCreations.mockClear();
    mocks.surfaceHookMounts.mockClear();
    mocks.fitnessSurfaceMounts.mockClear();
    mocks.planSurfaceMounts.mockClear();
    mocks.surfaceReadyCallbacks.activityAnalysis = null;
    mocks.surfaceReadyCallbacks.fitness = null;
    mocks.surfaceReadyCallbacks.plan = null;
    mocks.consumeHandoff.mockClear();
    vi.mocked(onSnapshot).mockClear();
  });

  it("mounts no profile listener, React Query provider, or surface hook before sessionAccepted", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge);

    expect(bridge.sent).toContainEqual({
      type: "bootstrap.ready",
      payload: {
        contractVersion: 1,
        capabilities: ["host.surfaceSelected", "surface-selection-request-id-v1"],
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

    act(() => bridge.emit(hostMessage("host.surfaceSelected", { surface: null })));
    await waitFor(() => expect(screen.queryByTestId("plan-surface")).not.toBeInTheDocument());
    expect(mocks.queryClientCreations).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
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
});
