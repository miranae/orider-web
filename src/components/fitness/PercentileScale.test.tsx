import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import PercentileScale from "./PercentileScale";

describe("PercentileScale", () => {
  it.each([
    { score: 1, top: 99 },
    { score: 50, top: 50 },
    { score: 99, top: 1 },
  ])("shows percentile $score as a distribution position and keeps its marker on the track", ({ score, top }) => {
    const { container } = renderWithProviders(
      <PercentileScale percentile={score} ariaLabel="테스트 백분위" population="비교 집단" />,
    );

    const meter = screen.getByRole("meter", { name: "테스트 백분위" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuenow", String(score));
    expect(meter).toHaveAttribute("aria-valuetext", `백분위 ${score}, 상위 ${top}퍼센트`);
    expect(screen.getByText(`백분위 ${score}`)).toBeInTheDocument();
    expect(screen.getByText(`상위 ${top}%`)).toBeInTheDocument();
    const population = screen.getByText("비교 집단");
    expect(population).toBeInTheDocument();
    expect(meter).toHaveAttribute("aria-describedby", population.id);
    expect(container.querySelector("[data-percentile-marker]")).toHaveStyle({
      left: `clamp(var(--space-1), ${score}%, calc(100% - var(--space-1)))`,
    });
  });

  it("labels the ruler without exposing decorative ticks to assistive technology", () => {
    renderWithProviders(<PercentileScale percentile={50} ariaLabel="중앙값 위치" />);

    expect(screen.getByText("낮음")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("높음")).toBeInTheDocument();
    expect(screen.getAllByRole("meter")).toHaveLength(1);
  });
});
