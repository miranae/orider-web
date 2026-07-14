import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import PercentileScale from "./PercentileScale";

describe("PercentileScale", () => {
  it.each([
    { score: 1 },
    { score: 50 },
    { score: 99 },
  ])("shows percentile $score as a rank position and keeps its marker on the track", ({ score }) => {
    const { container } = renderWithProviders(
      <PercentileScale percentile={score} ariaLabel="테스트 백분위" population="비교 집단" />,
    );

    const meter = screen.getByRole("meter", { name: "테스트 백분위" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuenow", String(score));
    expect(meter).toHaveAttribute("aria-valuetext", `백분위 ${score}`);
    expect(screen.getByText(`백분위 ${score}`)).toBeInTheDocument();
    expect(screen.queryByText(/상위 \d+%/)).not.toBeInTheDocument();
    const population = screen.getByText("비교 집단");
    expect(population).toBeInTheDocument();
    expect(meter).toHaveAttribute("aria-describedby", population.parentElement?.id);
    expect(container.querySelector("[data-percentile-marker]")).toHaveStyle({
      left: `clamp(var(--space-1), ${score}%, calc(100% - var(--space-1)))`,
    });
    expect(container.querySelector('[data-percentile-visual="ruler"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-density-bin]")).toHaveLength(0);
    expect(screen.getByText(/분포 데이터가 없어 백분위 위치만 표시합니다/)).toBeInTheDocument();
  });

  it("labels the position ruler and applies the requested accent without inventing density", () => {
    const { container } = renderWithProviders(<PercentileScale percentile={50} ariaLabel="중앙값 위치" accentColor="var(--violet)" />);

    expect(screen.getByText("하위")).toBeInTheDocument();
    expect(screen.getByText("중간")).toBeInTheDocument();
    expect(screen.getByText("상위")).toBeInTheDocument();
    expect(container.querySelector("[data-percentile-marker]")).toHaveStyle({ background: "var(--violet)" });
    expect(container.querySelector('[data-percentile-visual="ruler"]')).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(1);
  });

  it("can leave the shared ruler explanation to a parent and clarify a clipped floor score", () => {
    renderWithProviders(
      <PercentileScale percentile={1} ariaLabel="하한 백분위" floorClipped showRulerGuide={false} />,
    );

    expect(screen.getByRole("meter", { name: "하한 백분위" })).toHaveAttribute(
      "aria-valuetext",
      "백분위 1 이하, 기준표 하한",
    );
    expect(screen.getByText("백분위 1 이하 · 기준표 하한")).toBeInTheDocument();
    expect(screen.queryByText(/분포 데이터가 없어/)).not.toBeInTheDocument();
  });

  it("renders validated cohort bins as density with a raw-value marker and privacy-safe context", () => {
    const { container } = renderWithProviders(<PercentileScale
      percentile={75}
      ariaLabel="VO2max 백분위"
      population="실제 O-Rider 전체 코호트 기준"
      distributionValue={76.25}
      fallbackComputedAt={Date.UTC(2026, 6, 14)}
      distribution={{
        basis: "vo2max_ml_kg_min",
        domain: [20, 95],
        approximateSampleSize: 120,
        bins: [
          { from: 20, to: 45, densityLevel: 1 },
          { from: 45, to: 70, densityLevel: 5 },
          { from: 70, to: 95, densityLevel: 2 },
        ],
        privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
        computedAt: Date.UTC(2026, 6, 14),
      }}
    />);

    expect(screen.getByText("백분위 75")).toBeInTheDocument();
    expect(container.querySelector('[data-percentile-visual="density"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-density-bin]")).toHaveLength(3);
    expect(container.querySelector('[data-density-bin="2"]')).toHaveStyle({ position: "absolute", height: "100%" });
    expect(container.querySelector("[data-percentile-marker]")).toHaveStyle({ left: "clamp(var(--space-1), 75%, calc(100% - var(--space-1)))" });
    expect(screen.getByText("O-Rider 전체 · 약 120명")).toBeInTheDocument();
    expect(screen.getByText(/O-Rider 추정 VO2max 분포 · 5명 미만 구간 병합 · 정확한 인원 수 비공개/)).toBeInTheDocument();
    expect(screen.getByText(/2026.*7.*14.*계산/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("vo2max_ml_kg_min");
    expect(screen.queryByText(/분포 데이터가 없어/)).not.toBeInTheDocument();
  });
});
