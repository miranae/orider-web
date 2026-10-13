import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useOriderTheme } from "../theme";
import ElevationChart from "./ElevationChart";

const { line } = vi.hoisted(() => ({ line: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Line: (props: unknown) => { line(props); return <div data-testid="elevation-line" />; } }));

function ThemeSwitchingElevationChart() {
  const { variant, setThemeId } = useOriderTheme();
  return <>
    <button
      type="button"
      data-altitude={variant.chartColors.altitude}
      data-grid={variant.chartColors.grid}
      data-grid-axis={variant.chartColors.gridAxis}
      data-grid-label={variant.chartColors.gridLabel}
      data-success={variant.colors.success}
      data-error={variant.colors.error}
      data-warning={variant.colors.warning}
      onClick={() => setThemeId("app-parity")}
    >테마 변경</button>
    <ElevationChart
      data={[{ distance: 0, elevation: 100 }, { distance: 1000, elevation: 110 }]}
      rangeMode
      range={[0, 1]}
      focusedOverlayKey="speed"
      overlays={[{ key: "speed", label: "속도", data: [20, 25], color: variant.chartColors.speed, yAxisID: "ySpeed", unit: "km/h" }]}
      markers={[{ distance: 500, elevation: 105, color: variant.chartColors.altitude, label: "지점" }]}
    />
  </>;
}

describe("ElevationChart theme colors", () => {
  it("accepts touch drag within the DS 48px handle strip and retains keyboard alternatives", () => {
    const change = vi.fn();
    const chart = { canvas: { getBoundingClientRect: () => ({ left: 0 }) }, scales: { x: { getPixelForValue: (value: number) => value * 100, getValueForPixel: (pixel: number) => pixel / 100 } } };
    line.mockImplementation(props => { if (props.ref) props.ref.current = chart; });
    vi.stubGlobal("PointerEvent", MouseEvent);
    try {
      renderWithProviders(<ElevationChart data={[{ distance: 0, elevation: 1 }, { distance: 1000, elevation: 2 }, { distance: 2000, elevation: 3 }]} rangeMode range={[0, 2]} onRangeChange={change} />);
      const target = screen.getByLabelText(/arrow|화살표/i);
      fireEvent.pointerDown(target, { clientX: 22, pointerId: 1 });
      fireEvent.pointerMove(target, { clientX: 100, pointerId: 1 });
      expect(change).toHaveBeenLastCalledWith([1, 2]);
      fireEvent.keyDown(target, { key: "ArrowLeft" });
      expect(change).toHaveBeenLastCalledWith([0, 1]);
    } finally { vi.unstubAllGlobals(); line.mockImplementation(() => undefined); }
  });
  it("installs both selection plugins before mode toggling and maps raw indices to linear distance coordinates", () => {
    const data = Array.from({ length: 181 }, (_, index) => ({ distance: index * 70, elevation: 10 }));
    const { rerender } = renderWithProviders(<ElevationChart data={data} />);
    const initial = line.mock.lastCall?.[0];
    expect(initial.plugins.map((plugin: { id: string }) => plugin.id)).toContain("rangeHighlight");
    expect(initial.options.plugins.rangeHighlight).toBeUndefined();
    rerender(<ElevationChart data={data} rangeMode range={[120, 150]} />);
    const chart = line.mock.lastCall?.[0];
    expect(chart.plugins.map((plugin: { id: string }) => plugin.id)).toEqual(initial.plugins.map((plugin: { id: string }) => plugin.id));
    expect(chart.options.plugins.rangeHighlight).toMatchObject({ start: 8.4, end: 10.5 });
  });
  it("shares elapsed coordinates and selected range across every sensor lane and moves handles by keyboard", () => {
    const change = vi.fn();
    renderWithProviders(<ElevationChart data={[{ distance: 0, elevation: 1 }, { distance: 100, elevation: 2 }, { distance: 100, elevation: 3 }, { distance: 200, elevation: 4 }]}
      elapsedAxisSec={[0, 60, 120, 180]} xAxis="elapsed" rangeMode range={[1, 3]} onRangeChange={change}
      separateOverlayLanes overlays={[{ key: "hr", label: "HR", data: [130, 140, 150, 140], color: "red", yAxisID: "yHr", unit: "bpm" }]} />);
    const charts = line.mock.calls.map(call => call[0]);
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      expect(chart.data.datasets[0].data.map((point: { x: number }) => point.x)).toEqual([0, 1, 2, 3]);
      expect(chart.plugins.some((plugin: { id: string }) => plugin.id === "rangeHighlight")).toBe(true);
      expect(chart.options.plugins.rangeHighlight).toMatchObject({ start: 1, end: 3 });
    }
    const keyboard = screen.getByLabelText(/arrow|화살표/i);
    fireEvent.keyDown(keyboard, { key: "ArrowLeft" });
    expect(change).toHaveBeenLastCalledWith([1, 2]);
    fireEvent.keyDown(keyboard, { key: "ArrowRight", shiftKey: true });
    expect(change).toHaveBeenLastCalledWith([2, 3]);
  });

  beforeEach(() => line.mockClear());

  it("passes resolved chart and selection colors to Canvas on both design themes", () => {
    window.localStorage.removeItem("orider.designTheme");
    renderWithProviders(<ThemeSwitchingElevationChart />);
    const button = screen.getByRole("button", { name: "테마 변경" });
    const checkColors = () => {
      const chart = line.mock.lastCall?.[0];
      expect(chart.data.datasets[0].borderColor).toBe(button.getAttribute("data-altitude"));
      expect(chart.data.datasets[0].backgroundColor).toContain(button.getAttribute("data-altitude"));
      expect(chart.options.scales.yElev.grid.color).toBe(button.getAttribute("data-grid"));
      expect(chart.options.scales.yElev.ticks.color).toBe(button.getAttribute("data-grid-label"));
      expect(chart.options.scales.x.ticks.color).toBe(button.getAttribute("data-grid-label"));
      expect(chart.options.scales.ySpeed.ticks.color).toBe(button.getAttribute("data-grid-label"));
      expect(chart.options.scales.ySpeed.title.color).toBe(button.getAttribute("data-grid-label"));
      expect(chart.options.plugins.crosshair.color).toBe(button.getAttribute("data-grid-axis"));
      expect(chart.options.plugins.tooltip.backgroundColor).not.toContain("var(");
      expect(chart.options.plugins.tooltip.bodyColor).not.toContain("var(");
      expect(chart.options.plugins.tooltip.borderWidth).toBe(1);
      expect(chart.options.plugins.rangeHighlight.startColor).toBe(button.getAttribute("data-success"));
      expect(chart.options.plugins.rangeHighlight.endColor).toBe(button.getAttribute("data-error"));
      expect(chart.options.plugins.rangeHighlight.reverseColor).toBe(button.getAttribute("data-warning"));
      expect(JSON.stringify(chart.data)).not.toContain("var(");
      expect(JSON.stringify(chart.options.scales)).not.toContain("var(");
    };
    checkColors();
    fireEvent.click(button);
    checkColors();
  });

  it("keeps matching gutters and clock-only pace ticks across elevation and sensor lanes", () => {
    renderWithProviders(<ElevationChart data={[{ distance: 0, elevation: 0 }, { distance: 1000, elevation: 0 }]}
      showElevation={false} separateOverlayLanes overlays={[
        { key: "speed", label: "페이스", data: [5, 6], color: "green", yAxisID: "ySpeed", unit: "min/km", formatValue: value => `${value}:00`, reverseAxis: true },
        { key: "heartRate", label: "심박", data: [140, 150], color: "red", yAxisID: "yHeartRate", unit: "bpm" },
      ]} />);
    const charts = line.mock.calls.map(call => call[0]);
    expect(charts[0].options.scales.yElev.display).toBe(false);
    expect(charts[0].data.datasets[0].data).toEqual([]);
    const widths = charts.map(chart => {
      const scale = { width: 0 };
      (chart.options.scales.yElevSpacer ?? chart.options.scales.yMetric).afterFit(scale);
      return scale.width;
    });
    expect(widths).toEqual([62, 62, 62]);
    for (const chart of charts) {
      expect(chart.options.layout.padding.right).toBeGreaterThanOrEqual(8);
      const rightScale = { width: 0 };
      (chart.options.scales.yMetric ?? chart.options.scales.yElevSpacer).afterFit(rightScale);
      expect(rightScale.width).toBeGreaterThanOrEqual(62);
    }
    expect(charts[1].options.scales.yMetric.ticks.callback(10)).toBe("10:00");
    expect(charts[1].options.scales.yMetric.reverse).toBe(true);
  });

  it("keeps reverse-range start/end handles and direction arrow semantically distinct", () => {
    renderWithProviders(<ElevationChart data={[{ distance: 0, elevation: 100 }, { distance: 1000, elevation: 110 }]} rangeMode range={[1, 0]} />);
    const chart = line.mock.lastCall?.[0];
    const plugin = chart.plugins.find((item: { id: string }) => item.id === "rangeHighlight");
    const strokes: string[] = [];
    const fills: string[] = [];
    const ctx = {
      strokeStyle: "", fillStyle: "", globalAlpha: 1, lineWidth: 1,
      save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), arc: vi.fn(), fillRect: vi.fn(),
      stroke() { strokes.push(this.strokeStyle); },
      fill() { fills.push(this.fillStyle); },
    };
    plugin.afterDatasetsDraw({
      options: chart.options,
      chartArea: { left: 0, right: 100, top: 0, bottom: 80 },
      scales: { x: { getPixelForValue: (value: number) => value * 100 } },
      ctx,
    });

    const colors = chart.options.plugins.rangeHighlight;
    expect(strokes).toEqual([colors.startColor, colors.endColor]);
    expect(fills).toEqual([colors.reverseColor, colors.startColor, colors.handleCenterColor, colors.endColor, colors.handleCenterColor]);
    expect(ctx.globalAlpha).toBe(1);
  });
});
