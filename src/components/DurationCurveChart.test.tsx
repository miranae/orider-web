import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useTheme } from "../contexts/ThemeContext";
import { useOriderTheme } from "../theme";
import PowerCurveChart from "./PowerCurveChart";
import DurationCurveChart from "./DurationCurveChart";
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
