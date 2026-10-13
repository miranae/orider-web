import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MySegmentHistoryResponse } from "@shared/types/segment-history";
import SegmentHistoryPanel from "./SegmentHistoryPanel";
const mocks = vi.hoisted(() => ({ value: { response: null as MySegmentHistoryResponse | null, rows: [] as MySegmentHistoryResponse["attempts"], loading: false, error: false, loadMore: vi.fn(), retry: vi.fn() } }));
vi.mock("../../hooks/useMySegmentHistory", () => ({ useMySegmentHistory: () => mocks.value }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => key === "history.rawSnapshot" ? `raw snapshot ${options?.count}` : (key === "history.loaded" || key === "history.observedPartial") ? `loaded ${options?.count}` : key }) }));
vi.mock("../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
const row = { effortId: "current", activityId: "a", segmentId: "s", elapsedMs: 90000, startDateMs: null, averageSpeedKph: 25, averageHeartrate: 130, averageWatts: 0, averageCadence: 80, isVirtualPower: false, source: "orider", matchAlgorithmVersion: null, direction: "unknown" as const, geometryRevision: null };
describe("segment history source states", () => {
  it("shows preparing and bounded source records without pretending deployed analysis", () => {
    mocks.value.response = null; mocks.value.rows = [];
    render(<SegmentHistoryPanel segmentId="s" seeds={[{ id: "e", activityId: "a", elapsedTime: 90000 }]} seedLoading={false} seedError={false} />);
    expect(screen.getByText("history.preparing")).toBeInTheDocument(); expect(screen.getByText("history.unknownDate")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "history.select" })).not.toBeInTheDocument(); expect(screen.getByText("history.alignment")).toBeInTheDocument();
  });
  it("shows top-level current outside page, partial comparison, unknown date and distinct raw snapshot", () => {
    mocks.value.rows = [{ ...row, effortId: "past", activityId: "b" }];
    mocks.value.response = { state: "available", currentAttempt: row, currentEffortId: "current", coverage: { complete: false }, comparison: null, records: { state: "authoritative_snapshot", topThree: [row], rawTotalEfforts: 129, authorityUpdatedAtMs: 1 }, nextCursor: "next" } as MySegmentHistoryResponse;
    render(<SegmentHistoryPanel segmentId="s" seeds={[]} seedLoading={false} seedError={false} callableEnabled />);
    expect(screen.getByRole("region", { name: "history.current" })).toBeInTheDocument(); expect(screen.getByText("history.partial")).toBeInTheDocument(); expect(screen.getByText("raw snapshot 129").closest("details")).not.toHaveAttribute("open"); expect(screen.queryByText("history.selectHint")).not.toBeInTheDocument(); expect(within(screen.getByRole("region", { name: "history.current" })).getByText("1:30").closest(".ds-stat")).toHaveClass("ds-stat--compact"); expect(screen.getByText("loaded 1")).toBeInTheDocument(); expect(screen.getAllByText(/0 W/).length).toBeGreaterThan(0); expect(screen.getByText("PR #1")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "history.more" })).toBeInTheDocument();
  });
  it("marks the selected timeline row without another select action", () => {
    mocks.value.rows = [row];
    mocks.value.response = { state: "available", currentAttempt: row, currentEffortId: "current", coverage: { complete: false }, comparison: null, records: { state: "unavailable", topThree: [], rawTotalEfforts: null }, nextCursor: null } as MySegmentHistoryResponse;
    render(<SegmentHistoryPanel segmentId="s" seeds={[]} seedLoading={false} seedError={false} callableEnabled />);
    expect(document.querySelector('[aria-current="true"]')).toHaveClass("segment-history-row-current");
    expect(screen.queryByRole("button", { name: "history.select" })).not.toBeInTheDocument();
  });
});
