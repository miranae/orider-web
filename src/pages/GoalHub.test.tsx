import i18n from "i18next";
import enTraining from "../i18n/resources/en/training.json";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData } from "../__tests__/mocks/firebase";
import GoalHub from "./GoalHub";
import { auth } from "../services/firebase";
import { __resetDailyActivitiesEnsureForTests } from "../hooks/usePlanDailyActivities";
const state = vi.hoisted(() => ({ goal: null as null | Record<string, unknown>, sport: "bike", user: { uid: "owner" } as { uid: string; isAnonymous?: boolean } | null,
  weeks: [] as unknown[], totalTSS: 0 }));
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => ({ user: state.user, goal: state.goal, discipline: state.sport, loading: false, loadError: null, weeks: state.weeks, totalTSS: state.totalTSS, goalMatchesDiscipline: true, daysLeft: 30, goalDate: new Date("2026-12-01"), retryLoad: vi.fn() }) }));
const todayKey = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const todayMs = Date.parse(`${todayKey}T00:00:00+09:00`);
/** 오늘 하루짜리 계획(계획 TSS 100)과 그달 일별 활동 문서(실제 12 TSS). */
function seedActualPlan() {
  state.weeks = [{ id: "w1", weekNumber: 1, phase: "base", startDate: todayMs, plannedTSS: 100,
    days: [{ date: todayMs, dayOfWeek: 0, workout: "z2", plannedTSS: 100, plannedDurationMin: 60, completed: false, skipped: false }] }];
  state.totalTSS = 100;
  setDocData(`users/owner/daily_activities/bike_${todayKey.slice(0, 7)}`, { uid: "owner", discipline: "bike", month: todayKey.slice(0, 7), timezone: "Asia/Seoul",
    schemaVersion: 1, ftp: 250, complete: true, updatedAt: 1, dayAsOf: {},
    days: { [todayKey]: { tss: 12, tssEstimated: false, activities: [{ id: "a", startTime: todayMs + 3_600_000, distance: 10000, movingSec: 1800, tss: 12, estimated: false, source: "orider" }] } } });
}
vi.mock("./ClimbGoalSetupPage", () => ({ default: () => <div>climb form</div> }));
beforeEach(() => { state.goal = null; state.sport = "bike"; state.user = { uid: "owner" }; state.weeks = []; state.totalTSS = 0; __resetDailyActivitiesEnsureForTests();
  (auth as { currentUser: unknown }).currentUser = { uid: "owner" }; });
describe("goal hub", () => {
  it("shows the existing goal before type selection and opens the wizard only after choosing", () => {
    state.goal = { id: "g", title: "Winter course", courseName: "Course", eventType: "completion" };
    seedActualPlan();
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: "/ko/coach/goals?sport=bike" });
    expect(screen.getByTestId("K3-1-1")).toHaveTextContent("Winter course");
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("계획진행률12%");
    expect(screen.getByRole("progressbar", { name: "목표 진행률" })).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByRole("button", { name: "목표 포기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계획 보기 →" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike");
    expect(screen.queryByText("event wizard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대회·코스 완주" }));
    expect(screen.getByText("event wizard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Winter course");
  });
  it("shows server goal-day projection only when its goal identity matches", async () => {
    state.goal = { id: "g", title: "Projection goal", eventType: "completion" };
    setDocData("users/owner/fitness/projection_bike", { goalId: "g", discipline: "bike", goalDay: { ctl: 42, tsb: 5 } });
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(await screen.findByText(/목표일 예상/)).toHaveTextContent("목표일 예상 · CTL 42.0 · TSB 5.0");
  });
  it("offers run race and program routes without a bike wizard", () => {
    state.sport = "run";
    renderWithProviders(<GoalHub wizard={<div>run wizard</div>} />, { route: "/ko/coach/goals?sport=run&new=1" });
    expect(screen.getByRole("button", { name: "러닝 대회" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30분 달리기 프로그램" })).toHaveAttribute("href", "/ko/coach/plan?sport=run");
    expect(screen.queryByRole("button", { name: "대회·코스 완주" })).not.toBeInTheDocument();
  });
  it("offers one current-program plan link and disables swimming without changing saved goals", () => {
    state.sport = "run";
    state.goal = { id: "run", title: "30분 달리기", runProgram: { week: 1 } };
    renderWithProviders(<GoalHub wizard={<div>run wizard</div>} />);
    expect(screen.getAllByRole("link", { name: "계획 보기 →" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "30분 달리기 프로그램" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "수영 · 준비 중" })).toBeDisabled();
    expect(state.goal.runProgram).toEqual({ week: 1 });
  });
  it("requires sign-in for anonymous identities before type selection", () => {
    state.user = { uid: "anonymous", isAnonymous: true };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-2-5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대회·코스 완주" })).not.toBeInTheDocument();
  });
  it("keeps guests out of the type picker and wizard", () => {
    state.user = null;
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-2-5")).toBeInTheDocument();
    expect(screen.queryByTestId("K3-2")).not.toBeInTheDocument();
  });
});


it.each(['ko', 'en'])('uses the active %s UI locale for the saved target date', async locale => {
  const previous = i18n.language;
  i18n.addResourceBundle('en', 'training', enTraining, true, true);
  const expectedDate = new Date('2026-12-01').toLocaleDateString(locale);
  const format = vi.spyOn(Date.prototype, 'toLocaleDateString');
  try {
    await i18n.changeLanguage(locale);
    state.goal = { id: 'localized-date', title: 'Locale goal', eventType: 'completion' };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: `/${locale}/coach/goals?sport=bike` });
    expect(screen.getByTestId('K3-1-1')).toHaveTextContent(expectedDate);
    expect(format).toHaveBeenCalledWith(locale);
  } finally { format.mockRestore(); await i18n.changeLanguage(previous); }
});

describe("goal hub progress", () => {
  it("clamps the bar over 100% while keeping the actual percentage in text", () => {
    state.goal = { id: "g", title: "Over plan", eventType: "completion" };
    seedActualPlan();
    state.totalTSS = 8; // 실제 12 ÷ 계획 8 = 150%
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("계획진행률150%");
    const bar = screen.getByRole("progressbar", { name: "목표 진행률" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "150%");
    expect(bar.firstElementChild).toHaveStyle({ width: "100%" });
  });

  it("uses the plan screen's actual-load progress and shows a dash until it is known", () => {
    state.goal = { id: "g", title: "No plan yet", eventType: "completion" };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("계획진행률—");
    expect(screen.getByRole("progressbar", { name: "목표 진행률" })).not.toHaveAttribute("aria-valuenow");
  });
});
