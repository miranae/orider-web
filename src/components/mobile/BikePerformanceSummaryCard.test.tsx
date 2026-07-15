import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import BikePerformanceSummaryCard from "./BikePerformanceSummaryCard";

const completeDecision = {
  activeFtpW: 250,
  automaticCandidateW: 265,
  cpW: 270,
  recentTwentyMinuteW: 279,
  latestMonthlyEstimate: { period: "2026-07", ftpW: 265 },
  tteMin: 45,
  activityCount: 14,
};

describe("BikePerformanceSummaryCard", () => {
  it("keeps the personal PDC hierarchy and shows one simple ability score", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard
        decision={completeDecision}
        pdc={{ riderType: { type: "Climber", confidence: 0.8 }, abilityScore: 82, vo2maxEst: 58.4, activityCount: 14 }}
        weightKg={70}
        progression={[{ period: "2026-06", ftpW: 255, source: "20m" }, { period: "2026-07", ftpW: 265, source: "20m" }]}
        applying={false}
        onApplyCandidate={onApply}
      />,
    );

    expect(screen.getByRole("heading", { name: "사이클링 퍼포먼스" })).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("3.57 W/kg")).toBeInTheDocument();
    expect(screen.getByText("클라이머")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "종합 사이클링 역량 점수" })).toHaveAttribute("aria-valuetext", "역량 점수 82/100, 최상 단계");
    expect(screen.getByText("역량 점수 82/100")).toBeInTheDocument();
    expect(within(container.querySelector('[data-performance-metric="tte"]')!).getByText("45")).toBeInTheDocument();
    const vo2Tile = container.querySelector('[data-performance-metric="vo2max"]')!;
    expect(within(vo2Tile).getByText("58")).toHaveStyle({ whiteSpace: "nowrap" });
    expect(within(vo2Tile).getByText("ml/kg/min")).toHaveStyle({ whiteSpace: "nowrap" });
    expect(within(vo2Tile).queryByRole("meter")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/상위 \d+%|O-Rider 전체|밀도|표본/);

    await user.click(screen.getByRole("button", { name: "이 후보 적용" }));
    expect(onApply).toHaveBeenCalledWith(265);
    await user.click(screen.getByRole("button", { name: "산출 근거 보기" }));
    expect(screen.getByText("최근 20분 최고 평균")).toBeVisible();
    expect(screen.getByText("279 W")).toBeVisible();
    expect(screen.getByText("라이더 유형 신뢰도")).toBeVisible();
    expect(screen.getByRole("link", { name: "PDC와 3축 산출 근거 보기" })).toHaveAttribute("href", "/web-manual/ch06-advanced.html#s6-3");
  });

  it("shows a stable empty state without inventing scores", () => {
    const { container } = renderWithProviders(<BikePerformanceSummaryCard applying={false} onApplyCandidate={vi.fn()} />);
    expect(screen.getByText("라이더 유형 근거 부족")).toBeInTheDocument();
    expect(screen.getByText("역량 점수 근거 부족")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-performance-metric]")).toHaveLength(4);
  });

  it("keeps VO2max as an estimate without a comparison meter", () => {
    const { container } = renderWithProviders(
      <BikePerformanceSummaryCard
        decision={{ ...completeDecision, automaticCandidateW: null, latestMonthlyEstimate: null, tteMin: null, cpW: 245 }}
        pdc={{ riderType: null, abilityScore: null, vo2maxEst: 52.2, activityCount: 4 }}
        applying={false}
        onApplyCandidate={vi.fn()}
      />,
    );
    const vo2Tile = container.querySelector('[data-performance-metric="vo2max"]')!;
    expect(within(vo2Tile).getByText("52")).toBeInTheDocument();
    expect(within(vo2Tile).queryByRole("meter")).not.toBeInTheDocument();
  });
});
