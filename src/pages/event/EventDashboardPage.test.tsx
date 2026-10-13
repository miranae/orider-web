import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => ({
  failEvent: false,
  deferredPage: false,
  snapshotError: null as null | ((error: Error) => void),
  pageResolve: null as null | ((value: unknown) => void),
  authChanged: null as null | ((user: { uid: string } | null) => void),
  eventError: null as null | ((error: Error) => void),
  snapshotSubscriptions: 0,
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
  getDoc: vi.fn(),
  onSnapshot: (path: string, next: (value: unknown) => void, error: (value: Error) => void) => {
    if (path === "events/event-1") listeners.eventError = error;
    queueMicrotask(() => {
      if (path === "events/event-1" && listeners.failEvent) error(new Error("event denied"));
      else if (path === "events/event-1") next({ exists: () => true, data: () => ({ info: { name: "QA event", status: "LIVE", creatorId: "host-1", type: "TOUR" }, counters: { totalRegistered: 1 } }) });
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
    listeners.failEvent = false;
    listeners.deferredPage = false;
    listeners.snapshotError = null;
    listeners.pageResolve = null;
    listeners.authChanged = null;
    listeners.eventError = null;
    listeners.snapshotSubscriptions = 0;
    firebaseAuth.currentUser = { uid: "host-1" };
  });

  it("keeps owner Finish available and warns when only the optional snapshot is denied", async () => {
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
});
