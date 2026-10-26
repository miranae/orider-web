import { planCalendarDate } from "@shared/training/planDate";
import { seoulYearStartMs } from "../../utils/seoulWeek";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import AthleteActivityChart from "./AthleteActivityChart";
import type { WeeklyStat } from "../WeeklyChart";
const chart = vi.hoisted(() => vi.fn());
vi.mock("../WeeklyChart", () => ({ default: (props: { data: WeeklyStat[]; onPeriodSelect: (period: string) => void }) => { chart(props); return <button onClick={() => props.onPeriodSelect(props.data[0]!.week)}>Inspect period</button>; } }));
it("defaults to the current month and excludes future weeks while forwarding exact period ranges", () => {
  const onSelect = vi.fn();
  renderWithProviders(<AthleteActivityChart activities={[]} selected={null} onSelect={onSelect} />);
  const now = planCalendarDate(Date.now());
  expect(chart.mock.lastCall![0].data.at(-1).week).toBe(`${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  fireEvent.click(screen.getByRole("button", { name: "주간" }));
  const props = chart.mock.lastCall![0];
  expect(props.periodUnit).toBe("week");
  // 선택 범위와 차트 날짜 모두 KST이며 브라우저 시간대에 영향받지 않는다.
  expect(new Date(`${props.data.at(-1).week}T00:00:00+09:00`).getTime()).toBeLessThanOrEqual(Date.now());
  fireEvent.click(screen.getByRole("button", { name: "Inspect period" }));
  expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ start: seoulYearStartMs(Date.now()) }));
});

it("offers the KST year and forwards January's range at the UTC year boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-12-31T15:30:00Z"));
  try {
    const onSelect = vi.fn();
    renderWithProviders(<AthleteActivityChart activities={[]} selected={{start: Date.parse("2025-12-31T15:00:00Z"), end: Date.parse("2026-01-01T15:00:00Z"), label: "day"}} onSelect={onSelect} />);
    expect(screen.getByRole("combobox")).toHaveValue("2026");
    expect(chart.mock.lastCall![0].data.map((row: WeeklyStat) => row.week)).toEqual(["2026.01"]);
    expect(screen.getByText("한국 시간(KST) 기준")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2026");
    expect(screen.getByRole("status")).not.toHaveTextContent("2025");
    fireEvent.click(screen.getByRole("button", {name: "Inspect period"}));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({start: Date.parse("2025-12-31T15:00:00Z"), end: Date.parse("2026-01-31T15:00:00Z")}));
  } finally { vi.useRealTimers(); }
});
