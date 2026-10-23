import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { Route, Routes, useLocation } from "react-router-dom";
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
  it.each(["bike", "run"] as const)("preserves %s when the empty mobile plan opens goal setup", sport => {
    function GoalLocation() { const location = useLocation(); return <output>{location.search}</output>; }
    renderWithProviders(<Routes><Route path="/:lang/coach/plan" element={<MobilePlanPage currentWeek={null} weekLabel="" />} /><Route path="/:lang/goal-setup" element={<GoalLocation />} /></Routes>, { route: `/ko/coach/plan?sport=${sport}` });
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));
    expect(screen.getByRole("status")).toHaveTextContent(`?sport=${sport}`);
  });
  it("hides goal creation for a disabled swim deep link", () => {
    renderWithProviders(<MobilePlanPage currentWeek={null} weekLabel="" />, { route: "/ko/coach/plan?sport=swim" });
    expect(screen.queryByRole("button", { name: /추가/ })).not.toBeInTheDocument();
  });
  it("uses the goal sport for a shared workout code across week and goal changes", () => {
    const view = renderWithProviders(<MobilePlanPage currentWeek={week} weekLabel="W1" goalDiscipline="run" />);
    expect(screen.getByText("러닝")).toBeInTheDocument();
    view.rerender(<MobilePlanPage currentWeek={{ ...week, id: "week-05" }} weekLabel="W2" goalDiscipline="bike" />);
    expect(screen.getByText("사이클")).toBeInTheDocument();
    expect(screen.queryByText("러닝")).not.toBeInTheDocument();
  });
});

it('closes an uncommitted add sheet when the goal or week changes', () => {
  const view = renderWithProviders(<MobilePlanPage currentWeek={week} weekLabel="W1" goalId="goal-a" goalDiscipline="bike" />);
  fireEvent.click(screen.getByRole('button', { name: /추가/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  view.rerender(<MobilePlanPage currentWeek={{ ...week, id: 'week-05' }} weekLabel="W2" goalId="goal-b" goalDiscipline="bike" />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(<MobilePlanPage currentWeek={week} weekLabel="W1" goalId="goal-a" goalDiscipline="bike" />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it("forwards the actual target date through the mobile wrapper instead of marking every goal workout as goal day", () => {
  const date = Date.now() + 86400000;
  const goal = { ...week.days[0]!, date, workout: "goal" as const };
  renderWithProviders(<MobilePlanPage currentWeek={{ ...week, days: [goal, { ...goal, date: date + 7 * 86400000 }] }} weekLabel="W1" goalDate={new Date(date)} />);
  expect(screen.getAllByText("목표일")).toHaveLength(1);
  expect(screen.queryByTestId("K4-5m-2")).not.toBeInTheDocument();
  expect(screen.getByText("목표 운동")).toBeInTheDocument();
});


it('hides workout addition for a server-managed current goal while retaining legacy plan addition', () => {
  const view = renderWithProviders(<MobilePlanPage currentWeek={week} weekLabel="W1" goalTitle="달리기 목표" goalDiscipline="run" />);
  expect(screen.queryByRole('button', { name: /추가/ })).not.toBeInTheDocument();
  view.rerender(<MobilePlanPage currentWeek={week} weekLabel="W1" goalId="legacy-goal" goalTitle="사이클 목표" goalDiscipline="bike" />);
  fireEvent.click(screen.getByRole('button', { name: /추가/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
