import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanPage from "./PlanPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { mockCallableInvocations } from "../__tests__/mocks/firebase";
const model = vi.hoisted(() => ({ value: {} as Record<string, unknown>, mobile: false }));
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => model.value }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => model.mobile }));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("../features/training/plan/PlanPresentation", () => ({ default: ({ mobileWeekOffset }: { mobileWeekOffset: number }) => <div data-testid="plan-presentation" data-week-offset={mobileWeekOffset} /> }));
vi.mock("../features/trainingDecision/TodayTrainingDecisionCard", () => ({ default: () => null }));
vi.mock("../components/training/WorkoutEditModal", () => ({ default: () => <div data-testid="workout-editor" /> }));
const date = Date.parse("2026-10-01T00:00:00+09:00");
function setup() {
  model.value = { discipline: "run", goal: { id: "goal-owned", userId: "test-uid", discipline: "run", status: "active" }, weeks: [
    { id: "week-current", days: [{ date: date - 86400000 }] },
    { id: "week-next", days: [{ date, workout: "easyRun", plannedDurationMin: 30, completed: false, skipped: false, workoutName: "정확한 다음 러닝", intervals: [{ label: "WU", durationMin: 5, targetPowerW: [100, 200] }, { label: "Z2", durationMin: 20 }, { label: "CD", durationMin: 5 }] }] },
  ], loading: false, loadError: null, freshLoaded: true, isTodayCell: (day: { date: number }) => day.date === date - 86400000 };
}
const route = "/ko/plan?sport=run&goalId=goal-owned&weekId=week-next&dayIndex=0&date=2026-10-01";
describe("read-only running plan target route", () => {
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
