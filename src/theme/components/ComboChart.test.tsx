import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ComboChart, type ComboChartProps } from './ComboChart';
vi.mock('chart.js', async importOriginal => await importOriginal());
const { rendered, draw } = vi.hoisted(() => ({ rendered: vi.fn(), draw: vi.fn() }));
vi.mock('react-chartjs-2', () => ({ Chart: (props: any) => {
  rendered(props);
  props.ref.current = { draw, canvas: { getBoundingClientRect: () => ({ left: 0 }) }, chartArea: { left: 0, right: 100 }, scales: { x: { min: 0, max: 10, getValueForPixel: (pixel: number) => pixel / 10 } } };
  return <canvas role={props.role} aria-label={props['aria-label']} />;
} }));
const props: ComboChartProps = {
  axes: { left: { label: '파워', unit: 'W' }, right: { label: '심박수', unit: 'bpm' } }, domain: [0, 10], xLabel: '시간 (분)',
  series: [{ id: 'power', label: '파워', color: '#005DBA', mark: 'bar', axis: 'left', points: [{ x: 0, y: 0 }, { x: 5, y: null }, { x: 10, y: 200 }] }, { id: 'hr', label: '심박수', color: '#A63A00', mark: 'line', axis: 'right', points: [{ x: 0, y: 120 }, { x: 5, y: null }, { x: 10, y: 140 }] }],
  colors: { grid: 'gray', gridAxis: 'gray', gridLabel: 'gray' }, visibleSeries: new Set(['power', 'hr']), onToggleSeries: vi.fn(), selectedCoordinate: null, onSelectCoordinate: vi.fn(),
  labels: { chart: '파워와 심박수', legend: '표시 지표', empty: '기록 없음', keyboardHint: '방향키로 선택' },
};
it('uses actual bar/line datasets, independent units, null gaps and zero; legend selection is controlled', () => {
  const view = render(<ComboChart {...props} />);
  const chart = rendered.mock.lastCall![0];
  expect(chart.data.datasets.map((dataset: { type: string; yAxisID: string }) => [dataset.type, dataset.yAxisID])).toEqual([['bar', 'left'], ['line', 'right']]);
  expect(chart.data.datasets[0].data[0].y).toBe(0);
  expect(chart.data.datasets[1].data[1].y).toBeNull();
  expect(chart.data.datasets[1].spanGaps).toBe(false);
  expect(chart.options.scales.left.title.text).toBe('파워 (W)');
  expect(chart.options.scales.right.title.text).toBe('심박수 (bpm)');
  fireEvent.click(screen.getByRole('button', { name: '파워 (W)' }));
  expect(props.onToggleSeries).toHaveBeenCalledWith('power');
  view.rerender(<ComboChart {...props} visibleSeries={new Set(['hr'])} />);
  expect(rendered.mock.lastCall![0].data.datasets).toHaveLength(1);
  expect(screen.getByRole('button', { name: '파워 (W)' })).toHaveAttribute('aria-pressed', 'false');
});
it('selects original shared zero and gap coordinates by keyboard or touch and retains the canvas on selection/empty updates', () => {
  const selected = vi.fn();
  vi.stubGlobal('PointerEvent', MouseEvent);
  try {
    const view = render(<ComboChart {...props} onSelectCoordinate={selected} />);
    const canvas = screen.getByRole('img');
    const plot = screen.getByRole('group', { name: '파워와 심박수' });
    fireEvent.keyDown(plot, { key: 'Home' });
    expect(selected).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(plot, { key: 'End' });
    expect(selected).toHaveBeenLastCalledWith(10);
    fireEvent.pointerDown(plot, { clientX: 2 });
    expect(selected).toHaveBeenLastCalledWith(0);
    const data = rendered.mock.lastCall![0].data;
    act(() => view.rerender(<ComboChart {...props} selectedCoordinate={10} onSelectCoordinate={selected} />));
    expect(rendered.mock.lastCall![0].data).toBe(data);
    expect(draw).toHaveBeenCalled();
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(selected).toHaveBeenLastCalledWith(5);
    view.rerender(<ComboChart {...props} selectedCoordinate={5} onSelectCoordinate={selected} />);
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(selected).toHaveBeenLastCalledWith(10);
    fireEvent.keyDown(plot, { key: 'Escape' });
    expect(selected).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('img')).toBe(canvas);
    view.rerender(<ComboChart {...props} visibleSeries={new Set()} onSelectCoordinate={selected} />);
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBe(canvas);
  } finally { vi.unstubAllGlobals(); }
});

it('uses sample-sized bar edges instead of half-tick offsets and keeps natural ticks inside the data range', () => {
  render(<ComboChart {...props} domain={[0, 90]} series={[{ ...props.series[0]!, points: [{ x: 0, y: 0 }, { x: 3, y: 100 }, { x: 90, y: 150 }] }]} />);
  const x = rendered.mock.lastCall![0].options.scales.x;
  expect(x.offset).toBe(false);
  expect(x.min).toBe(-1.5);
  expect(x.max).toBe(91.5);
  expect(x.ticks.stepSize).toBe(30);
  expect(x.ticks.includeBounds).toBe(false);
  expect(x.ticks.callback(-1.5)).toBe('');
  expect(x.ticks.callback(91.5)).toBe('');
  expect(x.ticks.callback(0)).toBe('0');
  expect(x.ticks.callback(90)).toBe('90');
  expect(rendered.mock.lastCall![0].data.datasets[0].data.map((point: { x: number }) => point.x)).toEqual([0, 3, 90]);
});
