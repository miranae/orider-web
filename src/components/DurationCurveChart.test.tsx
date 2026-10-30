import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useTheme } from "../contexts/ThemeContext";
import { useOriderTheme } from "../theme";
import { durationCurveArea } from "../theme/charts/durationCurvePresentation";
import PowerCurveChart from "./PowerCurveChart";
import DurationCurveChart, { niceStep, visibleLogLabels } from "./DurationCurveChart";
import SpeedCurveChart from "./SpeedCurveChart";

const { line } = vi.hoisted(() => ({ line: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Line: (props: unknown) => { line(props); return <div data-testid="curve-line" />; } }));

function ThemeSwitchingCurves() {
  const { variant, setThemeId } = useOriderTheme();
  const { resolvedTheme, setTheme } = useTheme();
  return <>
    <button type="button" data-power={variant.chartColors.power} data-speed={variant.chartColors.speed} data-reference={variant.colors.textTertiary} data-grid={variant.chartColors.grid} onClick={() => setThemeId("app-parity")}>테마 변경</button>
    <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>명암 변경</button>
    <PowerCurveChart points={[{ durationSeconds: 60, maxPower: 210 }]} ftp={180} />
    <SpeedCurveChart points={[{ durationSeconds: 60, speedKmh: 32 }]} />
  </>;
}

describe("DurationCurveChart theme colors", () => {
  it("resolves power, speed and FTP reference colors for Chart.js across design themes", () => {
    renderWithProviders(<ThemeSwitchingCurves />);
    const button = screen.getByRole("button", { name: "테마 변경" });
    const checkColors = () => {
      const [power, speed] = line.mock.calls.slice(-2).map(([props]) => props);
      expect(power.data.datasets[0].borderColor).toBe(button.getAttribute("data-power"));
      expect(power.data.datasets[1].borderColor).toBe(button.getAttribute("data-reference"));
      expect(speed.data.datasets[0].borderColor).toBe(button.getAttribute("data-speed"));
      expect(power.options.scales.y.grid.color).toBe(button.getAttribute("data-grid"));
      expect(power.options.plugins.tooltip.backgroundColor).not.toContain("var(");
    };
    checkColors();
    fireEvent.click(button);
    checkColors();
    fireEvent.click(screen.getByRole("button", { name: "명암 변경" }));
    checkColors();
  });
});

describe("DurationCurveChart comparison", () => {
  it("overlays a dashed comparison series with a legend, tooltip footer and an accessible canvas", () => {
    line.mockClear();
    renderWithProviders(<DurationCurveChart points={[{ durationSeconds: 1, value: 500 }, { durationSeconds: 60, value: 300 }]}
      unit="W" color="var(--chart-power)" datasetLabel="이번 활동" emptyTitle="-" emptyDescription="-" showLegend
      comparison={{ label: "역대 최고", values: [600, null] }} tooltipFooter={(index) => [`footer ${index}`]} ariaLabel="파워 커브" />);
    const props = line.mock.lastCall![0];
    expect(props.data.datasets[1]).toMatchObject({ label: "역대 최고", data: [600, null], borderDash: [5, 4], spanGaps: true });
    expect(props.options.plugins.tooltip.callbacks.footer([{ dataIndex: 1 }])).toEqual(["footer 1"]);
    expect(props["aria-label"]).toBe("파워 커브");
    expect(props.tabIndex).toBe(0);
    expect(screen.getByText("역대 최고")).toBeInTheDocument();
  });
});

describe("DurationCurveChart summary axis", () => {
  it("connects measured windows with straight lines and labels every window, thinning to even points plus the end when narrow", () => {
    line.mockClear();
    const points = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800].map((durationSeconds, index) => ({ durationSeconds, value: 900 - index * 80 }));
    renderWithProviders(<DurationCurveChart points={points} unit="W" color="var(--chart-power)" datasetLabel="이번 활동"
      emptyTitle="-" emptyDescription="-" xTicks="all" unitAxisTitle reference={{ value: 182, label: "FTP 182 W" }} referenceSolid roleDescription="차트" />);
    const props = line.mock.lastCall![0];
    expect(props.data.datasets[0].tension).toBe(0);
    expect(props.data.datasets[1].borderDash).toEqual([]);
    expect(props.options.scales.y.title).toMatchObject({ display: true, text: "W" });
    expect(props.options.scales.y.ticks.maxTicksLimit).toBe(6);
    expect(props.options.scales.y.ticks.callback(500)).toBe("500");
    const ticks = points.map(() => ({}));
    const label = (width: number) => (index: number) => props.options.scales.x.ticks.callback.call({ chart: { width }, getLabelForValue: (value: number) => `L${value}` }, index, index, ticks);
    expect(points.map((_, index) => label(800)(index)).filter(Boolean)).toHaveLength(10);
    expect(points.map((_, index) => label(340)(index))).toEqual(["L0", "", "L2", "", "L4", "", "L6", "", "", "L9"]);
    expect(props.role).toBe("group");
    expect(props["aria-roledescription"]).toBe("차트");
  });
});

describe("DurationCurveChart log time axis", () => {
  it("plots (seconds, value) on a logarithmic axis with ticks only at measured windows and 4–5 y steps", () => {
    line.mockClear();
    const points = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800].map((durationSeconds, index) => ({ durationSeconds, value: 845 - index * 70 }));
    renderWithProviders(<DurationCurveChart points={points} unit="W" color="var(--chart-power)" datasetLabel="이번 활동"
      emptyTitle="-" emptyDescription="-" xScale="log" unitAxisTitle />);
    const props = line.mock.lastCall![0];
    expect(props.data.datasets[0].data[1]).toEqual({ x: 5, y: 775 });
    expect(props.options.scales.x).toMatchObject({ type: "logarithmic", min: 1, max: 1800 });
    const scale = { ticks: [] as Array<{ value: number }> };
    props.options.scales.x.afterBuildTicks(scale);
    expect(scale.ticks.map((tick) => tick.value)).toEqual(points.map((p) => p.durationSeconds));
    expect(props.options.scales.y.ticks.stepSize).toBe(250);
    expect(props.options.scales.y.max).toBe(1000);
  });

  it("keeps the end label and drops labels that would collide", () => {
    const durations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800];
    expect([...visibleLogLabels(durations, 600)]).toContain(9);
    expect(visibleLogLabels(durations, 600).has(8)).toBe(false);
    expect([...visibleLogLabels(durations, 300)].length).toBeLessThan(durations.length);
    expect(niceStep(211)).toBe(250);
    expect(niceStep(160)).toBe(200);
    expect(niceStep(45)).toBe(50);
  });
});


it("keeps optional unresolved colors from aborting chart creation and fills valid theme colors", () => {
  const addColorStop = vi.fn();
  const gradient = { addColorStop };
  const context = { chart: { ctx: { createLinearGradient: vi.fn(() => gradient) }, chartArea: { top: 10, bottom: 100 } } };
  expect(durationCurveArea(context as any, "var(--missing-color)")).toBe("transparent");
  expect(durationCurveArea(context as any, "#9988cc")).toBe(gradient);
  expect(addColorStop).toHaveBeenCalledTimes(2);
});
