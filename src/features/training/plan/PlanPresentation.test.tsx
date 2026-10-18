import userEvent from "@testing-library/user-event";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanModel } from "../../../hooks/usePlanModel";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import PlanPresentation from "./PlanPresentation";
import { mockCallableInvocations, setCallableImplementation, setDocData } from "../../../__tests__/mocks/firebase";
import { onSnapshot } from "firebase/firestore";
import { __resetDailyActivitiesEnsureForTests } from "../../../hooks/usePlanDailyActivities";

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
  weeksLeft: 3,
  isTodayCell: () => false,
} as unknown as PlanModel;

afterEach(() => { vi.restoreAllMocks(); __resetDailyActivitiesEnsureForTests(); });

const kstKey = (ms: number) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
/** 계획 날짜들이 걸친 달마다 완성된 일별 활동 문서를 둔다. */
function seedDailyDocs(discipline: string, keys: string[], days: Record<string, unknown> = {}) {
  for (const month of new Set(keys.map(key => key.slice(0, 7)))) {
    setDocData(`users/me/daily_activities/${discipline}_${month}`, {
      uid: "me", discipline, month, timezone: "Asia/Seoul", schemaVersion: 1, ftp: 250, complete: true, updatedAt: 1, dayAsOf: {},
      days: Object.fromEntries(Object.entries(days).filter(([key]) => key.startsWith(month))),
    });
  }
}

describe("PlanPresentation responsive layout", () => {
  it("passes the scoped goal discipline through embedded and standalone mobile presentation", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(max-width: 1023px)", media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    const scopedModel = { ...model, discipline: "bike", goal: { ...model.goal, discipline: "run" } } as unknown as PlanModel;
    const mobile = vi.fn((props) => <div>{props.goalDiscipline}</div>);
    const view = renderWithProviders(<PlanPresentation model={scopedModel} embedded mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} renderMobile={mobile} />);
    expect(screen.getByText("run")).toBeInTheDocument();
    view.rerender(<PlanPresentation model={{ ...scopedModel, goal: { ...scopedModel.goal, discipline: "swim" } } as unknown as PlanModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} renderMobile={mobile} />);
    expect(screen.getByText("swim")).toBeInTheDocument();
  });

  it("unfolds the past desktop week and highlights the date linked from the log", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    const currentDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const current = Date.parse(`${currentDate}T00:00:00+09:00`);
    const past = current - 7 * 86400000;
    const selectedDate = new Date(past + 9 * 3600000).toISOString().slice(0, 10);
    const day = { date: current, dayOfWeek: 0, workout: "z2", plannedTSS: 20, plannedDurationMin: 30, completed: false, skipped: false };
    const scoped = { ...model, weeks: [{ id: "past", weekNumber: 1, phase: "base", startDate: past, plannedTSS: 20, days: [{ ...day, date: past }] },
      { id: "current", weekNumber: 2, phase: "base", startDate: current, plannedTSS: 20, days: [day] }],
      isTodayCell: (value: { date: number }) => value.date === current } as unknown as PlanModel;
    renderWithProviders(<PlanPresentation model={scoped} selectedDate={selectedDate} mobileWeekOffset={-1} onMobileWeekOffsetChange={vi.fn()} />);
    expect(await screen.findByTestId("K4-5-6")).toHaveAttribute("data-plan-date", selectedDate);
    expect(screen.getByTestId("K4-5-6")).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId("K4-5-4")).toHaveAttribute("aria-expanded", "true");
  });

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
    expect(screen.queryByText("108.0km")).not.toBeInTheDocument();
    expect(screen.getByText("240 분")).toBeInTheDocument();
    expect(screen.getByText("180 TSS")).toHaveStyle({ whiteSpace: "nowrap" });
  });

  it("omits unsupported fitness forecasts and empty course metrics for a time-based running goal", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    const runModel = { ...model, discipline: "run", totalTSS: 0,
      goal: { ...model.goal, title: "30분 달리기", courseDist: 0, courseElev: 0, targetDurationMin: 30, snapshot: { ctl: 50 } },
    } as unknown as PlanModel;
    renderWithProviders(<PlanPresentation model={runModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.queryByText("CTL 변화 가이드")).not.toBeInTheDocument();
    expect(screen.queryByText("≈+9")).not.toBeInTheDocument();
    expect(screen.queryByText(/이동거리 0.0/)).not.toBeInTheDocument();
    expect(screen.queryByText("완료 TSS")).not.toBeInTheDocument();
    expect(screen.getByText("목표시간")).toBeInTheDocument();
  });

  it("starts the desktop calendar at the current week while keeping past weeks accessible", async () => {
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
    const pastKey = kstKey(today - 7 * 86_400_000);
    seedDailyDocs("bike", [pastKey, kstKey(today)], { [pastKey]: { tss: 50, tssEstimated: false, activities: [{ id: "past-ride", startTime: today - 7 * 86_400_000, distance: 20000, movingSec: 3600, tss: 50, estimated: false, source: "orider" }] } });
    renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, weeks, isTodayCell: (candidate: { date: number }) => candidate.date === today } as unknown as PlanModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit} />);
    // 진행률 = 실제 부하 50 / 계획 TSS 200
    expect(await screen.findByText("25%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "진행률" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("남은 계획 운동")).toBeInTheDocument();
    expect(screen.getByText("오늘의 다음 운동")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "운동 상세" }));
    expect(edit).toHaveBeenCalledWith(day, "week-02", 0);
    expect(screen.getByText("W2")).toBeInTheDocument();
    expect(screen.queryByText("W1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지난 1주 보기" }));
    expect(screen.getByText("W1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지난 주 접기" }));
    expect(screen.queryByText("W1")).not.toBeInTheDocument();
  });
  it("계획 연결 판정(완료 체크·달성률·미완료 표식·연결 링크)을 날짜 칸에 보이지 않는다", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()}));
    const today = Date.parse(`${kstKey(Date.now())}T00:00:00+09:00`);
    const yesterday = today - 86_400_000;
    const linked = { date: today, dayOfWeek: 1, workout: "z2", plannedTSS: 100, adjustedTSS: 85, actualTSS: 85, completed: true, actualActivityId: "linked", plannedDurationMin: 60 };
    const missed = { date: yesterday, dayOfWeek: 0, workout: "z2", plannedTSS: 50, plannedDurationMin: 60, completed: false, skipped: false };
    seedDailyDocs("bike", [kstKey(yesterday), kstKey(today)]);
    const view = renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, totalTSS: 135,
      weeks: [{ id: "week-01", weekNumber: 1, phase: "build", startDate: yesterday, plannedTSS: 135, days: [missed, linked] }] } as unknown as PlanModel}
      mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(await screen.findByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K4-5-5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K4-5-14")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "미완료" })).not.toBeInTheDocument();
    expect(screen.queryByText("미완료")).not.toBeInTheDocument();
    // 활동 없는 지난 날은 계획만 흐리게 둔다.
    expect(view.container.querySelector(`[data-plan-date="${kstKey(yesterday)}"]`)).toHaveStyle({ opacity: "0.85" });
    expect(mockCallableInvocations).toHaveLength(0);
  });

});

it.each([false, true])("재계획의 현재 가정값과 역사적 시작값은 한 번만 표시한다 (mobile=%s)", mobile => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query === "(max-width: 1023px)",
    media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const sources = { ftpSource: "assumed", weightSource: "user" };
  const scoped = { ...model, goal: { ...model.goal, assumedBaseline: false, snapshot: { ftpSource: "user", weightSource: "user" }, planInputSources: sources } } as unknown as PlanModel;
  renderWithProviders(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} renderMobile={() => <div>plan</div>} />);
  expect(screen.getAllByTestId("goal-input-source")).toHaveLength(1);
  expect(screen.getByTestId("goal-input-source")).toHaveTextContent("가정값");
  expect(screen.getByTestId("goal-input-source").querySelector("a")).toHaveAttribute("href", expect.stringContaining("#thresholds"));
});

it("exposes a native per-date workout detail control without nesting glossary buttons", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const edit = vi.fn();
  const date = Date.now();
  const day = { date, dayOfWeek: 0, workout: "z2", plannedTSS: 50, plannedDurationMin: 60 };
  renderWithProviders(<PlanPresentation model={{ ...model, weeks: [{ id: "keyboard-week", weekNumber: 1, phase: "base", startDate: date, days: [day] }] } as unknown as PlanModel}
    mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit} />);
  const cell = screen.getByTestId("K4-5-1");
  const button = cell.querySelector('button[aria-label]') as HTMLButtonElement;
  expect(button).not.toBeNull();
  expect(button).toHaveAccessibleName(/상세/);
  expect(button.querySelector("button")).toBeNull();
  button.focus();
  expect(button).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(edit).toHaveBeenCalledExactlyOnceWith(day, "keyboard-week", 0);
});

it.each([false, true])("labels only the actual target date as goal day (mobile=%s)", mobile => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query === "(max-width: 1023px)", media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const date = Date.now() + 86400000;
  const goal = { date, dayOfWeek: 0, workout: "goal", plannedTSS: 0, plannedDurationMin: 0 };
  renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, goalDate: new Date(date), weeks: [{ id: "truth-week", weekNumber: 1, phase: "taper", startDate: date, days: [goal, { ...goal, date: date + 7 * 86400000 }] }] } as unknown as PlanModel}
    mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
  const calendar = within(screen.getByTestId(mobile ? "K4-5m" : "K4-5"));
  expect(calendar.getAllByText("목표일")).toHaveLength(mobile ? 2 : 1);
  expect(calendar.getByText("목표 운동")).toBeInTheDocument();
});


it('labels a non-Monday desktop week from its dates without changing edit identities', () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const date = Date.parse('2026-10-16T00:00:00+09:00');
  const day = { date, dayOfWeek: 0, workout: 'z2', plannedTSS: 30, plannedDurationMin: 45, completed: false, skipped: false };
  const edit = vi.fn();
  renderWithProviders(<PlanPresentation model={{ ...model, weeks: [{ id: 'friday-start', weekNumber: 1, phase: 'base', startDate: date, plannedTSS: 30, days: [day] }] } as unknown as PlanModel}
    mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit} />);
  const calendar = screen.getByTestId('K4-5');
  expect(calendar.firstElementChild).toHaveTextContent('주차금토일월화수목');
  expect(screen.getByText('금 10/16')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /2026-10-16.*상세/ }));
  expect(edit).toHaveBeenCalledWith(day, 'friday-start', 0);
});


it.each([false, true])("distinguishes post-goal stored workouts and keeps their calendar rows (mobile=%s)", mobile => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query === "(max-width: 1023px)", media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-17T12:00:00+09:00"));
  const date = Date.parse("2026-10-21T12:00:00+09:00");
  const day = { date, dayOfWeek: 2, workout: "z2", plannedTSS: 30, plannedDurationMin: 45, completed: false, skipped: false };
  const scoped = { ...model, user: { uid: "me" }, goalDate: new Date("2026-10-18T00:00:00+09:00"), daysLeft: 1,
    weeks: [{ id: "after", weekNumber: 1, phase: "base", startDate: date, plannedTSS: 30, days: [day] }] } as unknown as PlanModel;
  renderWithProviders(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
  expect(screen.getByTestId("plan-scope-notice")).toHaveTextContent("목표일까지 예정 0회 · 목표일 이후 저장된 운동 1회");
  expect(screen.getByText("목표일 이후 저장된 운동")).toBeInTheDocument();
  expect(screen.getByTestId(mobile ? "K4-5m" : "K4-5")).toHaveTextContent("45");
});

describe("PlanPresentation actual activities (server daily documents)", () => {
  const desktop = () => vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const today = () => Date.parse(`${kstKey(Date.now())}T00:00:00+09:00`);

  it("lists a rest day's activities with links, day/week/summary actual load, and keeps other sports out", async () => {
    desktop();
    const todayMs = today();
    const yesterday = todayMs - 86_400_000;
    const yesterdayKey = kstKey(yesterday);
    const rest = { date: yesterday, dayOfWeek: 0, workout: "rest", plannedTSS: 0, plannedDurationMin: 0, completed: false, skipped: false };
    const planned = { ...rest, date: todayMs, workout: "z2", plannedTSS: 60, plannedDurationMin: 60 };
    const activity = (id: string, tss: number, estimated = false) => ({ id, startTime: yesterday + 8 * 3600000, distance: 30000, movingSec: 3600, tss, estimated, source: "orider" });
    seedDailyDocs("bike", [yesterdayKey, kstKey(todayMs)], {
      [yesterdayKey]: { tss: 90, tssEstimated: true, activities: [activity("ride-1", 70), activity("ride-2", 20, true)] },
    });
    seedDailyDocs("run", [yesterdayKey, kstKey(todayMs)], { [yesterdayKey]: { tss: 40, tssEstimated: false, activities: [activity("run-1", 40)] } });
    const view = renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, totalTSS: 60,
      weeks: [{ id: "w1", weekNumber: 1, phase: "base", startDate: yesterday, plannedTSS: 60, days: [rest, planned] }],
      isTodayCell: (value: { date: number }) => value.date === todayMs } as unknown as PlanModel}
      mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={vi.fn()} />);

    const restCell = view.container.querySelector(`[data-plan-date="${yesterdayKey}"]`) as HTMLElement;
    const links = await within(restCell).findAllByTestId("K4-5-8");
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/ko/activity/ride-1", "/ko/activity/ride-2"]);
    expect(links[0]).toHaveTextContent("08:00 · 30.0km · 70 TSS");
    expect(links[1]).toHaveTextContent("20 TSS 추정");
    expect(within(restCell).getByTestId("K4-5-9")).toHaveTextContent("실제 90 TSS추정");
    expect(within(restCell).getByTestId("K4-5-14")).toHaveAccessibleName("운동한 날");
    expect(restCell).toHaveStyle({ opacity: "1" });
    expect(view.container.querySelector('a[href="/ko/activity/run-1"]')).toBeNull();
    expect(screen.getByTestId("K4-5-12")).toHaveTextContent("실제 90 추정");
    expect(screen.getByTestId("K4-2-5")).toHaveTextContent("90/ 60 추정");
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("keeps the plan visible with a small per-day notice when the month cannot be loaded", async () => {
    desktop();
    setCallableImplementation("ensureDailyActivities", async () => { throw new Error("internal"); });
    const todayMs = today();
    const day = { date: todayMs, dayOfWeek: 0, workout: "z2", plannedTSS: 60, plannedDurationMin: 60, completed: false, skipped: false };
    renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, weeks: [{ id: "w1", weekNumber: 1, phase: "base", startDate: todayMs, plannedTSS: 60, days: [day] }],
      isTodayCell: () => true } as unknown as PlanModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(await screen.findByTestId("K4-5-10")).toHaveTextContent("활동 확인 불가");
    expect(screen.getByTestId("K4-2-5")).toHaveTextContent("—");
    expect(screen.queryByTestId("K4-5-12")).not.toBeInTheDocument();
    expect(screen.getByText("60 TSS")).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "ensureDailyActivities")).toHaveLength(1);
  });

  it("does not subscribe when the goal does not match the sport tab", () => {
    desktop();
    vi.mocked(onSnapshot).mockClear();
    renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, goalMatchesDiscipline: false } as unknown as PlanModel}
      mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(vi.mocked(onSnapshot).mock.calls.filter(([ref]) => (ref as { path: string }).path.includes("daily_activities"))).toHaveLength(0);
    expect(mockCallableInvocations).toHaveLength(0);
    expect(screen.queryByTestId("K4-2-5")).not.toBeInTheDocument();
  });
});

describe("PlanPresentation review guards", () => {
  const desktop = () => vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const today = () => Date.parse(`${kstKey(Date.now())}T00:00:00+09:00`);

  it("leaves the next workout and remaining sessions empty until the daily documents are read", async () => {
    desktop();
    const todayMs = today();
    const day = { date: todayMs, dayOfWeek: 0, workout: "z2", plannedTSS: 60, plannedDurationMin: 60, completed: false, skipped: false };
    // 문서 없음 → ensure 응답 전까지 로딩
    let resolve: (value: unknown) => void = () => undefined;
    setCallableImplementation("ensureDailyActivities", () => new Promise(done => { resolve = done; }));
    renderWithProviders(<PlanPresentation model={{ ...model, user: { uid: "me" }, weeks: [{ id: "w1", weekNumber: 1, phase: "base", startDate: todayMs, plannedTSS: 60, days: [day] }],
      isTodayCell: () => true } as unknown as PlanModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.queryByText("오늘의 다음 운동")).not.toBeInTheDocument();
    expect(screen.getByText("남은 계획 운동").parentElement).toHaveTextContent("—");
    await waitFor(() => expect(mockCallableInvocations.some(call => call.name === "ensureDailyActivities")).toBe(true));
    await act(async () => { resolve({ data: { months: [] } }); });
    expect(await screen.findByText("오늘의 다음 운동")).toBeInTheDocument();
    expect(screen.getByText("남은 계획 운동").parentElement).toHaveTextContent("1");
  });

  it("does not suggest a recovery downshift on a day that already has an activity", async () => {
    desktop();
    const todayMs = today();
    const hard = { date: todayMs, dayOfWeek: 0, workout: "vo2", plannedTSS: 90, plannedDurationMin: 60, completed: false, skipped: false };
    const scoped = (withActivity: boolean) => {
      seedDailyDocs("bike", [kstKey(todayMs)], withActivity ? { [kstKey(todayMs)]: { tss: 80, tssEstimated: false, activities: [{ id: "done", startTime: todayMs + 3600000, distance: 30000, movingSec: 3600, tss: 80, estimated: false, source: "orider" }] } } : {});
      return { ...model, user: { uid: "me" }, currentTsb: -40, weeks: [{ id: "w1", weekNumber: 1, phase: "base", startDate: todayMs, plannedTSS: 90, days: [hard] }],
        isTodayCell: () => true } as unknown as PlanModel;
    };
    const view = renderWithProviders(<PlanPresentation model={scoped(false)} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    const cell = () => view.container.querySelector(`[data-plan-date="${kstKey(todayMs)}"]`) as HTMLElement;
    await waitFor(() => expect(cell().textContent).toMatch(/권장/));
    view.unmount();
    const withActivity = renderWithProviders(<PlanPresentation model={scoped(true)} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    const activityCell = withActivity.container.querySelector(`[data-plan-date="${kstKey(todayMs)}"]`) as HTMLElement;
    await within(activityCell).findByTestId("K4-5-8");
    expect(activityCell.textContent).not.toMatch(/권장/);
  });

  it("shows the next workout as before when daily activities are inactive (no signed-in uid)", () => {
    desktop();
    const todayMs = today();
    const day = { date: todayMs, dayOfWeek: 0, workout: "z2", plannedTSS: 60, plannedDurationMin: 60, completed: false, skipped: false };
    renderWithProviders(<PlanPresentation model={{ ...model, weeks: [{ id: "w1", weekNumber: 1, phase: "base", startDate: todayMs, plannedTSS: 60, days: [day] }],
      isTodayCell: () => true } as unknown as PlanModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.getByText("오늘의 다음 운동")).toBeInTheDocument();
  });
});
