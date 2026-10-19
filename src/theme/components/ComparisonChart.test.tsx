import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ComparisonChart, type ComparisonChartProps } from './ComparisonChart';
const { charts } = vi.hoisted(() => ({ charts: vi.fn() }));
vi.mock('react-chartjs-2', () => ({ Line: (props: any) => { charts(props); return <canvas role={props.role} aria-label={props['aria-label']} />; } }));

it('renders prepared fixture lanes without a theme provider and shares a functional viewport', () => {
  const changed = vi.fn();
  const props: ComparisonChartProps = {
    description: <p>표본 설명</p>, beforePlot: <p>기록 범례</p>,
    lanes: [{ id: 'power', label: '파워', unit: 'W', sampled: true, series: [{ id: 'record', label: '예시 기록', color: '#FC5200', points: [{ x: 0, y: 0 }, { x: 5, y: null }, { x: 10, y: 200 }] }] }, { id: 'speed', label: '속도', unit: 'km/h', series: [] }],
    domain: [0, 10], minSpan: 1, axisKey: 'distance', colors: { grid: 'gray', gridAxis: 'gray', gridLabel: 'gray' },
    rangeLabel: (start, end) => `${start}–${end} km`, selectedCoordinate: null, onHoverCoordinate: vi.fn(), onViewportChange: changed,
    labels: { controls: '표시 범위', zoomIn: '확대', zoomOut: '축소', selectRange: '구간 선택', selectRangeShort: '구간', reset: '전체', rangeHint: '끌어서 선택', empty: '표본 없음' },
  };
  const view = render(<ComparisonChart {...props} />);
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(screen.getByText('표본 설명').compareDocumentPosition(screen.getByText('기록 범례')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('기록 범례').compareDocumentPosition(screen.getByRole('region', { name: '파워 (W)' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('button', { name: '전체' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(screen.getByRole('button', { name: '전체' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '전체' }));
  expect(screen.getByRole('button', { name: '전체' })).toBeDisabled();
  expect(screen.getByText('표본 없음')).toBeInTheDocument();
  expect(charts.mock.calls[0]![0].data.datasets[0].data).toContainEqual({ x: 0, y: 0 });
  expect(charts.mock.calls[0]![0].data.datasets[0].borderWidth).toBe(1.5);
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  expect(changed).toHaveBeenLastCalledWith([2.5, 7.5], [0, 10]);
  expect(charts.mock.calls.slice(-2).map(call => call[0].options.scales.x.max)).toEqual([7.5, 7.5]);
  view.rerender(<ComparisonChart {...props} axisKey="clock" />);
  expect(changed).toHaveBeenLastCalledWith(null, [0, 10]);
});
