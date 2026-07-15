import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import CyclingAbilityCard from "./CyclingAbilityCard";

describe("CyclingAbilityCard", () => {
  it("세 축을 개인 역량 점수와 고정 5단계로 표시한다", () => {
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

    expect(screen.getByText("역량 점수 1/100")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "단시간 파워 역량 점수" })).toHaveAttribute(
      "aria-valuetext",
      "역량 점수 1/100, 입문 단계",
    );
    expect(screen.getAllByText("입문").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/상위 \d+%|밀도|표본/);
  });
});
