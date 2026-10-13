import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobilePlanPage from "./MobilePlanPage";

const week: PlanWeek = {
  id: "week-04",
  weekNumber: 4,
  phase: "build",
  startDate: Date.now(),
  plannedTSS: 60,
  days: [{ date: Date.now(), dayOfWeek: 1, workout: "z2", plannedTSS: 60,
    plannedDurationMin: 75, completed: false, skipped: false }],
};

describe("MobilePlanPage goal discipline", () => {
  it("uses the goal sport for a shared workout code across week and goal changes", () => {
    const view = renderWithProviders(<MobilePlanPage currentWeek={week} weekLabel="W1" goalDiscipline="run" />);
    expect(screen.getByText("🏃 러닝")).toBeInTheDocument();
    view.rerender(<MobilePlanPage currentWeek={{ ...week, id: "week-05" }} weekLabel="W2" goalDiscipline="bike" />);
    expect(screen.getByText("🚴 사이클")).toBeInTheDocument();
    expect(screen.queryByText("🏃 러닝")).not.toBeInTheDocument();
  });
});
