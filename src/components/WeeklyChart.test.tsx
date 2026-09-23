import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { useOriderTheme } from "../theme";
import WeeklyChart, { type WeeklyStat } from "./WeeklyChart";

const { bar } = vi.hoisted(() => ({ bar: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Bar: (props: unknown) => { bar(props); return <div data-testid="bar" />; } }));
const data: WeeklyStat[] = Array.from({ length: 24 }, (_, i) => ({ week: `${2024 + Math.floor(i / 12)}.${String(i % 12 + 1).padStart(2, "0")}`, distance: i, time: 0, elevation: 0, rides: 1, tss: 0, tssEstimated: false }));

function ThemeSwitchingWeeklyChart() {
  const { variant, setThemeId } = useOriderTheme();
  return <>
    <button type="button" data-expected-series={variant.colors.accent} data-expected-grid={variant.chartColors.grid} onClick={() => setThemeId("app-parity")}>테마 변경</button>
    <WeeklyChart data={data} />
  </>;
}

it("makes all year-month labels visible in a horizontally scrollable chart", () => {
  renderWithProviders(<WeeklyChart data={data} rich showAllPeriods />);
  const props = bar.mock.lastCall![0];
  expect(props.data.labels).toEqual(data.map((row) => row.week));
  expect(props.options.scales.x.ticks.autoSkip).toBe(false);
  expect(props.options.plugins.legend.display).toBe(false);
  const tooltipLines = props.options.plugins.tooltip.callbacks.label({ dataIndex: 0 });
  expect(tooltipLines).toHaveLength(4);
  expect(tooltipLines.filter((line: string) => line.includes("거리"))).toHaveLength(1);
  expect(screen.getByTestId("bar").parentElement?.parentElement).toHaveStyle({ overflowX: "auto" });
  expect(screen.getByText("2024.01 – 2025.12")).toBeInTheDocument();
});

it("retains the existing compact labels and skipping for other charts", () => {
  renderWithProviders(<WeeklyChart data={data} />);
  const props = bar.mock.lastCall![0];
  expect(props.data.labels[0]).toBe("1월");
  expect(props.options.scales.x.ticks.autoSkip).toBe(true);
  expect(props.options.scales.x.ticks.maxTicksLimit).toBe(6);
});

it("resolves semantic series, axis, grid and tooltip colors after a design-theme switch", () => {
  renderWithProviders(<ThemeSwitchingWeeklyChart />);
  const button = screen.getByRole("button", { name: "테마 변경" });
  const checkColors = () => {
    const props = bar.mock.lastCall![0];
    expect(props.data.datasets[0].backgroundColor).toBe(button.getAttribute("data-expected-series"));
    expect(props.options.scales.y.grid.color).toBe(button.getAttribute("data-expected-grid"));
    expect(props.options.scales.x.ticks.color).not.toContain("var(");
    expect(props.options.plugins.tooltip.backgroundColor).not.toContain("var(");
  };
  checkColors();
  fireEvent.click(button);
  checkColors();
});
