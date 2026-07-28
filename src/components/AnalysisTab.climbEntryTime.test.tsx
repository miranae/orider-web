import { render, screen, within } from "@testing-library/react";
import type { ActivitySummary } from "@shared/types";
import AnalysisTab from "./AnalysisTab";
import { formatClimbEntryTime } from "../utils/climbMetrics";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, profile: { ftp: 250, weightKg: 70 } }),
}));

vi.mock("../contexts/LocaleContext", () => ({
  useLocale: () => ({ units: "metric", locale: "ko" }),
}));

vi.mock("../hooks/useFitnessTimeseries", () => ({
  useFitnessTimeseries: () => ({ timeseries: null }),
}));

vi.mock("../hooks/useActivityMetrics", () => ({
  useActivityMetrics: () => ({
    status: "ready",
    metrics: {
      workoutType: "endurance",
      workoutTypeConfidence: 0.9,
      computedAt: 1_700_000_000_000,
      version: 1,
      climbs: [{
        startKm: 2,
        lengthKm: 1,
        elevationGainM: 70,
        avgGrade: 7,
        category: "Cat4",
        durationSec: 300,
        vam: 840,
        avgPower: 250,
        wPerKg: 3.6,
      }],
    },
  }),
}));

vi.mock("./ZoneDistributionChart", () => ({ default: () => null }));
vi.mock("./PowerCurveChart", () => ({ default: () => null }));
vi.mock("./MetabolismCard", () => ({ default: () => null }));

describe("AnalysisTab climb entry time", () => {
  it("renders entry time next to duration without replacing existing climb columns", () => {
    const startTime = Date.parse("2026-07-12T22:38:32+09:00");
    const firstRecordMs = Date.parse("2026-07-12T22:38:33+09:00");
    render(<AnalysisTab
      startTime={startTime}
      streams={{
        userId: "rider",
        watts: [180, 180, 180, 180],
        altitude: [0, 10, 20, 30],
        distance: [0, 1_000, 2_000, 3_000],
        time: [0, 60, 120, 180],
        device_temperature: { startTimeMs: firstRecordMs, routeOffsetSec: 41 },
      }}
      summary={{ elapsedTimeMillis: 222_000, ridingTimeMillis: 222_000 } as ActivitySummary}
      sport="ride"
    />);

    const table = screen.getByRole("table", { name: "클라임 (1)" });
    const headers = within(table).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(expect.arrayContaining(["시작", "소요시간", "진입시간"]));
    expect(headers.indexOf("진입시간")).toBe(headers.indexOf("소요시간") + 1);

    const row = within(table).getAllByRole("row")[1]!;
    expect(within(row).getByRole("cell", { name: "2.0 km" })).toBeInTheDocument();
    expect(within(row).getByRole("cell", { name: "5:00" })).toBeInTheDocument();
    const expectedEntryTime = formatClimbEntryTime(startTime, 162, "ko")!;
    expect(within(row).getByRole("cell", { name: expectedEntryTime })).toBeInTheDocument();
  });

  it("renders unavailable entry time when activity startTime is invalid", () => {
    render(<AnalysisTab
      startTime={null}
      streams={{
        userId: "rider",
        watts: [180, 180, 180, 180],
        altitude: [0, 10, 20, 30],
        distance: [0, 1_000, 2_000, 3_000],
        time: [0, 60, 120, 180],
      }}
      sport="ride"
    />);

    const table = screen.getByRole("table", { name: "클라임 (1)" });
    const row = within(table).getAllByRole("row")[1]!;
    expect(within(row).getByRole("cell", { name: "—" })).toBeInTheDocument();
  });

  it("preserves server climb geometry while removing stale server power fields", () => {
    render(<AnalysisTab
      hasStreamPowerCandidate
      streams={{
        userId: "rider",
        watts: [180, 180, 180, 180],
        altitude: [0, 10, 20, 30],
        distance: [0, 1_000, 2_000, 3_000],
        time: [0, 60, 120, 180],
      }}
      sport="ride"
    />);

    const table = screen.getByRole("table", { name: "클라임 (1)" });
    const cells = within(table).getAllByRole("row")[1]!.querySelectorAll("td");
    expect(cells[1]).toHaveTextContent("2.0 km");
    expect(cells[2]).toHaveTextContent("1.00 km");
    expect(cells[3]).toHaveTextContent("70 m");
    expect(cells[4]).toHaveTextContent("7.0 %");
    expect(cells[5]).toHaveTextContent("5:00");
    expect(cells[7]).toHaveTextContent("840");
    expect(cells[8]).toHaveTextContent("—");
    expect(cells[9]).toHaveTextContent("—");
  });

  it.each(["accepted", "rejected"])(
    "keeps server workout classification for a cadence-only %s candidate",
    () => {
      render(<AnalysisTab
        hasStreamCadenceCandidate
        streams={{
          userId: "rider",
          cadence: [80, 82, 84],
          watts: [180, 185, 190],
          time: [0, 1, 2],
        }}
        sport="ride"
      />);

      expect(screen.getByText("지구력")).toBeInTheDocument();
    },
  );
});
