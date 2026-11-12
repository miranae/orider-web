import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "FINISHED", metadataError: false }));
const t = vi.hoisted(() => (key: string) => key);
const heartbeat = vi.hoisted(() => vi.fn(async () => ({})));
const ensureAppCheckReady = vi.hoisted(() => vi.fn(async () => {}));
const read = vi.hoisted(() => vi.fn());
const subscribe = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useParams: () => ({ eventId: "event-1" }),
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t, i18n: { language: "ko" } }) }));
vi.mock("../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ alert: vi.fn() }) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {}, ensureAppCheckReady }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => heartbeat }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  collection: (_db: unknown, path: string) => path,
  getDoc: read,
  onSnapshot: subscribe,
}));
vi.mock("../../components/event/EventMap", () => ({ default: () => null }));

import EventLivePage from "./EventLivePage";

describe("confirmed ended public live events", () => {
  beforeEach(() => {
    state.status = "FINISHED"; state.metadataError = false;
    heartbeat.mockClear(); ensureAppCheckReady.mockClear(); subscribe.mockReset(); read.mockReset();
    subscribe.mockImplementation(() => () => {});
    read.mockImplementation(async (path: string) => {
      if (path === "events/event-1") {
        if (state.metadataError) throw new Error("metadata denied");
        return { exists: () => true, data: () => ({ info: { name: "Ended fixture", status: state.status, courseIds: ["course-1"] } }) };
      }
      if (path.includes("/snapshots/")) throw new Error("snapshot denied");
      return { exists: () => false };
    });
  });

  it.each(["FINISHED", "CANCELLED"])("shows %s without live reads or presence writes", async status => {
    state.status = status;
    render(<EventLivePage />);
    expect(await screen.findByText("dashboard.trackingEnded")).toBeInTheDocument();
    expect(read.mock.calls.map(([path]) => path)).toEqual(["events/event-1"]);
    expect(subscribe).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
    expect(ensureAppCheckReady).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "participantsView.eventDetailLink" })).toHaveAttribute("href", "/event/event-1");
    expect(screen.queryByRole("link", { name: "resultsTitle" }) !== null).toBe(status === "FINISHED");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps metadata failure visible and does not start snapshot or presence reads", async () => {
    state.metadataError = true;
    render(<EventLivePage />);
    expect(await screen.findByText("metadata denied")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.trackingEnded")).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it.each(["OPEN", "LIVE"])("preserves %s snapshot failure and presence behavior", async status => {
    state.status = status;
    render(<EventLivePage />);
    expect(await screen.findByText("snapshot denied")).toBeInTheDocument();
    await waitFor(() => expect(heartbeat).toHaveBeenCalledWith(expect.objectContaining({ active: true })));
    expect(subscribe).toHaveBeenCalledWith("events/event-1/viewers", expect.any(Function), expect.any(Function));
    expect(read).toHaveBeenCalledWith("events/event-1/snapshots/public_latest");
    expect(screen.queryByText("dashboard.trackingEnded")).toBeNull();
  });

  it("waits for metadata before opening any live data path", async () => {
    let resolve!: (value: unknown) => void;
    read.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<EventLivePage />);
    expect(subscribe).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
    await act(async () => resolve({ exists: () => true, data: () => ({ info: { status: "FINISHED", name: "Delayed metadata" } }) }));
    expect(await screen.findByText("dashboard.trackingEnded")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
