import { screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import TriFitnessView from "./TriFitnessView";

vi.mock("../../components/training/TodaysWorkoutCard", () => ({
  default: () => <div data-testid="full-ai-coach" />,
}));
vi.mock("../../components/mobile/IntegratedLoadCard", () => ({
  default: () => <div data-testid="desktop-integrated-detail" />,
}));

describe("TriFitnessView parity", () => {
  it("renders the full AI coach and authoritative integrated detail exactly once", () => {
    renderWithProviders(
      <TriFitnessView
        activities={[]}
        streamsMap={new Map()}
        range={90}
        profile={null}
        combinedLoad={{ ctl: 30, atl: 25, tsb: 5, contributions: [] }}
        loadFocus={{
          windowDays: 28,
          totalLoad: 0,
          buckets: { baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 0 },
          sourceLoad: { power: 0, heartRate: 0, unclassified: 0 },
          disciplineLoad: { bike: 0, run: 0, swim: 0, other: 0 },
          activityCount: 0,
          coveragePct: 0,
          confidence: "none",
          hasAnaerobicBikeDetail: false,
        }}
      />,
      { authenticated: true, route: "/fitness?sport=tri" },
    );

    expect(screen.getAllByTestId("full-ai-coach")).toHaveLength(1);
    expect(screen.getAllByTestId("desktop-integrated-detail")).toHaveLength(1);
  });

  it("uses integrated status as the only static snapshot and keeps the PMC trend", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/fitness/TriFitnessView.tsx"), "utf8");
    expect(source).not.toContain("KPI_ITEMS");
    expect(source).not.toContain("triView.kpi.thresholdReady");
    expect(source).not.toContain("triView.kpi.recoveryAdvised");
    expect(source).toContain("<TripleStackPMC");
    expect(source).toContain("IntegratedLoadCard는 현재 snapshot/기여도/포커스, 이 PMC는 시간 추이만 담당한다.");
  });
});
