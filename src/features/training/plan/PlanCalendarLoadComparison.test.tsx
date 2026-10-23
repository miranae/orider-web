import { screen, waitFor } from "@testing-library/react";
import type { PlanDay, PlanWeek } from "@shared/types/goal";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { PlanModel } from "../../../hooks/usePlanModel";
import MobilePlanPage from "../../../components/mobile/MobilePlanPage";
import PlanPresentation from "./PlanPresentation";
import { usePlanLoadComparison } from "./usePlanLoadComparison";
import type { PlanLoadComparisonRow } from "./planLoadComparison";

const loadFixture = vi.hoisted(() => ({ days: [] as PlanLoadComparisonRow[] }));
vi.mock("./usePlanLoadComparison", () => ({ usePlanLoadComparison: vi.fn(() => ({ state: "ready", days: loadFixture.days, retry: vi.fn(), summary: {} })) }));
const time = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
function day(date: string, workout: PlanDay["workout"], plannedTSS: number, extra: Partial<PlanDay> = {}): PlanDay {
  return { date: time(date), dayOfWeek: 0, workout, plannedTSS, plannedDurationMin: 60, completed: false, skipped: false, ...extra };
}
const weeks: PlanWeek[] = [
  { id: "week-1", weekNumber: 1, phase: "build", startDate: time("2026-10-19"), plannedTSS: 255,
    days: [day("2026-10-19", "z2", 65), day("2026-10-20", "rest", 0), day("2026-10-21", "z2", 65, { skipped: true }), day("2026-10-22", "goal", 100), day("2026-10-23", "rec", 25)] },
  { id: "week-2", weekNumber: 2, phase: "build", startDate: time("2026-10-26"), plannedTSS: 50, days: [day("2026-10-26", "z2", 50)] },
];
const model = { discipline: "bike", goal: { id: "goal", title: "목표", discipline: "bike" }, weeks, loading: false, loadError: null,
  goalMatchesDiscipline: true, progress: 0, totalTSS: 305, completedTSS: 0, weeksLeft: 2, daysLeft: 2,
  isTodayCell: (value: PlanDay) => value.date === time("2026-10-23") } as unknown as PlanModel;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T12:00:00+09:00"));
  vi.clearAllMocks();
  loadFixture.days = [
    { date: "2026-10-19", plannedTss: 65, actualTss: 0, ratioPct: 0, deltaTss: -65 },
    { date: "2026-10-20", plannedTss: 0, actualTss: 118, ratioPct: null, deltaTss: 118 },
    { date: "2026-10-21", plannedTss: 65, actualTss: 20, ratioPct: 20 / 65 * 100, deltaTss: -45 },
    { date: "2026-10-22", plannedTss: 100, actualTss: 68, ratioPct: 68, deltaTss: -32 },
    { date: "2026-10-23", plannedTss: 25, actualTss: 0, ratioPct: 0, deltaTss: -25 },
    { date: "2026-10-26", plannedTss: 50, actualTss: null, ratioPct: null, deltaTss: null, future: true },
  ].map(row => ({ estimated: false, unknownCount: 0, future: false, ...row }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function layout(mobile: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: mobile && query === "(max-width: 1023px)", media: query,
    onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
}

it("renders actual load directly in desktop normal, rest, skipped, goal and future day cards", async () => {
  layout(false);
  renderWithProviders(<PlanPresentation model={model} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} />, { authenticated: true });
  expect(screen.getByRole("group", { name: "2026-10-19 부하 비교" })).toHaveTextContent("달성 0% · 차이 -65 TSS");
  expect(screen.getByRole("group", { name: "2026-10-20 부하 비교" })).toHaveTextContent("실제 118 TSS");
  expect(screen.getByRole("group", { name: "2026-10-21 부하 비교" })).toHaveTextContent("실제 20 TSS");
  expect(screen.getByRole("group", { name: "2026-10-22 부하 비교" })).toHaveTextContent("달성 68% · 차이 -32 TSS");
  expect(screen.getByRole("group", { name: "2026-10-26 부하 비교" })).toHaveTextContent("실제 예정");
  await waitFor(() => expect(vi.mocked(usePlanLoadComparison).mock.calls.at(-1)?.[0]).toMatchObject({ range: { start: "2026-10-19", end: "2026-10-26" }, enabled: true }));
  expect(weeks[0].days.every(value => !value.completed)).toBe(true);
});

it("passes the selected mobile week's comparison through the real MobilePlanPage wrapper", () => {
  layout(true);
  const view = renderWithProviders(<PlanPresentation model={model} mobileWeekOffset={0} onMobileWeekOffsetChange={vi.fn()} renderMobile={props => <MobilePlanPage {...props} />} />, { authenticated: true });
  expect(screen.getByRole("group", { name: "2026-10-20 부하 비교" })).toHaveTextContent("달성 — · 차이 +118 TSS");
  expect(vi.mocked(usePlanLoadComparison).mock.calls.at(-1)?.[0].range).toEqual({ start: "2026-10-19", end: "2026-10-23" });
  view.rerender(<PlanPresentation model={model} mobileWeekOffset={1} onMobileWeekOffsetChange={vi.fn()} renderMobile={props => <MobilePlanPage {...props} />} />);
  expect(screen.queryByRole("group", { name: "2026-10-19 부하 비교" })).not.toBeInTheDocument();
  expect(screen.getByRole("group", { name: "2026-10-26 부하 비교" })).toHaveTextContent("실제 예정 TSS");
  expect(vi.mocked(usePlanLoadComparison).mock.calls.at(-1)?.[0].range).toEqual({ start: "2026-10-26", end: "2026-10-26" });
});
