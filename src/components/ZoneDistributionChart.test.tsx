import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import type { ZoneDistribution } from "../utils/zoneAnalysis";
import ZoneDistributionChart from "./ZoneDistributionChart";
import { useOriderTheme } from "../theme";

vi.mock("react-chartjs-2", () => ({
  Bar: ({ data }: { data: { datasets: Array<{ backgroundColor: string[] }> } }) => (
    <div data-testid="zone-bar" data-colors={JSON.stringify(data.datasets[0]?.backgroundColor ?? [])} />
  ),
}));

const emptyZones: ZoneDistribution[] = [
  { zone: 1, name: "회복", nameKey: "fitness:zone.recovery", seconds: 0, percentage: 0, color: "#94a3b8" },
  { zone: 2, name: "지구력", nameKey: "fitness:zone.endurance", seconds: 0, percentage: 0, color: "#3b82f6" },
];

function ThemeSwitchingZoneChart() {
  const { variant, setThemeId } = useOriderTheme();
  return (
    <>
      <button
        type="button"
        data-expected-colors={JSON.stringify([variant.colors.zone1, variant.colors.zone2])}
        onClick={() => setThemeId("app-parity")}
      >
        테마 변경
      </button>
      <ZoneDistributionChart
        title="심박 존"
        zones={[
          { ...emptyZones[0]!, seconds: 10, percentage: 25, color: "var(--zone-1)" },
          { ...emptyZones[1]!, seconds: 30, percentage: 75, color: "var(--zone-2)" },
        ]}
      />
    </>
  );
}

describe("ZoneDistributionChart", () => {
  it("handles an empty zone array safely", () => {
    renderWithProviders(<ZoneDistributionChart title="심박 존" zones={[]} />);

    expect(screen.getByText("심박 존")).toBeInTheDocument();
    expect(screen.getByText("존 분포를 계산할 데이터가 부족해요")).toBeInTheDocument();
    expect(screen.getByText(/심박, 파워, 페이스 스트림/)).toBeInTheDocument();
  });

  it("treats zero-duration zones as an empty chart", () => {
    renderWithProviders(
      <ZoneDistributionChart
        title="파워 존"
        zones={emptyZones}
        emptyTitle="파워 존 부족"
        emptyDescription="파워 스트림이 충분히 기록되면 표시됩니다."
      />,
    );

    expect(screen.getByText("파워 존")).toBeInTheDocument();
    expect(screen.getByText("파워 존 부족")).toBeInTheDocument();
    expect(screen.getByText("파워 스트림이 충분히 기록되면 표시됩니다.")).toBeInTheDocument();
  });

  it("passes concrete colors to Chart.js and stays in sync during design-theme changes", () => {
    window.localStorage.removeItem("orider.designTheme");
    renderWithProviders(<ThemeSwitchingZoneChart />);

    const button = screen.getByRole("button", { name: "테마 변경" });
    const chart = screen.getByTestId("zone-bar");
    expect(chart).toHaveAttribute("data-colors", button.getAttribute("data-expected-colors"));
    expect(chart.getAttribute("data-colors")).not.toContain("var(");

    fireEvent.click(button);

    expect(chart).toHaveAttribute("data-colors", button.getAttribute("data-expected-colors"));
    expect(chart.getAttribute("data-colors")).not.toContain("var(");
  });
});
