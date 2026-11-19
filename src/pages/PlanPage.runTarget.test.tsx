import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanPage from "./PlanPage";
import TrainingLogPage from "./TrainingLogPage";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { mockCallableInvocations } from "../__tests__/mocks/firebase";
const model = vi.hoisted(() => ({ value: {} as Record<string, unknown>, mobile: false, sport: vi.fn() }));
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: (sport: string) => { model.sport(sport); return model.value; } }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => model.mobile }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("../features/training/plan/PlanPresentation", () => ({ default: ({ mobileWeekOffset, onMobileWeekOffsetChange, onEditWorkout }: { mobileWeekOffset: number; onMobileWeekOffsetChange: (offset: number) => void; onEditWorkout: (day: unknown, week: string, index: number) => void }) => <div data-testid="plan-presentation" data-week-offset={mobileWeekOffset}><button onClick={() => onEditWorkout({date: Date.parse("2026-10-02T00:00:00+09:00"), workout: "z2"}, "week-next", 0)}>Review next workout</button><button onClick={() => onMobileWeekOffsetChange(mobileWeekOffset - 1)}>Previous plan week</button><button onClick={() => onMobileWeekOffsetChange(mobileWeekOffset + 1)}>Next plan week</button></div> }));
vi.mock("../features/trainingDecision/TodayTrainingDecisionCard", () => ({ default: () => null }));
vi.mock("../components/training/WorkoutEditModal", () => ({ default: ({ onClose }: { onClose: () => void }) => <div data-testid="workout-editor"><button onClick={onClose}>Close review</button></div> }));
const date = Date.parse("2026-10-01T00:00:00+09:00");
function setup(discipline = "run") {
  model.value = { discipline, goal: { id: "goal-owned", userId: "test-uid", discipline, status: "active" }, weeks: [
    { id: "week-current", days: [{ date: date - 86400000 }] },
    { id: "week-next", days: [{ date, workout: "easyRun", plannedDurationMin: 30, completed: false, skipped: false, workoutName: "정확한 다음 러닝", intervals: [{ label: "WU", durationMin: 5, targetPowerW: [100, 200] }, { label: "Z2", durationMin: 20 }, { label: "CD", durationMin: 5 }] }] },
  ], goalMatchesDiscipline: true, loading: false, loadError: null, freshLoaded: true, isTodayCell: (day: { date: number }) => day.date === date - 86400000 };
}
const route = "/ko/plan?sport=run&goalId=goal-owned&weekId=week-next&dayIndex=0&date=2026-10-01";
it("opens the exact running session requested by a deep link", async () => {
  setup(); model.mobile = false;
  renderWithProviders(<PlanPage />, { authenticated: true, route });
  expect(await screen.findByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run&date=2026-10-01");
  expect(screen.queryByTestId("plan-presentation")).not.toBeInTheDocument();
  const preview = await screen.findByRole("dialog");
  expect(within(preview).getByText("정확한 다음 러닝")).toBeVisible();
  expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
});

it("returns from a dated record comparison to the current plan without writing or opening an editor", async () => {
  setup("bike"); model.mobile = true;
  const priorCalls = mockCallableInvocations.length;
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=bike&date=2026-10-01" });
  expect(await screen.findByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "1");
  fireEvent.click(screen.getByRole("button", { name: /현재 계획으로/ }));
  await waitFor(() => expect(screen.getByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "0"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
  expect(mockCallableInvocations.slice(priorCalls).filter(({ name }) => !["ensureUserProfile", "getCurrentRun30Program"].includes(name))).toEqual([]);
});

it.each([false, true])("preserves the selected midweek day in the records handoff mobile=%s", async mobile => {
  setup("bike"); model.mobile = mobile;
  model.value.weeks = [{ id: "week-current", days: [{ date: date - 86400000 }, { date }] }];
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=bike&date=2026-10-01" });
  expect(await screen.findByTestId("plan-presentation")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=bike&date=2026-10-01");
});

it("keeps an exact selected day through the real plan → records → plan route round trip", async () => {
  setup("bike"); model.mobile = false;
  model.value.weeks = [{ id: "week-current", days: [{ date: date - 86400000 }, { date }] }];
  renderWithProviders(<Routes><Route path="/ko/coach/plan" element={<PlanPage />} /><Route path="/ko/athlete/me/activities" element={<TrainingLogPage />} /></Routes>, { authenticated: true, route: "/ko/coach/plan?sport=bike&date=2026-10-01" });
  fireEvent.click(await screen.findByRole("link", { name: "활동 기록·수행 확인" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike&date=2026-10-01"));
  fireEvent.click(screen.getByRole("link", { name: "훈련 계획" }));
  expect(await screen.findByTestId("plan-presentation")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=bike&date=2026-10-01");
});
it.each(["all", "tri", ""])("uses the existing bike plan fallback consistently sport=%s", async sport => {
  setup("bike"); model.mobile = false; model.value.discipline = "bike"; model.sport.mockClear();
  renderWithProviders(<PlanPage />, { authenticated: true, route: `/ko/coach/plan?date=2026-10-01${sport ? `&sport=${sport}` : ""}` });
  expect(await screen.findByTestId("plan-presentation")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike&date=2026-10-01"));
  expect(model.sport).toHaveBeenLastCalledWith("bike");
});

it("replaces the old selected day with the visible week's date after intentional week navigation", async () => {
  setup("bike"); model.mobile = true;
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=bike&date=2026-10-01" });
  expect(await screen.findByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "1");
  fireEvent.click(screen.getByRole("button", { name: "Previous plan week" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=bike&date=2026-09-30"));
  fireEvent.click(screen.getByRole("button", { name: "Next plan week" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "활동 기록·수행 확인" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=bike&date=2026-10-01"));
});


it.each(["close", "back"])("restores the original date, range and detail after next workout %s", async action => {
  setup(); model.value.discipline = "bike";
  const Context = () => { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="context">{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>Browser back</button><PlanPage /></>; };
  const search = "?sport=bike&date=2026-10-01&range=90&detail=closed#comparison";
  renderWithProviders(<Context />, { authenticated: true, route: `/ko/coach/plan${search}` });
  fireEvent.click(await screen.findByText("Review next workout"));
  expect(await screen.findByTestId("workout-editor")).toBeVisible();
  expect(screen.getByTestId("context")).toHaveTextContent(search);
  fireEvent.click(screen.getByText(action === "close" ? "Close review" : "Browser back"));
  await waitFor(() => expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument());
  expect(screen.getByTestId("context")).toHaveTextContent(search);
});
