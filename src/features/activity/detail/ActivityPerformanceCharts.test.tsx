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
function Chart({ sport = "ride", powerSource = "watts", hasElevation = false, power = 200 }: {
  sport?: string; powerSource?: "watts" | "watts_calc"; hasElevation?: boolean; power?: number | null;
}) {
  const available = getPerformanceOverlays([point], sport, "metric", null, "cadence");
  const selected = new Set(["speed", "power"]);
  return <ActivityPerformanceCharts elevData={[{ distance: 100, elevation: 0 }]}
    availableOverlays={available} activeOverlays={selected} focusedOverlayKey="speed" toggleOverlay={vi.fn()}
    chartOverlays={buildChartOverlays(available, selected, [point], key => key)} hoverPoint={{ ...point, power }}
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

it("shows actual zero watts but omits missing power in the detail hover", () => {
  const view = render(<Chart power={0} />);
  expect(screen.getByText("실측 파워 0 W")).toBeInTheDocument();
  view.rerender(<Chart power={null} />);
  expect(screen.queryByText("실측 파워 0 W")).not.toBeInTheDocument();
});

it("keeps imported GPS subset elevation at its exact sensor timestamps", () => {
  const streams = { distance: [0,20], altitude: [100,110], time: [0,.5,1,1.5,2],
    importedSensorObservationsV1: { version: 1, source: "parsed_import_points", state: "available", timeUnit: "relative_milliseconds",
      originEpochMs: 1792970000000, timeMs: [0,500,1000,1500,2000], routeTimeMs: [500,1500],
      watts: [200,null,0,200,200], heartrate: [150,null,150,150,150], cadence: [80,null,0,80,80] } };
  const points = buildSampledData(streams);
  const available = getPerformanceOverlays(points, "ride", "metric", null, "cadence");
  const selected = new Set(available.map(cfg => cfg.key));
  render(<ActivityPerformanceCharts analysisStyle rawStreams={streams} sourceIndices={points.map(point => point.sourceIndex!)}
    elapsedAxisSec={streams.time} xAxis="elapsed" elevData={points.map(point => ({ distance: point.distance, elevation: point.altitude }))}
    availableOverlays={available} activeOverlays={selected} focusedOverlayKey={null} toggleOverlay={vi.fn()}
    chartOverlays={buildChartOverlays(available, selected, points, key => key)} hoverPoint={null}
    summaryStats={null} sport="ride" recordedRunCadenceUnit={null} metrics={null} powerSource="importedSensorObservationsV1" />);
  expect((captured.props.data as { elevation: number }[]).map(point => point.elevation)).toEqual([NaN,100,NaN,110,NaN]);
  expect((captured.props.overlays as OverlayDataset[]).find(overlay => overlay.key === "power")?.data).toEqual([200,null,0,200,200]);
  expect(captured.props.xAxis).toBe("elapsed");
});

it("presents exact elapsed selection statistics instead of enclosing downsample handles", () => {
  const time = Array.from({ length: 1801 }, (_, i) => i);
  const streams = { time, distance: time.map(t => t * 10), altitude: time.map(() => 100),
    watts: time.map(t => t >= 301 && t < 1501 ? 200 : 50), cadence: time.map(() => 80) };
  const points = buildSampledData(streams);
  const available = getPerformanceOverlays(points, "ride", "metric", null, "cadence");
  const selected = new Set(available.map(cfg => cfg.key));
  render(<ActivityPerformanceCharts analysisStyle rawStreams={streams} rawElapsedAxis={time}
    sensorSelectionContext={{ activityStartTime: 1700000000000, explicitDurationSec: 1800 }}
    sourceIndices={points.map(point => point.sourceIndex!)} visualRange={[0, points.length - 1]}
    selectedElapsedRange={{ startOffsetSec: 301, endOffsetSec: 1501 }}
    visualSummaryStats={{ minElev: 0, maxElev: 0, overlays: { power: { avg: 50, max: 50 } } }}
    elevData={points.map(point => ({ distance: point.distance, elevation: point.altitude }))}
    availableOverlays={available} activeOverlays={selected} focusedOverlayKey={null} toggleOverlay={vi.fn()}
    chartOverlays={buildChartOverlays(available, selected, points, key => key)} hoverPoint={null}
    summaryStats={null} sport="ride" recordedRunCadenceUnit={null} metrics={null} />);
  const presentation = captured.props.analysisPresentation as AnalysisChartPresentation;
  render(<>{presentation.selectionCaption}</>);
  expect(screen.getByText(/20:00/)).toHaveTextContent("12.0");
  expect(presentation.lanes.power?.average).toBe("200");
});

it("labels calculated elevation separately from Strava sensor summary headings", () => {
  const points = [point];
  const available = getPerformanceOverlays(points, "ride", "metric", null, "cadence");
  const selected = new Set(available.map(cfg => cfg.key));
  render(<ActivityPerformanceCharts analysisStyle sourceLabel="Strava" elevData={[{ distance: 100, elevation: 0 }]}
    availableOverlays={available} activeOverlays={selected} focusedOverlayKey={null} toggleOverlay={vi.fn()}
    chartOverlays={buildChartOverlays(available, selected, points, key => key)} hoverPoint={point}
    summaryStats={{ minElev: 0, maxElev: 100, overlays: { speed: { avg: 25.6, max: 60.4 } } }} sport="ride" recordedRunCadenceUnit={null} metrics={null} />);
  const presentation = captured.props.analysisPresentation as AnalysisChartPresentation;
  expect(presentation.maximumLabel).toMatch(/Strava/);
  expect(presentation.elevation.maximumLabel).toMatch(/Orider/);
});
