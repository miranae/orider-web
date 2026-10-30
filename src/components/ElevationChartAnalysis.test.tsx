import { useState } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ElevationChart from "./ElevationChart";
const state = vi.hoisted(() => ({ lines: vi.fn(), change: vi.fn(), hover: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Line: (props: unknown) => { state.lines(props); return <div data-testid="analysis-line" />; } }));
const data = [0, 1, 2, 3, 4].map(index => ({ distance: index * 1000, elevation: index * 10 }));
function Example({ elapsed = false, identity = "activity", exact = false }: { elapsed?: boolean; identity?: string; exact?: boolean }) {
  const [range, setRange] = useState<[number, number] | null>(null);
  return <ElevationChart data={data} xAxis={elapsed ? "elapsed" : "distance"} elapsedAxisSec={[0, 15, 45, 60, 120]}
    overlays={[{ key: "speed", label: "Speed", data: [0, 10, null, 30, 40], color: "red", yAxisID: "speed" }]}
    onHoverIndex={state.hover} analysisPresentation={{ elapsedViewport: exact ? { startOffsetSec: 21, endOffsetSec: 81 } : null, identity, hoverIndex: undefined, visualRange: range,
      onVisualRangeChange: next => { state.change(next); setRange(next); },
      elevation: { label: "Elevation", maximum: "40", current: "—", unit: "m" },
      lanes: { speed: { label: "Speed", maximum: "40", average: "20", current: "—", unit: "km/h" } },
      maximumLabel: "Max", averageLabel: "Avg", keyboardLabel: "keyboard", segmentsLabel: "Segments", segmentDetailsLabel: "Details",
      segments: [{ id: "effort", name: "Real segment", startIndex: 1, endIndex: 3, summary: "2 km", href: "/activity/one?tab=segments" }],
      selectionHint: "Drag to inspect", selectionCaption: range ? <span>Selected range</span> : null,
    }} />;
}
function plots() { return screen.getAllByRole("group", { name: /keyboard/ }); }
function setBounds(element: HTMLElement) { element.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, bottom: 72, right: 100, height: 72, x: 0, y: 0, toJSON() {} }); }
function latestPlots() { return state.lines.mock.calls.slice(-2).map(([props]) => props); }
beforeEach(() => { state.lines.mockClear(); state.change.mockClear(); state.hover.mockClear(); vi.stubGlobal("PointerEvent", MouseEvent); });
afterEach(() => vi.unstubAllGlobals());
it("renders sparse raw-part elevation as measured segments while retaining cursor indices and long gaps", () => {
  renderWithProviders(<ElevationChart data={[10, NaN, 20, NaN, 30, NaN, 40].map((elevation, index) => ({ distance: index * 100, elevation }))}
    analysisPresentation={{ elevationObservationTimeSec: [0, 1, 5, 6, 10, 11, 100],
      elevation: { label: "Elevation", maximum: "40", current: "—", unit: "m" }, lanes: {},
      maximumLabel: "Max", averageLabel: "Avg", keyboardLabel: "keyboard", segmentsLabel: "Segments", segmentDetailsLabel: "Details" }} />);
  const points = state.lines.mock.lastCall![0].data.datasets[0].data;
  expect(points.map((point: { sourceIndex: number | null }) => point.sourceIndex)).toEqual([0, 2, 4, null, 6]);
  expect(points.map((point: { y: number | null }) => point.y)).toEqual([10, 20, 30, null, 40]);
});
it("brushes any metric, keeps the full overview and y scale, and does not clear on the synthetic click", () => {
  renderWithProviders(<Example />);
  const plot = plots()[1]!; setBounds(plot);
  fireEvent.pointerDown(plot, { clientX: 25, button: 0 }); fireEvent.pointerMove(plot, { clientX: 75 }); fireEvent.pointerUp(window, { clientX: 75 });
  expect(state.change).toHaveBeenLastCalledWith([1, 3]);
  fireEvent.pointerLeave(plot);
  expect(state.hover).toHaveBeenLastCalledWith(3);
  fireEvent.click(plot);
  expect(state.change).toHaveBeenCalledTimes(1);
  const [overview, metric] = latestPlots();
  expect(overview.options.scales.x).toMatchObject({ min: 0, max: 4 });
  expect(metric.options.scales.x).toMatchObject({ min: 1, max: 3 });
  expect(metric.options.scales.y).toMatchObject({ min: 0, max: 40 });
  fireEvent.click(plot);
  expect(state.change).toHaveBeenLastCalledWith(null);
  expect(latestPlots()[1].options.scales.x).toMatchObject({ min: 0, max: 4 });
});
it("cancels interrupted pointer gestures and exposes keyboard selection/reset", () => {
  renderWithProviders(<Example />);
  const plot = plots()[1]!; setBounds(plot);
  fireEvent.pointerDown(plot, { clientX: 25, button: 0 }); fireEvent.pointerMove(plot, { clientX: 75 }); fireEvent.pointerCancel(window); fireEvent.pointerUp(window, { clientX: 75 });
  expect(state.change).not.toHaveBeenCalled();
  fireEvent.pointerDown(plot, { clientX: 25, button: 0 }); fireEvent.scroll(window); fireEvent.pointerUp(window, { clientX: 75 });
  expect(state.change).not.toHaveBeenCalled();
  fireEvent.keyDown(plot, { key: "Escape" });
  expect(state.change).toHaveBeenLastCalledWith(null);
  fireEvent.keyDown(plot, { key: "ArrowRight", shiftKey: true });
  expect(state.change.mock.lastCall?.[0]).toEqual([0, 1]);
});
it("preserves the exact sample tuple when changing axes and makes real segment bars actionable", () => {
  const view = renderWithProviders(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Real segment · 2 km" }));
  expect(state.change).toHaveBeenLastCalledWith([1, 3]);
  expect(screen.getByRole("button", { name: "Real segment · 2 km" })).toHaveAttribute("aria-pressed", "true");
  // 끝의 상세 링크 대신 세그먼트 이름이 상세로 간다.
  expect(screen.getByRole("link", { name: "Real segment · Details" })).toHaveAttribute("href", "/ko/activity/one?tab=segments");
  view.rerender(<Example elapsed />);
  expect(latestPlots()[1].options.scales.x).toMatchObject({ min: 0.25, max: 1 });
  expect(state.change).toHaveBeenCalledTimes(1);
});
it("shares one cursor coordinate across every canvas without compacting missing samples", () => {
  renderWithProviders(<Example />);
  const plot = plots()[1]!; setBounds(plot); fireEvent.pointerMove(plot, { clientX: 75 });
  expect(state.hover).toHaveBeenLastCalledWith(3);
  const charts = latestPlots();
  expect(charts[1].data.datasets[0].data[2]).toEqual({ x: 2, y: null, sourceIndex: 2 });
  const stroke = vi.fn();
  for (const chart of charts) chart.plugins[0].afterDatasetsDraw({ data: chart.data, scales: { x: { getPixelForValue: (value: number) => value * 10 }, y: { getPixelForValue: (value: number) => value } }, chartArea: { left: 0, right: 100, top: 0, bottom: 100 }, ctx: { save() {}, restore() {}, beginPath() {}, moveTo: vi.fn(), lineTo: vi.fn(), stroke, arc() {}, fill() {} } });
  expect(stroke).toHaveBeenCalledTimes(2);
});

it("preserves explicit owner range handles and keyboard without invoking public visual selection", () => {
  const canonical = vi.fn();
  renderWithProviders(<ElevationChart data={data} rangeMode range={[1, 3]} onRangeChange={canonical}
    analysisPresentation={{ visualRange: null, onVisualRangeChange: state.change,
      elevation: { label: "Elevation", maximum: "40", current: "—", unit: "m" }, lanes: {},
      maximumLabel: "Max", averageLabel: "Avg", keyboardLabel: "keyboard", segmentsLabel: "Segments", segmentDetailsLabel: "Details",
      segments: [{ id: "owner-effort", name: "Owner segment", startIndex: 0, endIndex: 2 }] }} />);
  const plot = plots()[0]!; setBounds(plot);
  fireEvent.pointerDown(plot, { clientX: 25, button: 0 }); fireEvent.pointerMove(plot, { clientX: 50 }); fireEvent.pointerUp(window, { clientX: 50 });
  expect(canonical).toHaveBeenLastCalledWith([2, 3]);
  fireEvent.click(plot);
  fireEvent.keyDown(plot, { key: "ArrowLeft" });
  expect(canonical).toHaveBeenLastCalledWith([1, 2]);
  fireEvent.keyDown(plot, { key: "ArrowLeft", shiftKey: true });
  expect(canonical).toHaveBeenLastCalledWith([0, 3]);
  fireEvent.pointerDown(plot, { clientX: 25, button: 0 }); fireEvent.pointerMove(plot, { clientX: 35, ctrlKey: true });
  expect(canonical).toHaveBeenLastCalledWith([2, 3]);
  fireEvent.pointerCancel(window); fireEvent.pointerMove(plot, { clientX: 75 });
  expect(canonical).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole("button", { name: "Owner segment" }));
  expect(canonical).toHaveBeenLastCalledWith([0, 2]);
  expect(state.change).not.toHaveBeenCalled();
});

it("keeps axis controls accessible and adapts tick density to the measured plot width", () => {
  let resize = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  const view = renderWithProviders(<ElevationChart data={data} xAxis="elapsed" elapsedAxisSec={[0, 900, 1800, 2700, 3600]}
    analysisPresentation={{ axisControls: <button type="button">Time axis</button>,
      elevation: { label: "Elevation", maximum: "40", current: "—", unit: "m" }, lanes: {},
      maximumLabel: "Max", averageLabel: "Avg", keyboardLabel: "keyboard", segmentsLabel: "Segments", segmentDetailsLabel: "Details" }} />);
  expect(screen.getByRole("button", { name: "Time axis" })).toBeInTheDocument();
  const plot = plots()[0]!; setBounds(plot); act(() => resize());
  const ticks = view.container.querySelector(".analysis-timeline-ticks")!;
  expect(ticks.children).toHaveLength(2);
  expect(ticks).toHaveTextContent("1:00:00");
  plot.getBoundingClientRect = () => ({ left: 0, width: 600, top: 0, bottom: 100, right: 600, height: 100, x: 0, y: 0, toJSON() {} });
  act(() => resize());
  expect(ticks.children).toHaveLength(6);
});

it("keeps one caption row in place before and after selecting a range or a segment", () => {
  const { container } = renderWithProviders(<Example />);
  const rows = () => [...container.querySelectorAll(".analysis-timeline > *")].map(row => row.className);
  const before = rows();
  expect(container.querySelector(".analysis-timeline-caption-slot")).toHaveTextContent("Drag to inspect");
  expect(container.querySelector(".analysis-timeline-segment-summary")).toBeNull();
  const plot = plots()[1]!; setBounds(plot);
  fireEvent.pointerDown(plot, { clientX: 25, button: 0 }); fireEvent.pointerMove(plot, { clientX: 75 }); fireEvent.pointerUp(window, { clientX: 75 });
  // 선택 뒤에도 같은 줄 구성 — 고도 아래·지표 위에 줄이 새로 끼어들지 않는다.
  expect(rows()).toEqual(before);
  // 고른 범위가 세그먼트와 같으면 같은 자리에 세그먼트 이름·기록이 나온다(줄이 늘지 않는다).
  expect(container.querySelector(".analysis-timeline-caption-slot .analysis-timeline-segment-summary")).toHaveTextContent("Real segment");
});

it("clips elapsed plot and tick labels to exact requested time rather than enclosing samples", () => {
  renderWithProviders(<Example elapsed exact />);
  const [overview, metric] = latestPlots();
  expect(overview.options.scales.x).toMatchObject({ min: 0, max: 2 });
  expect(metric.options.scales.x).toMatchObject({ min: .35, max: 1.35 });
  expect(screen.getByText("0:21")).toBeInTheDocument();
  expect(screen.getByText("1:21")).toBeInTheDocument();
});
