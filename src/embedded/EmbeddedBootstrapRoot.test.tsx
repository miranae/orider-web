import { act, render, screen, waitFor } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { simulateLogin } from "../__tests__/mocks/firebase";

import type { EmbeddedBridge, HostBridgeEnvelope, WebMessageType } from "./bridge";

const mocks = vi.hoisted(() => {
  const state = {
    currentUser: { uid: "owner-1" } as { uid: string } | null,
    queryProviderMounts: vi.fn(),
    surfaceHookMounts: vi.fn(),
    fitnessSurfaceMounts: vi.fn(),
    planSurfaceMounts: vi.fn(),
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
  QueryClient: class {},
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
  default: () => {
    mocks.surfaceHookMounts();
    return <div data-testid="analysis-surface" />;
  },
}));

vi.mock("./surfaces/FitnessSurface", () => ({
  default: () => {
    mocks.fitnessSurfaceMounts();
    return <div data-testid="fitness-surface" />;
  },
}));

vi.mock("./surfaces/PlanSurface", () => ({
  default: () => {
    mocks.planSurfaceMounts();
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

function hostMessage(type: HostBridgeEnvelope["type"], payload: unknown): HostBridgeEnvelope {
  return { version: 1, type, payload };
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
  beforeEach(() => {
    mocks.setCurrentUser({ uid: "owner-1" });
    mocks.queryProviderMounts.mockClear();
    mocks.surfaceHookMounts.mockClear();
    mocks.fitnessSurfaceMounts.mockClear();
    mocks.planSurfaceMounts.mockClear();
    mocks.consumeHandoff.mockClear();
    vi.mocked(onSnapshot).mockClear();
  });

  it("mounts no profile listener, React Query provider, or surface hook before sessionAccepted", async () => {
    const bridge = createFakeBridge();
    renderBootstrap(bridge);

    expect(bridge.sent).toContainEqual({
      type: "bootstrap.ready",
      payload: { contractVersion: 1 },
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
