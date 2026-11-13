import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { getDoc, getDocs, query, limit, startAfter } from "firebase/firestore";
import { logClientError } from "../../services/errorLogger";
import { Route, Routes, useNavigate } from "react-router-dom";
import { displayRankFor, shouldShowResultsGroupCta, type ResultEntry } from "./EventResultsPage";
import EventResultsPage from "./EventResultsPage";
import { isVerifiedEventFinisher } from "../../features/event/resultVerification";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setDocData, simulateLogin } from "../../__tests__/mocks/firebase";

import { auth } from "../../services/firebase";
import { getPublicUserProfile } from "../../services/publicProfiles";
const paging = vi.hoisted(() => ({ page: vi.fn(), host: null as null | { uid: string; getIdTokenResult: () => Promise<{ claims: object }> } }));
vi.mock("../../contexts/AuthContext", async original => {
  const actual = await original<typeof import("../../contexts/AuthContext")>();
  return { ...actual, useAuth: () => { const value = actual.useAuth(); return paging.host ? { ...value, user: paging.host, loading: false } : value; } };
});
vi.mock("../../services/publicProfiles", () => ({ getPublicUserProfile: vi.fn().mockResolvedValue({ nickname: "Profile name" }) }));
beforeEach(() => {
  paging.host = null;
  paging.page.mockReset().mockResolvedValue({ participants: [], complete: true, nextCursor: null, counterRevision: null, counters: null, countersStatus: "pending", projectionVersion: 2 });
});
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));

vi.mock("../../services/eventPublicParticipants", async (original) => ({
  ...await original<typeof import("../../services/eventPublicParticipants")>(),
  getEventPublicParticipantsPage: paging.page,
}));

function ResultsWithNavigation() {
  const navigate = useNavigate();
  return <>
    <button type="button" onClick={() => navigate("/ko/event/next/results")}>Next event</button>
    <button type="button" onClick={() => navigate("/ko/event/first/results")}>Back to first event</button>
    <Routes><Route path="/ko/event/:eventId/results" element={<EventResultsPage />} /></Routes>
  </>;
}

function entry(rank: number, overallRank: number): ResultEntry {
  return {
    userId: `u-${rank}-${overallRank}`,
    displayName: "Rider",
    bibNumber: null,
    category: "A",
    rank,
    overallRank,
    finishTime: 1,
    status: "FINISHED",
  };
}

describe("finished event route navigation", () => {
  it("retains the active results tab and overview link after the event finishes", async () => {
    setDocData("events/first", { info: { name: "Finished navigation fixture", status: "FINISHED", type: "TOUR" } });
    renderWithProviders(<ResultsWithNavigation />, { route: "/ko/event/first/results" });
    await screen.findByRole("heading", { name: "Finished navigation fixture" });
    const resultTab = screen.getByRole("link", { name: "종합 결과" });
    expect(resultTab).toHaveAttribute("href", "/ko/event/first/results");
    expect(resultTab).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "개요" })).toHaveAttribute("href", "/ko/event/first");
  });
});

describe("EventResultsPage podium rank", () => {
  it("uses overallRank for overall podium", () => {
    expect(displayRankFor(entry(4, 3), "__overall__")).toBe(3);
  });

  it("uses category rank for category podium", () => {
    expect(displayRankFor(entry(1, 3), "B")).toBe(1);
  });
});

describe("event result contract", () => {
  it("preserves v1 FINISHED ranking even without a verification flag", () => {
    expect(isVerifiedEventFinisher(undefined, "FINISHED", undefined, null, null)).toBe(true);
  });

  it("does not count six unverified v2 FINISHED participants", () => {
    const finished = Array.from({ length: 6 }, () =>
      isVerifiedEventFinisher(2, "FINISHED", false, 120_000, 100_000));
    expect(finished.filter(Boolean)).toHaveLength(0);
  });

  it("requires an explicit proof and a valid timestamp at or after the start", () => {
    expect(isVerifiedEventFinisher(2, "FINISHED", true, 120_000, 100_000)).toBe(true);
    expect(isVerifiedEventFinisher(2, "FINISHED", true, 90_000, 100_000)).toBe(false);
    expect(isVerifiedEventFinisher(2, "FINISHED", true, Number.NaN, 100_000)).toBe(false);
    expect(isVerifiedEventFinisher(2, "DNF", true, 120_000, 100_000)).toBe(false);
  });
});

describe("EventResultsPage group CTA", () => {
  it("shows only the active event group's completed successful snapshot", () => {
    expect(shouldShowResultsGroupCta("group-1", "group-1", false, false, false)).toBe(true);
    expect(shouldShowResultsGroupCta("group-1", "group-1", true, false, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", "group-old", false, false, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", undefined, false, false, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", "group-1", false, true, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", "group-1", false, false, true)).toBe(false);
  });
});

describe("EventResultsPage CSV notice", () => {
  it("announces every click and does not carry the notice to another event", async () => {
    setDocData("events/first", { info: { name: "First event", status: "FINISHED", type: "TOUR" } });
    setDocData("events/next", { info: { name: "Next event fixture", status: "FINISHED", type: "TOUR" } });
    renderWithProviders(<ResultsWithNavigation />, { route: "/ko/event/first/results" });

    const csvButton = await screen.findByRole("button", { name: /CSV/ });
    fireEvent.click(csvButton);
    const firstNotice = screen.getByRole("status");
    expect(firstNotice).toHaveTextContent("CSV 내보내기는 추후 지원됩니다.");

    fireEvent.click(csvButton);
    expect(screen.getByRole("status")).not.toBe(firstNotice);

    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(screen.queryByText("CSV 내보내기는 추후 지원됩니다.")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "Next event fixture" });

    fireEvent.click(screen.getByRole("button", { name: "Back to first event" }));
    await screen.findByRole("heading", { name: "First event" });
    expect(screen.queryByText("CSV 내보내기는 추후 지원됩니다.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    await screen.findByRole("heading", { name: "Next event fixture" });
    const nextCsvButton = await screen.findByRole("button", { name: /CSV/ });
    fireEvent.click(nextCsvButton);
    expect(screen.getByRole("status")).toHaveTextContent("CSV 내보내기는 추후 지원됩니다.");
  });
});


it("replaces a pending event read with a connection error instead of an endless skeleton", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const read = vi.mocked(getDoc);
  const original = read.getMockImplementation()!;
  read.mockImplementation(ref => ref.path === "events/first"
    ? new Promise<Awaited<ReturnType<typeof getDoc>>>(() => undefined)
    : original(ref));
  try {
    renderWithProviders(<ResultsWithNavigation />, { route: "/ko/event/first/results" });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText("정보를 불러오는 데 시간이 오래 걸립니다. 연결을 확인한 뒤 다시 시도해 주세요.")).toBeVisible();
    expect(screen.getByRole("button", { name: /다시/ })).toBeEnabled();
  } finally {
    read.mockImplementation(original);
    vi.useRealTimers();
  }
});


it("keeps results available and reports an optional course read that times out", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  setDocData("events/first", { info: { name: "Finished optional course", status: "FINISHED", type: "TOUR", courseIds: ["slow"] } });
  const read = vi.mocked(getDoc);
  const original = read.getMockImplementation()!;
  read.mockImplementation(ref => ref.path === "courses/slow"
    ? new Promise<Awaited<ReturnType<typeof getDoc>>>(() => undefined)
    : original(ref));
  try {
    renderWithProviders(<ResultsWithNavigation />, { route: "/ko/event/first/results" });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole("heading", { name: "Finished optional course" })).toBeVisible();
    expect(logClientError).toHaveBeenCalledWith("EventResultsPage.loadCourse", expect.any(Error), { eventId: "first" });
  } finally {
    read.mockImplementation(original);
    vi.useRealTimers();
  }
});

function participant(userId: string, finish = 2000) {
  return { userId, displayName: `Rider ${userId}`, status: "FINISHED", finishedAt: finish, category: "A" };
}
function page(participants: ReturnType<typeof participant>[], nextCursor: string | null) {
  return { participants, complete: nextCursor === null, nextCursor, counterRevision: null, counters: null, countersStatus: "pending", projectionVersion: 2 };
}
function setupPaging() {
  setDocData("events/first", { info: { name: "Paged results", startTime: 1000, status: "FINISHED", type: "TOUR" } });
  return renderWithProviders(<ResultsWithNavigation />, { route: "/ko/event/first/results" });
}
it("reads one initial page, preserves partial rows on error, and enables exact ranks/CSV only at EOF", async () => {
  paging.page.mockResolvedValueOnce(page([participant("slow", 4000)], "cursor1"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(page([participant("fast", 2000)], null));
  setupPaging();
  await screen.findByText("Rider slow");
  expect(paging.page).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Rider slow")).toBeVisible();
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(screen.getAllByText("Rider fast").length).toBeGreaterThan(0);
  expect(within(screen.getByRole("row", { name: /Rider fast/ })).getAllByRole("cell")[0]).toHaveTextContent("1");
  expect(within(screen.getByRole("row", { name: /Rider slow/ })).getAllByRole("cell")[0]).toHaveTextContent("2");
  expect(paging.page.mock.calls.map(args => args[1])).toEqual([null, "cursor1", "cursor1"]);
  expect(getDocs).not.toHaveBeenCalled();
  expect(getPublicUserProfile).not.toHaveBeenCalled();
});
it("loads remaining pages only after explicit All and rejects revision drift without presenting completeness", async () => {
  paging.page.mockResolvedValueOnce({ ...page([participant("a")], "one"), counterRevision: "r1" })
    .mockResolvedValueOnce({ ...page([participant("b")], "two"), counterRevision: "r1" })
    .mockResolvedValueOnce({ ...page([participant("c")], null), counterRevision: "r2" });
  setupPaging();
  await screen.findByText("Rider a");
  expect(paging.page).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "전체 불러오기" }));
  await screen.findByRole("alert");
  expect(paging.page).toHaveBeenCalledTimes(3);
  expect(screen.getByText("Rider b")).toBeVisible();
  expect(screen.queryByText("Rider c")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
});
it("discards a delayed previous-event page", async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  paging.page.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
  setDocData("events/next", { info: { name: "Current event", status: "FINISHED", type: "TOUR" } });
  setupPaging();
  await waitFor(() => expect(paging.page).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Next event" }));
  await screen.findByRole("heading", { name: "Current event" });
  await act(async () => resolve(page([participant("old")], null)));
  expect(screen.queryByText("Rider old")).not.toBeInTheDocument();
});
it("fences a delayed public page when the account changes", async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  paging.page.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
  setupPaging();
  await waitFor(() => expect(paging.page).toHaveBeenCalledTimes(1));
  await act(async () => { simulateLogin({ uid: "new-account" }); });
  await act(async () => resolve(page([participant("old-account")], null)));
  expect(screen.queryByText("Rider old-account")).not.toBeInTheDocument();
});
it("keeps the private host path paged by document ID with four profile gets in flight", async () => {
  paging.host = { uid: "host", getIdTokenResult: async () => ({ claims: {} }) };
  auth.currentUser = paging.host as never;
  setDocData("events/first", { info: { name: "Host results", creatorId: "host", status: "FINISHED", type: "GROUP_RIDE", startTime: 1000 } });
  const docs = Array.from({ length: 50 }, (_, i) => ({ id: `u${String(i).padStart(3, "0")}`, data: () => ({ status: "FINISHED", finishedAt: 2000, category: "A", bib: i }) }));
  const reads = vi.mocked(getDocs);
  reads.mockResolvedValueOnce({ docs } as never).mockResolvedValueOnce({ docs: [] } as never);
  let active = 0;
  let peak = 0;
  vi.mocked(getPublicUserProfile).mockImplementation(async uid => {
    active++; peak = Math.max(peak, active);
    await Promise.resolve(); active--;
    return { nickname: `Private ${uid}` } as never;
  });
  renderWithProviders(<ResultsWithNavigation />, { route: "/ko/event/first/results" });
  await screen.findByText("Private u000");
  expect(reads).toHaveBeenCalledTimes(1);
  expect(peak).toBeLessThanOrEqual(4);
  expect(getPublicUserProfile).toHaveBeenCalledTimes(50);
  expect(limit).toHaveBeenCalledWith(50);
  expect(query).toHaveBeenCalledWith(expect.objectContaining({ path: "events/first/participants" }), expect.objectContaining({ type: "orderBy" }), expect.objectContaining({ type: "limit", args: [50] }));
  fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(startAfter).toHaveBeenCalledWith("u049");
  expect(getPublicUserProfile).toHaveBeenCalledTimes(50);
  expect(paging.page).not.toHaveBeenCalled();
});
it("pauses explicit All at a page boundary and resumes the committed cursor", async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  paging.page.mockResolvedValueOnce(page([participant("a")], "one"))
    .mockImplementationOnce(() => new Promise(value => { resolve = value; }))
    .mockResolvedValueOnce(page([participant("c")], null));
  setupPaging();
  await screen.findByText("Rider a");
  fireEvent.click(screen.getByRole("button", { name: "전체 불러오기" }));
  await waitFor(() => expect(paging.page).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "로딩 일시정지" }));
  await act(async () => resolve(page([participant("b")], "two")));
  expect(paging.page).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "전체 불러오기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(paging.page.mock.calls.map(args => args[1])).toEqual([null, "one", "two"]);
});
it("rejects overlapping IDs and restarts explicitly without mixing old rows", async () => {
  paging.page.mockResolvedValueOnce(page([participant("a")], "one"))
    .mockResolvedValueOnce(page([participant("a")], null))
    .mockResolvedValueOnce(page([participant("fresh")], null));
  setupPaging();
  await screen.findByText("Rider a");
  fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "처음부터 다시 불러오기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(screen.queryByText("Rider a")).not.toBeInTheDocument();
  expect(screen.getAllByText("Rider fresh").length).toBeGreaterThan(0);
  expect(paging.page.mock.calls.map(args => args[1])).toEqual([null, "one", null]);
});
it("bounds an explicit All action to 200 requests and keeps the cursor resumable instead of claiming completeness", async () => {
  let calls = 0;
  paging.page.mockImplementation(async () => {
    calls++;
    return page([participant(`budget-${calls}`)], calls <= 201 ? `cursor-${calls}` : null);
  });
  setupPaging();
  await screen.findByText("Rider budget-1");
  expect(calls).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "전체 불러오기" }));
  await screen.findByRole("alert");
  expect(calls).toBe(201);
  expect(screen.getByRole("alert")).toHaveTextContent("최대 200회, 10,000명");
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
  expect(screen.getByText("Rider budget-201")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(calls).toBe(202);
  expect(paging.page.mock.calls[201]![1]).toBe("cursor-201");
}, 15000);

it("keeps advancing through explicitly requested empty fenced pages until healthy rows and EOF", async () => {
  paging.page.mockResolvedValueOnce(page([], "fenced-50"))
    .mockResolvedValueOnce(page([], "fenced-100"))
    .mockResolvedValueOnce(page([participant("healthy")], null));
  setupPaging();
  await screen.findByRole("heading", { name: "Paged results" });
  expect(paging.page).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: /CSV/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "전체 불러오기" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(screen.getAllByText("Rider healthy").length).toBeGreaterThan(0);
  expect(paging.page.mock.calls.map(args => args[1])).toEqual([null, "fenced-50", "fenced-100"]);
});
it("hides an already rendered result synchronously when the SDK account changes before its auth notification", async () => {
  paging.page.mockResolvedValueOnce(page([participant("previous-session")], null));
  const view = setupPaging();
  await waitFor(() => expect(screen.getByRole("button", { name: /CSV/ })).toBeEnabled());
  expect(screen.getAllByText("Rider previous-session").length).toBeGreaterThan(0);
  auth.currentUser = { uid: "replacement" } as never;
  view.rerender(<ResultsWithNavigation />);
  expect(screen.queryByText("Rider previous-session")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /CSV/ })).not.toBeInTheDocument();
});
