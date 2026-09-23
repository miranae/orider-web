import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useTheme } from "../contexts/ThemeContext";
import { useOriderTheme } from "../theme";
import ComparisonChart from "./ComparisonChart";

const { bar } = vi.hoisted(() => ({ bar: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Bar: (props: unknown) => { bar(props); return <div data-testid="comparison-bar" />; } }));

function ThemeSwitchingComparison() {
  const { variant, setThemeId } = useOriderTheme();
  const { resolvedTheme, setTheme } = useTheme();
  return <>
    <button type="button" data-power={variant.chartColors.power} data-grid={variant.chartColors.grid} data-label={variant.chartColors.gridLabel} onClick={() => setThemeId("app-parity")}>테마 변경</button>
    <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>명암 변경</button>
    <ComparisonChart labels={["라이더"]} datasets={[{ label: "파워", data: [210], color: "var(--chart-power)" }]} unit="W" />
  </>;
}

describe("ComparisonChart theme colors", () => {
  it("resolves series, axis, grid and tooltip colors after theme switches", () => {
    renderWithProviders(<ThemeSwitchingComparison />);
    const button = screen.getByRole("button", { name: "테마 변경" });
    const checkColors = () => {
      const props = bar.mock.lastCall![0];
      expect(props.data.datasets[0].backgroundColor).toBe(button.getAttribute("data-power"));
      expect(props.options.scales.y.grid.color).toBe(button.getAttribute("data-grid"));
      expect(props.options.scales.x.ticks.color).toBe(button.getAttribute("data-label"));
      expect(props.options.plugins.tooltip.backgroundColor).not.toContain("var(");
    };
    checkColors();
    fireEvent.click(button);
    checkColors();
    fireEvent.click(screen.getByRole("button", { name: "명암 변경" }));
    checkColors();
  });
});
