import userEvent from "@testing-library/user-event";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanModel } from "../../../hooks/usePlanModel";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import PlanPresentation from "./PlanPresentation";
import MobilePlanPage from "../../../components/mobile/MobilePlanPage";

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
    expect(screen.getByText(/계획 180 · 실제/)).toBeInTheDocument();
  });

  it("omits unsupported fitness forecasts and empty course metrics for a time-based running goal", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    const runModel = { ...model, discipline: "run", totalTSS: 0, completedTSS: 0,
      goal: { ...model.goal, title: "30분 달리기", courseDist: 0, courseElev: 0, targetDurationMin: 30, snapshot: { ctl: 50 } },
    } as unknown as PlanModel;
    renderWithProviders(<PlanPresentation model={runModel} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.queryByText("CTL 변화 가이드")).not.toBeInTheDocument();
    expect(screen.queryByText("≈+9")).not.toBeInTheDocument();
    expect(screen.queryByText(/이동거리 0.0/)).not.toBeInTheDocument();
    expect(screen.queryByText("완료 TSS")).not.toBeInTheDocument();
    expect(screen.getByText("목표시간")).toBeInTheDocument();
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
    expect(screen.getByText("전체 계획 미완료")).toBeInTheDocument();
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
  it.each([85, 0])("확정 연결에 저장된 %s TSS를 정본 일별 부하로 대신 사용하지 않는다", actual => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()}));
    const date = Date.now();
    const adjusted = {...model, weeks: [{id: "week-01", weekNumber: 1, phase: "build", startDate: date, plannedTSS: 100, days: [{date, dayOfWeek: 0, workout: "z2", plannedTSS: 100, adjustedTSS: 85, actualTSS: actual, actualActivityId: "saved-ride", matchMethod: "explicit-start", matchConfidence: "exact", completed: true, plannedDurationMin: 60}]}]} as unknown as PlanModel;
    renderWithProviders(<PlanPresentation model={adjusted} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
    expect(screen.getByText("계획 85 · 실제 미확인 TSS")).toBeInTheDocument();
    expect(screen.getByText("달성 — · 차이 — TSS")).toBeInTheDocument();
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
  renderWithProviders(<PlanPresentation model={{ ...model, goalDate: new Date(date), weeks: [{ id: "truth-week", weekNumber: 1, phase: "taper", startDate: date, days: [goal, { ...goal, date: date + 7 * 86400000 }] }] } as unknown as PlanModel}
    mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
  const calendar = within(screen.getByTestId(mobile ? "K4-5m" : "K4-5"));
  expect(calendar.getAllByText("목표일")).toHaveLength(1);
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
  const scoped = { ...model, goalDate: new Date("2026-10-18T00:00:00+09:00"), daysLeft: 1,
    weeks: [{ id: "after", weekNumber: 1, phase: "base", startDate: date, plannedTSS: 30, days: [day] }] } as unknown as PlanModel;
  renderWithProviders(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
  expect(screen.getByTestId("plan-scope-notice")).toHaveTextContent("목표일까지 예정 0회 · 목표일 이후 저장된 운동 1회");
  expect(screen.getByText("목표일 이후 저장된 운동")).toBeInTheDocument();
  expect(screen.getByTestId(mobile ? "K4-5m" : "K4-5")).toHaveTextContent("45");
});

it.each([false, true])("keeps elapsed goal dates signed without changing plan progress (mobile=%s)", mobile => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query === "(max-width: 1023px)", media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-22T12:00:00+09:00"));
  const scoped = { ...model, goalDate: new Date("2026-10-18T00:00:00+09:00"), daysLeft: 0 } as unknown as PlanModel;
  renderWithProviders(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />);
  expect(screen.getByText("D+4")).toBeInTheDocument();
  expect(scoped.daysLeft).toBe(0);
  expect(scoped.progress).toBe(25);
});


it("normal mobile keeps the next future week's precise edit target when returning from a past record", () => {
  vi.spyOn(window,"matchMedia").mockImplementation(query=>({matches:query==="(max-width: 1023px)",media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
  const current=Date.now(),past=current-7*86400000,future=current+7*86400000;
  const day={date:current,dayOfWeek:0,workout:"z2",plannedTSS:30,plannedDurationMin:45,completed:true,skipped:false};
  const futureDay={...day,date:future,completed:false};
  const scoped={...model,weeks:[{id:"past",weekNumber:1,phase:"base",startDate:past,plannedTSS:30,days:[{...day,date:past}]},{id:"current",weekNumber:2,phase:"base",startDate:current,plannedTSS:30,days:[day]},{id:"future",weekNumber:3,phase:"base",startDate:future,plannedTSS:30,days:[{...futureDay,workout:"rest"},futureDay]}],isTodayCell:(value:{date:number})=>value.date===current} as unknown as PlanModel;
  const edit=vi.fn();
  const renderMobile=(props: import("./MobilePlanContent").MobilePlanContentProps)=><MobilePlanPage {...props}/>;
  const view=renderWithProviders(<PlanPresentation model={scoped} selectedDate={new Date(past+9*3600000).toISOString().slice(0,10)} mobileWeekOffset={-1} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit} renderMobile={renderMobile}/>);
  view.rerender(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit} renderMobile={renderMobile}/>);
  fireEvent.click(screen.getAllByRole("button",{name:"편집"})[0]);
  expect(edit).toHaveBeenCalledWith(futureDay,"future",1);
  view.rerender(<PlanPresentation model={scoped} embedded mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()}/>);
  expect(screen.queryByText("다음 운동")).not.toBeInTheDocument();
});

it("desktop day cells distinguish saved partial, manual completion, probable linkage and postponement", () => {
  vi.spyOn(window,"matchMedia").mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
  const date=Date.now()-7*86400000;
  const base={date,dayOfWeek:0,workout:"z2",plannedTSS:30,plannedDurationMin:45,completed:true,actualTSS:30};
  const scoped={...model,weeks:[{id:"saved",weekNumber:1,phase:"base",startDate:date,plannedTSS:120,days:[{...base,executionStatus:"partial"},{...base},{...base,completed:false,actualActivityId:"candidate",matchConfidence:"probable",matchMethod:"legacy-time-window"},{...base,completed:false,executionStatus:"postponed",postponedToLocalDate:"2026-11-01"}]}]} as unknown as PlanModel;
  renderWithProviders(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()}/>);
  expect(screen.getByText("부분 완료로 기록됨")).toBeInTheDocument();
  expect(screen.getByText("완료 표시 · 연결 근거 확인 필요")).toBeInTheDocument();
  expect(screen.getByText("추정 연결 후보 · 확인 필요")).toBeInTheDocument();
  expect(screen.getByText("연기로 기록됨")).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"연결 후보 활동 보기"})).toHaveAttribute("href",expect.stringContaining("/activity/candidate"));
  expect(screen.queryByText("100%")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("미완료")).not.toBeInTheDocument();
});


it.each([false, true].flatMap(mobile => [0, 1].flatMap(offset =>
  ["completed", "skipped", "postponed", "partial"].map(status => ({ mobile, offset, status })),
)))("selects the next pending occurrence past saved $status with false mirrors (mobile=$mobile, futureOffset=$offset)", ({ mobile, offset, status }) => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query === "(max-width: 1023px)", media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const date = Date.now() + offset * 86400000;
  const closed = { date, dayOfWeek: 0, workout: "z2", plannedTSS: 30, plannedDurationMin: 45,
    completed: false, skipped: false, executionStatus: status, ...(status === "postponed" ? { postponedToLocalDate: "2027-01-01" } : {}) };
  const pending = { date: date + 86400000, dayOfWeek: 1, workout: "tempo", plannedTSS: 40, plannedDurationMin: 60, completed: false, skipped: false };
  const scoped = { ...model, weeks: [{ id: "outcome-week", weekNumber: 1, phase: "base", startDate: date, plannedTSS: 70, days: [closed, pending] }],
    isTodayCell: (day: { date: number }) => day.date === date && offset === 0 } as unknown as PlanModel;
  const edit = vi.fn();
  renderWithProviders(<PlanPresentation model={scoped} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} onEditWorkout={edit}
    renderMobile={props => <MobilePlanPage {...props} />} />);
  fireEvent.click(mobile ? within(screen.getByTestId("K4-5m-2")).getByRole("button", { name: "편집" }) : screen.getByRole("button", { name: "운동 상세" }));
  expect(edit).toHaveBeenCalledExactlyOnceWith(pending, "outcome-week", 1);
  expect(closed.completed).toBe(false);
  expect(closed.executionStatus).toBe(status);
});
