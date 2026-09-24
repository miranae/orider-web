import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanModel } from "../../../hooks/usePlanModel";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import PlanPresentation from "./PlanPresentation";

const model = {
  discipline: "bike",
  goal: { id: "goal-1", courseName: "Test ride", goalType: "course", courseDist: 100, courseElev: 1000 },
  weeks: [],
  loading: false,
  loadError: null,
  goalMatchesDiscipline: true,
  revalidating: false,
  justRecomputed: false,
  daysLeft: 20,
  totalTSS: 200,
  completedTSS: 50,
  progress: 25,
  weeksLeft: 3,
  isTodayCell: () => false,
} as unknown as PlanModel;

afterEach(() => vi.restoreAllMocks());

describe("PlanPresentation responsive layout", () => {
  it("uses the weekly list at tablet widths where the nine-column calendar cannot fit", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(max-width: 1023px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderWithProviders(
      <PlanPresentation model={model} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} renderMobile={() => <div>tablet weekly list</div>} />,
    );
    expect(screen.getByText("tablet weekly list")).toBeInTheDocument();
  });

  it("labels the displayed week after an old offset is clamped by refreshed plan data", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(max-width: 1023px)", media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const today = Date.now();
    const refreshedModel = {
      ...model,
      weeks: [{ id: "week-01", weekNumber: 1, phase: "build", startDate: today, plannedTSS: 50,
        days: [{ date: today, dayOfWeek: 0, workout: "z2", plannedTSS: 50, plannedDurationMin: 60 }] }],
      isTodayCell: (day: { date: number }) => day.date === today,
    } as unknown as PlanModel;
    renderWithProviders(<PlanPresentation model={refreshedModel} mobileWeekOffset={5} onMobileWeekOffsetChange={vi.fn()}
      renderMobile={(props) => <div>{props.weekLabel} · {props.canNextWeek ? "next" : "last"}</div>} />);

    expect(screen.getByText("이번 주 · last")).toBeInTheDocument();
  });

  it("keeps the embedded inset container for empty and wide plan views", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const view = renderWithProviders(<PlanPresentation model={{ ...model, goal: null } as unknown as PlanModel}
      embedded mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(view.container.querySelector(".embedded-plan-presentation")).toBeInTheDocument();

    view.rerender(<PlanPresentation model={model} embedded mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(view.container.querySelector(".embedded-plan-presentation")).toBeInTheDocument();
  });

  it("keeps a long ride's TSS value and unit together in the desktop calendar", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const desktopModel = {
      ...model,
      weeks: [{
        id: "week-01",
        weekNumber: 1,
        phase: "build",
        startDate: Date.now(),
        plannedTSS: 180,
        days: [{
          date: Date.now(),
          dayOfWeek: 0,
          workout: "z2Long",
          plannedTSS: 180,
          plannedDurationMin: 240,
          completed: false,
          skipped: false,
        }],
      }],
    } as unknown as PlanModel;
    renderWithProviders(<PlanPresentation model={desktopModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.getByText("108.0km")).toBeInTheDocument();
    expect(screen.getByText("180 TSS")).toHaveStyle({ whiteSpace: "nowrap" });
  });

  it("starts the desktop calendar at the current week while keeping past weeks accessible", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const today = Date.now();
    const day = { date: today, dayOfWeek: 0 as const, workout: "z2" as const, plannedTSS: 50, plannedDurationMin: 60, completed: false, skipped: false };
    const weeks = [
      { id: "week-01", weekNumber: 1, phase: "build" as const, startDate: today - 7 * 86_400_000, plannedTSS: 50, days: [{ ...day, date: today - 7 * 86_400_000 }] },
      { id: "week-02", weekNumber: 2, phase: "peak" as const, startDate: today, plannedTSS: 50, days: [day] },
    ];
    const edit = vi.fn();
    renderWithProviders(<PlanPresentation model={{ ...model, weeks, isTodayCell: (candidate: { date: number }) => candidate.date === today } as unknown as PlanModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit} />);
    expect(screen.getByRole("progressbar", { name: "진행률" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getAllByText("25%")).toHaveLength(1);
    expect(screen.getByText("남은 훈련")).toBeInTheDocument();
    expect(screen.getByText("오늘의 다음 운동")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(edit).toHaveBeenCalledWith(day, "week-02", 0);
    expect(screen.getByText("W2")).toBeInTheDocument();
    expect(screen.queryByText("W1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지난 1주 보기" }));
    expect(screen.getByText("W1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지난 주 접기" }));
    expect(screen.queryByText("W1")).not.toBeInTheDocument();
  });
});
