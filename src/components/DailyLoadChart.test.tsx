import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useTheme } from "../contexts/ThemeContext";
import { useOriderTheme } from "../theme";
import type { DailyLoad } from "../utils/fitnessMetrics";
import DailyLoadChart from "./DailyLoadChart";

const { bar } = vi.hoisted(() => ({ bar: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Bar: (props: unknown) => { bar(props); return <div data-testid="daily-load-bar" />; } }));

const data: DailyLoad[] = [
  { date: "2026-01-01", totalLoad: 70, activities: [{ load: 70, source: "tss" }] },
  { date: "2026-01-02", totalLoad: 50, activities: [{ load: 50, source: "trimp" }] },
  { date: "2026-01-03", totalLoad: 30, activities: [{ load: 30, source: "time" }] },
  { date: "2026-01-04", totalLoad: 0, activities: [] },
];

function ThemeSwitchingDailyLoad() {
  const { variant, setThemeId } = useOriderTheme();
  const { resolvedTheme, setTheme } = useTheme();
  return <>
    <button type="button" data-colors={JSON.stringify([variant.chartColors.power, variant.chartColors.heartRate, variant.chartColors.gridLabel, variant.colors.textQuaternary])} data-grid={variant.chartColors.grid} onClick={() => setThemeId("app-parity")}>테마 변경</button>
    <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>명암 변경</button>
    <DailyLoadChart data={data} />
  </>;
}

describe("DailyLoadChart theme colors", () => {
  it("keeps TSS, TRIMP, time fallback and empty days distinct across themes", () => {
    renderWithProviders(<ThemeSwitchingDailyLoad />);
    const button = screen.getByRole("button", { name: "테마 변경" });
    const checkColors = () => {
      const props = bar.mock.lastCall![0];
      expect(props.data.datasets[0].backgroundColor).toEqual(JSON.parse(button.getAttribute("data-colors")!));
      expect(props.options.scales.y.grid.color).toBe(button.getAttribute("data-grid"));
      expect(props.options.plugins.tooltip.backgroundColor).not.toContain("var(");
    };
    checkColors();
    fireEvent.click(button);
    checkColors();
    fireEvent.click(screen.getByRole("button", { name: "명암 변경" }));
    checkColors();
  });
});
