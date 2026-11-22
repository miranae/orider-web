import { act, render, screen, waitFor, within } from "@testing-library/react";
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

import type { WorldEventFrame } from "../../features/ride-world/useWorldEvent";
const presence = vi.hoisted(() => ({ enabled: false, frame: null as WorldEventFrame | null }));
vi.mock("../../features/ride-world/useWorldEvent", async importActual => ({
  ...await importActual<typeof import("../../features/ride-world/useWorldEvent")>(),
  isLocalWorldEventEnabled: () => presence.enabled,
  useWorldEvent: () => presence.frame,
}));

import EventLivePage from "./EventLivePage";

describe("confirmed ended public live events", () => {
  beforeEach(() => {
    state.status = "FINISHED"; state.metadataError = false;
    presence.enabled = false; presence.frame = null;
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
    // 시청자 수는 viewers 컬렉션이 아니라 서버 요약 문서 하나를 구독한다.
    expect(subscribe).toHaveBeenCalledWith("events/event-1/viewer_summary/current", expect.any(Function), expect.any(Function));
    expect(subscribe).not.toHaveBeenCalledWith("events/event-1/viewers", expect.any(Function), expect.any(Function));
    expect(read).toHaveBeenCalledWith("events/event-1/snapshots/public_latest");
    expect(screen.queryByText("dashboard.trackingEnded")).toBeNull();
  });

  it("does not start Firestore presence when the local socket provides a snapshot within the grace window", async () => {
    vi.useFakeTimers();
    try {
      state.status = "LIVE";
      presence.enabled = true;
      const view = render(<EventLivePage />);
      await act(async () => {});
      await act(async () => vi.advanceTimersByTimeAsync(2_000));
      expect(heartbeat).not.toHaveBeenCalled();
      presence.frame = { v: 1, type: "event_snapshot", eventId: "event-1", revision: 1, updatedAt: 1,
        viewers: 1, counts: { riding: 0, total: 0 }, markers: [], roster: [] };
      view.rerender(<EventLivePage />);
      await act(async () => vi.advanceTimersByTimeAsync(3_001));
      expect(heartbeat).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalledWith("events/event-1/viewer_summary/current", expect.any(Function), expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores Firestore presence when the local socket still has no snapshot after the grace window", async () => {
    vi.useFakeTimers();
    try {
      state.status = "LIVE";
      presence.enabled = true;
      render(<EventLivePage />);
      await act(async () => {});
      await act(async () => vi.advanceTimersByTimeAsync(2_999));
      expect(heartbeat).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(heartbeat).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
      expect(subscribe).toHaveBeenCalledWith("events/event-1/viewer_summary/current", expect.any(Function), expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders share and host view as icon-only header actions with their labels", async () => {
    state.status = "LIVE";
    read.mockImplementation(async (path: string) => {
      if (path === "events/event-1") return { exists: () => true, data: () => ({ info: { name: "Live fixture", status: "LIVE" } }) };
      if (path.includes("/snapshots/")) return { exists: () => true, data: () => ({ timestamp: Date.now(), checkpoints: [], locations: [] }) };
      return { exists: () => false };
    });
    render(<EventLivePage />);
    const actions = await screen.findByTestId("event-live-header-actions");
    for (const name of ["button.share", "label.hostView"]) {
      const button = within(actions).getByRole("button", { name });
      expect(button).toHaveClass("ds-btn--icon-only");
      expect(button).toHaveAttribute("title", name);
      expect(button).toHaveTextContent("");
    }
  });

  it("unfollows a followed athlete from an icon-only X with the existing label", async () => {
    state.status = "LIVE";
    localStorage.setItem("event-follow:event-1:guest", JSON.stringify([7]));
    const rider = { uid: "r7", lat: 37, lng: 127, speed: 20, distance: 5000, status: "RIDING", displayName: "Follow fixture", bib: 7, category: null, rank: 1, overallRank: 1, lastCp: null, geohash: null };
    read.mockImplementation(async (path: string) => {
      if (path === "events/event-1") return { exists: () => true, data: () => ({ info: { name: "Live fixture", status: "LIVE" } }) };
      if (path.includes("/snapshots/")) return { exists: () => true, data: () => ({ timestamp: Date.now(), checkpoints: [], locations: [rider] }) };
      return { exists: () => false };
    });
    render(<EventLivePage />);
    const button = await screen.findByRole("button", { name: "action.unfollowAthlete" });
    expect(button).toHaveClass("ds-btn--icon-only");
    expect(button).toHaveAttribute("title", "action.unfollowAthlete");
    expect(button).toHaveTextContent("");
    act(() => { button.click(); });
    expect(screen.queryByRole("button", { name: "action.unfollowAthlete" })).toBeNull();
    expect(localStorage.getItem("event-follow:event-1:guest")).toBe("[]");
    localStorage.removeItem("event-follow:event-1:guest");
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
