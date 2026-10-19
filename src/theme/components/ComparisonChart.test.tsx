import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ComparisonChart, type ComparisonChartProps } from './ComparisonChart';
const { charts, draw, instances } = vi.hoisted(() => ({ charts: vi.fn(), draw: vi.fn(), instances: [] as any[] }));
vi.mock('react-chartjs-2', () => ({ Line: (props: any) => {
  charts(props);
  const instance = { draw, canvas: { getBoundingClientRect: () => ({ left: 0 }) }, chartArea: { left: 0, right: 100, top: 0, bottom: 120 }, scales: { x: { getPixelForValue: (value: number) => (value - props.options.scales.x.min) / (props.options.scales.x.max - props.options.scales.x.min) * 100, getValueForPixel: (pixel: number) => props.options.scales.x.min + pixel / 100 * (props.options.scales.x.max - props.options.scales.x.min) }, y: { min: props.options.scales.y.min ?? 0, max: props.options.scales.y.max ?? 250 } } };
  instances.push(instance); props.ref?.(instance);
  return <canvas role={props.role} aria-label={props['aria-label']} />;
} }));
class FixturePointerEvent extends MouseEvent {
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    Object.defineProperties(this, { pointerId: { value: init.pointerId ?? 1 }, isPrimary: { value: init.isPrimary ?? true }, pointerType: { value: init.pointerType ?? 'mouse' } });
  }
}
let nextFrame = 0;
let pendingFrames = new Map<number, FrameRequestCallback>();
beforeEach(() => {
  charts.mockClear(); instances.length = 0; pendingFrames = new Map(); nextFrame = 0;
  vi.stubGlobal('PointerEvent', FixturePointerEvent);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pendingFrames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id));
});
function flushFrame() { const callbacks = [...pendingFrames.values()]; pendingFrames.clear(); act(() => callbacks.forEach(callback => callback(0))); }
afterEach(() => vi.unstubAllGlobals());
const fixture = (changed = vi.fn()): ComparisonChartProps => ({
  description: <p>표본 설명</p>, beforePlot: <p>기록 범례</p>,
  lanes: [{ id: 'power', label: '파워', unit: 'W', sampled: true, series: [{ id: 'record', label: '예시 기록', color: '#FC5200', points: [{ x: 0, y: 0 }, { x: 5, y: null }, { x: 10, y: 200 }] }] }, { id: 'speed', label: '속도', unit: 'km/h', series: [] }],
  domain: [0, 10], minSpan: 1, axisKey: 'distance', colors: { grid: 'gray', gridAxis: 'gray', gridLabel: 'gray' },
  rangeLabel: (start, end) => `${start}–${end} km`, selectedCoordinate: 5, onHoverCoordinate: vi.fn(), onViewportChange: changed,
  labels: { controls: '표시 범위', selectRange: '구간 선택', selectRangeShort: '구간 선택', panRange: '구간 이동', panHint: '드래그 또는 방향키로 이동', panUnavailable: '구간을 선택하면 이동할 수 있어요', reset: '초기화', rangeHint: '끌어서 선택', empty: '표본 없음' },
});
const plot = () => screen.getByRole('region', { name: '파워 (W)' }).querySelector<HTMLDivElement>('.ds-chart-lane__plot')!;
const ranges = () => charts.mock.calls.slice(-2).map(call => [call[0].options.scales.x.min, call[0].options.scales.x.max]);
function select(from = 20, to = 60) {
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  fireEvent.pointerDown(plot(), { clientX: from, pointerId: 1 });
  fireEvent.pointerMove(plot(), { clientX: to, pointerId: 1 });
  fireEvent.pointerUp(plot(), { clientX: to, pointerId: 1 });
}

it('keeps three tools, an inspect default and one shared viewport with prepared zero/gap samples', () => {
  const changed = vi.fn(), props = fixture(changed);
  const view = render(<ComparisonChart {...props} />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.getByRole('button', { name: '구간 이동' })).toBeDisabled();
  expect(screen.getByText('구간을 선택하면 이동할 수 있어요')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '초기화' })).toBeDisabled();
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(screen.getByText('표본 설명').compareDocumentPosition(screen.getByText('기록 범례')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('기록 범례').compareDocumentPosition(screen.getByRole('region', { name: '파워 (W)' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(charts.mock.calls[0]![0].data.datasets[0].data).toContainEqual({ x: 0, y: 0 });
  expect(charts.mock.calls[0]![0].data.datasets[0].borderWidth).toBe(1.5);
  select(25, 75);
  expect(changed).toHaveBeenLastCalledWith([2.5, 7.5], [0, 10]);
  expect(ranges()).toEqual([[2.5, 7.5], [2.5, 7.5]]);
  expect(screen.getByRole('button', { name: '구간 이동' })).toHaveAttribute('aria-pressed', 'false');
  expect(plot()).toHaveAttribute('data-gesture', 'pan-y');
  view.rerender(<ComparisonChart {...props} axisKey="clock" />);
  expect(changed).toHaveBeenLastCalledWith(null, [0, 10]);
});

it('pans from one immutable snapshot, ignores other pointers and clamps both edges while preserving the selected point', () => {
  const props = fixture();
  render(<ComparisonChart {...props} />);
  select();
  fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  expect(plot()).toHaveAttribute('data-gesture', 'none');
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 7 });
  fireEvent.pointerMove(plot(), { clientX: 0, pointerId: 7 }); flushFrame();
  expect(ranges()).toEqual([[4, 8], [4, 8]]);
  fireEvent.pointerMove(plot(), { clientX: 25, pointerId: 7 }); flushFrame();
  expect(ranges()).toEqual([[3, 7], [3, 7]]);
  fireEvent.pointerMove(plot(), { clientX: 90, pointerId: 8 }); flushFrame();
  expect(ranges()).toEqual([[3, 7], [3, 7]]);
  fireEvent.pointerMove(plot(), { clientX: 250, pointerId: 7 }); flushFrame();
  expect(ranges()).toEqual([[0, 4], [0, 4]]);
  fireEvent.pointerUp(plot(), { clientX: -250, pointerId: 7 });
  expect(ranges()).toEqual([[6, 10], [6, 10]]);
  expect(props.onViewportChange).toHaveBeenLastCalledWith([6, 10], [0, 10]);
  expect(props.onHoverCoordinate).not.toHaveBeenCalled();
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 8, button: 2 });
  fireEvent.pointerMove(plot(), { clientX: 100, pointerId: 8 }); flushFrame();
  expect(ranges()).toEqual([[6, 10], [6, 10]]);
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 8, isPrimary: false });
  fireEvent.pointerMove(plot(), { clientX: 100, pointerId: 8 }); flushFrame();
  expect(ranges()).toEqual([[6, 10], [6, 10]]);
});

it('restores a canceled pan and releases capture on cancel, lost capture and an axis change', () => {
  const props = fixture();
  const view = render(<ComparisonChart {...props} />);
  select(); fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  const target = plot();
  target.setPointerCapture = vi.fn(); target.hasPointerCapture = () => true; target.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(target, { clientX: 50, pointerId: 4 });
  fireEvent.pointerMove(target, { clientX: 25, pointerId: 4 }); flushFrame();
  expect(ranges()).toEqual([[3, 7], [3, 7]]);
  fireEvent.pointerCancel(target, { pointerId: 4 });
  expect(ranges()).toEqual([[2, 6], [2, 6]]);
  expect(target.releasePointerCapture).toHaveBeenCalledWith(4);
  fireEvent.pointerDown(target, { clientX: 50, pointerId: 5 });
  fireEvent.pointerMove(target, { clientX: 25, pointerId: 5 }); flushFrame();
  fireEvent.lostPointerCapture(target, { pointerId: 5 });
  expect(ranges()).toEqual([[2, 6], [2, 6]]);
  fireEvent.pointerDown(target, { clientX: 50, pointerId: 6 });
  fireEvent.pointerMove(target, { clientX: 25, pointerId: 6 }); flushFrame();
  view.rerender(<ComparisonChart {...props} axisKey="time" />);
  expect(ranges()).toEqual([[0, 10], [0, 10]]);
  expect(target.releasePointerCapture).toHaveBeenCalledWith(6);
  expect(screen.getByRole('button', { name: '구간 이동' })).toBeDisabled();
  expect(plot()).toHaveAttribute('data-gesture', 'pan-y');
});

it('scopes keyboard pan to its active button, preserves the range on Escape and resets all lanes explicitly', () => {
  const bubbled = vi.fn(), props = fixture();
  render(<div onKeyDown={bubbled}><ComparisonChart {...props} /></div>);
  select();
  const pan = screen.getByRole('button', { name: '구간 이동' });
  fireEvent.click(pan); pan.focus();
  fireEvent.keyDown(pan, { key: 'ArrowRight' }); expect(ranges()).toEqual([[3, 7], [3, 7]]);
  fireEvent.keyDown(pan, { key: 'ArrowLeft' }); expect(ranges()).toEqual([[2, 6], [2, 6]]);
  fireEvent.keyDown(pan, { key: 'End' }); expect(ranges()).toEqual([[6, 10], [6, 10]]);
  fireEvent.keyDown(pan, { key: 'Home' }); expect(ranges()).toEqual([[0, 4], [0, 4]]);
  expect(bubbled).not.toHaveBeenCalled();
  fireEvent.keyDown(pan, { key: 'ArrowUp' }); expect(bubbled).toHaveBeenCalledOnce();
  fireEvent.keyDown(pan, { key: 'Escape' });
  expect(pan).toHaveAttribute('aria-pressed', 'false');
  expect(ranges()).toEqual([[0, 4], [0, 4]]);
  expect(bubbled).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  expect(ranges()).toEqual([[0, 10], [0, 10]]);
  expect(props.onViewportChange).toHaveBeenLastCalledWith(null, [0, 10]);
});


it('holds one full-source Y range through pan/release and invalidates it when lane data changes', () => {
  const props = fixture();
  props.lanes = [{ ...props.lanes[0]!, series: [{ ...props.lanes[0]!.series[0]!, points: [{ x: 0, y: 0 }, { x: 5, y: 200 }, { x: 9, y: 1000 }, { x: 10, y: 50 }] }] }, props.lanes[1]!];
  const view = render(<ComparisonChart {...props} />);
  select(); fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  const fixed = { min: charts.mock.calls[charts.mock.calls.length - 2]![0].options.scales.y.min, max: charts.mock.calls[charts.mock.calls.length - 2]![0].options.scales.y.max };
  expect(fixed.min).toBe(0); expect(fixed.max).toBeGreaterThanOrEqual(1000);
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 3 });
  fireEvent.pointerMove(plot(), { clientX: 25, pointerId: 3 }); flushFrame();
  expect(charts.mock.calls[charts.mock.calls.length - 2]![0].options.scales.y).toMatchObject(fixed);
  fireEvent.pointerUp(plot(), { clientX: -50, pointerId: 3 });
  expect(charts.mock.calls[charts.mock.calls.length - 2]![0].options.scales.y).toMatchObject(fixed);
  expect(pendingFrames.size).toBe(0);
  const changed = [{ ...props.lanes[0]!, series: [] }, props.lanes[1]!];
  view.rerender(<ComparisonChart {...props} lanes={changed} />);
  expect(charts.mock.calls[charts.mock.calls.length - 2]![0].options.scales.y.min).toBeUndefined();
  expect(screen.getByRole('button', { name: '구간 이동' })).toHaveAttribute('aria-pressed', 'false');
});

it('coalesces pan moves to the latest frame, flushes release and prevents canceled/reset frames from moving later', () => {
  const props = fixture(); render(<ComparisonChart {...props} />); flushFrame();
  select(); fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 2 });
  fireEvent.pointerMove(plot(), { clientX: 0, pointerId: 2 });
  fireEvent.pointerMove(plot(), { clientX: 25, pointerId: 2 });
  expect(pendingFrames.size).toBe(1);
  expect(ranges()).toEqual([[2, 6], [2, 6]]);
  flushFrame(); expect(ranges()).toEqual([[3, 7], [3, 7]]);
  fireEvent.pointerMove(plot(), { clientX: 10, pointerId: 2 });
  const canceled = [...pendingFrames.values()];
  fireEvent.pointerCancel(plot(), { pointerId: 2 });
  expect(pendingFrames.size).toBe(0);
  act(() => canceled.forEach(callback => callback(0)));
  expect(ranges()).toEqual([[2, 6], [2, 6]]);
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 3 });
  fireEvent.pointerMove(plot(), { clientX: 25, pointerId: 3 });
  const reset = [...pendingFrames.values()];
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  expect(pendingFrames.size).toBe(0);
  act(() => reset.forEach(callback => callback(0)));
  expect(ranges()).toEqual([[0, 10], [0, 10]]);
  select(); fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 4 });
  fireEvent.pointerMove(plot(), { clientX: 25, pointerId: 4 });
  fireEvent.pointerUp(plot(), { clientX: 0, pointerId: 4 });
  expect(pendingFrames.size).toBe(0);
  expect(ranges()).toEqual([[4, 8], [4, 8]]);
});


it('retains the anchored sampled values and their data reference after releasing and leaving pan mode', () => {
  const props = fixture();
  props.lanes = [{ ...props.lanes[0]!, samplingPolicy: 'preserve-runs', series: [{ ...props.lanes[0]!.series[0]!, points: Array.from({ length: 2001 }, (_, index) => ({ x: index / 200, y: index * index })) }] }, props.lanes[1]!];
  render(<ComparisonChart {...props} />);
  select(); fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  fireEvent.pointerDown(plot(), { clientX: 50, pointerId: 9 });
  fireEvent.pointerMove(plot(), { clientX: 25, pointerId: 9 }); flushFrame();
  fireEvent.pointerUp(plot(), { clientX: 25, pointerId: 9 });
  const data = charts.mock.calls[charts.mock.calls.length - 2]![0].data;
  expect(data.datasets[0].data.length).toBeLessThan(100);
  fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  expect(screen.getByRole('button', { name: '구간 이동' })).toHaveAttribute('aria-pressed', 'false');
  expect(charts.mock.calls[charts.mock.calls.length - 2]![0].data).toBe(data);
});

it('draws a clipped accent range band and both endpoint guides across lanes, clearing them on cancel', () => {
  render(<ComparisonChart {...fixture()} selectedCoordinate={null} />);
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  fireEvent.pointerDown(plot(), { clientX: 20, pointerId: 7 });
  fireEvent.pointerMove(plot(), { clientX: 60, pointerId: 7 });
  const paint = () => instances.slice(-2).map((instance, index) => {
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), setLineDash: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 0 };
    instance.ctx = ctx;
    charts.mock.calls.slice(-2)[index]![0].plugins[0].afterDatasetsDraw(instance);
    return ctx;
  });
  for (const ctx of paint()) {
    expect(ctx.clip).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(20, 0, 40, 120);
    expect(ctx.moveTo.mock.calls).toEqual([[20, 0], [60, 0]]);
    expect(ctx.lineTo.mock.calls).toEqual([[20, 120], [60, 120]]);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.restore).toHaveBeenCalled();
  }
  fireEvent.pointerCancel(plot(), { pointerId: 7 });
  for (const ctx of paint()) { expect(ctx.fillRect).not.toHaveBeenCalled(); expect(ctx.stroke).not.toHaveBeenCalled(); }
});

it('reads the interaction accent after parent theme effects and cancels a superseded or unmounted probe', () => {
  const read = vi.fn();
  const original = window.getComputedStyle.bind(window);
  const computed = vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const result = original(element);
    if (!(element instanceof HTMLElement) || element.style.color !== 'var(--accent-text)') return result;
    const accent = document.documentElement.style.getPropertyValue('--fixture-accent');
    read(accent);
    return new Proxy(result, { get: (target, property) => property === 'color' ? accent : Reflect.get(target, property) });
  });
  const props = fixture();
  function Theme({ dark }: { dark: boolean }) {
    useEffect(() => { document.documentElement.style.setProperty('--fixture-accent', dark ? 'rgb(120, 230, 210)' : 'rgb(0, 90, 80)'); }, [dark]);
    return <ComparisonChart {...props} selectedCoordinate={null} colors={{ ...props.colors, gridAxis: dark ? 'silver' : 'gray' }} />;
  }
  const view = render(<Theme dark={false} />);
  try {
    expect(read).not.toHaveBeenCalled();
    flushFrame(); expect(read).toHaveBeenLastCalledWith('rgb(0, 90, 80)');
    view.rerender(<Theme dark />);
    expect(read).toHaveBeenCalledTimes(1);
    flushFrame(); expect(read).toHaveBeenLastCalledWith('rgb(120, 230, 210)');
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    fireEvent.pointerDown(plot(), { clientX: 20, pointerId: 7 });
    fireEvent.pointerMove(plot(), { clientX: 60, pointerId: 7 });
    const instance = instances[instances.length - 2];
    const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), setLineDash: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillStyle: '', strokeStyle: '' };
    instance.ctx = ctx;
    charts.mock.calls[charts.mock.calls.length - 2]![0].plugins[0].afterDatasetsDraw(instance);
    expect(ctx.fillStyle).toBe('rgb(120, 230, 210)');
    expect(ctx.strokeStyle).toBe('rgb(120, 230, 210)');
    view.rerender(<Theme dark={false} />);
    view.rerender(<Theme dark />);
    expect(pendingFrames.size).toBe(1);
    flushFrame(); expect(read).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenLastCalledWith('rgb(120, 230, 210)');
    view.rerender(<Theme dark={false} />);
    view.unmount();
    expect(pendingFrames.size).toBe(0);
  } finally { computed.mockRestore(); document.documentElement.style.removeProperty('--fixture-accent'); }
});
