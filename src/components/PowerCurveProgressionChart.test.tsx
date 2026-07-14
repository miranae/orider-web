import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useOriderTheme } from "../theme";
import PowerCurveProgressionChart from "./PowerCurveProgressionChart";

vi.mock("react-chartjs-2", () => ({
  Line: ({ data }: { data: { datasets: Array<{ borderColor: string }> } }) => (
    <div data-testid="progression-line" data-colors={JSON.stringify(data.datasets.map((d) => d.borderColor))} />
  ),
}));

function ThemeSwitchingProgressionChart() {
  const { variant, setThemeId } = useOriderTheme();
  return (
    <>
      <button
        type="button"
        data-expected-colors={JSON.stringify([variant.colors.accent, variant.colors.textQuaternary])}
        onClick={() => setThemeId("app-parity")}
      >
        테마 변경
      </button>
      <PowerCurveProgressionChart
        progressions={[
          { label: "최근", color: "var(--lime)", points: [{ durationSeconds: 60, maxPower: 300 }] },
          { label: "이전", color: "var(--ink-3)", points: [{ durationSeconds: 60, maxPower: 280 }] },
        ]}
      />
    </>
  );
}

describe("PowerCurveProgressionChart", () => {
  it("keeps canvas colors synchronized with design-theme changes", () => {
    window.localStorage.removeItem("orider.designTheme");
    renderWithProviders(<ThemeSwitchingProgressionChart />);

    const button = screen.getByRole("button", { name: "테마 변경" });
    const chart = screen.getByTestId("progression-line");
    expect(chart).toHaveAttribute("data-colors", button.getAttribute("data-expected-colors"));
    expect(chart.getAttribute("data-colors")).not.toContain("var(");

    fireEvent.click(button);

    expect(chart).toHaveAttribute("data-colors", button.getAttribute("data-expected-colors"));
    expect(chart.getAttribute("data-colors")).not.toContain("var(");
  });
});
