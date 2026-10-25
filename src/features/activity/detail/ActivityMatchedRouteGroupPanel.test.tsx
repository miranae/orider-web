import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityMatchedRouteGroupResponse } from "@shared/activity-matched-route-groups";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import ActivityMatchedRouteGroupPanel from "./ActivityMatchedRouteGroupPanel";
import { validateActivityMatchedRouteGroupResponse } from "../../../services/activityMatchedRouteGroups";
const mocks = vi.hoisted(() => ({ available: true, status: "idle", pages: [] as ActivityMatchedRouteGroupResponse[], start: vi.fn(), more: vi.fn(), language: "ko", units: "metric", hook: vi.fn() }));
vi.mock("../../../hooks/useActivityMatchedRouteGroups", () => ({ useActivityMatchedRouteGroups: (...args: unknown[]) => { mocks.hook(...args); return { available: mocks.available, status: mocks.status, pages: mocks.pages, start: mocks.start, loadMore: mocks.more }; } }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units, locale: mocks.language }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: mocks.language }, t: (key: string, values?: Record<string, unknown>) => {
  let text: unknown = mocks.language === "ko" ? ko : en;
  for (const part of key.split(".")) text = (text as Record<string, unknown>)?.[part];
  return typeof text === "string" ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(values?.[name] ?? "")) : key;
} }) }));
const activity = { id: "anchor", userId: "owner", type: "Ride", startTime: 1790000000000, source: "orider" } as Activity;
function page(known = 3, discipline: "bike" | "run" = "bike"): ActivityMatchedRouteGroupResponse {
  const trend = { state: "insufficient", basis: "canonical_avg_speed_kph", count: 3, reason: "insufficient_distinct_dates" };
  return { groupToken: "group", members: Array.from({ length: 3 }, (_, index) => ({ activityId: index ? `ride-${index}` : "anchor", startTime: Date.UTC(index ? 2026 : 2025, 8, 1), year: index ? 2026 : 2025, isAnchor: !index,
    canonicalAverage: index >= known ? { state: "pending", reason: "metrics_pending", metricsRevision: null } : { state: "available", reason: null, metricsRevision: "a".repeat(64), version: 41, discipline, startTime: Date.UTC(index ? 2026 : 2025, 8, 1), computedAt: Date.UTC(2026, 9, 1), avgSpeedKph: 6 + index * 6, inputCoverage: "complete", sourceLayer: "raw_parts" }, rankingEligible: index < known, rankingExclusionReason: index >= known ? "metric_unavailable" : null })),
    readTime: { seconds: 1791792000, nanoseconds: 0 }, nextCursor: "next", coverage: { indexCohort: "descriptor_capped", sourceValidation: "validation_capped" },
    summary: { memberCount: 6, knownMetricCount: known, rankEligibleCount: known, fastestActivityIds: ["ride-2"], trend, years: [{ year: 2026, memberCount: 4, knownMetricCount: 2, rankEligibleCount: 2, fastestActivityIds: ["ride-2"], trend }, { year: 2025, memberCount: 2, knownMetricCount: 1, rankEligibleCount: 1, fastestActivityIds: ["anchor"], trend }] } } as unknown as ActivityMatchedRouteGroupResponse;
}
beforeEach(() => { mocks.available = true; mocks.status = "idle"; mocks.pages = []; mocks.start.mockReset(); mocks.more.mockReset(); mocks.hook.mockReset(); mocks.language = "ko"; mocks.units = "metric"; });
describe("bounded route group panel", () => {
  it("opening has zero requests; only explicit buttons start or read a next page", () => {
    const view = render(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="metrics" />);
    fireEvent.click(screen.getByText(ko.routeGroup.title)); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: ko.routeGroup.find })); expect(mocks.start).toHaveBeenCalledOnce();
    mocks.pages = [page()]; mocks.status = "partial"; view.rerender(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="metrics" />);
    expect(screen.getByText(/그룹 활동 6개 중 3개 표시/)).toBeInTheDocument(); expect(screen.getAllByRole("link")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText(ko.routeGroup.year), { target: { value: "2025" } }); expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText(/2025년 그룹 활동 2개 중 1개 표시/)).toBeInTheDocument(); expect(mocks.start).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: ko.routeGroup.more })); expect(mocks.more).toHaveBeenCalledOnce();
  });
  it.each([0, 1])("suppresses an empty large chart for %i averages while keeping every source", known => {
    mocks.pages = [page(known)]; mocks.status = "budget";
    render(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="metrics" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText(known ? /평균 1개로는/ : ko.routeGroup.noAverage)).toBeInTheDocument();
    expect(screen.getByText(ko.routeGroup.partial)).toBeInTheDocument();
  });
  it.each(["run", "bike"] as const)("shows real value/unit ticks and source computation metadata for %s without connecting gaps", discipline => {
    mocks.pages = [page(2, discipline)]; mocks.status = "partial"; mocks.language = "en"; mocks.units = "imperial";
    render(<ActivityMatchedRouteGroupPanel activity={{ ...activity, type: discipline === "run" ? "Run" : "Ride" }} observedMetricsIdentity="metrics" />);
    const chart = screen.getByRole("img"); expect(chart.querySelectorAll("circle")).toHaveLength(2); expect(chart.querySelectorAll("polyline,path")).toHaveLength(0);
    expect(chart.querySelector(".matched-route-group-value-axis")).toHaveTextContent(discipline === "run" ? "/mi" : "mph");
    expect(screen.getAllByText(/Analysis computed/)).toHaveLength(2); expect(screen.getByText(en.routeGroup.quality)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Current activity/ })).toHaveAttribute("href", "/en/activity/anchor");
  });
  it("forwards original head/metric identity and excludes deleted/public activity", () => {
    mocks.available = false; const view = render(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="observed" />);
    expect(view.container).toBeEmptyDOMElement(); expect(mocks.hook).toHaveBeenLastCalledWith("owner", "anchor", "bike", expect.stringContaining("observed"), "complete");
    view.rerender(<ActivityMatchedRouteGroupPanel activity={{ ...activity, deletedAt: 1 }} observedMetricsIdentity="changed" />); expect(mocks.hook).toHaveBeenLastCalledWith("owner", "anchor", null, expect.stringContaining("changed"), "complete");
  });
  it.each(["ko", "en"])("explains the verified early anchor partial-geometry exclusion in %s without calls", language => {
    const time = 1791792000000;
    const response: ActivityMatchedRouteGroupResponse = { mode: "matched_route_group_page", anchorActivityId: "anchor", discipline: "bike", state: "anchor_unsupported", readTime: { seconds: time / 1000, nanoseconds: 0 }, expiresAt: time + 1800000, groupToken: null, nextCursor: null,
      scope: { kind: "bounded_owner_stored_index_cohort", indexQueryPolicy: "document_id_first20_v1", groupPolicy: "observed-complete-link-v1", descriptorLimit: 20, validatedLimit: 6 },
      coverage: { indexCohort: "not_inspected", sourceValidation: "not_inspected", wholeHistory: "unknown", geometry: "unavailable", gpsAccuracy: "unknown", deduplication: "unknown" },
      omittedCounts: { partialGeometry: 1, gapGeometry: 0, unsupportedDescriptor: 0, changedSource: 0, validationCap: 0, nonAnchorCluster: 0 }, members: [], summary: null,
      io: { logicalDocuments: 16, metadataRequests: 0, descriptorComparisons: 0, rawDownloads: 0, writes: 0 } };
    mocks.pages = [validateActivityMatchedRouteGroupResponse(response, { mode: "matched_route_group_page", anchorActivityId: "anchor", discipline: "bike" }, time + 1)]; mocks.status = "unsupported"; mocks.language = language;
    const translations = language === "ko" ? ko : en;
    const view = render(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.getByText(translations.routeGroup.partialGeometry)).toBeInTheDocument(); expect(screen.queryByText(translations.routeGroup.states.unsupported)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument(); expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.more).not.toHaveBeenCalled();
    // 후보 집계의 부분 경로 수만으로 현재 활동의 제외 이유를 단정하지 않는다.
    mocks.pages = [{ ...response, groupToken: "mrgg1." + "a".repeat(40), coverage: { ...response.coverage, indexCohort: "exhausted", sourceValidation: "omitted" } }];
    view.rerender(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.getByText(translations.routeGroup.states.unsupported)).toBeInTheDocument(); expect(screen.queryByText(translations.routeGroup.partialGeometry)).not.toBeInTheDocument();
  });
  it.each(["expired", "invalidated", "index_missing", "unsupported", "error"])("keeps %s honest without empty history claims", status => {
    mocks.status = status; render(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="head" />);
    expect(screen.getByText(ko.routeGroup.states[status as keyof typeof ko.routeGroup.states])).toBeInTheDocument(); expect(screen.getByRole("button", { name: ko.routeGroup.refresh })).toBeInTheDocument(); expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

it('requires native opt-in, suppresses comparison chart and fastest badges while keeping activity links', () => {
  const view = render(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="metrics" />);
  fireEvent.click(screen.getByText(ko.routeGroup.title));
  fireEvent.change(screen.getByLabelText(ko.routeGroup.mode), { target: { value: 'observed_native' } });
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.hook.mock.calls.at(-1)![4]).toBe('observed_native');
  mocks.pages = [page()]; mocks.status = 'complete';
  view.rerender(<ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity="metrics" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText(ko.routeGroup.observedScope)).toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.queryByText(new RegExp(ko.routeGroup.fastest))).not.toBeInTheDocument();
  view.rerender(<ActivityMatchedRouteGroupPanel activity={{ ...activity, id: 'another' }} observedMetricsIdentity="metrics" />);
  expect(mocks.hook.mock.calls.at(-1)![4]).toBe('complete');
});
