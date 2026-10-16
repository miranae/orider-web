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
}));
const translate = vi.hoisted(() => (key: string) => key);
const firebaseAuth = vi.hoisted(() => ({ currentUser: { uid: "host-1" } as { uid: string } | null }));

vi.mock("react-router-dom", () => ({ useParams: () => ({ eventId: "event-1" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "host-1" }, loading: false }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }) }));
vi.mock("../../services/firebase", () => ({ auth: firebaseAuth, firestore: {}, functions: {}, getAppCheckToken: vi.fn() }));
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
vi.mock("../../components/RouteMap", () => ({ default: () => null }));
vi.mock("../../components/event/ParticipantTable", () => ({ default: ({ locations }: { locations: Array<{ displayName: string }> }) => <div>{locations.map(location => location.displayName).join(", ")}</div> }));
vi.mock("./privateSnapshotPages", () => ({ loadPrivateSnapshotWithRetry: () => new Promise(resolve => { listeners.pageResolve = resolve; }) }));

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
    firebaseAuth.currentUser = { uid: "host-1" };
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
  it("an unrelated RIDER cannot enter or read private map data", async () => {
    listeners.creatorId = "creator-elsewhere"; listeners.role = "RIDER";
    render(<EventDashboardPage />);
    expect(await screen.findByText("host.permissionDenied")).toBeInTheDocument();
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

});
