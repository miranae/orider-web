import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import AthleteActivityChart from "./AthleteActivityChart";
import type { WeeklyStat } from "../WeeklyChart";
const chart = vi.hoisted(() => vi.fn());
vi.mock("../WeeklyChart", () => ({ default: (props: { data: WeeklyStat[]; onPeriodSelect: (period: string) => void }) => { chart(props); return <button onClick={() => props.onPeriodSelect(props.data[0]!.week)}>Inspect period</button>; } }));
it("defaults to the current month and excludes future weeks while forwarding exact period ranges", () => {
  const onSelect = vi.fn();
  renderWithProviders(<AthleteActivityChart activities={[]} selected={null} onSelect={onSelect} />);
  const now = new Date();
  expect(chart.mock.lastCall![0].data.at(-1).week).toBe(`${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`);
  fireEvent.click(screen.getByRole("button", { name: "주간" }));
  const props = chart.mock.lastCall![0];
  expect(props.periodUnit).toBe("week");
  // A date-only chart label is a local calendar date; bare ISO parsing uses UTC.
  expect(new Date(`${props.data.at(-1).week}T00:00:00`).getTime()).toBeLessThanOrEqual(now.getTime());
  fireEvent.click(screen.getByRole("button", { name: "Inspect period" }));
  expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ start: new Date(now.getFullYear(), 0, 1).getTime() }));
});
