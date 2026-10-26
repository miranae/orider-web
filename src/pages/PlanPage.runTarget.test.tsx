import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanPage from "./PlanPage";
import { useLocation, useNavigate } from "react-router-dom";
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
function setup() {
  model.value = { discipline: "run", goal: { id: "goal-owned", userId: "test-uid", discipline: "run", status: "active" }, weeks: [
    { id: "week-current", days: [{ date: date - 86400000 }] },
    { id: "week-next", days: [{ date, workout: "easyRun", plannedDurationMin: 30, completed: false, skipped: false, workoutName: "정확한 다음 러닝", intervals: [{ label: "WU", durationMin: 5, targetPowerW: [100, 200] }, { label: "Z2", durationMin: 20 }, { label: "CD", durationMin: 5 }] }] },
  ], goalMatchesDiscipline: true, loading: false, loadError: null, freshLoaded: true, isTodayCell: (day: { date: number }) => day.date === date - 86400000 };
}
const route = "/ko/plan?sport=run&goalId=goal-owned&weekId=week-next&dayIndex=0&date=2026-10-01";
describe("read-only running plan target route", () => {
  it("opens a date-only log handoff in the requested week without a run-start preview", async () => {
    setup(); model.mobile = true;
    renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=run&date=2026-10-01" });
    expect(await screen.findByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
  });
  it.each([false, true])("opens exact preview without workout editor or execution and focuses target week mobile=%s", async mobile => {
    setup(); model.mobile = mobile;
    const priorCalls = mockCallableInvocations.length;
    renderWithProviders(<PlanPage />, { authenticated: true, route });
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("정확한 다음 러닝");
    expect(dialog).toHaveTextContent("30분");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "1");
    expect(mockCallableInvocations.slice(priorCalls).filter(({ name }) => /reserve|start|complete|reroll|revalidate|refresh/i.test(name))).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("does not open cached target data before the current-owner plan finishes its fresh read", async () => {
    setup(); model.value.freshLoaded = false;
    renderWithProviders(<PlanPage />, { authenticated: true, route });
    await screen.findByTestId("plan-presentation");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps missing target neutral without opening a different workout", async () => {
    setup();
    renderWithProviders(<PlanPage />, { authenticated: true, route: route.replace("week-next", "week-deleted") });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("현재 계획에서 확인할 수 없어요"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
  });
});


it("returns from a dated record comparison to the current plan without writing or opening an editor", async () => {
  setup(); model.mobile = true;
  const priorCalls = mockCallableInvocations.length;
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=run&date=2026-10-01" });
  expect(await screen.findByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "1");
  fireEvent.click(screen.getByRole("button", { name: /현재 계획으로/ }));
  await waitFor(() => expect(screen.getByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "0"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByTestId("workout-editor")).not.toBeInTheDocument();
  expect(mockCallableInvocations.slice(priorCalls).filter(({ name }) => !["ensureUserProfile", "getCurrentRun30Program"].includes(name))).toEqual([]);
});

it.each([false, true])("preserves the selected midweek day in plan navigation mobile=%s", async mobile => {
  setup(); model.mobile = mobile;
  model.value.weeks = [{ id: "week-current", days: [{ date: date - 86400000 }, { date }] }];
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=run&date=2026-10-01" });
  expect(await screen.findByTestId("plan-presentation")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-10-01");
});

it.each(["all", "tri", ""])("uses the existing bike plan fallback consistently sport=%s", async sport => {
  setup(); model.mobile = false; model.value.discipline = "bike"; model.sport.mockClear();
  renderWithProviders(<PlanPage />, { authenticated: true, route: `/ko/coach/plan?date=2026-10-01${sport ? `&sport=${sport}` : ""}` });
  expect(await screen.findByTestId("plan-presentation")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike&date=2026-10-01"));
  expect(model.sport).toHaveBeenLastCalledWith("bike");
});

it("replaces the old selected day with the visible week's date after intentional week navigation", async () => {
  setup(); model.mobile = true;
  renderWithProviders(<PlanPage />, { authenticated: true, route: "/ko/coach/plan?sport=run&date=2026-10-01" });
  expect(await screen.findByTestId("plan-presentation")).toHaveAttribute("data-week-offset", "1");
  fireEvent.click(screen.getByRole("button", { name: "Previous plan week" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-09-30"));
  fireEvent.click(screen.getByRole("button", { name: "Next plan week" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "훈련 계획" })).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-10-01"));
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
