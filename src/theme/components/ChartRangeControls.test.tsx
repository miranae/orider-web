import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChartRangeControls } from './ChartRangeControls';

it('offers three controlled tools, disables unavailable actions and dispatches mode/reset/keyboard callbacks', () => {
  const onModeChange = vi.fn(), onReset = vi.fn(), onPanKeyDown = vi.fn();
  const props = { labels: { controls: '구간 도구', selectRange: '구간 선택', panRange: '구간 이동', reset: '초기화' }, onModeChange, onReset, onPanKeyDown };
  const view = render(<ChartRangeControls {...props} mode="inspect" canPan={false} canReset={false} />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.getByRole('button', { name: '구간 이동' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '초기화' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(onModeChange).toHaveBeenLastCalledWith('select');
  view.rerender(<ChartRangeControls {...props} mode="select" canPan canReset />);
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(onModeChange).toHaveBeenLastCalledWith('inspect');
  fireEvent.click(screen.getByRole('button', { name: '구간 이동' }));
  expect(onModeChange).toHaveBeenLastCalledWith('pan');
  view.rerender(<ChartRangeControls {...props} mode="pan" canPan canReset />);
  const pan = screen.getByRole('button', { name: '구간 이동' });
  expect(pan).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(pan, { key: 'ArrowRight' });
  expect(onPanKeyDown).toHaveBeenCalledOnce();
  fireEvent.click(pan); expect(onModeChange).toHaveBeenLastCalledWith('inspect');
  fireEvent.click(screen.getByRole('button', { name: '초기화' })); expect(onReset).toHaveBeenCalledOnce();
});
