import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import TriFitnessView from "./TriFitnessView";
import { buildTriFitnessTimeline, type TriFitnessBreakdown } from "../../hooks/useFitnessModel";

vi.mock("../../components/mobile/IntegratedLoadCard", () => ({
  default: ({ combined }: { combined: { ctl: number; atl: number; tsb: number } }) => (
    <div data-testid="desktop-integrated-detail">
      integrated {combined.ctl}/{combined.atl}/{combined.tsb}
    </div>
  ),
}));

const emptyLoadFocus = {
  windowDays: 28,
  totalLoad: 0,
  buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 },
  sourceLoad: { power: 0, heartRate: 0, unclassified: 0 },
  disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 },
  activityCount: 0,
  coveragePct: 0,
  confidence: "none" as const,
  hasAnaerobicBikeDetail: false,
};

function breakdown(values: { bike?: number; run?: number; swim?: number } = {}): TriFitnessBreakdown {
  const entry = (ctl: number) => ({
    canonical: true,
    weeklyTSS: ctl * 2,
    fitness: [{ date: "2026-09-02", ctl, atl: ctl - 1, tsb: 1, dailyLoad: ctl * 2 }],
  });
  return {
    bike: entry(values.bike ?? 0),
    run: entry(values.run ?? 0),
    swim: entry(values.swim ?? 0),
  };
}

function triProps(values: { bike?: number; run?: number; swim?: number } = {}) {
  const value = breakdown(values);
  return { breakdown: value, timeline: buildTriFitnessTimeline(value) };
}

describe("TriFitnessView parity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows current integrated interpretation before history while retaining both", () => {
    renderWithProviders(
      <TriFitnessView
        range={90}
        onRangeChange={vi.fn()}
        {...triProps({ bike: 35.2 })}
        combinedLoad={{ ctl: 35.2, atl: 30, tsb: 5.2, contributions: [] }}
        loadFocus={emptyLoadFocus}
        historySlot={<section data-testid="pmc-history-chart">PMC history chart</section>}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    const chart = screen.getByTestId("pmc-history-chart");
    const summary = screen.getByTestId("desktop-integrated-detail");
    expect(summary.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("tri-legacy-range-note")).toHaveTextContent("최근 90일");
    expect(screen.queryByRole("button", { name: "3개월" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /사이클링/ })).toBeInTheDocument();
  });

  it("exposes the same sport evidence on mobile without duplicating current status or headings", () => {
    renderWithProviders(<TriFitnessView evidenceOnly condition range={90} onRangeChange={vi.fn()}
      {...triProps({ bike: 30, run: 10 })}
      combinedLoad={{ ctl: 40, atl: 35, tsb: 5, contributions: [] }} loadFocus={emptyLoadFocus}
      historySlot={<section data-testid="already-present-history" />}
      thresholdsSlot={<section data-testid="already-present-thresholds" />} />);
    const evidence = screen.getByTestId("condition-tri-mobile-evidence");
    expect(within(evidence).getByRole("link", { name: /사이클링/ })).toBeVisible();
    expect(within(evidence).getByRole("link", { name: /러닝/ })).toBeVisible();
    expect(within(evidence).getAllByText(/최근 7일/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("desktop-integrated-detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("already-present-history")).not.toBeInTheDocument();
    expect(screen.queryByTestId("already-present-thresholds")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("keeps training thresholds after integrated evidence", () => {
    renderWithProviders(<TriFitnessView range={90} onRangeChange={vi.fn()} {...triProps({ bike: 30 })} combinedLoad={null} loadFocus={emptyLoadFocus} thresholdsSlot={<section data-testid="thresholds">훈련 기준값</section>} />);
    const thresholds = screen.getByTestId("thresholds");
    expect(screen.getByRole("link", { name: /사이클링/ }).compareDocumentPosition(thresholds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("states that the secondary stack stays on the numeric activity window for long history selections", () => {
    renderWithProviders(
      <TriFitnessView range={90} selectedHistoryRange="3y" onRangeChange={vi.fn()} {...triProps({ bike: 35.2 })} combinedLoad={null} loadFocus={emptyLoadFocus} historySlot={<div>main history</div>} />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(screen.getByTestId("tri-legacy-range-note")).toHaveTextContent("상단 기간 선택은 3년");
    expect(screen.getByTestId("tri-legacy-range-note")).toHaveTextContent("최근 90일 데이터로 고정");
  });

  it("filters sparse PMC by latest-record cutoff and daily load by the current 42-day window", () => {
    const value: TriFitnessBreakdown = {
      bike: {
        canonical: true,
        weeklyTSS: 40,
        fitness: [
          { date: "2026-06-01", ctl: 20, atl: 18, tsb: 2, dailyLoad: 40 },
          { date: "2026-09-01", ctl: 35, atl: 30, tsb: 5, dailyLoad: 60 },
        ],
      },
      run: { canonical: true, weeklyTSS: 0, fitness: [] },
      swim: { canonical: true, weeklyTSS: 0, fitness: [] },
    };
    const { container } = renderWithProviders(
      <TriFitnessView range={42} selectedHistoryRange={42} onRangeChange={vi.fn()} breakdown={value} timeline={buildTriFitnessTimeline(value)} combinedLoad={null} loadFocus={emptyLoadFocus} />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(container.querySelector("svg[data-point-count]")).toHaveAttribute("data-point-count", "1");
    expect(container.querySelector("[data-daily-point-count]")).toHaveAttribute("data-daily-point-count", "1");
    expect(screen.getByTestId("tri-legacy-range-note")).toHaveTextContent("최신 기록일 기준 최근 42일");
  });

  it("retains the historical PMC when its load records fall outside the current daily window", () => {
    vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
    const value = breakdown({ bike: 35.2 });
    const { container } = renderWithProviders(
      <TriFitnessView range={42} selectedHistoryRange={42} onRangeChange={vi.fn()} breakdown={value} timeline={buildTriFitnessTimeline(value)} combinedLoad={null} loadFocus={emptyLoadFocus} />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(container.querySelector("svg[data-point-count]")).toHaveAttribute("data-point-count", "1");
    expect(container.querySelector("[data-daily-point-count]")).toBeNull();
    expect(screen.getByText("일별 부하 데이터가 없어요")).toBeInTheDocument();
  });

  it("renders the authoritative integrated detail exactly once without a workout card", () => {
    renderWithProviders(
      <TriFitnessView
        range={90}
        selectedHistoryRange="3y"
        onRangeChange={vi.fn()}
        {...triProps()}
        combinedLoad={{ ctl: 30, atl: 25, tsb: 5, contributions: [] }}
        loadFocus={emptyLoadFocus}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(screen.getAllByTestId("desktop-integrated-detail")).toHaveLength(1);
    expect(screen.queryByTestId("tri-contribution-empty")).not.toBeInTheDocument();
    expect(screen.queryByText("487")).not.toBeInTheDocument();
  });

  it("renders the integrated snapshot and discipline cards from one canonical breakdown", () => {
    renderWithProviders(
      <TriFitnessView
        range={90}
        onRangeChange={vi.fn()}
        {...triProps({ bike: 35.2, run: 8.1, swim: 3.4 })}
        combinedLoad={{
          ctl: 46.7,
          atl: 43.7,
          tsb: 3,
          contributions: [
            { discipline: "bike", ctl: 35.2 },
            { discipline: "run", ctl: 8.1 },
            { discipline: "swim", ctl: 3.4 },
          ],
        }}
        loadFocus={emptyLoadFocus}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(screen.getByTestId("desktop-integrated-detail")).toHaveTextContent("integrated 46.7/43.7/3");
    expect(screen.getByRole("link", { name: /사이클링/ })).toHaveTextContent("35.2");
    expect(screen.getByRole("link", { name: /러닝/ })).toHaveTextContent("8.1");
    expect(screen.queryByRole("group", { name: "수영 · 준비 중" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /수영/ })).not.toBeInTheDocument();
  });

  it("keeps the legacy chart range without rendering duplicate header controls", () => {
    const onRangeChange = vi.fn();
    renderWithProviders(
      <TriFitnessView
        range={90}
        onRangeChange={onRangeChange}
        {...triProps({ bike: 10 })}
        combinedLoad={null}
        loadFocus={emptyLoadFocus}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(screen.queryByRole("button", { name: "6개월" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1년" })).not.toBeInTheDocument();
    expect(onRangeChange).not.toHaveBeenCalled();
  });

  it("decays each discipline snapshot across unequal timeline dates", () => {
    const value: TriFitnessBreakdown = {
      bike: {
        canonical: true,
        weeklyTSS: 40,
        fitness: [{ date: "2026-09-01", ctl: 35, atl: 30, tsb: 5, dailyLoad: 40 }],
      },
      run: {
        canonical: false,
        weeklyTSS: 72,
        fitness: [{ date: "2026-09-02", ctl: 8, atl: 7, tsb: 1, dailyLoad: 72 }],
      },
      swim: { canonical: true, weeklyTSS: 0, fitness: [] },
    };

    expect(buildTriFitnessTimeline(value)).toEqual([
      expect.objectContaining({
        date: "2026-09-01",
        integrated: expect.objectContaining({ ctl: 35, atl: 30, dailyLoad: 40 }),
      }),
      expect.objectContaining({
        date: "2026-09-02",
        bike: expect.objectContaining({ ctl: 34.2, atl: 25.7, tsb: 8.5, dailyLoad: 0 }),
        run: expect.objectContaining({ ctl: 8, atl: 7, dailyLoad: 72 }),
        integrated: expect.objectContaining({ ctl: 42.2, atl: 32.7, tsb: 9.5, dailyLoad: 72 }),
      }),
    ]);
  });

  it("applies multi-day zero-load decay, re-bases on exact points, and keeps final cards aligned", () => {
    const value: TriFitnessBreakdown = {
      bike: {
        canonical: true,
        weeklyTSS: 40,
        fitness: [
          { date: "2026-09-01", ctl: 35, atl: 30, tsb: 5, dailyLoad: 40 },
          { date: "2026-09-06", ctl: 40, atl: 38, tsb: 2, dailyLoad: 90 },
        ],
      },
      run: {
        canonical: false,
        weeklyTSS: 72,
        fitness: [{ date: "2026-09-02", ctl: 8, atl: 7, tsb: 1, dailyLoad: 72 }],
      },
      swim: {
        canonical: true,
        weeklyTSS: 30,
        fitness: [{ date: "2026-09-05", ctl: 4, atl: 3, tsb: 1, dailyLoad: 30 }],
      },
    };
    const timeline = buildTriFitnessTimeline(value);

    expect(timeline[2]).toEqual(expect.objectContaining({
      date: "2026-09-05",
      bike: expect.objectContaining({ ctl: 31.8, atl: 16.2, dailyLoad: 0 }),
      run: expect.objectContaining({ ctl: 7.4, atl: 4.4, dailyLoad: 0 }),
      swim: expect.objectContaining({ ctl: 4, atl: 3, dailyLoad: 30 }),
      integrated: expect.objectContaining({ ctl: 43.2, atl: 23.6, tsb: 19.6, dailyLoad: 30 }),
    }));
    expect(timeline[3]).toEqual(expect.objectContaining({
      date: "2026-09-06",
      bike: expect.objectContaining({ ctl: 40, atl: 38, dailyLoad: 90 }),
      run: expect.objectContaining({ ctl: 7.3, atl: 3.8, dailyLoad: 0 }),
      swim: expect.objectContaining({ ctl: 3.9, atl: 2.6, dailyLoad: 0 }),
      integrated: expect.objectContaining({ ctl: 51.2, atl: 44.4, tsb: 6.8, dailyLoad: 90 }),
    }));

    renderWithProviders(
      <TriFitnessView
        range={90}
        onRangeChange={vi.fn()}
        breakdown={value}
        timeline={timeline}
        combinedLoad={{ ctl: 51.2, atl: 44.4, tsb: 6.8, contributions: [] }}
        loadFocus={emptyLoadFocus}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );
    expect(screen.getByTestId("desktop-integrated-detail")).toHaveTextContent("integrated 51.2/44.4/6.8");
    expect(screen.getByRole("link", { name: /사이클링/ })).toHaveTextContent("40.0");
    expect(screen.getByRole("link", { name: /러닝/ })).toHaveTextContent("7.3");
    expect(screen.queryByRole("group", { name: "수영 · 준비 중" })).not.toBeInTheDocument();
  });

  it("opens condition evidence and supports keyboard daily load with unknown distinct from zero", () => {
    const value = breakdown({ bike: 20 });
    value.run.fitness = [];
    value.swim.fitness = [];
    renderWithProviders(<TriFitnessView condition range={90} onRangeChange={vi.fn()} breakdown={value} timeline={buildTriFitnessTimeline(value)} combinedLoad={null} loadFocus={null} historySlot={<div>history</div>} />);
    expect(screen.getByRole("region", { name: "종목별 체력 추이" }).closest("details")).toBeNull();
    const chart = screen.getByRole("group", { name: "일별 운동 부하" });
    fireEvent.focus(chart);
    expect(within(chart).getByRole("status")).toHaveTextContent("2026-09-02");
    expect(within(chart).getByRole("status")).toHaveTextContent("bTSS");
    expect(within(chart).getByRole("status")).toHaveTextContent("미관측");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(within(chart).getByRole("status")).toBeVisible();
  });

  it("supports keyboard PMC selection and does not turn absent sport CTL into zero", () => {
    const value = breakdown({ bike: 20 });
    value.run.fitness = [];
    value.swim.fitness = [];
    renderWithProviders(<TriFitnessView condition range={90} onRangeChange={vi.fn()} breakdown={value} timeline={buildTriFitnessTimeline(value)} combinedLoad={null} loadFocus={null} />);
    const chart = screen.getByRole("group", { name: "퍼포먼스 관리 차트 · 3종목 스택" });
    expect(chart.querySelector("svg text")).toBeNull();
    expect(chart.querySelector(".tri-fitness__date-axis")).toHaveTextContent("9");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(within(chart).getByRole("status")).toHaveTextContent("2026-09-02");
    expect(within(chart).getByRole("status")).toHaveTextContent("20.0");
    fireEvent.pointerLeave(chart, { pointerType: "mouse" });
    fireEvent.blur(chart);
    expect(within(chart).getByRole("status")).toHaveTextContent("20.0");
    expect(within(chart).getByRole("status")).toHaveTextContent("미관측");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(within(chart).getByRole("status")).toBeVisible();
  });

});
