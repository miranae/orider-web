import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StravaMetricComparisonContent } from "./StravaMetricComparison";
afterEach(cleanup);
it("names provider evidence separately from analysis, preserving source calories and unavailable training load", () => {
  render(<StravaMetricComparisonContent units="metric" record={{ version: 1, max_speed: 60.4 / 3.6,
    total_elevation_gain: 645, calories: 3086, weighted_average_watts: 144 }} metrics={{ maxSpeedKph: 54.2, elevationGainM: 638, np: 157.49, tss: 307.7, caloriesKcal: 2279 }} />);
  expect(screen.getByRole("columnheader", { name: "Strava" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Orider 분석" })).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /최고 속도/ })).getByText("60.4km/h")).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /칼로리/ })).getByText("3086 kcal")).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /칼로리/ })).getByText("2279 kcal")).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /^TSS/ })).getByText("—")).toBeInTheDocument();
});

it("normalizes cadence units independently for Strava source and Orider analysis", () => {
  render(<StravaMetricComparisonContent units="metric" sport="run" record={{ version: 1, average_cadence: 90, max_cadence: 100 }}
    metrics={{ avgCadence: 182, maxCadence: 205, cadenceUnit: "spm" }} />);
  const row = screen.getByRole("row", { name: /평균 케이던스/ });
  expect(within(row).getByText("180 spm")).toBeInTheDocument();
  expect(within(row).getByText("182 spm")).toBeInTheDocument();
});
