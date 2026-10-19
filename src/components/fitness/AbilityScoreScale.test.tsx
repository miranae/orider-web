import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import AbilityScoreScale from "./AbilityScoreScale";

describe("AbilityScoreScale", () => {
  it.each([
    { score: 1, stage: "입문", key: "entry" },
    { score: 50, stage: "보통", key: "average" },
    { score: 82, stage: "최상", key: "top" },
    { score: 100, stage: "최상", key: "top" },
  ])("shows $score as a personal 100-point score and fixed stage", ({ score, stage }) => {
    renderWithProviders(<AbilityScoreScale score={score} ariaLabel="사이클링 역량 점수" />);
    expect(screen.getByRole("meter", { name: "사이클링 역량 점수" })).toHaveAttribute("aria-valuetext", `역량 점수 ${score}/100, ${stage} 단계`);
    expect(screen.getByText(`역량 점수 ${score}/100`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "사이클링 역량 점수" })).toBeVisible();
    expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    expect(screen.getByText(/사용자 간 순위나 백분위가 아닙니다/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/상위 \d+%|O-Rider 전체|밀도|표본/);
  });
});
