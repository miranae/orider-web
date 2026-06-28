import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import type { ZoneDistribution } from "../utils/zoneAnalysis";
import ZoneDistributionChart from "./ZoneDistributionChart";

const emptyZones: ZoneDistribution[] = [
  { zone: 1, name: "회복", nameKey: "fitness:zone.recovery", seconds: 0, percentage: 0, color: "#94a3b8" },
  { zone: 2, name: "지구력", nameKey: "fitness:zone.endurance", seconds: 0, percentage: 0, color: "#3b82f6" },
];

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
});
