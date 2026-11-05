import { describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { getDoc } from "firebase/firestore";
import { logClientError } from "../../services/errorLogger";
import { Route, Routes, useNavigate } from "react-router-dom";
import { displayRankFor, shouldShowResultsGroupCta, type ResultEntry } from "./EventResultsPage";
import EventResultsPage from "./EventResultsPage";
import { isVerifiedEventFinisher } from "../../features/event/resultVerification";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setDocData } from "../../__tests__/mocks/firebase";

vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));

vi.mock("../../services/eventPublicParticipants", async (original) => ({
  ...await original<typeof import("../../services/eventPublicParticipants")>(),
  getEventPublicParticipants: async () => ({ participants: [] }),
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
