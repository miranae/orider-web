import { useEffect } from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import SegmentElevationInspector from "./SegmentElevationInspector";

const { chart, boundaryKey, replay } = vi.hoisted(() => ({ chart: vi.fn(), boundaryKey: vi.fn(), replay: { index: null as number | null, calls: vi.fn() } }));
vi.mock("../../components/ElevationChart", () => ({ default: function MockElevationChart(props: { onHoverIndex?: (index: number | null) => void }) { chart(props); useEffect(() => { if (replay.index !== null) { replay.calls(); props.onHoverIndex?.(replay.index); } }); return <div tabIndex={0} data-testid="shared-chart-focus" onKeyDown={event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) boundaryKey(event.key); }}><canvas data-testid="sample-chart-canvas" /></div>; } }));
beforeEach(() => { chart.mockClear(); boundaryKey.mockClear(); replay.index = null; replay.calls.mockClear(); });
const data = [{distance:0,elevation:10},{distance:1234,elevation:42},{distance:2000,elevation:NaN}];
it("reads existing distance/elevation samples, survives canvas leave and closes without immediately reopening", () => {
  const onHover = vi.fn();
  renderWithProviders(<SegmentElevationInspector data={data} onHoverIndex={onHover} />, {route:"/segment/create"});
  act(() => chart.mock.lastCall?.[0].onHoverIndex(1));
  const panel = screen.getByTestId("segment-elevation-inspection");
  expect(panel).toHaveTextContent("이동거리1.23 km");
  expect(panel).toHaveTextContent("해발고도42 m");
  act(() => chart.mock.lastCall?.[0].onHoverIndex(null));
  expect(panel).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole("button", {name:"닫기"}));
  expect(screen.queryByTestId("segment-elevation-inspection")).not.toBeInTheDocument();
  expect(screen.getByRole("group", {name:"구간 고도 차트"})).toHaveFocus();
  expect(onHover).toHaveBeenLastCalledWith(null);
  fireEvent.pointerMove(screen.getByTestId("sample-chart-canvas"));
  act(() => chart.mock.lastCall?.[0].onHoverIndex(2));
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("해발고도—");
});
it("inspects with the keyboard without dispatching global segment range arrow shortcuts", () => {
  renderWithProviders(<SegmentElevationInspector data={data} />, {route:"/segment/create"});
  const wrapper = screen.getByRole("group", {name:"구간 고도 차트"});
  const globalKey = vi.fn();window.addEventListener("keydown",globalKey);
  try {
    fireEvent.focus(wrapper);
    fireEvent.keyDown(wrapper,{key:"End"});
    expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("2.00 km");
    fireEvent.keyDown(wrapper,{key:"ArrowLeft"});
    expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("1.23 km");
    expect(globalKey).not.toHaveBeenCalled();
    fireEvent.keyDown(wrapper,{key:"Escape"});
    expect(screen.queryByTestId("segment-elevation-inspection")).not.toBeInTheDocument();
    fireEvent.keyDown(wrapper,{key:"Home"});
    expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("0.00 km");
    fireEvent.pointerLeave(wrapper,{pointerType:"mouse"});
    expect(screen.queryByTestId("segment-elevation-inspection")).not.toBeInTheDocument();
  } finally {window.removeEventListener("keydown",globalKey);}
});
it("does not retain a sample from the preceding activity", () => {
  const {rerender}=renderWithProviders(<SegmentElevationInspector data={data} />, {route:"/segment/create"});
  act(() => chart.mock.lastCall?.[0].onHoverIndex(1));
  expect(screen.getByTestId("segment-elevation-inspection")).toBeInTheDocument();
  rerender(<SegmentElevationInspector data={[{distance:0,elevation:99}]} />);
  expect(screen.queryByTestId("segment-elevation-inspection")).not.toBeInTheDocument();
});


it("focuses a mouse-clicked chart and isolates sample inspection keys from boundary shortcuts", () => {
  renderWithProviders(<><button>Outside chart</button><SegmentElevationInspector data={data} /></>, {route:"/segment/create"});
  const globalKey = vi.fn(); window.addEventListener("keydown",globalKey);
  try {
    fireEvent.pointerDown(screen.getByTestId("sample-chart-canvas"),{pointerType:"mouse"});
    const wrapper = screen.getByRole("group",{name:"구간 고도 차트"});
    expect(wrapper).toHaveFocus();
    act(() => chart.mock.lastCall?.[0].onHoverIndex(1));
    fireEvent.keyDown(document.activeElement!,{key:"ArrowRight"});
    expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("2.00 km");
    const panel = screen.getByTestId("segment-elevation-inspection");
    act(()=>panel.focus());
    fireEvent.keyDown(panel,{key:"ArrowLeft"});
    expect(panel).toHaveTextContent("2.00 km");
    expect(globalKey).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button",{name:"Outside chart"}),{key:"ArrowRight"});
    expect(globalKey).toHaveBeenCalledOnce();
  } finally { window.removeEventListener("keydown",globalKey); }
});


it("inspects samples when the nested range chart receives native focus and preempts its boundary shortcuts", () => {
  renderWithProviders(<SegmentElevationInspector data={data} rangeMode range={[0,2]} onRangeChange={vi.fn()} />, {route:"/segment/create"});
  const child = screen.getByTestId("shared-chart-focus");
  act(()=>child.focus());
  act(()=>chart.mock.lastCall?.[0].onHoverIndex(1));
  expect(child).toHaveFocus();
  fireEvent.keyDown(child,{key:"ArrowRight"});
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("2.00 km");
  fireEvent.keyDown(child,{key:"Home"});
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("0.00 km");
  fireEvent.keyDown(child,{key:"End"});
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("2.00 km");
  expect(boundaryKey).not.toHaveBeenCalled();
});


it("keeps keyboard selection and dismissal through Chart.js last-hover replay until a real pointer action", () => {
  renderWithProviders(<SegmentElevationInspector data={data} />, {route:"/segment/create"});
  const child = screen.getByTestId("shared-chart-focus");
  act(()=>child.focus());
  fireEvent.pointerMove(screen.getByTestId("sample-chart-canvas"));
  act(()=>chart.mock.lastCall?.[0].onHoverIndex(1));
  replay.index = 1;
  fireEvent.keyDown(child,{key:"End"});
  expect(replay.calls).toHaveBeenCalled();
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("2.00 km");
  fireEvent.keyDown(child,{key:"Home"});
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("0.00 km");
  fireEvent.keyDown(child,{key:"ArrowRight"});
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("1.23 km");
  fireEvent.keyDown(child,{key:"Escape"});
  expect(screen.queryByTestId("segment-elevation-inspection")).not.toBeInTheDocument();
  fireEvent.pointerMove(screen.getByTestId("sample-chart-canvas"));
  act(()=>chart.mock.lastCall?.[0].onHoverIndex(1));
  expect(screen.getByTestId("segment-elevation-inspection")).toHaveTextContent("1.23 km");
});
