import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { User } from "firebase/auth";
import { Route, Routes } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { auth, getAppCheckToken } from "../../services/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { mockCallableInvocations, setCallableResult, setDocData, simulateLogin as mockLogin, getCurrentUser } from "../../__tests__/mocks/firebase";
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
  setDocData("events/qa-lifecycle", { info: { name: "QA private lifecycle", creatorId: "test-uid", status,
    type: "TOUR", visibility: "PRIVATE", startTime: Date.now() + 86_400_000, categories: [] },
    counters: { totalRegistered: 1 } });
  setDocData("events/qa-lifecycle/snapshots/latest", { timestamp: Date.now(),
    counts: { riding: 0, finished: 0, dnf: 0, sos: 0, offCourse: 0, total: 0 }, checkpoints: [], locations: [] });
}

async function startButton() {
  event("OPEN");
  const view = renderWithProviders(<Routes><Route path="/ko/event/:eventId" element={<EventDetailPage />} />
    <Route path="/ko/event/:eventId/dashboard" element={<div>Dashboard destination</div>} /></Routes>,
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
});
