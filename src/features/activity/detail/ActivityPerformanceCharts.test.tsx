import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ActivityPerformanceCharts from "./ActivityPerformanceCharts";
import { getPerformanceOverlays } from "./activityPerformancePresentation";
import { buildChartOverlays, buildSampledData, buildSummaryStats } from "./activityDetailDerived";
import { markRawPartStreams } from "../../../services/activityStreamSource";
import { rawPartChartStreams } from "../../../__tests__/fixtures/rawPartChartStreams";
import type { AnalysisChartPresentation } from "../../../components/ElevationChartAnalysis";
import type { OverlayDataset } from "../../../components/ElevationChart";
import type { SampledPoint } from "./activityDetailUtils";
const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("../../../components/ElevationChart", () => ({ default: (props: Record<string, unknown>) => {
  captured.props = props; return <div data-testid="chart" />;
} }));
vi.mock("../../../components/activity/ActivityZoneTimeline", () => ({ ActivityZoneTimeline: () => null }));
afterEach(cleanup);
const point: SampledPoint = { speed: 12, heartRate: null, power: 200, cadence: 0, distance: 100, altitude: 0, latlng: null };
function Chart({ sport = "ride", powerSource = "watts", hasElevation = false }: {
  sport?: string; powerSource?: "watts" | "watts_calc"; hasElevation?: boolean;
}) {
  const available = getPerformanceOverlays([point], sport, "metric", null, "cadence");
  const selected = new Set(["speed", "power"]);
  return <ActivityPerformanceCharts elevData={[{ distance: 100, elevation: 0 }]}
    availableOverlays={available} activeOverlays={selected} focusedOverlayKey="speed" toggleOverlay={vi.fn()}
    chartOverlays={buildChartOverlays(available, selected, [point], key => key)} hoverPoint={point}
    summaryStats={null} sport={sport} recordedRunCadenceUnit={null} metrics={null}
    powerSource={powerSource} hasElevation={hasElevation} />;
}
it("labels measured and virtual power distinctly, and omits absent HR and invented elevation", () => {
  const view = render(<Chart />);
  expect(screen.getByRole("button", { name: "실측 파워" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "심박" })).not.toBeInTheDocument();
  expect(captured.props.showElevation).toBe(false);
  expect(screen.queryByText(/고도.*0/)).not.toBeInTheDocument();
  view.rerender(<Chart powerSource="watts_calc" />);
  expect(screen.getByRole("button", { name: "가상 파워" })).toBeInTheDocument();
});
it("shows pace clock values while cycling retains km/h", () => {
  const view = render(<Chart sport="run" />);
  expect(screen.getByText(/페이스 5:00 min\/km/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^페이스/ })).toHaveTextContent("min/km");
  expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
  view.rerender(<Chart />);
  expect(screen.getByText(/속도 12.0 km\/h/)).toBeInTheDocument();
});

it("passes observed elevation times and measured sensor gaps through the raw-part analysis chart", () => {
  const streams = markRawPartStreams(rawPartChartStreams(), "a".repeat(64));
  const points = buildSampledData(streams);
  const available = getPerformanceOverlays(points, "ride", "metric", null, "cadence");
  const selected = new Set(available.map(cfg => cfg.key));
  const sourceIndices = points.map(point => point.sourceIndex!);
  const elapsed = sourceIndices.map(index => streams.time![index]!);
  render(<ActivityPerformanceCharts analysisStyle rawStreams={streams} sourceIndices={sourceIndices}
    elapsedAxisSec={elapsed} elevData={points.map(point => ({ distance: point.distance, elevation: point.altitude }))}
    availableOverlays={available} activeOverlays={selected} focusedOverlayKey={null} toggleOverlay={vi.fn()}
    chartOverlays={buildChartOverlays(available, selected, points, key => key)} hoverPoint={null}
    summaryStats={buildSummaryStats(streams, null)} sport="ride" recordedRunCadenceUnit={null} metrics={null} />);
  const presentation = captured.props.analysisPresentation as AnalysisChartPresentation;
  expect(presentation.elevationObservationTimeSec).toEqual(elapsed);
  expect(presentation.lanes.hr?.maximum).toBe("139");
  expect(presentation.lanes.cadence?.maximum).toBe("80");
  const overlays = captured.props.overlays as OverlayDataset[];
  expect(overlays.map(overlay => overlay.key)).toEqual(["speed", "hr", "cadence"]);
  const cadence = overlays.find(overlay => overlay.key === "cadence")!;
  expect(cadence.data[sourceIndices.indexOf(17)]).toBeNull();
  expect(cadence.data[sourceIndices.indexOf(26)]).toBe(0);
});
