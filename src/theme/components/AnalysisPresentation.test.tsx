import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BeforeAfterPlot, ReferenceGauge, SegmentTimeline } from './AnalysisPresentation';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('exposes timeline intervals and missing composition without relying on color', () => {
  render(<SegmentTimeline aria-label="심박 존 분포" accessibleHint="각 구간의 존 구성은 구간 이름으로 읽을 수 있습니다." rows={[{ id: 'hr', label: '심박수', buckets: [
    { id: 'first', label: '0–30초, Z2 20초, 결측 10초', weight: 30, segments: [{ weight: 20, color: 'var(--accent)' }, { weight: 10, color: null }] },
    { id: 'second', label: '30–90초, Z3 60초', weight: 60, segments: [{ weight: 60, color: 'var(--accent)' }] },
  ] }]} />);
  const timeline = screen.getByRole('group', { name: '심박 존 분포' });
  expect(within(timeline).getByRole('group', { name: '심박수' })).toBeInTheDocument();
  expect(within(timeline).getByRole('img', { name: '0–30초, Z2 20초, 결측 10초' })).toBeInTheDocument();
  expect(within(timeline).getByRole('img', { name: '30–90초, Z3 60초' })).toBeInTheDocument();
  expect(screen.getByText('각 구간의 존 구성은 구간 이름으로 읽을 수 있습니다.')).toBeInTheDocument();
  const coloredSegment = timeline.querySelector<HTMLElement>('.ds-segment-timeline__segment');
  expect(coloredSegment?.style.backgroundColor).toBe('var(--accent)');
  expect(coloredSegment?.style.backgroundImage).toBe('');
});

it('clamps only gauge geometry and preserves the actual out-of-range value in its accessible name', () => {
  const { container, rerender } = render(<ReferenceGauge value={1.45} domain={[0.4, 1.3]} bands={[]} ticks={[]} reference={{ value: 1, label: 'FTP' }} outsideLabel="≥1.30" aria-label="운동강도 1.45, FTP 기준, 읽기 전용" />);
  expect(screen.getByRole('img', { name: '운동강도 1.45, FTP 기준, 읽기 전용' })).toBeInTheDocument();
  expect(container.querySelector('.ds-reference-gauge__marker')).toHaveStyle('--at: 100%');
  expect(screen.getByText('≥1.30')).toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  rerender(<ReferenceGauge value={NaN} domain={[0.4, 1.3]} bands={[]} ticks={[]} aria-label="운동강도 알 수 없음" />);
  expect(screen.getByRole('img', { name: '운동강도 알 수 없음' })).toBeInTheDocument();
  expect(container.querySelector('.ds-reference-gauge__marker')).toBeNull();
});

it('reduces gauge tick labels on narrow plots without removing reference geometry', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect);
  const { container } = render(<ReferenceGauge value={0.8} domain={[0.4, 1.3]} bands={[]} ticks={[
    { value: 0.55, label: '0.55' }, { value: 0.75, label: '0.75', compact: true }, { value: 1.05, label: '1.05', compact: true },
  ]} reference={{ value: 1, label: 'FTP' }} aria-label="운동강도 0.8" />);
  expect(screen.queryByText('0.55')).not.toBeInTheDocument();
  expect(screen.getByText('0.75')).toBeInTheDocument();
  expect(screen.getByText('1.05')).toBeInTheDocument();
  expect(container.querySelectorAll('.ds-reference-gauge__tick')).toHaveLength(3);
  expect(screen.getByText('FTP')).toBeInTheDocument();
});

it('uses one reference across negative and zero before/after rows and keeps unchanged values readable', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200 } as DOMRect);
  const { container } = render(<BeforeAfterPlot domain={[-10, 10]} reference={{ value: 0, label: '0' }} beforeLabel="활동 전" afterLabel="활동 후" rows={[
    { id: 'form', label: 'Form', ariaLabel: 'Form 활동 전 -5, 활동 후 0', from: -5, to: 0, values: '-5 → 0', shadeBelowReference: true },
    { id: 'same', label: 'Fitness', ariaLabel: 'Fitness 활동 전 0, 활동 후 0', from: 0, to: 0, values: '0 → 0' },
  ]} />);
  expect(screen.getByRole('img', { name: 'Form 활동 전 -5, 활동 후 0' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Fitness 활동 전 0, 활동 후 0' })).toBeInTheDocument();
  expect(screen.getByText('0 → 0')).toBeInTheDocument();
  for (const reference of container.querySelectorAll('.ds-before-after__reference')) expect(reference).toHaveStyle('left: 50%');
  expect(container.querySelector('.ds-before-after__dot--before[data-halo="true"]')).toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});


it('observes a before/after plot that receives rows after mounting and cleans up its observer', () => {
  let width = 200;
  let resize = () => {};
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width }) as DOMRect);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  const props = { domain: [-10, 10] as const, beforeLabel: '활동 전', afterLabel: '활동 후' };
  const { container, rerender, unmount } = render(<BeforeAfterPlot {...props} rows={[]} />);
  expect(observe).not.toHaveBeenCalled();
  rerender(<BeforeAfterPlot {...props} rows={[{ id: 'late', label: 'Fitness', ariaLabel: 'Fitness 0에서 0.5로', from: 0, to: 0.5, values: '0 → 0.5' }]} />);
  expect(observe).toHaveBeenCalledWith(screen.getByRole('img', { name: 'Fitness 0에서 0.5로' }));
  expect(container.querySelector('[data-halo="true"]')).toBeInTheDocument();
  act(() => { width = 400; resize(); });
  expect(container.querySelector('[data-halo="true"]')).toBeNull();
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});


it('offers one timeline focus target with keyboard navigation and a persistent click readout', () => {
  const { container } = render(<SegmentTimeline aria-label="존 구간" rows={[{ id: 'hr', label: '심박수', buckets: [
    { id: 'a', label: '0–30초, Z2', weight: 30, segments: [] },
    { id: 'b', label: '30–90초, 결측', weight: 60, segments: [] },
    { id: 'c', label: '90–120초, Z3', weight: 30, segments: [] },
  ] }]} />);
  const timeline = screen.getByRole('group', { name: '존 구간' });
  const readout = screen.getByRole('status');
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  expect(readout).toHaveTextContent('심박수: 0–30초, Z2');
  fireEvent.keyDown(timeline, { key: 'ArrowRight' });
  expect(readout).toHaveTextContent('심박수: 30–90초, 결측');
  fireEvent.keyDown(timeline, { key: 'End' });
  expect(readout).toHaveTextContent('90–120초, Z3');
  fireEvent.keyDown(timeline, { key: 'ArrowLeft' });
  expect(readout).toHaveTextContent('30–90초, 결측');
  fireEvent.keyDown(timeline, { key: 'Home' });
  expect(readout).toHaveTextContent('0–30초, Z2');
  fireEvent.click(screen.getByRole('img', { name: '90–120초, Z3' }));
  fireEvent.mouseLeave(timeline);
  expect(screen.getByRole('status')).toBe(readout);
  expect(readout).toHaveTextContent('심박수: 90–120초, Z3');
});

it('exposes a prepared static distribution without adding duplicate selection or readout', () => {
  const { container } = render(<SegmentTimeline presentation="distribution" aria-label="사이클 30 CTL · 러닝 미관측" rows={[{ id: 'ctl', label: '현재 체력 기여도', buckets: [{ id: 'bike', label: '사이클 30 CTL', weight: 30, segments: [{weight: 30,color:'var(--accent)'}] }] }]} />);
  const chart = screen.getByRole('img', { name: '사이클 30 CTL · 러닝 미관측' });
  expect(chart).not.toHaveAttribute('tabindex');
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(container.querySelector('[data-selected="true"]')).toBeNull();
  expect(container.querySelector('.ds-segment-timeline__segment')).toHaveStyle('flex: 30');
});
