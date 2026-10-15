import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { displayRankFor, shouldShowResultsGroupCta, type ResultEntry } from "./EventResultsPage";
import EventResultsPage from "./EventResultsPage";
import { isVerifiedEventFinisher } from "../../features/event/resultVerification";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setDocData } from "../../__tests__/mocks/firebase";

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

  it("observes host group snapshot failures", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/event/EventResultsPage.tsx"), "utf8");
    expect(source).toContain('logClientError("EventResultsPage.loadHostGroup", groupError');
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
