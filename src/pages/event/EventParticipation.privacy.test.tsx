import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import i18n from "i18next";
import { getDoc, getDocs } from "firebase/firestore";
import { mockDocData, mockCollectionData, simulateLogin as mockLogin, simulateLogout as mockLogout, getCurrentUser, setCallableImplementation } from "../../__tests__/mocks/firebase";
import eventStrings from "../../i18n/resources/ko/event.json";
import termStrings from "../../i18n/resources/ko/termGlossary.json";
import enEventStrings from "../../i18n/resources/en/event.json";
import enTermStrings from "../../i18n/resources/en/termGlossary.json";
import { cancelEventRegistration } from "../../features/event/detail/cancelRegistration";
import { auth, getAppCheckToken, ensureAppCheckReady } from "../../services/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getEventPublicParticipants } from "../../services/eventPublicParticipants";
import EventDetailPage from "./EventDetailPage";
import EventResultsPage from "./EventResultsPage";
import EventParticipantsPage from "./EventParticipantsPage";

const { user, dialog } = vi.hoisted(() => ({
  user: { uid: "actor", displayName: "Actor", getIdTokenResult: vi.fn(async () => ({ claims: {} })) },
  dialog: { confirm: vi.fn(async () => true), alert: vi.fn() },
}));
const signInWithGoogle = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const authState = { user: user as typeof user | null };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: authState.user, loading: false, signInWithGoogle }) }));
vi.mock("../../services/eventPublicParticipants", async (original) => ({ ...(await original()), getEventPublicParticipants: vi.fn() }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => dialog }));
vi.mock("../../hooks/useGroup", () => ({ useGroup: () => ({ group: null, loading: false, error: null, inactive: false }) }));
vi.mock("../../hooks/useGroupNextEvents", () => ({ useGroupNextEvents: () => ({ byGroup: {}, eventByGroup: {} }) }));
vi.mock("../../features/event/detail/cancelRegistration", () => ({ cancelEventRegistration: vi.fn(async () => {}) }));

function simulateLogin(value: { uid: string }) { mockLogin(value); auth.currentUser = getCurrentUser() as unknown as User; }
function simulateLogout() { mockLogout(); auth.currentUser = null; }

let navigateRoute: ReturnType<typeof useNavigate>;
function RouteControl() { navigateRoute = useNavigate(); return null; }
function show(component: React.ReactNode) {
  return render(<MemoryRouter initialEntries={["/ko/event/ev"]}><RouteControl /><Routes><Route path="/:lang/event/:eventId" element={component} /></Routes></MemoryRouter>);
}
function collectionPath(q: unknown): string | undefined {
  const ref = q as { _collectionPath?: string; path?: string };
  return ref._collectionPath ?? ref.path;
}
const realGetDocs = vi.mocked(getDocs).getMockImplementation()!;
const realGetDoc = vi.mocked(getDoc).getMockImplementation()!;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  authState.user = user;
  dialog.confirm.mockResolvedValue(true);
  vi.mocked(cancelEventRegistration).mockResolvedValue(undefined);
  user.getIdTokenResult.mockResolvedValue({ claims: {} });
  simulateLogin({ uid: "actor" });
  mockDocData.clear(); mockCollectionData.clear();
  mockDocData.set("events/ev", { info: { name: "Event", type: "OPEN_TRAINING", status: "OPEN", creatorId: "host", startTime: Date.now() + 86400000, maxParticipants: 10 }, counters: { totalRegistered: 3 } });
  mockDocData.set("events/ev/participants/actor", { userId: "actor", role: "RIDER", status: "REGISTERED" });
  mockCollectionData.set("events/ev/participants_public", [{ id: "actor", userId: "actor", displayName: "Public rider", status: "FINISHED", finishedAt: Date.now() + 90000000, category: "A", bibNumber: 2, realName: "PRIVATE NAME", avgPower: 9999 }]);
  vi.mocked(getEventPublicParticipants).mockImplementation(async (eventId) => ({
    participants: (mockCollectionData.get(`events/${eventId}/participants_public`) ?? []).map((data) => ({ ...data, userId: data.userId ?? data.id })) as never,
    counters: { totalRegistered: 3, byCategory: {} },
  }));
  vi.mocked(getDoc).mockImplementation(realGetDoc);
  vi.mocked(getDocs).mockImplementation((q, ...args) => {
    if (collectionPath(q) === "events/ev/participants") return Promise.reject(new Error("permission-denied"));
    return realGetDocs({ _collectionPath: collectionPath(q) } as unknown as typeof q, ...args);
  });
});

describe("event participant privacy boundaries", () => {
  it("uses the single linked course summary without a blank cover or invented category", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), type: "GRANFONDO", courseIds: ["course-1"] } });
    mockDocData.set("courses/course-1", { name: "Linked course", distance: 118500, elevationGain: 1743, elevationHigh: 830 });
    show(<EventDetailPage />);
    await screen.findByText("Linked course");
    expect(screen.getByTestId("D4-1")).toHaveClass("event-detail-body--compact");
    const summary = within(screen.getByTestId("D4-summary"));
    expect(summary.getByText("118.5")).toBeInTheDocument();
    expect(summary.getByText("1743")).toBeInTheDocument();
    expect(summary.getByText("830")).toBeInTheDocument();
    expect(screen.queryByText("Cat HC")).toBeNull();
    const granfondo = screen.getByRole("button", { name: termStrings.openLabel.replace("{{term}}", "그란폰도") });
    fireEvent.focus(granfondo);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(termStrings.terms.granfondo.description);
    fireEvent.blur(granfondo);
    expect(screen.getByTestId("D4-0").querySelector(".h-64")).toBeNull();
    fireEvent.focus(summary.getByRole("button", { name: eventStrings["detail.metric.distance"] }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(eventStrings["detail.metric.distanceLinked"]);
  });

  it("provides the actual English Gran Fondo explanation", async () => {
    i18n.addResourceBundle("en", "event", enEventStrings, true, true);
    i18n.addResourceBundle("en", "termGlossary", enTermStrings, true, true);
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), type: "GRANFONDO" } });
    try {
      await act(async () => { await i18n.changeLanguage("en"); });
      show(<EventDetailPage />);
      const term = await screen.findByRole("button", { name: enTermStrings.openLabel.replace("{{term}}", enEventStrings["type.granfondo"]) });
      fireEvent.focus(term);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(enTermStrings.terms.granfondo.description);
    } finally {
      await act(async () => { await i18n.changeLanguage("ko"); });
    }
  });

  function addSendCourse() {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), creatorId: "actor", courseIds: ["course-1"] } });
    mockDocData.set("courses/course-1", { name: "Sendable course", distance: 20000, elevationGain: 100 });
    mockDocData.set("events/other", { info: { name: "Other event", status: "OPEN" } });
  }

  it.each(["success", "app-check-failure", "account", "route", "unmount"] as const)("guards course sending while App Check is pending: %s", async outcome => {
    addSendCourse();
    let ready!: () => void;
    let rejectReady!: (error: Error) => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve, reject) => { ready = resolve; rejectReady = reject; }));
    const view = show(<EventDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["detail.button.sendToParticipants"] }));
    await waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledOnce());
    expect(dialog.confirm).toHaveBeenCalledWith(
      eventStrings["detail.confirm.sendCourse"].replace("{{name}}", "Sendable course"),
      { title: eventStrings["detail.button.sendToParticipants"], confirmLabel: eventStrings["detail.button.sendToParticipants"] },
    );
    expect(vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "sendCourseToApp")).toHaveLength(0);
    if (outcome === "account") act(() => simulateLogin({ uid: "other-account" }));
    if (outcome === "route") act(() => navigateRoute("/ko/event/other"));
    if (outcome === "unmount") view.unmount();
    await act(async () => {
      if (outcome === "app-check-failure") rejectReady(new Error("app-check/token-timeout"));
      else ready();
    });
    expect(vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "sendCourseToApp")).toHaveLength(outcome === "success" ? 1 : 0);
  });

  it("discards a course send confirmation after an account change", async () => {
    addSendCourse();
    let confirm!: (accepted: boolean) => void;
    dialog.confirm.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
    show(<EventDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["detail.button.sendToParticipants"] }));
    act(() => simulateLogin({ uid: "other-account" }));
    await act(async () => confirm(true));
    expect(ensureAppCheckReady).not.toHaveBeenCalled();
    expect(vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "sendCourseToApp")).toHaveLength(0);
  });

  it.each(["success", "failure"] as const)("discards late course send %s feedback after route changes", async outcome => {
    addSendCourse();
    let finish!: () => void;
    let reject!: (error: Error) => void;
    setCallableImplementation("sendCourseToApp", () => new Promise((resolve, fail) => { finish = () => resolve({ data: {} }); reject = fail; }));
    show(<EventDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["detail.button.sendToParticipants"] }));
    await waitFor(() => expect(finish).toBeDefined());
    act(() => navigateRoute("/ko/event/other"));
    await screen.findAllByText("Other event");
    await act(async () => outcome === "success" ? finish() : reject(new Error("unavailable")));
    expect(screen.queryByText(eventStrings["detail.toast.courseSent"])).toBeNull();
    expect(screen.queryByText(eventStrings["detail.toast.sendFailed"])).toBeNull();
  });

  it("keeps the body and sidebar layout when event guidance is present", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), description: "Meet at the south entrance. Helmets required." } });
    show(<EventDetailPage />);
    await screen.findByText("Meet at the south entrance. Helmets required.");
    expect(screen.getByTestId("D4-1")).not.toHaveClass("event-detail-body--compact");
  });

  it("never adds alternative linked course distances or invents missing highest elevation", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), courseIds: ["course-1", "course-2"] } });
    mockDocData.set("courses/course-1", { name: "Short course", distance: 40000, elevationGain: 200 });
    mockDocData.set("courses/course-2", { name: "Long course", distance: 60000, elevationGain: 400 });
    show(<EventDetailPage />);
    await screen.findByText("Long course");
    const summary = within(screen.getByTestId("D4-summary"));
    expect(summary.getAllByText("—")).toHaveLength(3);
    expect(summary.queryByText("100.0")).toBeNull();
    expect(summary.queryByText("600")).toBeNull();
  });

  it("does not carry linked course numbers into another event", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), courseIds: ["course-1"] } });
    mockDocData.set("events/other", { info: { name: "Other event", status: "OPEN" } });
    let finish!: (value: Awaited<ReturnType<typeof getDoc>>) => void;
    vi.mocked(getDoc).mockImplementation((ref, ...args) => ref.path === "courses/course-1" ? new Promise(resolve => { finish = resolve; }) : realGetDoc(ref, ...args));
    show(<EventDetailPage />);
    await waitFor(() => expect(finish).toBeDefined());
    act(() => navigateRoute("/ko/event/other"));
    await screen.findAllByText("Other event");
    mockDocData.set("courses/course-1", { name: "Stale course", distance: 118500, elevationGain: 1743 });
    const snapshot = await realGetDoc({ path: "courses/course-1" } as Parameters<typeof getDoc>[0]);
    await act(async () => finish(snapshot));
    expect(screen.queryByText("Stale course")).toBeNull();
    expect(within(screen.getByTestId("D4-summary")).queryByText("118.5")).toBeNull();
  });

  it.each(["route", "account"])("discards stale recent participants after %s changes", async (boundary) => {
    let finish!: (value: Awaited<ReturnType<typeof getEventPublicParticipants>>) => void;
    vi.mocked(getEventPublicParticipants).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show(<EventDetailPage />);
    await waitFor(() => expect(finish).toBeDefined());
    if (boundary === "route") act(() => navigateRoute("/ko/event/other"));
    else simulateLogin({ uid: "other-account" });
    await act(async () => finish({ participants: [{ userId: "actor", displayName: "Stale recent" }], counters: { totalRegistered: 1, byCategory: {} } }));
    expect(screen.queryByText("Stale recent")).toBeNull();
  });

  it("preserves nanosecond ordering when recent joiners share the same second", async () => {
    mockCollectionData.set("events/ev/participants_public", Array.from({ length: 6 }, (_, i) => ({
      id: `recent-${i}`, displayName: `Precision ${i}`,
      joinedAt: i % 2 ? { seconds: 100, nanoseconds: (i + 1) * 1000000 }
        : { _seconds: 100, _nanoseconds: (i + 1) * 1000000 },
    })));
    show(<EventDetailPage />);
    await screen.findByText("Precision 5");
    expect(screen.queryByText("Precision 0")).toBeNull();
  });

  it("ranks public finishers by serialized subsecond finish time", async () => {
    mockDocData.set("events/ev", { ...mockDocData.get("events/ev"), info: {
      ...(mockDocData.get("events/ev")!.info as object), startTime: 100000, status: "FINISHED", resultContractVersion: 2,
    } });
    mockCollectionData.set("events/ev/participants_public", [
      { id: "slow", displayName: "Slower rider", status: "FINISHED", resultVerified: true, finishedAt: { _seconds: 102, _nanoseconds: 900000000 } },
      { id: "fast", displayName: "Faster rider", status: "FINISHED", resultVerified: true, finishedAt: { seconds: 102, nanoseconds: 100000000 } },
    ]);
    show(<EventResultsPage />);
    await screen.findAllByText("Faster rider");
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Faster rider");
    expect(rows[2]).toHaveTextContent("Slower rider");
  });

  it("sorts recent public participants by mixed joinedAt formats and keeps only five", async () => {
    mockCollectionData.set("events/ev/participants_public", Array.from({ length: 7 }, (_, i) => ({
      id: `recent-${i}`, displayName: `Recent ${i}`, joinedAt: i % 2 ? { _seconds: i + 1 } : (i + 1) * 1000,
    })));
    show(<EventDetailPage />);
    await screen.findByText("Recent 6");
    expect(screen.getByText("Recent 2")).toBeInTheDocument();
    expect(screen.queryByText("Recent 1")).toBeNull();
    expect(screen.queryByText("Recent 0")).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("supports anonymous public results through the callable", async () => {
    authState.user = null;
    simulateLogout();
    show(<EventResultsPage />);
    await screen.findAllByText("Public rider");
    expect(getEventPublicParticipants).toHaveBeenCalledWith("ev");
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("uses fixed result icons, one finisher column, and explanatory localized metric labels", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), status: "FINISHED" } });
    show(<EventResultsPage />);
    await screen.findAllByText("Public rider");
    const page = screen.getByTestId("D4-3");
    expect(page.textContent).not.toMatch(/[🏁🏆⬇🔗🖼⏳]/u);
    expect(page.querySelector(".podium-grid")).toHaveStyle({ gridTemplateColumns: "repeat(1, minmax(0, 1fr))" });
    const tableRegion = screen.getByRole("region", { name: eventStrings["label.allResults"] });
    expect(tableRegion).toHaveAttribute("tabindex", "0");
    expect(tableRegion).toHaveAccessibleDescription(eventStrings["resultsView.tableScrollHint"]);
    const resultTable = within(tableRegion).getByRole("table");
    const headerCells = within(resultTable).getAllByRole("columnheader");
    const rowCells = within(within(resultTable).getAllByRole("row")[1]).getAllByRole("cell");
    expect(headerCells).toHaveLength(8);
    expect(rowCells).toHaveLength(8);
    expect(headerCells[0]).toHaveTextContent(eventStrings["resultsView.col.rank"]);
    expect(rowCells[0]).toHaveTextContent("1");
    expect(headerCells[4]).toHaveTextContent(eventStrings["resultsView.col.finishTime"]);
    expect(rowCells[4]).not.toHaveTextContent("—");
    expect(resultTable.querySelector(".event-results-optional")).toBeNull();
    expect(screen.getAllByRole("columnheader").some(header => header.textContent === eventStrings["resultsView.col.avgSpeed"])).toBe(true);
    expect(screen.getAllByRole("columnheader").some(header => header.textContent === eventStrings["resultsView.col.avgPower"])).toBe(true);
    expect(screen.getByText(eventStrings["resultsView.col.finishTime"])).toBeInTheDocument();
    const segment = screen.getByRole("button", { name: eventStrings["resultsView.segmentKomQom"] });
    fireEvent.focus(segment);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(eventStrings["resultsView.segmentRecordsHelp"]);
    fireEvent.blur(segment);
    fireEvent.focus(screen.getByRole("button", { name: termStrings.openLabel.replace("{{term}}", "훈련 부하 점수") }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(termStrings.terms.tss.description);
    expect(screen.queryByText("9999")).toBeNull();
  });

  it("never falls back to private participants after callable rejection", async () => {
    vi.mocked(getEventPublicParticipants).mockRejectedValue(new Error("permission-denied"));
    show(<EventResultsPage />);
    await screen.findByText("permission-denied");
    expect(getDocs).not.toHaveBeenCalled();
    expect(screen.queryByText("Public rider")).toBeNull();
  });

  it.each(["route", "account"])("discards stale public roster after %s changes", async (boundary) => {
    let finish!: (value: Awaited<ReturnType<typeof getEventPublicParticipants>>) => void;
    vi.mocked(getEventPublicParticipants).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    show(<EventResultsPage />);
    await waitFor(() => expect(getEventPublicParticipants).toHaveBeenCalled());
    if (boundary === "route") act(() => navigateRoute("/ko/event/other"));
    else simulateLogin({ uid: "other-account" });
    await act(async () => finish({ participants: [{ userId: "actor", displayName: "Stale rider" }], counters: { totalRegistered: 1, byCategory: {} } }));
    expect(screen.queryByText("Stale rider")).toBeNull();
  });

  it("uses own GET for registered cancel even when private LIST is denied", async () => {
    show(<EventDetailPage />);
    const button = await screen.findByRole("button", { name: eventStrings["detail.button.cancelRegistration"] });
    expect(button).toBeEnabled();
    expect(vi.mocked(getDoc).mock.calls.some(([ref]) => ref.path === "events/ev/participants/actor")).toBe(true);
    expect(vi.mocked(getDocs).mock.calls.every(([q]) => collectionPath(q) !== "events/ev/participants")).toBe(true);
    fireEvent.click(button);
    await waitFor(() => expect(cancelEventRegistration).toHaveBeenCalledWith("ev"));
    await waitFor(() => expect(screen.queryByRole("button", { name: eventStrings["detail.button.cancelRegistration"] })).toBeNull());
  });

  it("never turns a failed own GET into a registration invitation", async () => {
    vi.mocked(getDoc).mockImplementation((ref, ...args) => ref.path === "events/ev/participants/actor" ? Promise.reject(new Error("permission-denied")) : realGetDoc(ref, ...args));
    show(<EventDetailPage />);
    await screen.findAllByText("Event");
    expect(screen.queryByRole("button", { name: `+ ${eventStrings["button.register"]}` })).toBeNull();
    expect(screen.queryByRole("button", { name: eventStrings["detail.button.cancelRegistration"] })).toBeNull();
  });

  it("renders only safe public result fields without private profile reads or metrics", async () => {
    show(<EventResultsPage />);
    await screen.findAllByText("Public rider");
    expect(screen.queryByText("PRIVATE NAME")).toBeNull();
    expect(screen.queryByText("9999")).toBeNull();
    expect(vi.mocked(getDoc).mock.calls.every(([ref]) => !ref.path.startsWith("users/"))).toBe(true);
    expect(getDocs).not.toHaveBeenCalled();
    expect(getEventPublicParticipants).toHaveBeenCalledWith("ev");
  });

  it("keeps six v2 unverified riders pending without a podium, duration, or completion share", async () => {
    const event = mockDocData.get("events/ev")!;
    const startTime = Date.now() - 120_000;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), status: "FINISHED", startTime, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants_public", Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "actor" : `rider-${i}`,
      displayName: `Rider ${i}`,
      status: "FINISHED",
      resultVerified: false,
      finishedAt: startTime + (i + 1) * 1000,
      category: "A",
    })));
    show(<EventResultsPage />);
    await screen.findAllByText("Rider 0");
    expect(screen.getAllByText(eventStrings["resultsView.verificationPending"]).length).toBeGreaterThan(0);
    expect(screen.queryByText(eventStrings["label.podium"])).toBeNull();
    expect(screen.queryByLabelText(eventStrings["shareCard.completion"])).toBeNull();
    expect(screen.queryByText("0:00:01")).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
    expect(getEventPublicParticipants).toHaveBeenCalledWith("ev");
  });

  it("keeps six v2 RIDING riders pending if a finished event has not verified their rides", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), status: "FINISHED", startTime: Date.now() - 120_000, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants_public", Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "actor" : `rider-${i}`, displayName: `Riding ${i}`, status: "RIDING", category: "A",
    })));
    show(<EventResultsPage />);
    await screen.findAllByText("Riding 0");
    expect(screen.getByText(eventStrings["resultsView.pendingCount"].replace("{{count}}", "6"))).toBeInTheDocument();
    expect(screen.getAllByText(eventStrings["resultsView.verificationPending"]).length).toBeGreaterThan(0);
    expect(screen.queryByText(eventStrings["label.podium"])).toBeNull();
    expect(screen.queryByLabelText(eventStrings["shareCard.completion"])).toBeNull();
    expect(screen.queryByText(/0:00:\d\d/)).toBeNull();
  });

  it("ranks only the verified v2 finisher while preserving public field privacy", async () => {
    const event = mockDocData.get("events/ev")!;
    const startTime = Date.now() - 120_000;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), status: "FINISHED", startTime, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants_public", [
      { id: "actor", displayName: "Verified rider", status: "FINISHED", resultVerified: true, finishedAt: startTime + 90_000, category: "A", realName: "PRIVATE NAME", avgPower: 9999 },
      { id: "other", displayName: "Pending rider", status: "FINISHED", resultVerified: false, finishedAt: startTime + 30_000, category: "A" },
    ]);
    show(<EventResultsPage />);
    await screen.findAllByText("Verified rider");
    expect(screen.getByText(eventStrings["label.podium"])).toBeInTheDocument();
    expect(screen.getByLabelText(eventStrings["shareCard.completion"])).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE NAME")).toBeNull();
    expect(screen.queryByText("9999")).toBeNull();
  });

  it("includes five pending riders in the v2 verified finish rate denominator", async () => {
    const event = mockDocData.get("events/ev")!;
    const startTime = Date.now() - 120_000;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), status: "FINISHED", startTime, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants_public", Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "actor" : `rider-${i}`,
      displayName: `Rider ${i}`,
      status: "FINISHED",
      resultVerified: i === 0,
      finishedAt: startTime + 90_000,
      category: "A",
    })));
    show(<EventResultsPage />);
    await screen.findAllByText("Rider 0");
    expect(screen.getByText(eventStrings["resultsView.verifiedFinishRate"]).parentElement?.textContent).toContain("17%");
    expect(screen.getByText(eventStrings["resultsView.pendingCount"].replace("{{count}}", "5"))).toBeInTheDocument();
  });

  it("uses the same v2 verification rule for private host results", async () => {
    const event = mockDocData.get("events/ev")!;
    const startTime = Date.now() - 120_000;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), creatorId: "actor", type: "GROUP_RIDE", status: "FINISHED", startTime, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants", [
      { id: "actor", realName: "Host pending", status: "FINISHED", resultVerified: false, finishedAt: startTime + 30_000, avgPower: 222, bestTime: "0:00:30" },
    ]);
    vi.mocked(getDocs).mockImplementation((q, ...args) => realGetDocs({ _collectionPath: collectionPath(q) } as unknown as typeof q, ...args));
    show(<EventResultsPage />);
    await screen.findAllByText("Host pending");
    expect(screen.queryByText(eventStrings["label.podium"])).toBeNull();
    expect(screen.queryByLabelText(eventStrings["shareCard.completion"])).toBeNull();
    expect(screen.queryByText("222w")).toBeNull();
    expect(vi.mocked(getDocs).mock.calls.some(([q]) => collectionPath(q) === "events/ev/participants")).toBe(true);
  });

  it("shows v2 unverified host participant rows and stats as pending", async () => {
    const event = mockDocData.get("events/ev")!;
    const startTime = Date.now() - 120_000;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), creatorId: "actor", type: "GROUP_RIDE", status: "FINISHED", startTime, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants", [
      { id: "actor", realName: "Host pending", status: "FINISHED", resultVerified: false, finishedAt: startTime + 30_000, bestTime: "0:00:30" },
    ]);
    vi.mocked(getDocs).mockImplementation((q, ...args) => realGetDocs({ _collectionPath: collectionPath(q) } as unknown as typeof q, ...args));
    show(<EventParticipantsPage />);
    await screen.findByText("Host pending");
    expect(screen.getByText(eventStrings["resultsView.verifiedFinishCount"]).parentElement?.textContent).toContain("0");
    expect(screen.getAllByText(eventStrings["resultsView.verificationPending"]).length).toBeGreaterThan(0);
    expect(screen.queryByText("0:00:30")).toBeNull();
  });

  it.each([0, 2])("uses only registered checkpoint counts (%s) and identifies ended host navigation", async checkpointCount => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), creatorId: "actor", status: "FINISHED", checkpoints: Array.from({ length: checkpointCount }, (_, i) => ({ cpId: String(i), name: `Checkpoint ${i}` })) } });
    mockCollectionData.set("events/ev/participants", [{ id: "actor", realName: "Fixture rider", status: "FINISHED", cpProgress: 0, bestTime: "1:20:30", registrationNumber: "REG-12" }]);
    vi.mocked(getDocs).mockImplementation((q, ...args) => realGetDocs({ _collectionPath: collectionPath(q) } as unknown as typeof q, ...args));
    show(<EventParticipantsPage />);
    const rider = await screen.findByRole("button", { name: "Fixture rider" });
    const row = rider.closest("tr")!;
    expect(row.cells[6].textContent).toBe(checkpointCount ? "0/2" : "—");
    expect(screen.queryByText("FINISHED")).toBeNull();
    expect(screen.getByRole("columnheader", { name: eventStrings["resultsView.col.finishTime"] })).toHaveStyle({ minWidth: "128px" });
    fireEvent.click(rider);
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByRole("button", { name: eventStrings["participantsView.action.endedView"] })).toBeInTheDocument();
    expect(within(modal).queryByText(/LIVE/)).toBeNull();
    expect(within(modal).getByText("1:20:30")).toHaveStyle({ fontFamily: "var(--font-mono)" });
    expect(within(modal).getByText(eventStrings["participantsView.paidYes"])).not.toHaveStyle({ fontFamily: "var(--font-mono)" });
    expect(document.querySelector("button button")).toBeNull();
  });

  it("uses the same pending-aware v2 denominator for host participant stats", async () => {
    const event = mockDocData.get("events/ev")!;
    const startTime = Date.now() - 120_000;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), creatorId: "actor", type: "GROUP_RIDE", status: "FINISHED", startTime, resultContractVersion: 2 } });
    mockCollectionData.set("events/ev/participants", Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "actor" : `rider-${i}`,
      realName: `Host rider ${i}`,
      status: "FINISHED",
      resultVerified: i === 0,
      finishedAt: startTime + 90_000,
    })));
    vi.mocked(getDocs).mockImplementation((q, ...args) => realGetDocs({ _collectionPath: collectionPath(q) } as unknown as typeof q, ...args));
    show(<EventParticipantsPage />);
    await screen.findByText("Host rider 0");
    const rateCard = screen.getByText(eventStrings["resultsView.verifiedFinishRate"]).parentElement;
    expect(rateCard?.textContent).toContain("17%");
    expect(rateCard?.textContent).toContain(eventStrings["participantsView.finishRateSub"].replace("{{count}}", "6"));
  });

  it("keeps GROUP_RIDE results private without querying public or private lists", async () => {
    const event = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), type: "GROUP_RIDE" } });
    show(<EventResultsPage />);
    await screen.findByText(eventStrings["resultsView.privateResultsUnavailable"]);
    expect(getDocs).not.toHaveBeenCalled();
  });
  it.each(["WAITLISTED", "PENDING", "WITHDRAWN", "CANCELLED", "REFUNDED"])("does not treat %s as an active registration", async (status) => {
    mockDocData.set("events/ev/participants/actor", { role: "RIDER", status });
    show(<EventDetailPage />);
    expect(await screen.findByRole("button", { name: `+ ${eventStrings["button.register"]}` })).toBeEnabled();
    expect(screen.queryByRole("button", { name: eventStrings["detail.button.cancelRegistration"] })).toBeNull();
    expect(screen.queryByRole("button", { name: eventStrings["shareCard.registration"] })).toBeNull();
  });

  it.each(["REGISTERED", "PAID", "CHECKED_IN", "RIDING"])("preserves active %s registration without allowing a duplicate application", async (status) => {
    mockDocData.set("events/ev/participants/actor", { role: "RIDER", status });
    show(<EventDetailPage />);
    const cancel = await screen.findByRole("button", { name: eventStrings["detail.button.cancelRegistration"] });
    expect(cancel).toHaveProperty("disabled", status !== "REGISTERED");
    expect(screen.queryByRole("button", { name: `+ ${eventStrings["button.register"]}` })).toBeNull();
  });

  it.each(["permission-denied", "unavailable"])("distinguishes event %s failures from missing events and supports explicit retry", async (code) => {
    vi.mocked(getDoc).mockImplementation((ref, ...args) => ref.path === "events/ev" ? Promise.reject(new Error(code)) : realGetDoc(ref, ...args));
    show(<EventDetailPage />);
    await screen.findByText(eventStrings["detail.loadFailed"]);
    expect(screen.queryByText(eventStrings["detail.notFound.description"])).toBeNull();
    vi.mocked(getDoc).mockImplementation(realGetDoc);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findAllByText("Event");
    expect(screen.queryByText(eventStrings["detail.loadFailed"])).toBeNull();
  });

  it("keeps a genuinely missing event separate from a failed request", async () => {
    mockDocData.delete("events/ev");
    show(<EventDetailPage />);
    await screen.findByText(eventStrings["detail.notFound.description"]);
    expect(screen.queryByText(eventStrings["detail.loadFailed"])).toBeNull();
  });

  it.each(["route", "account"])("discards a stale event failure after %s changes", async (boundary) => {
    let reject!: (error: Error) => void;
    let held = false;
    vi.mocked(getDoc).mockImplementation((ref, ...args) => {
      if (ref.path === "events/ev" && !held) {
        held = true;
        return new Promise((_, fail) => { reject = fail; });
      }
      return realGetDoc(ref, ...args);
    });
    const view = show(<EventDetailPage />);
    await waitFor(() => expect(reject).toBeDefined());
    if (boundary === "route") act(() => navigateRoute("/ko/event/other"));
    else {
      authState.user = { ...user, uid: "other" };
      view.rerender(<MemoryRouter initialEntries={["/ko/event/ev"]}><RouteControl /><Routes><Route path="/:lang/event/:eventId" element={<EventDetailPage />} /></Routes></MemoryRouter>);
    }
    await act(async () => reject(new Error("unavailable")));
    expect(screen.queryByText(eventStrings["detail.loadFailed"])).toBeNull();
  });

  it("allows registration after a confirmed absent own document", async () => {
    mockDocData.delete("events/ev/participants/actor");
    show(<EventDetailPage />);
    expect(await screen.findByRole("button", { name: `+ ${eventStrings["button.register"]}` })).toBeEnabled();
    expect(screen.queryByRole("button", { name: eventStrings["detail.button.cancelRegistration"] })).toBeNull();
  });

  it.each(["host", "admin"])("preserves authorized %s private results without private user profiles", async (role) => {
    const event = mockDocData.get("events/ev")!;
    if (role === "host") mockDocData.set("events/ev", { ...event, info: { ...(event.info as object), creatorId: "actor", type: "GROUP_RIDE" } });
    else user.getIdTokenResult.mockResolvedValue({ claims: { admin: true } });
    mockCollectionData.set("events/ev/participants", [{ id: "actor", realName: "Host result", status: "FINISHED", finishedAt: Date.now() + 90000000, avgPower: 222 }]);
    vi.mocked(getDocs).mockImplementation((q, ...args) => realGetDocs({ _collectionPath: collectionPath(q) } as unknown as typeof q, ...args));
    show(<EventResultsPage />);
    await screen.findAllByText("Host result");
    expect(vi.mocked(getDocs).mock.calls.some(([q]) => collectionPath(q) === "events/ev/participants")).toBe(true);
    expect(vi.mocked(getDoc).mock.calls.every(([ref]) => !ref.path.startsWith("users/"))).toBe(true);
  });

  it("invalidates a pending start on a delayed first auth callback with a changed SDK user", async () => {
    mockDocData.set("events/ev/participants/actor", { userId: "actor", role: "LEADER", status: "REGISTERED" });
    let notify!: (user: User | null) => void;
    vi.mocked(onAuthStateChanged).mockImplementationOnce((_auth, next) => {
      notify = next as (user: User | null) => void;
      return vi.fn();
    });
    const data = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...data, info: { ...(data.info as object), creatorId: "actor" } });
    let finish!: (value: string) => void;
    vi.mocked(getAppCheckToken).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show(<EventDetailPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /이벤트 시작/ }))[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: /이벤트 시작/ }).at(-1)!);
    expect(screen.getByRole("button", { name: eventStrings["detail.button.starting"] })).toBeDisabled();
    act(() => { simulateLogin({ uid: "actor" }); notify(auth.currentUser); });
    expect(screen.getAllByRole("button", { name: /이벤트 시작/ })[0]).toBeEnabled();
    await act(async () => finish("old-token"));
    expect(vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "startEvent")).toHaveLength(0);
  });

  it("invalidates a pending cancel on a delayed first auth callback with a changed SDK user", async () => {
    let notify!: (user: User | null) => void;
    vi.mocked(onAuthStateChanged).mockImplementationOnce((_auth, next) => {
      notify = next as (user: User | null) => void;
      return vi.fn();
    });
    let finish!: (value: boolean) => void;
    dialog.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show(<EventDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["detail.button.cancelRegistration"] }));
    expect(screen.getByRole("button", { name: eventStrings["detail.button.cancellingRegistration"] })).toBeDisabled();
    act(() => { simulateLogin({ uid: "actor" }); notify(auth.currentUser); });
    expect(screen.getByRole("button", { name: eventStrings["detail.button.cancelRegistration"] })).toBeEnabled();
    await act(async () => finish(true));
    expect(cancelEventRegistration).not.toHaveBeenCalled();
  });

  it("rejects same-owner SDK relogin during cancellation confirmation and releases busy state", async () => {
    let finish!: (value: boolean) => void;
    dialog.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show(<EventDetailPage />);
    const button = await screen.findByRole("button", { name: eventStrings["detail.button.cancelRegistration"] });
    fireEvent.click(button);
    act(() => simulateLogin({ uid: "actor" }));
    await act(async () => finish(true));
    expect(cancelEventRegistration).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(cancelEventRegistration).toHaveBeenCalledOnce());
  });

  it("rejects an account switch during confirmation before making the cancellation call", async () => {
    let finish!: (value: boolean) => void;
    dialog.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    show(<EventDetailPage />);
    const button = await screen.findByRole("button", { name: eventStrings["detail.button.cancelRegistration"] });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    simulateLogin({ uid: "other-account" });
    await act(async () => finish(true));
    expect(cancelEventRegistration).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });

  it("does not clear a different event registration after an old cancellation settles", async () => {
    let finish!: () => void;
    vi.mocked(cancelEventRegistration).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    mockDocData.set("events/ev2", { ...mockDocData.get("events/ev"), info: { ...(mockDocData.get("events/ev")!.info as object), name: "Second event" } });
    mockDocData.set("events/ev2/participants/actor", { role: "RIDER", status: "REGISTERED" });
    show(<EventDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: eventStrings["detail.button.cancelRegistration"] }));
    await waitFor(() => expect(cancelEventRegistration).toHaveBeenCalledWith("ev"));
    await act(async () => navigateRoute("/ko/event/ev2"));
    await screen.findAllByText("Second event");
    await act(async () => finish());
    expect(screen.getByRole("button", { name: eventStrings["detail.button.cancelRegistration"] })).toBeEnabled();
  });

  it("discards an old course read before it can overwrite a new event results header", async () => {
    let finish!: (value: Awaited<ReturnType<typeof getDoc>>) => void;
    const first = mockDocData.get("events/ev")!;
    mockDocData.set("events/ev", { ...first, info: { ...(first.info as object), courseIds: ["slow"] } });
    mockDocData.set("events/ev2", { ...first, info: { ...(first.info as object), name: "Second event", status: "FINISHED" } });
    mockCollectionData.set("events/ev2/participants_public", [{ id: "second", displayName: "Second rider", status: "FINISHED", finishedAt: Date.now() + 90000000 }]);
    vi.mocked(getDoc).mockImplementation((ref, ...args) => ref.path === "courses/slow" ? new Promise((resolve) => { finish = resolve; }) : realGetDoc(ref, ...args));
    show(<EventResultsPage />);
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => navigateRoute("/ko/event/ev2"));
    await screen.findAllByText("Second event");
    await screen.findAllByText("Second rider");
    await act(async () => finish({ exists: () => true, data: () => ({ distance: 12000 }) } as Awaited<ReturnType<typeof getDoc>>));
    expect(screen.queryByText("Event")).toBeNull();
    expect(screen.getAllByText("Second event").length).toBeGreaterThan(0);
    expect(getDocs).not.toHaveBeenCalled();
    expect(getEventPublicParticipants).toHaveBeenCalledWith("ev2");
  });

});


it("opens the existing Google auth flow for guest follow without navigating or submitting a follow", async () => {
  authState.user = null;
  simulateLogout();
  show(<EventDetailPage />);
  fireEvent.click(await screen.findByRole("button", { name: "이벤트 팔로우" }));
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledOnce());
  expect(screen.getByRole("heading", { name: "Event", level: 1 })).toBeInTheDocument();
  expect(vi.mocked(httpsCallable).mock.calls.some(call => call[1] === "setEventFollow")).toBe(false);
});
