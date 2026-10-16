import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MySegmentHistoryResponse } from "@shared/types/segment-history";
import SegmentHistoryPanel from "./SegmentHistoryPanel";
const mocks = vi.hoisted(() => ({ gap: vi.fn(), value: { response: null as MySegmentHistoryResponse | null, rows: [] as MySegmentHistoryResponse["attempts"], loading: false, error: false, loadMore: vi.fn(), retry: vi.fn() } }));
vi.mock("../../services/segmentDistanceTimeGap", () => ({ segmentGapAvailable: () => true }));
vi.mock("./SegmentDistanceTimeGapPanel", () => ({ default: (props: unknown) => { mocks.gap(props); return <div data-testid="gap-panel" />; } }));
vi.mock("../../hooks/useMySegmentHistory", () => ({ useMySegmentHistory: () => mocks.value }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => key === "timeGap.choice" ? `choice ${options?.count}` : key === "history.rawSnapshot" ? `raw snapshot ${options?.count}` : (key === "history.loaded" || key === "history.observedPartial") ? `loaded ${options?.count}` : key }) }));
vi.mock("../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
const row = { effortId: "current", activityId: "a", segmentId: "s", elapsedMs: 90000, startDateMs: null, averageSpeedKph: 25, averageHeartrate: 130, averageWatts: 0, averageCadence: 80, isVirtualPower: false, source: "orider", matchAlgorithmVersion: null, direction: "unknown" as const, geometryRevision: null };
function chooseOption(control: HTMLElement, index: number) {
  fireEvent.click(control);
  fireEvent.click(screen.getAllByRole("option")[index]!);
}
describe("segment history source states", () => {
  it("labels raw fallback measurements and preserves long minute-second values", () => {
    mocks.value.response = null; mocks.value.rows = [];
    render(<SegmentHistoryPanel segmentId="s" seeds={[
      {id:"long",activityId:"a",elapsedTime:8290000,averageSpeed:18.5,averageWatts:150},
      {id:"short",activityId:"b",elapsedTime:111000},
      {id:"other",activityId:"c",elapsedTime:119000},
    ]} seedLoading={false} seedError={false} />);
    const values = within(screen.getByText("138:10").parentElement!);
    expect(values.getByText("history.elapsedFormat")).toBeInTheDocument();
    expect(values.getByText("kom.avgSpeed 18.5 km/h")).toBeInTheDocument();
    expect(values.getByText("kom.power 150 W")).toBeInTheDocument();
    expect(screen.getByText("1:51")).toBeInTheDocument();
    expect(screen.getByText("1:59")).toBeInTheDocument();
  });
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
  it("only supplies the explicitly selected pair, keeping history selection and default callers intact", () => {
    mocks.value.rows = []; mocks.value.response = null;
    render(<SegmentHistoryPanel segmentId="s" seeds={[{ id: "ea", activityId: "a", elapsedTime: 1000 }, { id: "eb", activityId: "b", elapsedTime: 2000 }]} seedLoading={false} seedError={false} callableEnabled cachedGapEntry />);
    expect(mocks.gap.mock.lastCall?.[0]).toMatchObject({ pair: null });
    const selects = screen.getAllByRole("combobox");
    chooseOption(selects[0]!, 1); chooseOption(selects[1]!, 2);
    expect(mocks.gap.mock.lastCall?.[0]).toMatchObject({ pair: [{ activityId: "a", effortId: "ea" }, { activityId: "b", effortId: "eb" }] });
    chooseOption(selects[1]!, 1); expect(mocks.gap.mock.lastCall?.[0]).toMatchObject({ pair: null });
  });

  it("distinguishes KST seconds and unknown ties without exposing IDs as option labels", () => {
    mocks.value.rows = []; mocks.value.response = null;
    render(<SegmentHistoryPanel segmentId="s" seeds={[
      { id: "ea", activityId: "a", elapsedTime: 90000, startDate: Date.UTC(2026, 9, 7, 0, 1, 2), source: "orider" },
      { id: "eb", activityId: "b", elapsedTime: 90000, startDate: Date.UTC(2026, 9, 7, 0, 1, 3), source: "orider" },
      { id: "ec", activityId: "c", elapsedTime: Number.NaN },
      { id: "ed", activityId: "d", elapsedTime: Number.NaN },
    ]} seedLoading={false} seedError={false} callableEnabled cachedGapEntry />);
    const select = screen.getAllByRole("combobox")[0]!;
    fireEvent.click(select);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(5);
    expect(options[1]).toHaveTextContent("09:01:02 KST · 1:30 · timeGap.sources.orider");
    expect(options[2]).toHaveTextContent("09:01:03 KST · 1:30 · timeGap.sources.orider");
    expect(options[3]).toHaveTextContent("history.unknownDate · timeGap.unknownTime · history.unknownSource · choice 3");
    expect(options[4]).toHaveTextContent("choice 4");
    fireEvent.click(options[1]!);
    const proof = screen.getByText("timeGap.proof").closest("details")!;
    expect(proof).not.toHaveAttribute("open");
    expect(proof).toHaveTextContent("timeGap.activityId: a");
    expect(proof).toHaveTextContent("timeGap.effortId: ea");
    expect(mocks.gap.mock.lastCall?.[0]).toMatchObject({ pair: null });
    chooseOption(screen.getAllByRole("combobox")[1]!, 2);
    expect(mocks.gap.mock.lastCall?.[0]).toMatchObject({ pair: [{ activityId: "a", effortId: "ea" }, { activityId: "b", effortId: "eb" }] });
  });

});
