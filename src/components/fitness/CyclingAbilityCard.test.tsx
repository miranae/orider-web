import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import CyclingAbilityCard from "./CyclingAbilityCard";

describe("CyclingAbilityCard", () => {
  it("기준표 하한을 명확히 표시하고 반복되는 눈금 설명은 하나로 묶는다", () => {
    renderWithProviders(
      <CyclingAbilityCard
        cycling={{
          windowDays: 90,
          activityCount: 2,
          confidence: "low",
          axes: [
            { key: "anaerobic", score: 1, confidence: "low", evidence: [{ duration: "5s", watts: 613, wPerKg: 7.86, percentile: 1 }] },
            { key: "aerobic", score: 2, confidence: "low", evidence: [{ duration: "5m", watts: 207, wPerKg: 2.65, percentile: 2 }] },
            { key: "endurance", score: 4, confidence: "low", evidence: [{ duration: "20m", watts: 173, wPerKg: 2.22, percentile: 4 }] },
          ],
        }}
      />,
    );

    expect(screen.getByText("백분위 1 이하 · 기준표 하한")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "단시간 파워 역량 백분위 위치" })).toHaveAttribute(
      "aria-valuetext",
      "백분위 1 이하, 기준표 하한",
    );
    expect(screen.getAllByText(/분포 데이터가 없어 백분위 위치만 표시합니다/)).toHaveLength(1);
    expect(screen.getAllByText(/낮음/).length).toBeGreaterThan(0);
  });
});
