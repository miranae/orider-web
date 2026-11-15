import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { User } from "firebase/auth";
import { Route, Routes } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { getDoc, onSnapshot } from "firebase/firestore";
import { auth, getAppCheckToken } from "../../services/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableImplementation, setCallableResult, setDocData, simulateLogin as mockLogin, getCurrentUser } from "../../__tests__/mocks/firebase";
import EventDetailPage from "./EventDetailPage";
import EventDashboardPage from "./EventDashboardPage";
import koEventStrings from "../../i18n/resources/ko/event.json";
import enEventStrings from "../../i18n/resources/en/event.json";

const dialog = vi.hoisted(() => ({ confirm: vi.fn(async () => true), alert: vi.fn(async () => {}), prompt: vi.fn(async () => null) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => dialog }));
vi.mock("../../components/RouteMap", () => ({ default: () => null }));

function simulateLogin(value: { uid: string }) { mockLogin(value); auth.currentUser = getCurrentUser() as unknown as User; }

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const calls = (name: string) => mockCallableInvocations.filter((call) => call.name === name);
const constructed = (name: string) => vi.mocked(httpsCallable).mock.calls.filter((call) => call[1] === name);

function event(status: "OPEN" | "LIVE") {
  setDocData("events/qa-lifecycle/participants/test-uid", { userId: "test-uid", role: "LEADER", status: "REGISTERED" });
  setDocData("events/qa-lifecycle", { info: { name: "QA private lifecycle", creatorId: "test-uid", status,
    type: "TOUR", visibility: "PRIVATE", startTime: Date.now() + 86_400_000, categories: [] },
    counters: { totalRegistered: 1 } });
  setDocData("events/qa-lifecycle/snapshots/latest", { timestamp: Date.now(),
    counts: { riding: 0, finished: 0, dnf: 0, sos: 0, offCourse: 0, total: 0 }, checkpoints: [], locations: [] });
}

async function startButton() {
  event("OPEN");
  const view = renderWithProviders(<Routes><Route path="/ko/event/:eventId" element={<EventDetailPage />} />
    <Route path="/ko/event/:eventId/dashboard" element={<div>Dashboard destination</div>} />
    <Route path="/ko/event/:eventId/host" element={<div>Host destination</div>} /></Routes>,
    { route: "/ko/event/qa-lifecycle", authenticated: true });
  auth.currentUser = getCurrentUser() as unknown as User;
  const opens = await screen.findAllByRole("button", { name: /이벤트 시작/ });
  fireEvent.click(opens[0]);
  return { view, confirm: within(screen.getByRole("dialog")).getAllByRole("button", { name: /이벤트 시작/ }).at(-1)! };
}

async function finishButton() {
  event("LIVE");
  const view = renderWithProviders(<Routes><Route path="/ko/event/:eventId/dashboard" element={<EventDashboardPage />} />
    <Route path="/ko/event/:eventId/results" element={<div>Results destination</div>} /></Routes>,
    { route: "/ko/event/qa-lifecycle/dashboard", authenticated: true });
  return { view, finish: await screen.findByRole("button", { name: /이벤트 종료/ }) };
}

describe("event lifecycle cold App Check admission", () => {
  beforeEach(() => {
    vi.mocked(httpsCallable).mockClear();
    vi.mocked(getAppCheckToken).mockReset().mockResolvedValue("warm-token");
    dialog.confirm.mockClear().mockResolvedValue(true);
    dialog.alert.mockClear();
    setCallableResult("startEvent", { data: { success: true } });
    setCallableResult("finishEvent", { data: { success: true } });
  });

  it("holds a confirmed first Start until App Check is ready and submits once", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    const { confirm } = await startButton();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(constructed("startEvent")).toHaveLength(0);
    expect(calls("startEvent")).toHaveLength(0);
    await act(async () => { token.resolve("cold-token"); });
    await waitFor(() => expect(calls("startEvent")).toHaveLength(1));
    expect(calls("startEvent")[0].data).toEqual({ eventId: "qa-lifecycle" });
  });

  it("takes an already-started failure to the host screen when its message is tapped", async () => {
    setCallableImplementation("startEvent", () => { throw Object.assign(new Error("started"), { code: "functions/failed-precondition" }); });
    const { confirm } = await startButton();
    fireEvent.click(confirm);
    const message = await screen.findByText(koEventStrings["detail.error.alreadyStarted"]);
    fireEvent.click(message);
    expect(await screen.findByText("Host destination")).toBeInTheDocument();
  });

  it("reopens the start confirmation when a generic start failure message is tapped", async () => {
    setCallableImplementation("startEvent", () => { throw Object.assign(new Error("boom"), { code: "functions/internal" }); });
    const { confirm } = await startButton();
    fireEvent.click(confirm);
    const message = await screen.findByText(koEventStrings["detail.error.startFailed"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(message);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(calls("startEvent")).toHaveLength(1);
  });

  it("re-reads my registration when the 'not confirmed yet' message is tapped after a failed read", async () => {
    const read = vi.mocked(getDoc).getMockImplementation()!;
    let failing = true;
    vi.mocked(getDoc).mockImplementation(async (...args) => {
      if (failing && (args[0] as unknown as { path: string }).path === "events/qa-lifecycle/participants/test-uid") throw new Error("offline");
      return read(...args);
    });
    try {
      event("OPEN");
      renderWithProviders(<Routes><Route path="/ko/event/:eventId" element={<EventDetailPage />} /></Routes>,
        { route: "/ko/event/qa-lifecycle", authenticated: true });
      auth.currentUser = getCurrentUser() as unknown as User;
      const unknown = await screen.findByText(koEventStrings["detail.registrationStateUnknown"]);
      await waitFor(() => expect(unknown.closest("button")).not.toBeNull());
      failing = false;
      fireEvent.click(unknown);
      await waitFor(() => expect(screen.queryByText(koEventStrings["detail.registrationStateUnknown"])).not.toBeInTheDocument());
    } finally { vi.mocked(getDoc).mockImplementation(read); }
  });

  it("re-subscribes the live snapshot when its failure message is tapped", async () => {
    const original = vi.mocked(onSnapshot).getMockImplementation()!;
    let failing = true;
    vi.mocked(onSnapshot).mockImplementation(((...args: Parameters<typeof original>) => {
      if (!failing || (args[0] as { path?: string }).path !== "events/qa-lifecycle/snapshots/latest") return original(...args);
      (args[2] as (err: Error) => void)(Object.assign(new Error("denied"), { code: "permission-denied" }));
      return () => {};
    }) as never);
    try {
      await finishButton();
      const failure = await screen.findByText(new RegExp(koEventStrings["dashboard.errorLoadSnapshot"]));
      expect(failure.closest("button")).not.toBeNull();
      failing = false;
      fireEvent.click(failure);
      await waitFor(() => expect(screen.queryByText(new RegExp(koEventStrings["dashboard.errorLoadSnapshot"]))).not.toBeInTheDocument());
    } finally { vi.mocked(onSnapshot).mockImplementation(original); }
  });

  it("keeps Start blocked if account changes away and back while the token waits", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    const { confirm } = await startButton();
    fireEvent.click(confirm);
    await act(async () => { simulateLogin({ uid: "other-uid" }); simulateLogin({ uid: "test-uid" }); });
    await act(async () => { token.resolve("old-token"); });
    expect(constructed("startEvent")).toHaveLength(0);
    expect(calls("startEvent")).toHaveLength(0);
  });

  it("rejects same-owner SDK relogin during Start AppCheck and releases starting state", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    const { confirm } = await startButton();
    fireEvent.click(confirm);
    await act(async () => simulateLogin({ uid: "test-uid" }));
    await act(async () => token.resolve("old-token"));
    expect(calls("startEvent")).toHaveLength(0);
    const opens = await screen.findAllByRole("button", { name: /이벤트 시작/ });
    expect(opens[0]).toBeEnabled();
  });

  it("holds a confirmed first Finish until App Check is ready and submits once", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    const { finish } = await finishButton();
    fireEvent.click(finish);
    fireEvent.click(finish);
    await waitFor(() => expect(dialog.confirm).toHaveBeenCalledOnce());
    expect(dialog.confirm).toHaveBeenCalledWith(koEventStrings["dashboard.confirm.finish"], { destructive: true });
    expect(enEventStrings["dashboard.confirm.finish"]).toContain("pending");
    expect(koEventStrings["dashboard.confirm.finish"]).not.toContain("모든 참가자 상태가 확정됩니다");
    expect(constructed("finishEvent")).toHaveLength(0);
    expect(calls("finishEvent")).toHaveLength(0);
    await act(async () => { token.resolve("cold-token"); });
    await waitFor(() => expect(calls("finishEvent")).toHaveLength(1));
    expect(calls("finishEvent")[0].data).toEqual({ eventId: "qa-lifecycle" });
  });

  it("keeps Finish blocked on a rejected token and permits a deliberate retry", async () => {
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(new Error("app-check/token-timeout"));
    const { finish } = await finishButton();
    fireEvent.click(finish);
    await waitFor(() => expect(dialog.alert).toHaveBeenCalledOnce());
    expect(constructed("finishEvent")).toHaveLength(0);
    expect(calls("finishEvent")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /이벤트 종료/ }));
    await waitFor(() => expect(calls("finishEvent")).toHaveLength(1));
  });

  it("drops a pending Finish after an account ABA transition", async () => {
    const token = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    const { finish } = await finishButton();
    fireEvent.click(finish);
    await waitFor(() => expect(dialog.confirm).toHaveBeenCalledOnce());
    await act(async () => { simulateLogin({ uid: "other-uid" }); simulateLogin({ uid: "test-uid" }); });
    await act(async () => { token.resolve("old-token"); });
    expect(constructed("finishEvent")).toHaveLength(0);
    expect(calls("finishEvent")).toHaveLength(0);
  });
  it("fences role-only LEADER Finish after an auth ABA while preserving the token barrier", async () => {
    event("LIVE");
    setDocData("events/qa-lifecycle", { info: { name: "Role-only event", creatorId: "another-creator", hostIds: [], status: "LIVE", type: "TOUR" } });
    const token = deferred<string | null>(); vi.mocked(getAppCheckToken).mockReturnValueOnce(token.promise);
    renderWithProviders(<Routes><Route path="/ko/event/:eventId/host" element={<EventDashboardPage />} /></Routes>,
      { route: "/ko/event/qa-lifecycle/host", authenticated: true });
    auth.currentUser = getCurrentUser() as unknown as User;
    expect(await screen.findByTestId("O1-role-only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /이벤트 종료/ }));
    await waitFor(() => expect(dialog.confirm).toHaveBeenCalled());
    expect(constructed("finishEvent")).toHaveLength(0);
    await act(async () => { simulateLogin({ uid: "other-uid" }); simulateLogin({ uid: "test-uid" }); });
    await act(async () => token.resolve("old-token"));
    expect(constructed("finishEvent")).toHaveLength(0); expect(calls("finishEvent")).toHaveLength(0);
  });

});
