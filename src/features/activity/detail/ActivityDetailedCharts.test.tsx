import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityAnalysisModel } from "../../../hooks/useActivityAnalysisModel";
import type { RidePeakEffort } from "@shared/types/activity-metrics";
import ActivityDetailedCharts from "./ActivityDetailedCharts";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("./ActivityPerformanceCharts", () => ({ default: () => <div data-testid="performance-chart" /> }));
const request = vi.fn();
const peak = { durationSec: 60, startOffsetSec: 0, fromKm: 0, toKm: 0.2 } as RidePeakEffort;
const streams = { distance: [0, 100, 200], time: [0, 10, 20], altitude: [0, 1, 2] };
const model = { activity: { id: "a" }, sport: "ride", streams, effectiveStreams: streams,
  serverMetrics: { metrics: null }, requestStreams: request, loadingStreams: false } as unknown as ActivityAnalysisModel;
describe("ActivityDetailedCharts peak selection", () => {
  it("clears forced-open peak selection on hide and permits an ordinary reopen without stream reads", () => {
    const clear = vi.fn();
    function Host() {
      const [selection, setSelection] = useState<RidePeakEffort | null>(peak);
      return <ActivityDetailedCharts model={model} highlightedPeak={selection} onClearHighlightedPeak={() => {
        clear(); setSelection(null);
      }} />;
    }
    render(<Host />);
    expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "page.hideDetailedCharts" }));
    expect(clear).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("performance-chart")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "page.detailedCharts" }));
    expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
