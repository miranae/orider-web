import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanDay, PlanWeek } from "@shared/types/goal";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import MobilePlanContent from "./MobilePlanContent";
import type { DailyActivityDay, PlanDailyActivities } from "../../../hooks/usePlanDailyActivities";

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

const dateKey = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const activityDay = (id: string, tss: number | null, estimated = false): DailyActivityDay => ({
  tss, tssEstimated: estimated,
  activities: [{ id, startTime: today + 7 * 3_600_000, distance: 25000, movingSec: 3600, tss, estimated, source: "orider" }],
});
function actualOf(days: Record<string, DailyActivityDay>, overrides: Partial<PlanDailyActivities> = {}): PlanDailyActivities {
  return { discipline: "bike", timezone: "Asia/Seoul", todayKey: dateKey(today), days: new Map(Object.entries(days)),
    loading: false, failedMonths: new Set(), total: { value: 0, estimated: false }, ...overrides };
}

describe("MobilePlanContent product hierarchy", () => {
  it("keeps a date-linked past workout visible and highlights its date without changing today", () => {
    const past = { ...workout, date: today - 86400000 };
    const date = new Date(past.date + 9 * 3600000).toISOString().slice(0, 10);
    const view = renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [past, workout] }} weekLabel="W1" selectedDate={date} />);
    const selected = view.container.querySelector(`[data-plan-date="${date}"]`);
    expect(selected).toHaveAttribute("aria-current", "date");
    expect(view.container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  it("renders generic run load and preserves explicit mixed sessions and edit identities", () => {
    const edit = vi.fn();
    const mixedWeek = { ...week, days: [workout, { ...workout, date: today + 86_400_000, workout: "easySwim" as const }] };
    const view = renderWithProviders(<MobilePlanContent currentWeek={mixedWeek} weekLabel="W1" goalDiscipline="run" onEditWorkout={edit} />);
    expect(screen.getAllByText("러닝").length).toBeGreaterThan(0);
    expect(screen.getAllByText("수영").length).toBeGreaterThan(0);
    expect(screen.queryByText("사이클")).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "이번 주 요약" });
    expect(summary).toHaveTextContent("러닝 60");
    expect(summary).toHaveTextContent("수영 60");
    fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
    expect(edit).toHaveBeenCalledWith(workout, "week-04", 0);
    view.rerender(<MobilePlanContent embedded currentWeek={week} weekLabel="W2" goalDiscipline="bike" />);
    expect(screen.getByText("사이클")).toBeInTheDocument();
    expect(screen.queryByText("러닝")).not.toBeInTheDocument();
    expect(workout.workout).toBe("z2");
    expect(workout.plannedTSS).toBe(60);
  });

  it("keeps the goal compact, exposes the full title, and brings today's workout forward", () => {
    const edit = vi.fn();
    renderWithProviders(
      <MobilePlanContent
        currentWeek={week}
        weekLabel="이번 주"
        goalTitle="2026_비앙키그란폰도춘천_그란폰도_122.91km"
        daysLeft={25}
        progressPct={7}
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
    expect(screen.getByText("75 분 · 60 TSS")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "주간 선택" })).toHaveTextContent("이번 주");
    expect(screen.getByText("사이클")).toBeInTheDocument();
    expect(screen.getByText("가벼움")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "이번 주 요약" })).toHaveTextContent("훈련부하 · TSS60");
    expect(screen.getByRole("region", { name: "이번 주 요약" })).toHaveTextContent("1h 15m");
    expect(screen.getByRole("region", { name: "이번 주 요약" }).querySelector(".mobile-plan-sport-load")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
    expect(edit).toHaveBeenCalledWith(workout, "week-04", 0);
  });

  it("omits unassessed load and unsupported CTL while preserving planned duration", () => {
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, plannedTSS: 0, plannedDurationMin: 30 }] }} weekLabel="이번 주" goalTitle="30분 달리기" totalTSS={0} projectedCTL={8} remainingSessions={4} weeksLeft={2} />);
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.queryByText("CTL")).not.toBeInTheDocument();
    expect(screen.getByText("30 분")).toBeInTheDocument();
    expect(screen.getByText("4 회")).toBeInTheDocument();
    expect(screen.getByText("2 주")).toBeInTheDocument();
    expect(screen.queryByText("0 TSS")).not.toBeInTheDocument();
  });

  it("treats a day with an actual activity as done, regardless of plan completion links", () => {
    const view = renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [workout] }} weekLabel="이번 주" goalTitle="목표"
      actual={actualOf({ [dateKey(today)]: activityDay("today-ride", 55) })} />);
    expect(screen.queryByText("오늘의 다음 운동")).not.toBeInTheDocument();
    expect(screen.getByText("운동한 날")).toBeInTheDocument();
    // 연결 판정이 완료여도 활동이 없으면 "한 날"이 아니고, 오늘 운동은 그대로 다음 운동이다.
    view.rerender(<MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, completed: true }] }} weekLabel="이번 주" goalTitle="목표" actual={actualOf({})} />);
    expect(screen.getByText("오늘의 다음 운동")).toBeInTheDocument();
    expect(screen.queryByText("운동한 날")).not.toBeInTheDocument();
    expect(screen.queryByText("완료")).not.toBeInTheDocument();
  });

  it("shows the next scheduled workout when today is a rest day", () => {
    const edit = vi.fn();
    const nextDay = { ...workout, date: today + 86_400_000, dayOfWeek: 2 as const };
    renderWithProviders(
      <MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, workout: "rest" }, nextDay] }} weekLabel="이번 주" onEditWorkout={edit} />,
    );
    expect(screen.getByText("다음 예정 운동")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
    expect(edit).toHaveBeenCalledWith(nextDay, "week-04", 1);
  });

  it("shows the adjusted workout duration without offering an edit action in an embedded plan", () => {
    const adjustedDay = { ...workout, adjustedTSS: 48, adjustedDurationMin: 58 };
    renderWithProviders(<MobilePlanContent embedded currentWeek={{ ...week, days: [adjustedDay] }} weekLabel="이번 주" />);

    expect(screen.getByText("58 분 · 48 TSS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "편집" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "이번 주 요약" })).toHaveTextContent("48");
    expect(screen.getByRole("region", { name: "이번 주 요약" })).toHaveTextContent("0h 58m");
  });

  it("excludes skipped workouts from all weekly load, time, and session figures", () => {
    const skippedDay = { ...workout, skipped: true };
    const scheduledDay = { ...workout, date: today + 86_400_000, dayOfWeek: 2 as const,
      adjustedTSS: 40, adjustedDurationMin: 45 };
    renderWithProviders(<MobilePlanContent embedded currentWeek={{ ...week, days: [skippedDay, scheduledDay] }} weekLabel="이번 주" />);

    const summary = screen.getByRole("region", { name: "이번 주 요약" });
    expect(summary).toHaveTextContent("훈련부하 · TSS40");
    expect(summary).toHaveTextContent("시간0h 45m");
    expect(summary).toHaveTextContent("훈련횟수1");
    expect(summary.querySelector(".mobile-plan-sport-load")).toBeNull();
    expect(screen.getByText("다음 예정 운동")).toBeInTheDocument();
  });

  it("shows the sport load split when the week includes more than one sport", () => {
    const runDay = { ...workout, date: today + 86_400_000, workout: "easyRun" as const, plannedTSS: 30 };
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [workout, runDay] }} weekLabel="이번 주" />);

    const summary = screen.getByRole("region", { name: "이번 주 요약" });
    expect(summary.querySelector(".mobile-plan-sport-bar")).toBeInTheDocument();
    expect(summary).toHaveTextContent("사이클 60");
    expect(summary).toHaveTextContent("러닝 30");
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

  it("labels week controls and disables unavailable directions", () => {
    const previous = vi.fn();
    const next = vi.fn();
    renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="이번 주" canPrevWeek={false} canNextWeek
      onWeekPrev={previous} onWeekNext={next} />);

    const previousButton = screen.getByRole("button", { name: "이전 주" });
    const nextButton = screen.getByRole("button", { name: "다음 주" });
    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();
    fireEvent.click(previousButton);
    fireEvent.click(nextButton);
    expect(previous).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});


it("uses canonical KST dates for weekdays while preserving the stored edit index", () => {
  const edit = vi.fn();
  const friday = { ...workout, date: Date.parse('2026-10-16T00:00:00+09:00'), dayOfWeek: 0 as const };
  const saturday = { ...friday, date: friday.date + 86400000, workout: 'rest' as const };
  renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [friday, saturday] }} weekLabel="W1" selectedDate="2026-10-16" onEditWorkout={edit} />);
  const pastDays = screen.queryByRole("button", { name: /지난 \d+일 보기/ });
  if (pastDays) fireEvent.click(pastDays);
  const action = screen.getByRole('button', { name: /^금 16 / });
  fireEvent.click(action);
  expect(edit).toHaveBeenCalledWith(friday, week.id, 0);
  expect(screen.getByText('토')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^월 16 / })).not.toBeInTheDocument();
});

describe("MobilePlanContent actual activities", () => {
  it("lists a rest day's activities, the week's actual load and the summary actual load", () => {
    const rest = { ...workout, workout: "rest" as const, plannedTSS: 0 };
    const actual = actualOf({ [dateKey(today)]: activityDay("ride-9", 55) }, { total: { value: 55, estimated: false } });
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [rest] }} weekLabel="W1" goalTitle="Goal" totalTSS={200} actual={actual} />);
    expect(screen.getByTestId("K4-5-8")).toHaveAttribute("href", "/ko/activity/ride-9");
    expect(screen.getByTestId("K4-5-8")).toHaveTextContent("07:00 · 25.0km · 55 TSS");
    expect(screen.getByTestId("K4-5-9")).toHaveTextContent("실제 55 TSS");
    expect(screen.getByTestId("K4-7-2")).toHaveTextContent("55");
    expect(screen.getByTestId("K4-2-5")).toHaveTextContent("55/200");
    expect(screen.getByRole("img", { name: "운동한 날" })).toBeInTheDocument();
  });

  it("shows only the plan for a past day without activity, dimmed and without a missed label", () => {
    const past = { ...workout, date: today - 86_400_000 };
    const view = renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [past, workout] }} weekLabel="W1" selectedDate={dateKey(past.date)} actual={actualOf({})} />);
    const row = view.container.querySelector(`[data-plan-date="${dateKey(past.date)}"]`) as HTMLElement;
    expect(row).toHaveStyle({ opacity: "0.6" });
    expect(screen.queryByText("미완료")).not.toBeInTheDocument();
    expect(screen.getByTestId("K4-7-2")).toHaveTextContent("0");
  });

  it("keeps the plan with a small notice for days whose month could not be loaded", () => {
    const actual = actualOf({}, { failedMonths: new Set([dateKey(today).slice(0, 7)]), total: null });
    renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="W1" goalTitle="Goal" actual={actual} />);
    expect(screen.getByTestId("K4-5-10")).toHaveTextContent("활동 확인 불가");
    expect(screen.queryByTestId("K4-7-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("K4-2-5")).toHaveTextContent("—");
    expect(screen.getByText("75 분 · 60 TSS")).toBeInTheDocument();
  });

  it("marks estimated activity load", () => {
    const actual = actualOf({ [dateKey(today)]: activityDay("est-ride", 30, true) }, { total: { value: 30, estimated: true } });
    renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="W1" goalTitle="Goal" actual={actual} />);
    expect(screen.getByTestId("K4-5-8")).toHaveTextContent("30 TSS 추정");
    expect(screen.getByTestId("K4-2-5")).toHaveTextContent("30 추정");
  });
});

describe("MobilePlanContent review guards", () => {
  it("keeps activity links outside the row edit button", () => {
    renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="W1" onEditWorkout={vi.fn()} actual={actualOf({ [dateKey(today)]: activityDay("ride-x", 40) })} />);
    const link = screen.getByTestId("K4-5-8");
    expect(link.closest('[role="button"]')).toBeNull();
    expect(screen.getByRole("button", { name: /운동한 날/ })).toBeInTheDocument();
  });

  it("hides the next workout card while daily documents are loading", () => {
    renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="W1" goalTitle="Goal" actual={actualOf({}, { loading: true, total: null })} />);
    expect(screen.queryByText("오늘의 다음 운동")).not.toBeInTheDocument();
  });
});
