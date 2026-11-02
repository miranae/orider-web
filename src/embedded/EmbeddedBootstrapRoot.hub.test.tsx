import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setDocData, simulateLogin } from "../__tests__/mocks/firebase";
import type { EmbeddedBridge, HostBridgeEnvelope, WebMessageType } from "./bridge";

const mocks = vi.hoisted(() => {
  const state = { currentUser: { uid: "owner-1" } as { uid: string; isAnonymous?: boolean } | null };
  return {
    state,
    isolate: vi.fn(async (_uid: string | null) => {}),
    consumeHandoff: vi.fn().mockResolvedValue(undefined),
    auth: {
      get currentUser() { return state.currentUser; },
      authStateReady: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("./embeddedFirebase", () => ({
  initEmbeddedFirebase: () => ({ app: {}, auth: mocks.auth, firestore: { instance: "embedded" }, functions: {} }),
  ensureEmbeddedAppCheckReady: vi.fn().mockResolvedValue(undefined),
  getEmbeddedAppCheckToken: vi.fn().mockResolvedValue("token"),
  embeddedAccountReady: () => true,
  embeddedFirestoreOwnerUid: () => null,
  getEmbeddedFirestore: () => ({ instance: "embedded" }),
  isolateEmbeddedAccount: (uid: string | null) => mocks.isolate(uid),
}));
vi.mock("../services/appHandoff", () => ({ consumeAppHandoffCode: mocks.consumeHandoff }));

function hubSurfaceMock(testId: string) {
  return {
    default: ({ onReady }: { onReady: () => void }) => (
      <div data-testid={testId}>
        <button type="button" onClick={onReady}>ready</button>
        <a href="/ko/club/club-1">club detail</a>
        <a href="/ko/explore/events?type=race">events tab</a>
        <a href="https://example.com/rules">external</a>
      </div>
    ),
  };
}
vi.mock("./surfaces/ClubsSurface", () => hubSurfaceMock("clubs-surface"));
vi.mock("./surfaces/ExploreSurface", () => hubSurfaceMock("explore-surface"));
vi.mock("./surfaces/SearchSurface", () => hubSurfaceMock("search-surface"));

// 클럽 상세는 실제 ClubDetailSurface(하위 라우팅)를 쓰고 웹 클럽 화면만 가볍게 바꾼다.
function clubPageMock(name: string) {
  return {
    default: () => (
      <div data-testid={`club-page-${name}`}>
        <a href="/ko/club/club-1/members">members</a>
        <a href="/ko/club/club-1">club home</a>
        <a href="/ko/club/club-2">other club</a>
        <a href="/ko/athlete/user-9">athlete</a>
      </div>
    ),
  };
}
vi.mock("../pages/group/GroupDashboardPage", () => clubPageMock("dashboard"));
vi.mock("../pages/group/GroupMembersPage", () => clubPageMock("members"));
vi.mock("../pages/group/GroupWeekPage", () => clubPageMock("week"));

import EmbeddedBootstrapRoot, { type EmbeddedSurfaceKind } from "./EmbeddedBootstrapRoot";
import { isEmbeddedRoutePath } from "../App";

interface FakeBridge extends EmbeddedBridge {
  emit(message: HostBridgeEnvelope): void;
  sent: Array<{ type: WebMessageType; payload: unknown; requestId?: string }>;
}

function createFakeBridge(): FakeBridge {
  const listeners = new Set<(message: HostBridgeEnvelope) => void>();
  const sent: FakeBridge["sent"] = [];
  return {
    sent,
    send(type, payload, requestId) { sent.push({ type, payload, requestId }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose: vi.fn(),
    emit(message) { listeners.forEach((listener) => listener(message)); },
  };
}

const message = (type: HostBridgeEnvelope["type"], payload: unknown, requestId?: string): HostBridgeEnvelope =>
  ({ version: 1, type, payload, requestId });
const accepted = { theme: { mode: "light" }, locale: "ko", safeInsets: { top: 0, bottom: 0 } };

function renderHub(bridge: FakeBridge, surfaceKind: EmbeddedSurfaceKind, path = `/ko/embed/${surfaceKind}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:lang/embed/:hub" element={<EmbeddedBootstrapRoot bridgeFactory={() => bridge} surfaceKind={surfaceKind} />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function authorize(bridge: FakeBridge, payload: unknown) {
  await act(async () => bridge.emit(message("host.authorize", payload, "auth-1")));
  await waitFor(() => expect(bridge.sent.some(item => item.type === "auth.state")).toBe(true));
}

describe("app tab hub embeds", () => {
  beforeEach(() => {
    mocks.state.currentUser = { uid: "owner-1" };
    setDocData("users/owner-1", { nickname: "owner" });
    // 표면 계정 잠금(onAuthStateChanged)도 같은 계정을 본다.
    simulateLogin({ uid: "owner-1" });
    mocks.isolate.mockClear();
    mocks.consumeHandoff.mockClear();
  });

  it("routes the hub embeds and club detail outside the standard web shell", () => {
    for (const hub of ["clubs", "explore", "search"]) {
      expect(isEmbeddedRoutePath(`/ko/embed/${hub}`)).toBe(true);
      expect(isEmbeddedRoutePath(`/en/embed/${hub}/`)).toBe(true);
    }
    expect(isEmbeddedRoutePath("/ko/embed/clubs/club-1")).toBe(true);
    expect(isEmbeddedRoutePath("/en/embed/clubs/club-1/meetings/m-1/edit")).toBe(true);
    expect(isEmbeddedRoutePath("/ko/embed/explore/extra")).toBe(false);
    expect(isEmbeddedRoutePath("/ko/club/club-1")).toBe(false);
    expect(isEmbeddedRoutePath("/ko/clubs")).toBe(false);
  });

  it("advertises the club detail embed so the app only opens it in-app on a web that has the route", async () => {
    const bridge = createFakeBridge();
    renderHub(bridge, "clubs");
    await waitFor(() => expect(bridge.sent.some(item => item.type === "bootstrap.ready")).toBe(true));
    const ready = bridge.sent.find(item => item.type === "bootstrap.ready");
    expect((ready?.payload as { capabilities: string[] }).capabilities).toContain("club-detail-embed-v1");
  });

  it.each(["clubs", "explore", "search"] as const)("opens the signed-in %s surface with the existing handoff and reports readiness", async (kind) => {
    const bridge = createFakeBridge();
    renderHub(bridge, kind);
    await authorize(bridge, { expectedUid: "owner-1", contractVersion: 1 });
    expect(bridge.sent).toContainEqual({ type: "auth.state", payload: { uid: "owner-1" }, requestId: "auth-1" });
    act(() => bridge.emit(message("host.sessionAccepted", accepted)));
    fireEvent.click(await screen.findByRole("button", { name: "ready" }));
    expect(bridge.sent).toContainEqual({ type: "surface.ready", payload: { surface: kind }, requestId: undefined });
  });

  it("shows public hub content as a guest when the app has no signed-in web session", async () => {
    mocks.state.currentUser = null;
    simulateLogin(null);
    const bridge = createFakeBridge();
    renderHub(bridge, "clubs");
    await authorize(bridge, { contractVersion: 1 });
    expect(bridge.sent).toContainEqual({ type: "auth.state", payload: { uid: null }, requestId: "auth-1" });
    act(() => bridge.emit(message("host.sessionAccepted", accepted)));
    expect(await screen.findByTestId("clubs-surface")).toBeInTheDocument();
    expect(mocks.isolate).toHaveBeenCalledWith(null);
    expect(bridge.sent.some(item => item.type === "surface.error")).toBe(false);
  });

  it("falls back to a guest session when the handoff for the expected account produced no user", async () => {
    mocks.state.currentUser = null;
    const bridge = createFakeBridge();
    renderHub(bridge, "explore");
    await authorize(bridge, { expectedUid: "owner-1", contractVersion: 1 });
    act(() => bridge.emit(message("host.sessionAccepted", accepted)));
    expect(await screen.findByTestId("explore-surface")).toBeInTheDocument();
  });

  it("still rejects a different signed-in account and keeps guest authorization limited to hub surfaces", async () => {
    mocks.state.currentUser = { uid: "someone-else" };
    const bridge = createFakeBridge();
    renderHub(bridge, "search");
    await authorize(bridge, { expectedUid: "owner-1", contractVersion: 1 });
    act(() => bridge.emit(message("host.sessionAccepted", accepted, "accept-1")));
    expect(bridge.sent).toContainEqual({ type: "surface.error", payload: { code: "auth_uid_mismatch" }, requestId: "accept-1" });
    expect(screen.queryByTestId("search-surface")).toBeNull();

    mocks.state.currentUser = null;
    const fitnessBridge = createFakeBridge();
    renderHub(fitnessBridge, "fitness", "/ko/embed/fitness");
    act(() => fitnessBridge.emit(message("host.authorize", { contractVersion: 1 }, "auth-2")));
    expect(fitnessBridge.sent).toContainEqual({ type: "surface.error", payload: { code: "invalid_host_payload" }, requestId: "auth-2" });
  });

  it("rejects training surface selection messages on hub surfaces", async () => {
    const bridge = createFakeBridge();
    renderHub(bridge, "explore");
    await authorize(bridge, { expectedUid: "owner-1", contractVersion: 1 });
    act(() => bridge.emit(message("host.sessionAccepted", accepted)));
    await screen.findByTestId("explore-surface");
    act(() => bridge.emit(message("host.surfaceSelected", { surface: "fitness" }, "select-1")));
    expect(bridge.sent).toContainEqual({ type: "surface.error", payload: { code: "invalid_host_state" }, requestId: "select-1" });
  });

  it("opens a public club detail as a guest and keeps the club's own sub pages inside the embed", async () => {
    mocks.state.currentUser = null;
    simulateLogin(null);
    const bridge = createFakeBridge();
    render(
      <MemoryRouter initialEntries={["/ko/embed/clubs/club-1"]}>
        <Routes>
          <Route path="/:lang/embed/clubs/:groupId/*" element={<EmbeddedBootstrapRoot bridgeFactory={() => bridge} surfaceKind="club-detail" />} />
        </Routes>
      </MemoryRouter>,
    );
    await authorize(bridge, { contractVersion: 1 });
    act(() => bridge.emit(message("host.sessionAccepted", accepted)));
    expect(await screen.findByTestId("club-page-dashboard")).toBeInTheDocument();
    await waitFor(() => expect(bridge.sent).toContainEqual({ type: "surface.ready", payload: { surface: "club-detail" }, requestId: undefined }));

    fireEvent.click(screen.getByRole("link", { name: "members" }));
    expect(await screen.findByTestId("club-page-members")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "club home" }));
    expect(await screen.findByTestId("club-page-dashboard")).toBeInTheDocument();
    expect(bridge.sent.some(item => item.type === "navigation.openNative")).toBe(false);

    // 다른 클럽·상세 밖 경로는 앱이 정한다(다른 클럽은 앱이 새 상세로 push).
    fireEvent.click(screen.getByRole("link", { name: "other club" }));
    expect(bridge.sent).toContainEqual({ type: "navigation.openNative", payload: { path: "/ko/club/club-2" }, requestId: undefined });
    fireEvent.click(screen.getByRole("link", { name: "athlete" }));
    expect(bridge.sent).toContainEqual({ type: "navigation.openNative", payload: { path: "/ko/athlete/user-9" }, requestId: undefined });
  });

  it("hands detail and other-hub links to the app, keeps explore list links in the WebView, and opens external links outside", async () => {
    const bridge = createFakeBridge();
    renderHub(bridge, "explore");
    await authorize(bridge, { expectedUid: "owner-1", contractVersion: 1 });
    act(() => bridge.emit(message("host.sessionAccepted", accepted)));
    await screen.findByTestId("explore-surface");

    fireEvent.click(screen.getByRole("link", { name: "club detail" }));
    expect(bridge.sent).toContainEqual({ type: "navigation.openNative", payload: { path: "/ko/club/club-1" }, requestId: undefined });

    const before = bridge.sent.length;
    fireEvent.click(screen.getByRole("link", { name: "events tab" }));
    expect(bridge.sent.slice(before).some(item => item.type === "navigation.openNative")).toBe(false);

    fireEvent.click(screen.getByRole("link", { name: "external" }));
    expect(bridge.sent).toContainEqual({ type: "navigation.openExternal", payload: { url: "https://example.com/rules" }, requestId: undefined });
  });
});
