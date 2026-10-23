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
  return render(<PlanLoadComparison uid="owner" discipline="bike" weeks={[]} selectedDate="2026-10-23" />);
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
