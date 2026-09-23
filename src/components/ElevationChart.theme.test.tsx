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
