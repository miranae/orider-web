import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanDay, PlanWeek } from "@shared/types/goal";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import MobilePlanContent from "./MobilePlanContent";

const today = (() => {
  const kstDate = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return Date.parse(`${kstDate}T00:00:00+09:00`);
})();


/** 요일 줄은 기본으로 접혀 있다 — 상세(계획/실제/비교 근거·편집)를 보려면 줄을 눌러 펼친다. */
function expandDays() {
  document.querySelectorAll<HTMLButtonElement>('.mobile-plan-day-row[aria-expanded="false"]').forEach(row => fireEvent.click(row));
}

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
    expandDays();
    expect(screen.getAllByText("러닝").length).toBeGreaterThan(0);
    expect(screen.getAllByText("수영").length).toBeGreaterThan(0);
    expect(screen.queryByText("사이클")).not.toBeInTheDocument();
    const summary = screen.getByTestId("K4-7-1");
    expect(summary).toHaveTextContent("완료 0/2");
    expect(summary).toHaveTextContent("부하 120");
    expect(mixedWeek.days[1].workout).toBe("easySwim");
    fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
    expect(edit).toHaveBeenCalledWith(workout, "week-04", 0);
    view.rerender(<MobilePlanContent embedded currentWeek={week} weekLabel="W2" goalDiscipline="bike" />);
    expandDays();
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
        goalDate={new Date(today + 25 * 86400000)}
        daysLeft={25}
        onEditWorkout={edit}
        weekActionsSlot={<button type="button">ICS</button>}
      />,
    );

    // 목표는 한 줄 링크(이름 · D-N · 목표 ›)로만 남고, 진행률·부하 비교·목표 관리 동작은 목표 탭에 둔다.
    const goal = screen.getByTestId("K4-2");
    expect(goal).toHaveAttribute("href", "/ko/coach/goals?sport=bike");
    expect(screen.getByTestId("K4-2-1")).toHaveTextContent("비앙키그란폰도춘천");
    expect(goal).toHaveTextContent("D−25");
    expect(goal).toHaveTextContent("목표 ›");
    expect(screen.queryByText("목표기간 부하 비교")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { name: "진행률" })).not.toBeInTheDocument();
    // 계획 관리(⋯)·추가는 이번 주 머리 오른쪽에 둔다.
    expect(document.querySelector(".mobile-plan-week-header")).toContainElement(screen.getByRole("button", { name: "ICS" }));
    const todayCard = screen.getByTestId("K4-5m-2");
    expect(todayCard).toHaveTextContent("오늘 ·");
    expect(todayCard).toHaveTextContent("75 분");
    expect(todayCard).toHaveTextContent("60 TSS");
    expect(screen.getByRole("group", { name: "주간 선택" })).toHaveTextContent("이번 주");
    // 요일 줄은 한 줄(요일·날짜 | 막대 | 운동명 | 상태)로 접혀 있고, 누르면 종목·강도·비교 근거가 펼쳐진다.
    const row = document.querySelector<HTMLButtonElement>(".mobile-plan-day-row")!;
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveTextContent("오늘");
    expect(screen.queryByText("가벼움")).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.getByText("사이클")).toBeInTheDocument();
    expect(screen.getByText("가벼움")).toBeInTheDocument();
    expect(screen.getByTestId("K4-7-1")).toHaveTextContent("완료 0/1 · 부하 60");
    // 오늘 카드 → 이번 주 → 목표 순서.
    expect(todayCard.compareDocumentPosition(screen.getByTestId("K4-7-1")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("K4-7-1").compareDocumentPosition(goal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
    expect(edit).toHaveBeenCalledWith(workout, "week-04", 0);
  });

  it("omits unassessed load and unsupported CTL while preserving planned duration", () => {
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, plannedTSS: 0, plannedDurationMin: 30 }] }} weekLabel="이번 주" goalTitle="30분 달리기" totalTSS={0} projectedCTL={8} remainingSessions={4} weeksLeft={2} />);
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.queryByText("CTL")).not.toBeInTheDocument();
    expect(screen.getByText("30 분")).toBeInTheDocument();
    expect(screen.queryByText("4 회")).not.toBeInTheDocument();
    expect(screen.queryByText("2 주")).not.toBeInTheDocument();
    expect(screen.queryByText("0 TSS")).not.toBeInTheDocument();
  });

  it("does not present a completed workout as the next action", () => {
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, completed: true }] }} weekLabel="이번 주" goalTitle="목표" />);
    expect(screen.queryByTestId("K4-5m-2")).not.toBeInTheDocument();
  });

  it("shows the next scheduled workout when today is a rest day", () => {
    const edit = vi.fn();
    const nextDay = { ...workout, date: today + 86_400_000, dayOfWeek: 2 as const };
    renderWithProviders(
      <MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, workout: "rest" }, nextDay] }} weekLabel="이번 주" onEditWorkout={edit} />,
    );
    expect(screen.getByTestId("K4-5m-2")).toHaveTextContent("다음 ·");
    fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
    expect(edit).toHaveBeenCalledWith(nextDay, "week-04", 1);
  });

  it("shows the adjusted workout duration without offering an edit action in an embedded plan", () => {
    const adjustedDay = { ...workout, adjustedTSS: 48, adjustedDurationMin: 58 };
    renderWithProviders(<MobilePlanContent embedded currentWeek={{ ...week, days: [adjustedDay] }} weekLabel="이번 주" />);

    expect(screen.getByTestId("K4-5m-2")).toHaveTextContent("58 분");
    expect(screen.getByTestId("K4-5m-2")).toHaveTextContent("48 TSS");
    expect(screen.queryByRole("button", { name: "편집" })).not.toBeInTheDocument();
    expect(screen.getByTestId("K4-7-1")).toHaveTextContent("부하 48");
  });

  it("excludes skipped workouts from all weekly load, time, and session figures", () => {
    const skippedDay = { ...workout, skipped: true };
    const scheduledDay = { ...workout, date: today + 86_400_000, dayOfWeek: 2 as const,
      adjustedTSS: 40, adjustedDurationMin: 45 };
    renderWithProviders(<MobilePlanContent embedded currentWeek={{ ...week, days: [skippedDay, scheduledDay] }} weekLabel="이번 주" />);

    expect(screen.getByTestId("K4-7-1")).toHaveTextContent("완료 0/1 · 부하 40");
    expect(screen.getByTestId("K4-5m-2")).toHaveTextContent("다음 ·");
  });

  it("sums every sport's stored plan load into the single week line", () => {
    const runDay = { ...workout, date: today + 86_400_000, workout: "easyRun" as const, plannedTSS: 30 };
    renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [{ ...workout, completed: true, executionStatus: "completed", actualActivityId: "ride", matchMethod: "manual", matchConfidence: "manual" } as PlanDay, runDay] }} weekLabel="이번 주" />);
    expect(screen.getByTestId("K4-7-1")).toHaveTextContent("완료 1/2 · 부하 90");
    expect(document.querySelector(".mobile-plan-sport-bar")).toBeNull();
  });

  it("keeps the legacy embedded earlier-day expansion", () => {
    const priorDay = { ...workout, date: today - 86_400_000, workout: "rest" as const };
    renderWithProviders(<MobilePlanContent embedded currentWeek={{ ...week, days: [priorDay, workout] }} weekLabel="이번 주" />);
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
  fireEvent.click(screen.getAllByRole('button', { name: "편집" }).at(-1)!);
  expect(edit).toHaveBeenCalledWith(friday, week.id, 0);
  expect(screen.getByText('토')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^월 16 / })).not.toBeInTheDocument();
});


it("keeps the whole seven-day web week in place without a height-changing past-days toggle", () => {
  const priorDay = { ...workout, date: today - 86400000, workout: "rest" as const };
  renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [priorDay, workout] }} weekLabel="이번 주" />);
  expect(screen.getByText("휴식일")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /지난 .*일 보기/ })).not.toBeInTheDocument();
  expect(screen.getByTestId("K4-5m-2")).toHaveTextContent("오늘 ·");
});


it("uses saved evidence labels instead of treating partial and manual completion mirrors as confirmed done",()=>{
  const days=[{...workout,completed:true,executionStatus:"partial"},{...workout,completed:true},{...workout,actualActivityId:"candidate",matchMethod:"legacy-time-window",matchConfidence:"probable"},{...workout,executionStatus:"postponed",postponedToLocalDate:"2026-11-01"}];
  renderWithProviders(<MobilePlanContent currentWeek={{...week,days:days as PlanDay[]}} weekLabel="이번 주" nextAction={null}/>);
  expect(screen.queryByText("부분 완료로 기록됨")).not.toBeInTheDocument();
  expandDays();
  expect(screen.getByText("부분 완료로 기록됨")).toBeInTheDocument();
  expect(screen.getByText("완료 표시 · 연결 근거 확인 필요")).toBeInTheDocument();
  expect(screen.getByText("추정 연결 후보 · 확인 필요")).toBeInTheDocument();
  expect(screen.getByText("연기로 기록됨")).toBeInTheDocument();
  expect(screen.queryByText("✓")).not.toBeInTheDocument();
});


it.each(["completed", "skipped", "postponed", "partial"])("uses saved %s before false mirrors in its standalone next-card fallback", status => {
  const closed = { ...workout, executionStatus: status } as PlanDay;
  const pending = { ...workout, date: today + 86400000, workout: "tempo" as const };
  const edit = vi.fn();
  renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [closed, pending] }} weekLabel="이번 주" onEditWorkout={edit} />);
  fireEvent.click(screen.getAllByRole("button", { name: "편집" })[0]);
  expect(edit).toHaveBeenCalledExactlyOnceWith(pending, week.id, 1);
});

it("오늘 카드의 편집은 머리 오른쪽 작은 글자 버튼이고 요일 줄은 펼친 뒤 편집한다", () => {
  const edit = vi.fn();
  renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="이번 주" onEditWorkout={edit} />);
  const buttons = screen.getAllByRole("button", { name: "편집" });
  expect(buttons).toHaveLength(1);
  expect(screen.getByTestId("K4-5m-2").querySelector(".mobile-plan-today__head")).toContainElement(buttons[0]!);
  fireEvent.click(buttons[0]!);
  expect(edit).toHaveBeenCalledWith(workout, "week-04", 0);
  const row = document.querySelector<HTMLButtonElement>(".mobile-plan-day-row")!;
  fireEvent.click(row);
  expect(edit).toHaveBeenCalledTimes(1);
  expect(row).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getAllByRole("button", { name: "편집" })[1]!);
  expect(edit).toHaveBeenCalledTimes(2);
});

it("결정·제안 슬롯은 오늘 카드 안, 비교 슬롯은 이번 주 아래·목표 위에 둔다", () => {
  renderWithProviders(<MobilePlanContent currentWeek={week} weekLabel="이번 주" goalTitle="목표" decisionSlot={<p>결정 한 줄</p>} comparisonSlot={<p>계획 대비 기록 줄</p>} />);
  expect(screen.getByTestId("K4-5m-2")).toContainElement(screen.getByText("결정 한 줄"));
  const comparison = screen.getByText("계획 대비 기록 줄");
  expect(screen.getByTestId("K4-7-1").compareDocumentPosition(comparison) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(comparison.compareDocumentPosition(screen.getByTestId("K4-2")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("이번 주 부하와 오늘 카드는 처방 부하만 쓴다 — 완료한 날의 실측 부하를 섞지 않는다", () => {
  const done = { ...workout, completed: true, actualTSS: 100, executionStatus: "completed", actualActivityId: "ride", matchMethod: "manual", matchConfidence: "manual" } as PlanDay;
  const next = { ...workout, date: today + 86_400_000, plannedTSS: 40, adjustedTSS: 30 };
  renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [done, next] }} weekLabel="이번 주" />);
  expect(screen.getByTestId("K4-7-1")).toHaveTextContent("부하 90");
  expect(screen.getByTestId("K4-5m-2")).toHaveTextContent("30 TSS");
});

it("펼친 요일에는 저장된 연결 활동과 후보 활동으로 가는 링크를 둔다", () => {
  const linked = { ...workout, completed: true, executionStatus: "completed", actualActivityId: "linked-ride", matchMethod: "manual", matchConfidence: "manual" } as PlanDay;
  const candidate = { ...workout, date: today + 86_400_000, actualActivityId: "candidate-ride", matchMethod: "legacy-time-window", matchConfidence: "probable" } as PlanDay;
  renderWithProviders(<MobilePlanContent currentWeek={{ ...week, days: [linked, candidate] }} weekLabel="이번 주" loadState="ready" dayLoads={new Map()} />);
  expect(screen.queryAllByTestId("K4-5-5")).toHaveLength(0);
  expandDays();
  const hrefs = screen.getAllByTestId("K4-5-5").map(link => link.getAttribute("href"));
  expect(hrefs.some(href => href?.endsWith("/activity/linked-ride"))).toBe(true);
  expect(hrefs.some(href => href?.endsWith("/activity/candidate-ride"))).toBe(true);
});
