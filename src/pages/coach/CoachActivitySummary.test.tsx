import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CoachActivitySummary from "./CoachActivitySummary";
const state = vi.hoisted(() => ({ units: "metric" as "metric" | "imperial", coverage: "ready", percent: 120 as number | null, available: true, loading: false }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: state.units }) }));
const weekly = vi.hoisted(() => vi.fn());
const history = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useActivities", () => ({ useWeeklyStats: (options: unknown) => { weekly(options); return { coverage: state.coverage, monthlyActivityDistance: 42100, monthlyFlowPercent: state.percent }; } }));
vi.mock("../../hooks/useRunHistory", () => ({ useRunHistory: (weeks: number, enabled: boolean) => { history(weeks, enabled); return { loading: state.loading, available: state.available, runs: [] }; } }));
vi.mock("../../utils/runWeeklyRecap", () => ({ computeRunWeeklyRecap: () => ({ lastWeek: { count: 2 } }), isRecapVisible: () => true }));
vi.mock("../../components/dashboard/WeeklyRecapCard", () => ({ default: () => <div>verified weekly recap</div> }));
afterEach(cleanup);
beforeEach(() => { state.units = "metric"; state.coverage = "ready"; state.percent = 120; state.available = true; state.loading = false; weekly.mockClear(); history.mockClear(); });
describe("coach monthly activity and independent run history", () => {
  it("keeps non-running monthly distance explicitly all-sport and does not enable run history", () => {
    render(<CoachActivitySummary discipline="bike" />);
    expect(weekly).toHaveBeenCalledWith({ includeMonthlyDistance: true, discipline: undefined });
    expect(history).toHaveBeenCalledWith(8, false);
    expect(screen.getByRole("heading", { name: "이번 달 활동 · 전체 종목" })).toBeInTheDocument();
    expect(screen.getByText("42.1km")).toBeInTheDocument();
    expect(screen.getByText("평소 월간 환산 거리 대비 120%")).toBeInTheDocument();
    expect(screen.queryByText("verified weekly recap")).not.toBeInTheDocument();
  });
  it("follows the user's distance units when preferences change", () => {
    const view = render(<CoachActivitySummary discipline="run" />);
    expect(screen.getByText("42.1km")).toBeInTheDocument();
    state.units = "imperial";
    view.rerender(<CoachActivitySummary discipline="run" />);
    expect(screen.getByText("26.2mi")).toBeInTheDocument();
    expect(screen.queryByText("42.1km")).not.toBeInTheDocument();
  });
  it.each(["loading", "partial", "error", "unavailable"])("does not turn %s history into a known monthly total", coverage => {
    state.coverage = coverage;
    render(<CoachActivitySummary discipline="run" />);
    expect(screen.queryByText("42.1km")).not.toBeInTheDocument();
    expect(screen.queryByText(/120%/)).not.toBeInTheDocument();
  });
  it("uses complete independent eight-week history for recap even when monthly coverage is unavailable", () => {
    state.coverage = "error";
    const view = render(<CoachActivitySummary discipline="run" />);
    expect(weekly).toHaveBeenCalledWith({ includeMonthlyDistance: true, discipline: "run" });
    expect(history).toHaveBeenCalledWith(8, true);
    expect(screen.getByText("verified weekly recap")).toBeInTheDocument();
    state.available = false;
    view.rerender(<CoachActivitySummary discipline="run" />);
    expect(screen.queryByText("verified weekly recap")).not.toBeInTheDocument();
    state.available = true;
    state.loading = true;
    view.rerender(<CoachActivitySummary discipline="run" />);
    expect(screen.queryByText("verified weekly recap")).not.toBeInTheDocument();
  });
  it("does not manufacture a comparison when there is no historical baseline", () => {
    state.percent = null;
    render(<CoachActivitySummary discipline="run" />);
    expect(screen.getByText("42.1km")).toBeInTheDocument();
    expect(screen.queryByText(/평소 월간 환산 거리 대비/)).not.toBeInTheDocument();
  });
});
