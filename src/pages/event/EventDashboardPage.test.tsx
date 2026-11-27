import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => ({
  failEvent: false, status: "LIVE",
  creatorId: "host-1", role: "LEADER" as string | null, privateSubscriptions: 0,
  deferredPage: false,
  snapshotError: null as null | ((error: Error) => void),
  pageResolve: null as null | ((value: unknown) => void),
  authChanged: null as null | ((user: { uid: string } | null) => void),
  eventError: null as null | ((error: Error) => void),
  snapshotSubscriptions: 0,
  eventNext: null as null | ((value: unknown) => void),
  snapshotNext: null as null | ((value: unknown) => void),
  operatorWorld: false, webgl: true, mapboxToken: "pk.test", markerMapThrows: false,
  onFatalMapError: null as null | (() => void),
  // true면 월드 스트림을 붙잡아 첫 스냅샷 전 상태를 본다.
  holdWorld: false,
  worldSubscribe: null as null | { receive: (value: unknown) => void; options: { reconnecting?: (retrying: boolean) => void } },
}));
const translate = vi.hoisted(() => (key: string) => key);
const firebaseAuth = vi.hoisted(() => ({ currentUser: { uid: "host-1" } as { uid: string } | null }));

vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useParams: () => ({ eventId: "event-1" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => vi.fn(), useLocalizedPath: (path: string) => `/ko${path}` }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: firebaseAuth.currentUser, loading: false }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }) }));
vi.mock("../../services/firebase", () => ({ auth: firebaseAuth, firestore: {}, functions: {}, getAppCheckToken: vi.fn(), ensureAppCheckReady: vi.fn() }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: { uid: string } | null) => void) => {
  listeners.authChanged = callback;
  return () => { listeners.authChanged = null; };
} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => path,
  collection: (_db: unknown, path: string) => path,
  getDocs: async () => ({ docs: [] }),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ role: listeners.role }) })),
  onSnapshot: (path: string, next: (value: unknown) => void, error: (value: Error) => void) => {
    if (path.includes("/snapshots/")) listeners.privateSubscriptions++;
    if (path === "events/event-1") { listeners.eventError = error; listeners.eventNext = next; }
    else if (path.includes("/snapshots/")) listeners.snapshotNext = next;
    queueMicrotask(() => {
      if (path === "events/event-1" && listeners.failEvent) error(new Error("event denied"));
      else if (path === "events/event-1") next({ exists: () => true, data: () => ({ info: { name: "QA event", status: listeners.status, creatorId: listeners.creatorId, type: "TOUR" }, counters: { totalRegistered: 1 } }) });
      else if (listeners.deferredPage) {
        listeners.snapshotSubscriptions++;
        listeners.snapshotError = error;
        next({ exists: () => true, data: () => ({ timestamp: 1, checkpoints: [], locations: [] }) });
      } else error(new Error("snapshot denied"));
    });
    return () => {};
  },
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("../../components/RouteMap", () => ({ default: () => <div data-testid="route-map" />, supportsWebGL: () => listeners.webgl }));
vi.mock("../../components/event/EventMap", () => ({ default: ({ locations, pendingFinish, onFatalMapError }: { locations: Array<{ uid: string }>; pendingFinish?: boolean; onFatalMapError?: () => void }) => {
  if (listeners.markerMapThrows) throw new Error("map render failed");
  listeners.onFatalMapError = onFatalMapError ?? null;
  return <div data-testid="event-map" data-pending-finish={String(pendingFinish)}>{locations.map(location => location.uid).join(",")}</div>;
} }));
vi.mock("../../utils/mapbox", () => ({ getMapboxToken: () => listeners.mapboxToken }));
vi.mock("../../features/ride-world/useWorldEvent", async importOriginal => ({
  ...await importOriginal<typeof import("../../features/ride-world/useWorldEvent")>(),
  isProductionWorldEventEnabled: () => listeners.operatorWorld,
}));
vi.mock("../../services/runtimeConfig", async importOriginal => {
  const actual = await importOriginal<typeof import("../../services/runtimeConfig")>();
  return { ...actual, getRuntimeConfig: () => ({ ...actual.getRuntimeConfig(), operatorWorldSnapshotsEnabled: listeners.operatorWorld }) };
});
// 월드 스트림 대신 Firestore 폴백으로 바로 넘어간다: 출처와 관계없이 같은 지도 규칙을 쓰는지 본다.
// holdWorld면 스트림을 붙잡아 첫 스냅샷 전(연결 중·재시도 중) 상태를 본다.
vi.mock("./operatorSnapshotStream", () => ({
  LOCAL_OPERATOR_SNAPSHOT_ENDPOINT: "ws://local", PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT: "wss://production",
  subscribeOperatorSnapshot: (_eventId: string, _user: unknown, receive: (value: unknown) => void, _denied: unknown, fallback: () => () => void,
    options: { reconnecting?: (retrying: boolean) => void }) => {
    if (!listeners.holdWorld) return fallback();
    listeners.worldSubscribe = { receive, options };
    return () => {};
  },
}));
vi.mock("../../components/event/ParticipantTable", () => ({ default: ({ locations }: { locations: Array<{ displayName: string }> }) => <div>{locations.map(location => location.displayName).join(", ")}</div> }));
vi.mock("./privateSnapshotPages", () => ({ loadPrivateSnapshotWithRetry: () => new Promise(resolve => { listeners.pageResolve = resolve; }) }));

import { MemoryRouter } from "react-router-dom";
import EventDashboardPage from "./EventDashboardPage";

describe("EventDashboardPage read failures", () => {
  beforeEach(() => {
    listeners.failEvent = false; listeners.status = "LIVE";
    listeners.creatorId = "host-1"; listeners.role = "LEADER"; listeners.privateSubscriptions = 0;
    listeners.deferredPage = false;
    listeners.snapshotError = null;
    listeners.pageResolve = null;
    listeners.authChanged = null;
    listeners.eventError = null;
    listeners.snapshotSubscriptions = 0;
    listeners.eventNext = null; listeners.snapshotNext = null;
    listeners.holdWorld = false; listeners.worldSubscribe = null;
    firebaseAuth.currentUser = { uid: "host-1" };
    listeners.operatorWorld = false; listeners.webgl = true; listeners.mapboxToken = "pk.test"; listeners.markerMapThrows = false; listeners.onFatalMapError = null;
  });

  it.each(["FINISHED", "CANCELLED"])("does not subscribe to live locations for a confirmed %s event", async status => {
    listeners.status = status;
    render(<EventDashboardPage />);
    expect(await screen.findAllByText("dashboard.trackingEnded")).toHaveLength(1);
    expect(screen.queryByText("dashboard.liveAlerts")).toBeNull();
    expect(screen.queryByText("dashboard.noAlertsYet")).toBeNull();
    expect(screen.queryByText("dashboard.statusTitle")).toBeNull();
    expect(document.querySelector(".event-dashboard-body")).toHaveStyle({ gridTemplateColumns: "280px 1fr" });
    expect(listeners.privateSubscriptions).toBe(0);
    expect(screen.queryByText(/LIVE ·/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "resultsTitle" }) !== null).toBe(status === "FINISHED");
  });

  it("retains recorded alerts with an event label after the event ends", async () => {
    listeners.deferredPage = true;
    render(<EventDashboardPage />);
    await waitFor(() => expect(listeners.pageResolve).not.toBeNull());
    const resolveLocations = (status: string) => listeners.pageResolve?.({
      snapshot: { timestamp: 1, checkpoints: [], locations: [] },
      locations: [{ uid: "rider-1", displayName: "Rider", status, category: "Road" }],
    });
    act(() => resolveLocations("RIDING"));
    await screen.findByText("Rider");
    fireEvent.click(screen.getByRole("button", { name: "Road" }));
    act(() => listeners.snapshotNext?.({ exists: () => true, data: () => ({}) }));
    act(() => resolveLocations("SOS"));
    await screen.findByText("dashboard.alert.sos");
    act(() => listeners.eventNext?.({ exists: () => true, data: () => ({ info: { name: "QA event", status: "FINISHED", creatorId: "host-1", type: "TOUR" }, counters: { totalRegistered: 7 } }) }));
    expect(await screen.findByText("dashboard.eventAlerts")).toBeInTheDocument();
    expect(screen.getByText("dashboard.alert.sos")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.liveAlerts")).toBeNull();
    expect(screen.getByText("label.totalParticipants").parentElement).toHaveTextContent("7");
    expect(document.querySelector(".event-dashboard-body")).toHaveStyle({ gridTemplateColumns: "280px 1fr 320px" });
  });

  it("keeps LEADER Finish available and warns when only the optional snapshot is denied", async () => {
    render(<EventDashboardPage />);
    expect(await screen.findByRole("button", { name: /button.finish/ })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("snapshot denied");
    expect(screen.getAllByText("dashboard.snapshotUnavailable")).toHaveLength(2);
    expect(screen.queryByText(/0\s*\/\s*0/)).toBeNull();
  });

  // 월드 첫 스냅샷 전(연결 중·재시도 중)에도 운영 컨트롤은 바로 쓸 수 있고 지도·표 영역에만 상태를 보인다(11-25 결정).
  it("keeps operator controls usable while the world snapshot is still connecting or reconnecting", async () => {
    listeners.operatorWorld = true; listeners.holdWorld = true;
    render(<EventDashboardPage />);
    expect(await screen.findByRole("button", { name: /button.finish/ })).toBeTruthy();
    expect(listeners.worldSubscribe).not.toBeNull();
    expect(screen.getByText("dashboard.worldConnecting")).toBeTruthy();
    act(() => { listeners.worldSubscribe!.options.reconnecting!(true); });
    expect(screen.getAllByText(/dashboard.worldReconnecting/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /button.finish/ })).toBeTruthy();
    expect(listeners.privateSubscriptions).toBe(0);
  });

  it("blocks Finish when the event document itself is denied", async () => {
    listeners.failEvent = true;
    render(<EventDashboardPage />);
    expect(await screen.findByText("event denied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /button.finish/ })).toBeNull();
  });

  it("keeps the warning and hides stale locations when a delayed page resolves after listener denial", async () => {
    listeners.deferredPage = true;
    render(<EventDashboardPage />);
    await waitFor(() => expect(listeners.pageResolve).not.toBeNull());
    act(() => { listeners.snapshotError?.(new Error("snapshot denied")); });
    act(() => {
      listeners.pageResolve?.({ snapshot: { timestamp: 1, checkpoints: [], locations: [] },
        locations: [{ uid: "rider-1", displayName: "STALE LOCATION", status: "RIDING" }] });
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("snapshot denied"));
    expect(screen.queryByText("STALE LOCATION")).toBeNull();
    expect(screen.getByRole("button", { name: /button.finish/ })).toBeTruthy();
  });

  it("clears loaded locations and resubscribes after batched A-to-B-to-A authentication", async () => {
    listeners.deferredPage = true;
    render(<EventDashboardPage />);
    await waitFor(() => expect(listeners.pageResolve).not.toBeNull());
    act(() => {
      listeners.pageResolve?.({ snapshot: { timestamp: 1, checkpoints: [], locations: [] },
        locations: [{ uid: "rider-1", displayName: "INITIAL LOCATION", status: "RIDING" }] });
    });
    expect(await screen.findByText("INITIAL LOCATION")).toBeTruthy();
    const previousError = listeners.snapshotError;
    const previousEventError = listeners.eventError;
    act(() => {
      firebaseAuth.currentUser = { uid: "other-1" };
      listeners.authChanged?.(firebaseAuth.currentUser);
      firebaseAuth.currentUser = { uid: "host-1" };
      listeners.authChanged?.(firebaseAuth.currentUser);
    });
    await waitFor(() => expect(listeners.snapshotSubscriptions).toBe(2));
    expect(screen.queryByText("INITIAL LOCATION")).toBeNull();
    act(() => { previousError?.(new Error("stale snapshot denied")); });
    act(() => { previousEventError?.(new Error("stale event denied")); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("stale event denied")).toBeNull();
    act(() => { listeners.snapshotError?.(new Error("fresh snapshot denied")); });
    expect(screen.getByRole("alert").textContent).toContain("fresh snapshot denied");
    expect(screen.getByRole("button", { name: /button.finish/ })).toBeTruthy();
  });
  it("role-only STAFF can announce without mounting any private map subscription", async () => {
    listeners.creatorId = "creator-elsewhere"; listeners.role = "STAFF";
    render(<EventDashboardPage />);
    expect(await screen.findByTestId("O1-role-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "action.sendNotice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /button.finish/ })).not.toBeInTheDocument();
    expect(listeners.privateSubscriptions).toBe(0);
  });
  it("role-only operators get the participant view as an icon beside the title, keeping real CTAs as text", async () => {
    listeners.creatorId = "creator-elsewhere"; listeners.role = "STAFF"; listeners.status = "OPEN";
    render(<EventDashboardPage />);
    const participantView = await screen.findByRole("button", { name: "action.participantView" });
    expect(participantView).toHaveClass("ds-btn--icon-only");
    expect(participantView).toHaveAttribute("title", "action.participantView");
    expect(participantView).toHaveTextContent("");
    expect(participantView.parentElement).toContainElement(screen.getByRole("heading", { level: 1, name: "QA event" }));
    // 전체 공지는 실제 동작이라 글자 버튼으로 남는다.
    expect(screen.getByRole("button", { name: "action.sendNotice" })).not.toHaveClass("ds-btn--icon-only");
  });
  it("shows the spectator view as an icon-only header action on the private dashboard", async () => {
    render(<EventDashboardPage />);
    const spectator = await screen.findByRole("button", { name: "action.spectatorView" });
    expect(spectator).toHaveClass("ds-btn--icon-only");
    expect(spectator).toHaveAttribute("title", "action.spectatorView");
    expect(spectator).toHaveTextContent("");
  });
  it("an unrelated RIDER cannot enter or read private map data", async () => {
    listeners.creatorId = "creator-elsewhere"; listeners.role = "RIDER";
    render(<MemoryRouter initialEntries={["/ko/event/event-1/host"]}><EventDashboardPage /></MemoryRouter>);
    expect(await screen.findByText("host.permissionDenied")).toBeInTheDocument();
    // 권한 없음 문구 자체를 누르면 이벤트로 돌아간다 — 설명·버튼은 덧붙이지 않는다.
    expect(screen.getByRole("link", { name: "host.permissionDenied" })).toHaveAttribute("href", "/ko/event/event-1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(listeners.privateSubscriptions).toBe(0);
    expect(screen.queryByRole("button", { name: /button.finish/ })).not.toBeInTheDocument();
  });
  it("being creator permits data reads without granting LEADER/STAFF callable controls", async () => {
    listeners.role = "RIDER"; render(<EventDashboardPage />);
    expect(await screen.findByText("QA event")).toBeInTheDocument();
    await waitFor(() => expect(listeners.privateSubscriptions).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /button.finish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "action.sendNotice" })).not.toBeInTheDocument();
  });

  describe("operator world map markers (#4078)", () => {
    const showRider = async () => {
      listeners.deferredPage = true;
      render(<EventDashboardPage />);
      await waitFor(() => expect(listeners.pageResolve).not.toBeNull());
      act(() => {
        listeners.pageResolve?.({ snapshot: { timestamp: 1, checkpoints: [], locations: [] },
          locations: [{ uid: "rider-1", displayName: "Rider", status: "FINISHED", overallRank: 1 }] });
      });
      await screen.findByText("Rider");
    };

    it("draws participant markers with the table's pending-finish rank rule in operator world mode", async () => {
      listeners.operatorWorld = true;
      await showRider();
      const map = await screen.findByTestId("event-map");
      expect(map).toHaveTextContent("rider-1");
      expect(map).toHaveAttribute("data-pending-finish", "true");
      expect(screen.queryByTestId("route-map")).toBeNull();
    });

    it("keeps the course map when the operator world mode is off", async () => {
      await showRider();
      expect(screen.getByTestId("route-map")).toBeInTheDocument();
      expect(screen.queryByTestId("event-map")).toBeNull();
    });

    it.each([["WebGL is unsupported", { webgl: false }], ["the Mapbox token is missing", { mapboxToken: "" }]])(
      "falls back to the course map when %s", async (_label, override) => {
        listeners.operatorWorld = true;
        Object.assign(listeners, override);
        await showRider();
        expect(screen.getByTestId("route-map")).toBeInTheDocument();
        expect(screen.queryByTestId("event-map")).toBeNull();
      });

    it("falls back to the course map when the marker map fails to render", async () => {
      listeners.operatorWorld = true;
      listeners.markerMapThrows = true;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      await showRider();
      expect(await screen.findByTestId("route-map")).toBeInTheDocument();
      expect(screen.queryByTestId("event-map")).toBeNull();
      consoleError.mockRestore();
    });

    it("falls back to the course map when the marker map emits a fatal mapbox error", async () => {
      listeners.operatorWorld = true;
      await showRider();
      expect(await screen.findByTestId("event-map")).toBeInTheDocument();
      act(() => { listeners.onFatalMapError?.(); });
      expect(await screen.findByTestId("route-map")).toBeInTheDocument();
      expect(screen.queryByTestId("event-map")).toBeNull();
    });
  });
});
