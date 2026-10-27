vi.mock("./ActivityRouteHistorySnapshotPanel", () => ({ default: () => null }));
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { fireEvent, render as renderUi, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import ActivityRouteIndexHistoryPanel from "./ActivityRouteIndexHistoryPanel";
const mocks = vi.hoisted(() => ({ available: true, status: "idle", pages: [] as ActivityRouteIndexPageResponse[], start: vi.fn(), more: vi.fn(), language: "ko", units: "metric", hook: vi.fn() }));
vi.mock("./ActivityRouteInventoryPanel", () => ({ default: () => null }));
vi.mock("./ActivityMatchedRouteGroupPanel", () => ({ default: ({ activity, observedMetricsIdentity }: { activity: Activity; observedMetricsIdentity: string }) => mocks.available ? <span data-testid="adjacent-route-group" data-activity={activity.id} data-identity={observedMetricsIdentity} /> : null }));
vi.mock("../../../hooks/useActivityRouteIndexHistory", () => ({ useActivityRouteIndexHistory: (...args: unknown[]) => { mocks.hook(...args); return { available: mocks.available, status: mocks.status, pages: mocks.pages, start: mocks.start, loadMore: mocks.more }; } }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units, locale: mocks.language }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: mocks.language }, t: (key: string, values?: Record<string, unknown>) => {
  let text: unknown = mocks.language === "ko" ? ko : en;
  for (const part of key.split(".")) text = (text as Record<string, unknown>)?.[part];
  return typeof text === "string" ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(values?.[name] ?? "")) : key;
} }) }));
const activity = { id: "anchor", userId: "owner", type: "Run", startTime: 1790000000000, source: "orider" } as Activity;
function page(count = 7): ActivityRouteIndexPageResponse {
  return { candidates: Array.from({ length: count }, (_, index) => ({ activityId: `record-${index}`, startTime: Date.UTC(index ? 2026 : 2025, 0, 1),
    match: {}, canonicalAverage: index === 2 ? { state: "pending", reason: "metrics_pending", metricsRevision: null } : { state: "available", reason: null, metricsRevision: "a".repeat(64), version: 41, discipline: "run", startTime: Date.UTC(index ? 2026 : 2025, 0, 1), computedAt: Date.UTC(2026, 8, 1), avgSpeedKph: 12, inputCoverage: "partial_terminal", sourceLayer: "raw_parts" } })),
    readTime: { seconds: 1791792000, nanoseconds: 0 }, pageScannedCount: count, geometryPrefilteredCount: 0, sourceValidatedCount: count, omitted: [], nextCursor: { after: { startLatitude: 37, activityId: "last" } } } as unknown as ActivityRouteIndexPageResponse;
}
beforeEach(() => { mocks.available = true; mocks.status = "idle"; mocks.pages = []; mocks.start.mockReset(); mocks.more.mockReset(); mocks.hook.mockReset(); mocks.language = "ko"; mocks.units = "metric"; });
describe("route candidate compact panel", () => {
  it("provides the adjacent group with the exact current activity and observation scope without initiating candidate reads", () => {
    render(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="exact-head" />);
    expect(screen.getByTestId("adjacent-route-group")).toHaveAttribute("data-activity", "anchor");
    expect(screen.getByTestId("adjacent-route-group")).toHaveAttribute("data-identity", "exact-head");
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
  });

  it("opening and local controls do not fetch; explicit start and next page are distinct", () => {
    const view = render(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="head" />);
    fireEvent.click(screen.getByText(ko.routeIndexHistory.title)); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: ko.routeIndexHistory.find })); expect(mocks.start).toHaveBeenCalledOnce();
    mocks.status = "partial"; mocks.pages = [page()]; view.rerender(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /활동 출처 더 보기/ })); expect(screen.getAllByRole("link")).toHaveLength(7);
    fireEvent.change(screen.getByLabelText(ko.routeIndexHistory.year), { target: { value: "2025" } }); expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(mocks.start).toHaveBeenCalledTimes(1); expect(mocks.more).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: ko.routeIndexHistory.more })); expect(mocks.more).toHaveBeenCalledOnce();
  });
  it("uses source activity dates, shows missing averages and partial computation metadata without summary fallback", () => {
    mocks.pages = [page()]; mocks.status = "partial";
    render(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.getByText(ko.routeIndexHistory.averageMissing)).toBeInTheDocument();
    expect(screen.getAllByText(/분석 계산일/).length).toBeGreaterThan(0); expect(screen.getAllByText(/일부 표본으로 분석됨/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /2025.*5:00/ })).toHaveAttribute("href", "/ko/activity/record-0");
    expect(screen.getByText(ko.routeIndexHistory.quality)).toBeInTheDocument();
    expect(mocks.hook).toHaveBeenLastCalledWith("owner", "anchor", "run", expect.stringContaining("head"));
  });
  it.each(["index_missing", "unsupported", "expired", "invalidated", "budget", "capped"])("renders honest %s status and leaves a manual restart", status => {
    mocks.status = status; mocks.language = "en";
    render(<ActivityRouteIndexHistoryPanel activity={{ ...activity, type: "Ride" }} observedMetricsIdentity="head" />);
    expect(screen.getByText(en.routeIndexHistory.states[status as keyof typeof en.routeIndexHistory.states])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.routeIndexHistory.restart })).toBeInTheDocument();
  });
  it("does not offer private UI when eligibility is false and forwards deleted activity as ineligible", () => {
    mocks.available = false;
    const view = render(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="head" />); expect(view.container.querySelector("section")).toBeNull();
    view.rerender(<ActivityRouteIndexHistoryPanel activity={{ ...activity, deletedAt: 10 }} observedMetricsIdentity="head" />);
    expect(mocks.hook).toHaveBeenLastCalledWith("owner", "anchor", null, expect.any(String)); expect(mocks.start).not.toHaveBeenCalled();
  });
});

describe("readable canonical candidate trends", () => {
  it("keeps source gaps but suppresses a chart when zero or one average is known", () => {
    const received = page(3); received.candidates.forEach(row => { row.canonicalAverage = { state: "unavailable", reason: "missing_metrics", metricsRevision: null }; });
    mocks.pages = [received]; mocks.status = "partial";
    const view = render(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(screen.getByText(ko.routeIndexHistory.noAverage)).toBeInTheDocument(); expect(screen.getAllByRole("link")).toHaveLength(3);
    received.candidates[0]!.canonicalAverage = page(1).candidates[0]!.canonicalAverage;
    view.rerender(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(screen.getByText(/평균이 확인된 기록 1개로는 추세/)).toHaveTextContent("5:00/km"); expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
  });
  it.each(["run", "bike"])("shows existing-scale value/unit ticks and isolated points for %s, including imperial units", discipline => {
    const received = page(4), speeds = [12, 6, 18];
    received.candidates.forEach((row, index) => { if (index === 2) return; row.canonicalAverage = { state: "available", reason: null, metricsRevision: "a".repeat(64), version: 41, discipline: discipline as "run" | "bike", startTime: row.startTime, computedAt: row.startTime + 1, avgSpeedKph: speeds[index === 3 ? 2 : index]!, inputCoverage: "complete", sourceLayer: "inline_streams" }; });
    mocks.pages = [received]; mocks.status = "partial";
    const view = render(<ActivityRouteIndexHistoryPanel activity={{ ...activity, type: discipline === "run" ? "Run" : "Ride" }} observedMetricsIdentity="head" />);
    const chart = screen.getByRole("img"), ticks = chart.querySelectorAll(".route-index-history-value-axis span");
    expect(ticks).toHaveLength(2); expect(ticks[0]).toHaveTextContent(discipline === "run" ? "3:20/km" : "18.0km/h"); expect(ticks[1]).toHaveTextContent(discipline === "run" ? "10:00/km" : "6.0km/h");
    expect(chart.querySelectorAll("circle")).toHaveLength(3); expect(chart.querySelectorAll("polyline,path")).toHaveLength(0);
    expect(ticks[0]!.getAttribute("style")).toContain("16.666"); expect(ticks[1]!.getAttribute("style")).toContain("83.333");
    mocks.units = "imperial"; view.rerender(<ActivityRouteIndexHistoryPanel activity={{ ...activity, type: discipline === "run" ? "Run" : "Ride" }} observedMetricsIdentity="head" />);
    expect(screen.getByRole("img").querySelector(".route-index-history-value-axis")).toHaveTextContent(discipline === "run" ? "/mi" : "mph"); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
  });
});

function render(ui: ReactNode) { return renderUi(ui, { wrapper: ({ children }) => <MemoryRouter initialEntries={[`/${mocks.language}/activity/anchor?tab=compare`]}><Routes><Route path="/:lang/*" element={<>{children}<LocationEvidence /></>} /></Routes></MemoryRouter> }); }

function LocationEvidence() { const location = useLocation(); return <output data-testid="route-location">{JSON.stringify({pathname:location.pathname,state:location.state})}</output>; }

it("opens source through SPA with a validated return destination and no extra queries", () => {
 mocks.pages = [page()]; mocks.status = "partial";
 render(<ActivityRouteIndexHistoryPanel activity={activity} observedMetricsIdentity="metrics" />);
 fireEvent.click(screen.getAllByRole("link")[1]!);
 const location = JSON.parse(screen.getByTestId("route-location").textContent!);
 expect(location.state.routeInventoryReturn).toEqual({uid:"owner",pathname:"/ko/activity/anchor",search:"?tab=compare",hash:""});
 expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
});
