import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ACTIVITY_METRICS_VERSION, type SplitRow } from "@shared/types/activity-metrics";
import ko from "../../../i18n/resources/ko/activity.json";
import RunSplitComparisonPanel from "./RunSplitComparisonPanel";
import { compareRunSplits } from "./runSplitComparison";
import type { MetricsLike } from "./metricsPresentation";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key.split(".").reduce((value, part) => (value as Record<string, unknown>)[part], ko as unknown) }) }));
const split = (km: number, paceSec = 300, avgHr: number | null = 140): SplitRow => ({ km, paceSec, avgHr, gapSec: 290, elevGain: 0 });
const metrics = (distanceKm = 2.5, splits = [split(1), split(2), split(3)]): MetricsLike => ({ distanceKm, splits, version: ACTIVITY_METRICS_VERSION, inputCoverage: "complete" });
describe("run split comparison", () => {
  it("compares only common complete km, not the last partial or different length", () => {
    expect(compareRunSplits(metrics(), metrics(1.8)).map(row => row.km)).toEqual([1]);
    expect(compareRunSplits(metrics(0.8), metrics())).toEqual([]);
    expect(compareRunSplits(metrics(2.5, [split(1), split(1.5)]), metrics()).map(row => row.km)).toEqual([1]);
  });
  it("excludes every duplicate, invalid pace and uncertain distance without filling zeros", () => {
    expect(compareRunSplits(metrics(4, [split(1), split(1), split(2, NaN), split(3, 0), split(4)]), metrics(4, [split(1), split(2), split(3), split(4)]))).toHaveLength(1);
    for (const value of [null, { ...metrics(), distanceKm: undefined }, { ...metrics(), distanceSource: null }, { ...metrics(), inputPending: true }, { ...metrics(), inputCoverage: "partial_terminal" }, { ...metrics(), version: ACTIVITY_METRICS_VERSION - 1 }, { ...metrics(), version: undefined }, { ...metrics(), inputCoverage: undefined }, { ...metrics(), inputCoverage: "pending" }] as Array<MetricsLike | null>) expect(compareRunSplits(value, metrics())).toEqual([]);
  });
  it("keeps missing, zero and invalid heart rate unavailable and never exposes GAP", () => {
    const rows = compareRunSplits(metrics(2, [split(1, 300, null), split(2, 320, NaN)]), metrics(2, [split(1, 310, 0), split(2, 330, 150)]));
    expect(rows[0]?.current.heartRate).toBeNull(); expect(rows[0]?.previous.heartRate).toBeNull();
    expect(rows[1]?.previous.heartRate).toBe(150); expect(rows[0]?.current).not.toHaveProperty("gap");
  });
  it("renders paired values with accessible headers, missing marker and imperial conversion", () => {
    render(<RunSplitComparisonPanel current={metrics(1, [split(1, 300, null)])} previous={metrics(1, [split(1, 360, 155)])} units="imperial" />);
    expect(screen.getByRole("region", { name: ko.splitCompare.title })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: ko.splitCompare.current })).toBeInTheDocument();
    expect(screen.getByText("8:03/mi")).toBeInTheDocument(); expect(screen.getByText("9:39/mi")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); expect(screen.getByText("155")).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /GAP/ })).not.toBeInTheDocument();
  });
  it("changes paired values immediately on new selected metrics and does not retain unavailable old rows", () => {
    const r = render(<RunSplitComparisonPanel current={metrics()} previous={metrics(1, [split(1, 330)])} units="metric" />);
    expect(screen.getByText("5:30/km")).toBeInTheDocument();
    r.rerender(<RunSplitComparisonPanel current={metrics()} previous={metrics(1, [split(1, 400)])} units="metric" />);
    expect(screen.queryByText("5:30/km")).not.toBeInTheDocument(); expect(screen.getByText("6:40/km")).toBeInTheDocument();
    r.rerender(<RunSplitComparisonPanel current={metrics()} previous={metrics(0.4)} units="metric" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); expect(screen.getByText(ko.splitCompare.unavailable)).toBeInTheDocument();
  });
});
