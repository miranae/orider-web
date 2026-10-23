import { fireEvent, render, screen } from "@testing-library/react";
import type { Goal, PlanWeek } from "@shared/types/goal";
import PlanGoalLoadSummary from "./PlanGoalLoadSummary";
import { goalLoadScope } from "./planScope";
import type { usePlanLoadComparison } from "./usePlanLoadComparison";

const scope = goalLoadScope([{ days: [{ date: Date.parse("2026-08-17T00:00:00+09:00") }] }] as PlanWeek[], { targetDate: Date.parse("2026-10-18T00:00:00+09:00") } as Goal, Date.parse("2026-10-23T00:00:00+09:00"));
const retry = vi.fn();
const load = { state: "ready", summary: { plannedTss: 200, actualTss: 350, ratioPct: 175, deltaTss: 150, unknownCount: 0, estimated: true }, days: [], retry } as ReturnType<typeof usePlanLoadComparison>;

it("uses canonical TSS without capping attainment or presenting prescription completion", () => {
  render(<PlanGoalLoadSummary scope={scope} load={load} />);
  const summary = screen.getByRole("region", { name: "목표기간 훈련 부하" });
  expect(summary).toHaveTextContent("175%");
  expect(summary).toHaveTextContent("+150TSS");
  expect(summary).toHaveTextContent("목표일 경과 · 목표일까지 남은 기간 0주");
  expect(summary).toHaveTextContent("추정 부하");
  expect(screen.queryByText("완료 TSS")).not.toBeInTheDocument();
});

it("explains unknown loads, supports retry and hides totals when the goal range is invalid", () => {
  const view = render(<PlanGoalLoadSummary scope={scope} load={{ ...load, state: "incomplete", summary: { ...load.summary, actualTss: null, ratioPct: null, deltaTss: null, unknownCount: 2 } }} />);
  expect(screen.getByText(/TSS가 미확인인 활동 2건/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<PlanGoalLoadSummary scope={{ ...scope, valid: false }} load={load} />);
  expect(screen.queryByText("175")).not.toBeInTheDocument();
  expect(screen.getAllByText(/목표기간을 확인할 수 없어/).length).toBeGreaterThan(0);
});
