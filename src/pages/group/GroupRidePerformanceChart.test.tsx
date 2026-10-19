import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupRidePerformanceChart, { type GroupRideOverlay } from "./GroupRidePerformanceChart";
const { line, draw } = vi.hoisted(() => ({ line: vi.fn(), draw: vi.fn() }));
vi.mock("react-chartjs-2", () => ({ Line: (props: any) => {
  line(props);
  props.ref?.({ draw, canvas: { getBoundingClientRect: () => ({ left: 0 }) }, chartArea: { left: 0, right: 100 }, scales: { x: { getValueForPixel: (pixel: number) => props.options.scales.x.min + pixel / 100 * (props.options.scales.x.max - props.options.scales.x.min) } } });
  return <canvas role={props.role} aria-label={props["aria-label"]} />;
} }));
const metrics = new Set(["hr", "power", "speed"]);
const data = [{ distance: 0, elevation: 10 }, { distance: 1000, elevation: 20 }, { distance: 2000, elevation: 30 }];
const overlays: GroupRideOverlay[] = [
  { label: "First HR", borderDash: [2, 3], data: [100, 110, 120], distance: [0, 1000, 2000], elapsedAxisSec: [0, 10, 20], color: "#3b82f6", yAxisID: "yHR" },
  { label: "Second HR", data: [130, 140, 150], distance: [0, 3000, 6000], elapsedAxisSec: [0, 30, 60], color: "#f97316", yAxisID: "yHR" },
  { label: "Power", data: [0, 200, 300], distance: [0, 3000, 6000], elapsedAxisSec: [0, 30, 60], color: "#f97316", yAxisID: "yPower" },
  { label: "Speed", data: [0, 20, 30], distance: [0, 3000, 6000], elapsedAxisSec: [0, 30, 60], color: "#f97316", yAxisID: "ySpeed" },
];
const base = { data, elapsedAxisSec: [0, 10, 20], xAxis: "elapsed" as const, overlays, activeMetrics: metrics, selectedCoordinate: null, onHoverCoordinate: vi.fn() };
const charts = () => line.mock.calls.slice(-4).map(call => call[0]);
beforeEach(() => { line.mockClear(); draw.mockClear(); base.onHoverCoordinate.mockClear(); vi.stubGlobal("PointerEvent", MouseEvent); });
afterEach(() => vi.unstubAllGlobals());
function selectRange(from = 25, to = 75) {
  const plot = screen.getByRole("region", { name: "심박수 (bpm)" }).querySelector(".ds-chart-lane__plot")!;
  fireEvent.click(screen.getByRole("button", { name: "구간 선택" }));
  fireEvent.pointerDown(plot, { clientX: from, pointerId: 1 });
  fireEvent.pointerMove(plot, { clientX: to, pointerId: 1 });
  fireEvent.pointerUp(plot, { clientX: to, pointerId: 1 });
}
it("separates units into three common-axis panels and a faint elevation strip, without stacking power", () => {
  renderWithProviders(<GroupRidePerformanceChart {...base} />);
  const [hr, power, speed, elevation] = charts();
  expect(hr.data.datasets).toHaveLength(2);
  expect(hr.options.events).toEqual([]);
  expect(power.data.datasets[0]).toMatchObject({ fill: false, data: expect.arrayContaining([{ x: 0, y: 0 }]) });
  expect(power.options.scales.y.stacked).not.toBe(true);
  expect(hr.data.datasets[0].fill).toBe(false);
  for (const chart of [hr, power, speed]) {
    expect(chart.data.datasets[0].borderWidth).toBe(2);
    expect(chart.data.datasets[0].borderDash).toEqual([]);
    expect(chart.data.datasets[0].borderColor).toContain("0.8");
  }
  expect(elevation.data.datasets[0].borderWidth).toBe(1);
  expect(speed.data.datasets[0].data[0].y).toBe(0);
  expect(elevation.data.datasets[0].borderColor).toContain("0.18");
  expect(charts().map(chart => [chart.options.scales.x.min, chart.options.scales.x.max])).toEqual([[0, 1], [0, 1], [0, 1], [0, 1]]);
  expect(screen.getAllByRole("img")).toHaveLength(4);
});
it("reports actual coordinates beyond the base through one frame-batched pointer path", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return 1; });
  try {
    renderWithProviders(<GroupRidePerformanceChart {...base} />);
    act(() => frames.splice(0).forEach(callback => callback(0)));
    const plot = screen.getByRole("region", { name: "심박수 (bpm)" }).querySelector(".ds-chart-lane__plot")!;
    fireEvent.pointerMove(plot, { clientX: 70 });
    fireEvent.pointerMove(plot, { clientX: 75 });
    expect(base.onHoverCoordinate).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    act(() => frames[0]!(0));
    expect(base.onHoverCoordinate).toHaveBeenLastCalledWith(0.75);
    expect(charts()[0].options.onHover).toBeUndefined();
  } finally { vi.unstubAllGlobals(); }
});
it("redraws only the shared cursor without changing Line data or options on selection", () => {
  const view = renderWithProviders(<GroupRidePerformanceChart {...base} />);
  const before = charts();
  draw.mockClear();
  view.rerender(<GroupRidePerformanceChart {...base} selectedCoordinate={0.75} />);
  const after = charts();
  for (let index = 0; index < 4; index++) {
    expect(after[index].data).toBe(before[index].data);
    expect(after[index].options).toBe(before[index].options);
  }
  expect(draw).toHaveBeenCalledTimes(4);
});

it("zooms all panels together, resets the range and clamps after records are hidden", () => {
  const view = renderWithProviders(<GroupRidePerformanceChart {...base} />);
  selectRange();
  expect(charts().map(chart => [chart.options.scales.x.min, chart.options.scales.x.max])).toEqual(Array(4).fill([0.25, 0.75]));
  fireEvent.click(screen.getByRole("button", { name: "초기화" }));
  expect(charts()[0].options.scales.x.max).toBe(1);
  selectRange();
  view.rerender(<GroupRidePerformanceChart {...base} overlays={[overlays[0]!]} />);
  const range = charts()[0].options.scales.x;
  expect(range.min).toBeLessThan(range.max);
  expect(range.max).toBeLessThanOrEqual(20 / 60);
});
it("applies an explicitly armed pointer range to every lane without consuming ordinary page scrolling", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  try {
    renderWithProviders(<GroupRidePerformanceChart {...base} />);
    const plot = screen.getByRole("region", { name: "심박수 (bpm)" }).querySelector(".ds-chart-lane__plot")!;
    fireEvent.pointerDown(plot, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(plot, { clientX: 80, pointerId: 1 });
    fireEvent.pointerUp(plot, { clientX: 80, pointerId: 1 });
    expect(charts()[0].options.scales.x.max).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "구간 선택" }));
    fireEvent.pointerDown(plot, { clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(plot, { clientX: 80, pointerId: 1 });
    fireEvent.pointerUp(plot, { clientX: 80, pointerId: 1 });
    expect(charts().map(chart => [chart.options.scales.x.min, chart.options.scales.x.max])).toEqual(Array(4).fill([0.2, 0.8]));
    expect(screen.getByRole("button", { name: "구간 선택" })).toHaveAttribute("aria-pressed", "false");
  } finally { vi.unstubAllGlobals(); }
});
it("breaks long time gaps while preserving zero samples and leaves distance plotting unchanged", () => {
  const gap: GroupRideOverlay = { ...overlays[2]!, data: [0, 10, 20, 30], distance: [0, 100, 200, 300], elapsedAxisSec: [0, 1, 2, 600] };
  const view = renderWithProviders(<GroupRidePerformanceChart {...base} overlays={[gap]} />);
  expect(charts()[1].data.datasets[0].data.filter((point: { y: number | null }) => point.y === null)).toHaveLength(1);
  expect(charts()[1].data.datasets[0].data[0].y).toBe(0);
  view.rerender(<GroupRidePerformanceChart {...base} xAxis="distance" overlays={[gap]} />);
  expect(charts()[1].data.datasets[0].data.some((point: { y: number | null }) => point.y === null)).toBe(false);
});

it("selects a stationary tap without requiring pointer movement", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return 1; });
  try {
    renderWithProviders(<GroupRidePerformanceChart {...base} />);
    act(() => frames.splice(0).forEach(callback => callback(0)));
    const plot = screen.getByRole("region", { name: "심박수 (bpm)" }).querySelector(".ds-chart-lane__plot")!;
    fireEvent.pointerDown(plot, { clientX: 75, pointerType: "touch", pointerId: 1 });
    fireEvent.pointerUp(plot, { clientX: 75, pointerType: "touch", pointerId: 1 });
    expect(frames).toHaveLength(1);
    act(() => frames[0]!(0));
    expect(base.onHoverCoordinate).toHaveBeenCalledExactlyOnceWith(0.75);
    expect(charts()[0].options.scales.x.max).toBe(1);
  } finally { vi.unstubAllGlobals(); }
});

it("reports only a narrowed viewport and does not recompute the interval on point selection", () => {
  const changed = vi.fn();
  const view = renderWithProviders(<GroupRidePerformanceChart {...base} onViewportChange={changed} />);
  expect(changed).toHaveBeenLastCalledWith(null, [0, 1]);
  selectRange();
  expect(changed).toHaveBeenLastCalledWith([0.25, 0.75], [0, 1]);
  changed.mockClear();
  view.rerender(<GroupRidePerformanceChart {...base} onViewportChange={changed} selectedCoordinate={0.5} />);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "초기화" }));
  expect(changed).toHaveBeenLastCalledWith(null, [0, 1]);
});

it("adapts power/speed point budgets to width and viewport without reprocessing on cursor changes", () => {
  let resized!: () => void;
  let width = 1454;
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect);
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
  try {
    const samples = Array.from({ length: 12000 }, (_, index) => index);
    const dense: GroupRideOverlay[] = ["yPower", "ySpeed"].map(yAxisID => ({ label: yAxisID, yAxisID, color: "#3b82f6", data: samples.map(() => 100), distance: samples }));
    const props = { ...base, xAxis: "distance" as const, data: [{ distance: 0, elevation: 0 }, { distance: 11999, elevation: 10 }], overlays: dense };
    const view = renderWithProviders(<GroupRidePerformanceChart {...props} />);
    expect(charts()[1].data.datasets[0].data).toHaveLength(153);
    expect(charts()[1].options.scales.x.max).toBe(11.999);
    const dataset = charts()[1].data;
    const options = charts()[1].options;
    view.rerender(<GroupRidePerformanceChart {...props} selectedCoordinate={2} />);
    expect(charts()[1].data).toBe(dataset);
    expect(charts()[1].options).toBe(options);
    width = 334;
    act(() => resized());
    expect(charts()[1].data.datasets[0].data).toHaveLength(29);
    for (let index = 0; index < 10; index++) selectRange();
    expect(charts()[1].data.datasets[0].data.length).toBeLessThanOrEqual(40);
    expect(charts()[1].data.datasets[0].data.every((point: { y: number }) => point.y === 100)).toBe(true);
    expect(charts()[1].data.datasets[0].fill).toBe(false);
    expect(charts()[1].data.datasets[0].tension).toBe(0);
  } finally { bounds.mockRestore(); vi.unstubAllGlobals(); }
});

it("keeps long power and speed traces visible on mobile despite brief real gaps, including after zoom", () => {
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 274 }) as DOMRect);
  try {
    const times = Array.from({ length: 314 * 60 + 1 }, (_, second) => second);
    const values = times.map(second => second > 0 && second % 600 === 0 ? null : 0);
    const dense: GroupRideOverlay[] = ["yPower", "ySpeed"].map(yAxisID => ({ label: yAxisID, yAxisID, color: "#3b82f6", data: values, distance: times, elapsedAxisSec: times }));
    renderWithProviders(<GroupRidePerformanceChart {...base} data={[{ distance: 0, elevation: 0 }]} elapsedAxisSec={[0]} overlays={dense} />);
    for (const panel of charts().slice(1, 3)) {
      const points = panel.data.datasets[0].data as { x: number; y: number | null }[];
      expect(points.filter(point => point.y === 0).length).toBeGreaterThan(32);
      expect(points.filter(point => point.y === null)).toHaveLength(31);
      expect(points.length).toBeLessThan(150);
      expect(panel.data.datasets[0].spanGaps).toBe(false);
      expect(panel.data.datasets[0].pointRadius).toBe(0);
    }
    for (let index = 0; index < 4; index++) selectRange();
    for (const panel of charts().slice(1, 3)) {
      expect(panel.data.datasets[0].data.some((point: { y: number | null }) => point.y === 0)).toBe(true);
      expect(panel.options.scales.x.max - panel.options.scales.x.min).toBeCloseTo(314 / 16);
    }
    expect(values[600]).toBeNull();
    expect(values[0]).toBe(0);
    expect(values).toHaveLength(18841);
  } finally { bounds.mockRestore(); }
});
