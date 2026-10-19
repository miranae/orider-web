import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ConsistencyStreakCard from "./ConsistencyStreakCard";
const summary = { streakWeeks: 3, activeDays90d: 6, activeWeeks90d: 3, score90d: 18, thisWeekCount: 1, needsThisWeek: 0 };
describe("ConsistencyStreakCard sport meaning", () => {
  it("keeps legacy riding copy without changing other surfaces", () => {
    renderWithProviders(<ConsistencyStreakCard summary={summary} />);
    expect(screen.getByTestId("K1-4-2")).toHaveTextContent("라이딩 루틴");
    expect(screen.getByRole("heading", { name: "3주 연속 라이딩" })).toBeVisible();
  });
  it("describes condition evidence as activity across all sports", () => {
    renderWithProviders(<ConsistencyStreakCard summary={summary} allSports />);
    expect(screen.getByTestId("K1-4-2")).toHaveTextContent("전체 종목 운동 루틴");
    expect(screen.getByRole("heading", { name: "3주 연속 운동" })).toBeVisible();
    expect(screen.getByTestId("K1-4-2")).not.toHaveTextContent("라이딩");
  });
});
