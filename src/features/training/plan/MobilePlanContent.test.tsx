import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanDay, PlanWeek } from "@shared/types/goal";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import MobilePlanContent from "./MobilePlanContent";

const today = (() => {
  const kstDate = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return Date.parse(`${kstDate}T00:00:00+09:00`);
})();

const workout: PlanDay = {
  date: today,
  dayOfWeek: 1,
  workout: "z2",
  plannedTSS: 60,
  plannedDurationMin: 75,
  completed: false,
  skipped: false,
};

const week: PlanWeek = {
  id: "week-04",
  weekNumber: 4,
  phase: "build",
  startDate: today,
  plannedTSS: 60,
  days: [workout],
};

describe("MobilePlanContent product hierarchy", () => {
  it("keeps the goal compact, exposes the full title, and brings today's workout forward", () => {
    const edit = vi.fn();
    renderWithProviders(
      <MobilePlanContent
        currentWeek={week}
        weekLabel="이번 주"
        goalTitle="2026_비앙키그란폰도춘천_그란폰도_122.91km"
        daysLeft={25}
        progressPct={7}
        completedTSS={169}
        totalTSS={2595}
        projectedCTL={6}
        onEditWorkout={edit}
        actionsSlot={<button type="button">ICS</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("비앙키그란폰도춘천");
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName("2026_비앙키그란폰도춘천_그란폰도_122.91km");
    expect(screen.getByText("2026 · 그란폰도 · 122.91 km")).toBeInTheDocument();
    expect(screen.getByText("D-25")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "진행률" })).toHaveAttribute("aria-valuenow", "7");
    expect(screen.getByText("계획 관리")).toBeInTheDocument();
    fireEvent.click(screen.getByText("계획 관리"));
    expect(screen.getByRole("button", { name: "ICS" })).toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "원문 보기" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("2026_비앙키그란폰도춘천");
    expect(screen.getByText("오늘의 다음 운동")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "시작" })[0]);
    expect(edit).toHaveBeenCalledWith(workout, "week-04", 0);
  });

  it("does not present a completed workout as the next action", () => {
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, completed: true }] }} weekLabel="이번 주" goalTitle="목표" />);
    expect(screen.queryByText("오늘의 다음 운동")).not.toBeInTheDocument();
  });

  it("shows the next scheduled workout when today is a rest day", () => {
    const edit = vi.fn();
    const nextDay = { ...workout, date: today + 86_400_000, dayOfWeek: 2 as const };
    renderWithProviders(
      <MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, workout: "rest" }, nextDay] }} weekLabel="이번 주" onEditWorkout={edit} />,
    );
    expect(screen.getByText("이번 주 다음 운동")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(edit).toHaveBeenCalledWith(nextDay, "week-04", 1);
  });

  it("prioritizes today while keeping earlier days accessible", () => {
    const priorDay = { ...workout, date: today - 86_400_000, workout: "rest" as const };
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [priorDay, workout] }} weekLabel="이번 주" />);
    const reveal = screen.getByRole("button", { name: "지난 1일 보기" });
    expect(reveal).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("휴식일")).not.toBeInTheDocument();
    fireEvent.click(reveal);
    expect(screen.getByRole("button", { name: "지난 일정 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("휴식일")).toBeInTheDocument();
  });
});
