import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { CanonicalHomeSummaryState } from "../../hooks/useCanonicalHomeSummary";
import RecentActivitySummary from "./RecentActivitySummary";
import { serverHomeTotals } from "../../__tests__/fixtures/canonicalHomeSummary";
const state = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null,
  loading: false, units: "metric", coverage: "ready", canonical: { enabled: false, display: null, totals: null, computedAt: null } as CanonicalHomeSummaryState }));
const canonicalHook = vi.hoisted(() => vi.fn());
const statsHook = vi.hoisted(() => vi.fn());
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: state.loading }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: state.units }) }));
vi.mock("../../hooks/useCanonicalHomeSummary", () => ({ useCanonicalHomeSummary: () => { return canonicalHook() ?? state.canonical; } }));
vi.mock("../../hooks/useActivities", () => ({ useWeeklyStats: (options: unknown) => { statsHook(options); return { thisWeek: { rides: 2, distance: 10000, time: 5400000, elevation: 100 }, recent7DayCoverage: state.coverage }; } }));
afterEach(cleanup);
beforeEach(() => {
  state.user = { uid: "owner", isAnonymous: false }; state.loading = false; state.units = "metric"; state.coverage = "ready";
  state.canonical = { enabled: false, display: null, totals: null, computedAt: null };
  canonicalHook.mockReset(); statsHook.mockClear();
});
function value(label: string) { return within(screen.getByText(label).parentElement!).getByRole("definition"); }
describe("recent activity summary data ownership", () => {
  it.each(["guest", "anonymous", "loading"])("does not mount data hooks for %s", mode => {
    if (mode === "guest") state.user = null;
    if (mode === "anonymous") state.user!.isAnonymous = true;
    if (mode === "loading") state.loading = true;
    const { container } = render(<RecentActivitySummary sport="bike" />);
    expect(container).toBeEmptyDOMElement(); expect(canonicalHook).not.toHaveBeenCalled(); expect(statsHook).not.toHaveBeenCalled();
  });
  it("requests selected rolling-seven-day statistics without monthly distance and preserves four source values", () => {
    render(<RecentActivitySummary sport="bike" />);
    expect(statsHook).toHaveBeenCalledWith({ includeMonthlyDistance: false, discipline: undefined, recent7DayDiscipline: "bike" });
    expect(value("이동거리")).toHaveTextContent("10.0km"); expect(value("활동횟수")).toHaveTextContent("2건");
    expect(value("활동시간")).toHaveTextContent("1시간 30분"); expect(value("획득고도")).toHaveTextContent("100m");
  });
  it.each(["loading", "partial", "error", "unavailable"])("suppresses fallback numbers for %s coverage", coverage => {
    state.coverage = coverage;
    render(<RecentActivitySummary sport="run" />);
    expect(screen.getAllByRole("definition").every(node => node.textContent === "—")).toBe(true);
    expect(statsHook).toHaveBeenCalledWith({ includeMonthlyDistance: false, discipline: "run", recent7DayDiscipline: "run" });
  });
  it("uses canonical all-sport totals with unit conversion, stale hint, and no legacy query", () => {
    state.units = "imperial"; state.canonical = { enabled: true, display: "value_with_stale_hint", totals: serverHomeTotals, computedAt: 1 };
    render(<RecentActivitySummary sport="run" />);
    expect(screen.getByRole("heading")).toHaveTextContent("최근 7일 · 전체 종목");
    expect(value("이동거리")).toHaveTextContent("26.1mi"); expect(value("획득고도")).toHaveTextContent("394ft");
    expect(value("활동횟수")).toHaveTextContent("3건"); expect(value("활동시간")).toHaveTextContent("1시간 0분");
    expect(screen.getByText("이전 집계")).toBeInTheDocument(); expect(statsHook).not.toHaveBeenCalled();
  });
  it.each([null, "loading", "error", "empty"] as const)("does not use legacy values or zeros for canonical %s", display => {
    state.canonical = { enabled: true, display, totals: null, computedAt: null };
    render(<RecentActivitySummary sport="all" />);
    expect(screen.getAllByRole("definition").every(node => node.textContent === "—")).toBe(true); expect(statsHook).not.toHaveBeenCalled();
  });
  it("keeps the canonical controller mounted when only the sport filter changes", () => {
    const mounted = vi.fn();
    canonicalHook.mockImplementation(() => {
      useEffect(() => { mounted(); }, []);
      return state.canonical;
    });
    state.canonical = { enabled: true, display: "value", totals: serverHomeTotals, computedAt: 1 };
    const view = render(<RecentActivitySummary sport="bike" />);
    view.rerender(<RecentActivitySummary sport="run" />);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(statsHook).not.toHaveBeenCalled();
    expect(screen.getByRole("heading")).toHaveTextContent("최근 7일 · 전체 종목");
    expect(value("이동거리")).toHaveTextContent("42.0km");
  });
  it("preserves a confirmed zero as zero rather than unknown", () => {
    state.canonical = { enabled: true, display: "value", totals: { activityCount: 0, distanceMeters: 0, movingMillis: 0, elevationGainMeters: 0 }, computedAt: 1 };
    render(<RecentActivitySummary sport="all" />);
    expect(value("이동거리")).toHaveTextContent("0m"); expect(value("활동횟수")).toHaveTextContent("0건");
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
  it("does not retain the previous owner's canonical snapshot when the account changes", () => {
    canonicalHook.mockImplementation(() => {
      const [snapshot] = useState(state.canonical);
      return snapshot;
    });
    state.canonical = { enabled: true, display: "value", totals: serverHomeTotals, computedAt: 1 };
    const view = render(<RecentActivitySummary sport="all" />);
    expect(value("이동거리")).toHaveTextContent("42.0km");
    state.user = { uid: "second-owner", isAnonymous: false };
    state.canonical = { enabled: true, display: null, totals: null, computedAt: null };
    view.rerender(<RecentActivitySummary sport="all" />);
    expect(value("이동거리")).toHaveTextContent("—");
    expect(screen.queryByText("42.0km")).not.toBeInTheDocument();
  });
  it("changes fallback scope without requesting monthly data and clears output on owner logout", () => {
    const view = render(<RecentActivitySummary sport="all" />);
    view.rerender(<RecentActivitySummary sport="swim" />);
    expect(statsHook).toHaveBeenLastCalledWith({ includeMonthlyDistance: false, discipline: undefined, recent7DayDiscipline: "swim" });
    state.user = null; view.rerender(<RecentActivitySummary sport="swim" />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
