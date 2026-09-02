import { fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
  it("renders the authoritative integrated detail exactly once without a workout card", () => {
    renderWithProviders(
      <TriFitnessView
        range={90}
        onRangeChange={vi.fn()}
        {...triProps()}
        combinedLoad={{ ctl: 30, atl: 25, tsb: 5, contributions: [] }}
        loadFocus={emptyLoadFocus}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(screen.getAllByTestId("desktop-integrated-detail")).toHaveLength(1);
    const source = readFileSync(join(process.cwd(), "src/pages/fitness/TriFitnessView.tsx"), "utf8");
    expect(source).not.toContain("TodaysWorkoutCard");
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
    expect(screen.getByRole("link", { name: /수영/ })).toHaveTextContent("3.4");
  });

  it("sends every tri range selection to the parent model", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "6개월" }));
    fireEvent.click(screen.getByRole("button", { name: "1년" }));
    expect(onRangeChange).toHaveBeenNthCalledWith(1, 180);
    expect(onRangeChange).toHaveBeenNthCalledWith(2, 365);
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
    expect(screen.getByRole("link", { name: /수영/ })).toHaveTextContent("3.9");
  });

  it("uses integrated status as the only static snapshot and keeps the PMC trend", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/fitness/TriFitnessView.tsx"), "utf8");
    expect(source).not.toContain("KPI_ITEMS");
    expect(source).not.toContain("triView.kpi.thresholdReady");
    expect(source).not.toContain("triView.kpi.recoveryAdvised");
    expect(source).toContain("<TripleStackPMC");
    expect(source).toContain("IntegratedLoadCard는 현재 snapshot/기여도/포커스, 이 PMC는 시간 추이만 담당한다.");
  });

  it("uses tokenized discipline fills and semantic PMC line patterns", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/fitness/TriFitnessView.tsx"), "utf8");
    const chart = source.slice(source.indexOf("function TripleStackPMC"), source.indexOf("function ContribDonut"));

    expect(source).not.toMatch(/oklch\(\d/);
    expect(chart).toContain("DISCIPLINE_CHART_COLORS.bike");
    expect(chart).toContain("DISCIPLINE_CHART_COLORS.run");
    expect(chart).toContain("DISCIPLINE_CHART_COLORS.swim");
    expect(chart).toContain("PMC_LINE_PALETTE.atl.dasharray");
    expect(chart).toContain("PMC_LINE_PALETTE.tsb.dasharray");
    expect(chart).toContain('vectorEffect="non-scaling-stroke"');
    expect(chart).toContain('role="img"');
  });
});
