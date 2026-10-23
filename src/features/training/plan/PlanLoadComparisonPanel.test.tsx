import PlanRecordEvidence from "./PlanRecordEvidence";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import PlanLoadComparison from "./PlanLoadComparisonPanel";
import { usePlanLoadComparison } from "./usePlanLoadComparison";
import type { PlanLoadComparisonRow, PlanLoadComparisonSummary } from "./planLoadComparison";

const fixture = vi.hoisted(() => ({
  result: {
    state: "ready",
    summary: { plannedTss: 100, actualTss: 130, ratioPct: 130, deltaTss: 30, estimated: false, unknownCount: 0 } as PlanLoadComparisonSummary,
    days: [{ date: "2026-10-19", plannedTss: 100, actualTss: 130, ratioPct: 130, deltaTss: 30, estimated: false, unknownCount: 0, future: false }] as PlanLoadComparisonRow[],
    retry: vi.fn(),
  },
}));
vi.mock("./usePlanLoadComparison", () => ({ usePlanLoadComparison: vi.fn(() => fixture.result) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T12:00:00+09:00"));
  vi.clearAllMocks();
  fixture.result = {
    state: "ready",
    summary: { plannedTss: 100, actualTss: 130, ratioPct: 130, deltaTss: 30, estimated: false, unknownCount: 0 },
    days: [{ date: "2026-10-19", plannedTss: 100, actualTss: 130, ratioPct: 130, deltaTss: 30, estimated: false, unknownCount: 0, future: false }],
    retry: vi.fn(),
  };
});
afterEach(() => vi.useRealTimers());

function mount() {
  return render(<PlanLoadComparison uid="owner" discipline="bike" weeks={[]} selectedDate="2026-10-23" />, { wrapper: MemoryRouter });
}
const requestedRange = () => vi.mocked(usePlanLoadComparison).mock.calls.at(-1)?.[0].range;

it("compares day, Monday-based week, calendar month and selected date ranges", () => {
  mount();
  expect(requestedRange()).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  fireEvent.click(screen.getByRole("button", { name: "일", exact: true }));
  expect(requestedRange()).toEqual({ start: "2026-10-23", end: "2026-10-23" });
  fireEvent.click(screen.getByRole("button", { name: "월", exact: true }));
  expect(requestedRange()).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  fireEvent.click(screen.getByRole("button", { name: "기간", exact: true }));
  fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-09-15" } });
  fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2026-10-22" } });
  expect(requestedRange()).toEqual({ start: "2026-09-15", end: "2026-10-22" });
});

it("retains attainment above 100% and displays the signed TSS difference", () => {
  mount();
  expect(screen.getByRole("group", { name: "달성률" })).toHaveTextContent("130%");
  expect(screen.getByText("+30", { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "달성률", exact: true }));
  expect(screen.getByText(/100%를 넘을 수 있습니다/)).toBeInTheDocument();
  expect(screen.getByText(/2026-10-23 현재까지/)).toBeInTheDocument();
});

it("blocks invalid or overlong ranges instead of starting an activity query", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "기간", exact: true }));
  fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2024-01-01" } });
  expect(screen.getByRole("alert")).toHaveTextContent("최대 366일");
  expect(vi.mocked(usePlanLoadComparison).mock.calls.at(-1)?.[0].enabled).toBe(false);
});

it("distinguishes a zero-TSS plan from unknown actual load and exposes retry after failure", () => {
  fixture.result = { ...fixture.result, summary: { ...fixture.result.summary, plannedTss: 0, ratioPct: null } };
  const view = mount();
  expect(screen.getByText(/계획된 TSS가 없어/)).toBeInTheDocument();
  fixture.result = { ...fixture.result, state: "incomplete", summary: { ...fixture.result.summary, actualTss: null, deltaTss: null, unknownCount: 1 } };
  view.rerender(<PlanLoadComparison uid="owner" discipline="bike" weeks={[]} />);
  expect(screen.getByRole("status")).toHaveTextContent("확정할 수 없습니다");
  fixture.result = { ...fixture.result, state: "error" };
  view.rerender(<PlanLoadComparison uid="owner" discipline="bike" weeks={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(fixture.result.retry).toHaveBeenCalledOnce();
});

it("explains withheld totals when a complete query contains activities with unknown TSS", () => {
  fixture.result = { ...fixture.result, summary: { ...fixture.result.summary, actualTss: null, ratioPct: null, deltaTss: null, unknownCount: 2 } };
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("TSS가 미확인인 활동 2건");
  expect(screen.getByRole("group", { name: "실제 TSS" })).toHaveTextContent("—");
  expect(screen.getByRole("group", { name: "달성률" })).toHaveTextContent("—");
});

it("allows retrying incomplete activity coverage", () => {
  fixture.result = { ...fixture.result, state: "incomplete", summary: { ...fixture.result.summary, actualTss: null, ratioPct: null, deltaTss: null } };
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("확정할 수 없습니다");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(fixture.result.retry).toHaveBeenCalledOnce();
});


it.each([false, true])("restores period and parent fulfillment through record drilldown, with plan=%s", withPlan => {
  fixture.result.days[0].fulfilledWeek = { weekNumber: 6, plannedTss: 100, actualTss: 130, estimated: false };
  fixture.result = { ...fixture.result, days: [fixture.result.days[0]!, { ...fixture.result.days[0]!, date: "2026-10-20" }] };
  const original = "/ko/coach/plan?sport=bike&loadPeriod=range&loadStart=2026-10-19&loadEnd=2026-10-23&loadDetails=open";
  const Location = () => <output data-testid="period-location">{useLocation().pathname}{useLocation().search}</output>;
  render(<MemoryRouter initialEntries={[original]}><Location /><Routes><Route path="/ko/coach/plan" element={<PlanLoadComparison uid="owner" discipline="bike" weeks={[]} />} /><Route path="/ko/athlete/me/activities" element={<PlanRecordEvidence date="2026-10-19" plans={withPlan ? [{ discipline: "bike", workout: "vo2", plannedTSS: 100, plannedDurationMin: 60 }] : []} />} /></Routes></MemoryRouter>);
  expect(screen.getByText("일별 비교 보기").closest("details")).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("link", {name:"2026-10-19 근거 보기"}));
  expect(screen.getByText(/기간 실제 합계에는 미연결 활동도 포함/)).toBeVisible();
  if (withPlan) expect(screen.getByText("W6 주간 부하 목표로 충족")).toBeVisible();
  expect(screen.getByRole("link",{name:"원래 기간 부하 비교로 돌아가기"})).toHaveAttribute("href", original+"#plan-load-comparison");
  fireEvent.click(screen.getByRole("link",{name:"원래 기간 부하 비교로 돌아가기"}));
  expect(screen.getByTestId("period-location")).toHaveTextContent(original);
  expect(requestedRange()).toEqual({start:"2026-10-19",end:"2026-10-23"});
  expect(screen.getByText("일별 비교 보기").closest("details")).toHaveAttribute("open");
});
