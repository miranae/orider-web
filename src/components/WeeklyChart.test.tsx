import { render, screen } from "@testing-library/react";
import WeeklyChart, { type WeeklyStat } from "./WeeklyChart";

const { bar } = vi.hoisted(() => ({ bar: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Bar: (props: unknown) => { bar(props); return <div data-testid="bar" />; } }));
vi.mock("../contexts/ThemeContext", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

const data: WeeklyStat[] = Array.from({ length: 24 }, (_, i) => ({ week: `${2024 + Math.floor(i / 12)}.${String(i % 12 + 1).padStart(2, "0")}`, distance: i, time: 0, elevation: 0, rides: 1, tss: 0 }));

it("makes all year-month labels visible in a horizontally scrollable chart", () => {
  render(<WeeklyChart data={data} rich showAllPeriods />);
  const props = bar.mock.lastCall![0];
  expect(props.data.labels).toEqual(data.map((row) => row.week));
  expect(props.options.scales.x.ticks.autoSkip).toBe(false);
  expect(screen.getByTestId("bar").parentElement?.parentElement).toHaveStyle({ overflowX: "auto" });
  expect(screen.getByText("2024.01 – 2025.12")).toBeInTheDocument();
});

it("retains the existing compact labels and skipping for other charts", () => {
  render(<WeeklyChart data={data} />);
  const props = bar.mock.lastCall![0];
  expect(props.data.labels[0]).toBe("1월");
  expect(props.options.scales.x.ticks.autoSkip).toBe(true);
  expect(props.options.scales.x.ticks.maxTicksLimit).toBe(6);
});
