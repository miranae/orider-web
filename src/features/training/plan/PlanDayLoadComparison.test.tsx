import { render, screen } from "@testing-library/react";
import type { PlanDay } from "@shared/types/goal";
import PlanDayLoadComparison from "./PlanDayLoadComparison";
import type { PlanLoadComparisonRow } from "./planLoadComparison";

const day: PlanDay = { date: Date.parse("2026-10-19T00:00:00+09:00"), dayOfWeek: 0, workout: "z2", plannedTSS: 65, plannedDurationMin: 90, completed: false, skipped: false };
const row: PlanLoadComparisonRow = { date: "2026-10-19", plannedTss: 65, actualTss: 0, ratioPct: 0, deltaTss: -65, estimated: false, unknownCount: 0, future: false };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T12:00:00+09:00"));
});
afterEach(() => vi.useRealTimers());

it("shows zero actual load and the plan deficit directly in the day card", () => {
  render(<PlanDayLoadComparison day={day} row={row} state="ready" />);
  expect(screen.getByRole("group", { name: "2026-10-19 부하 비교" })).toHaveTextContent("계획 65 · 실제 0 TSS");
  expect(screen.getByText("달성 0% · 차이 -65 TSS")).toBeInTheDocument();
  expect(day.completed).toBe(false);
});

it("includes activity on a rest day without inventing a percentage for a zero plan", () => {
  render(<PlanDayLoadComparison day={{ ...day, workout: "rest", plannedTSS: 0 }} row={{ ...row, plannedTss: 0, actualTss: 118, ratioPct: null, deltaTss: 118 }} state="ready" />);
  expect(screen.getByText("계획 0 · 실제 118 TSS")).toBeInTheDocument();
  expect(screen.getByText("달성 — · 차이 +118 TSS")).toBeInTheDocument();
});

it.each(["rest", "goal", "z2"] as const)("distinguishes unknown TSS and future days for %s", workout => {
  const view = render(<PlanDayLoadComparison day={{ ...day, workout }} row={{ ...row, actualTss: null, ratioPct: null, deltaTss: null, unknownCount: 1 }} state="ready" />);
  expect(screen.getByText(/실제 미확인 TSS/)).toBeInTheDocument();
  expect(screen.getByText("달성 — · 차이 — TSS")).toBeInTheDocument();
  view.rerender(<PlanDayLoadComparison day={{ ...day, workout, date: Date.parse("2026-10-25T00:00:00+09:00") }} state="loading" />);
  expect(screen.getByText(/실제 예정 TSS/)).toBeInTheDocument();
});

it("does not cap load attainment or change a skipped workout into a completed workout", () => {
  const skipped = { ...day, skipped: true };
  render(<PlanDayLoadComparison day={skipped} row={{ ...row, plannedTss: 100, actualTss: 150, ratioPct: 150, deltaTss: 50 }} state="ready" />);
  expect(screen.getByText("달성 150% · 차이 +50 TSS")).toBeInTheDocument();
  expect(skipped.completed).toBe(false);
  expect(skipped.skipped).toBe(true);
});


it("shows weekly fulfillment alongside the date load without rewriting the workout", () => {
  render(<PlanDayLoadComparison day={day} row={{ ...row, fulfilledWeek: { weekNumber: 6, plannedTss: 300, actualTss: 350, estimated: false } }} state="ready" />);
  expect(screen.getByText("W6 주간 부하 목표로 충족")).toBeInTheDocument();
  expect(screen.getByText("계획 65 · 실제 0 TSS")).toBeInTheDocument();
  expect(day.completed).toBe(false);
});
it("uses confirmed linked accepted load for exceeded completion even without a stored completion flag", () => {
  const linked = { ...day, actualActivityId: "ride", matchMethod: "manual", matchConfidence: "manual" } as PlanDay;
  const view = render(<PlanDayLoadComparison day={linked} row={{ ...row, linkedLoads: { ride: 220 } }} state="ready" />);
  expect(screen.getByText("연결 활동으로 부하 목표 초과 완료")).toBeInTheDocument();
  view.rerender(<PlanDayLoadComparison day={{ ...linked, matchConfidence: "probable" } as PlanDay} row={{ ...row, linkedLoads: { ride: 220 } }} state="ready" />);
  expect(screen.queryByText("연결 활동으로 부하 목표 초과 완료")).not.toBeInTheDocument();
  view.rerender(<PlanDayLoadComparison day={linked} row={{ ...row, linkedLoads: { ride: 220 } }} state="incomplete" />);
  expect(screen.queryByText("연결 활동으로 부하 목표 초과 완료")).not.toBeInTheDocument();
});
