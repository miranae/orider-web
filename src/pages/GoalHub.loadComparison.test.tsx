import { screen } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import type { Goal, PlanWeek } from "@shared/types/goal";
import GoalHub from "./GoalHub";
import { usePlanLoadComparison } from "../features/training/plan/usePlanLoadComparison";

const fixture = vi.hoisted(() => ({ loading: false, freshLoaded: true, loadError: null as Error | null, matches: true }));
const goal = { id: "goal-load", title: "Training goal", discipline: "bike", status: "active", targetDate: Date.parse("2026-10-18T00:00:00+09:00"), eventDate: Date.parse("2026-10-25T00:00:00+09:00") } as Goal;
const weeks = [{ days: [{ date: Date.parse("2026-08-17T00:00:00+09:00"), workout: "z2", plannedTSS: 250 }] }] as PlanWeek[];
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => ({ user: { uid: "owner" }, goal, discipline: "bike", weeks, goalMatchesDiscipline: fixture.matches, loading: fixture.loading, freshLoaded: fixture.freshLoaded, loadError: fixture.loadError, retryLoad: vi.fn() }) }));
vi.mock("../features/training/plan/usePlanLoadComparison", () => ({ usePlanLoadComparison: vi.fn(() => ({ state: "ready", summary: { plannedTss: 250, actualTss: 400, ratioPct: 160, deltaTss: 150, unknownCount: 0, estimated: false }, days: [], retry: vi.fn() })) }));
vi.mock("./ClimbGoalSetupPage", () => ({ default: () => <div>climb form</div> }));
beforeEach(() => {
  fixture.loading = false; fixture.freshLoaded = true; fixture.loadError = null; fixture.matches = true;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-23T12:00:00+09:00"));
});
afterEach(() => vi.useRealTimers());

it.each([false, true])("shows goal-period actual load and expiry on the goal tab (mobile=%s)", mobile => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query.includes("max-width"), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  renderWithProviders(<GoalHub wizard={<div />} />, { authenticated: true, user: { uid: "owner" }, route: "/ko/coach/goals?sport=bike" });
  const summary = screen.getByRole("region", { name: "목표기간 훈련 부하" });
  expect(summary).toHaveTextContent("2026-08-17 ~ 2026-10-18");
  expect(summary).toHaveTextContent("250TSS"); expect(summary).toHaveTextContent("400TSS");
  expect(summary).toHaveTextContent("160%"); expect(summary).toHaveTextContent("+150TSS");
  expect(screen.getByTestId("K3-1-1")).toHaveTextContent("목표일 경과");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(usePlanLoadComparison).toHaveBeenLastCalledWith(expect.objectContaining({ uid: "owner", enabled: true, range: { start: "2026-08-17", end: "2026-10-18" } }));
  expect(goal.status).toBe("active");
});

it.each(["loading", "cached", "error", "sport-mismatch"])("does not query or show exact load before goal identity is confirmed: %s", phase => {
  fixture.loading = phase === "loading"; fixture.freshLoaded = phase !== "cached"; fixture.loadError = phase === "error" ? new Error("offline") : null; fixture.matches = phase !== "sport-mismatch";
  renderWithProviders(<GoalHub wizard={<div />} />, { authenticated: true, user: { uid: "owner" } });
  expect(screen.queryByRole("region", { name: "목표기간 훈련 부하" })).not.toBeInTheDocument();
  expect(screen.queryByText("160")).not.toBeInTheDocument();
  expect(usePlanLoadComparison).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});
