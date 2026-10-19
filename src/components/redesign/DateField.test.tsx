import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DateField from './DateField';

// ISO labels identify the day directly; retain role/visibility/focus checks without
// recomputing accessible names for all 42 calendar cells after every key.
function calendarDay(date: string) {
  const cell = screen.getByLabelText(date);
  expect(cell).toHaveAttribute('role', 'gridcell');
  expect(cell).toBeVisible();
  return cell;
}
function pressDay(date: string, key: string) {
  const cell = calendarDay(date);
  expect(cell).toHaveFocus();
  fireEvent.keyDown(cell, { key });
}

describe('DateField keyboard and viewport behavior', () => {
  it('uses a supplied SVG without changing the selected date', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-01-31" onChange={onChange} presets={false} icon={<svg data-testid="date-svg" />} />);
    expect(screen.getByTestId('date-svg')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toHaveTextContent('📅');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('focuses the chosen day, moves through days and weeks across month boundaries, and selects only on Enter', async () => {
    const onChange = vi.fn();
    render(<DateField value="2026-01-31" onChange={onChange} presets={false} />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(calendarDay('2026-01-31')).toHaveFocus();
    pressDay('2026-01-31', 'ArrowRight');
    expect(calendarDay('2026-02-01')).toHaveFocus();
    pressDay('2026-02-01', 'ArrowDown');
    expect(calendarDay('2026-02-08')).toHaveFocus();
    pressDay('2026-02-08', 'ArrowUp');
    pressDay('2026-02-01', 'ArrowLeft');
    expect(calendarDay('2026-01-31')).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-01-31');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens with Enter or Space and restores trigger focus on Escape without changing the value', async () => {
    const onChange = vi.fn();
    render(<DateField value="2026-01-31" onChange={onChange} presets={false} />);
    const trigger = screen.getByRole('button'); trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(calendarDay('2026-01-31')).toHaveFocus();
    fireEvent.keyDown(calendarDay('2026-01-31'), { key: 'Escape' }); expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(calendarDay('2026-01-31')).toHaveFocus();
    fireEvent.keyDown(calendarDay('2026-01-31'), { key: 'Escape' }); expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps PageDown to the actual last day and honors min/max without changing the value on Escape', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-01-31" min="2026-01-30" max="2026-02-28" onChange={onChange} presets={false} />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    pressDay('2026-01-31', 'PageDown');
    expect(calendarDay('2026-02-28')).toHaveFocus();
    pressDay('2026-02-28', 'ArrowRight');
    expect(calendarDay('2026-02-28')).toHaveFocus();
    pressDay('2026-02-28', 'PageUp');
    expect(calendarDay('2026-01-30')).toHaveFocus();
    pressDay('2026-01-30', 'ArrowLeft');
    pressDay('2026-01-30', 'Home');
    expect(calendarDay('2026-01-30')).toHaveFocus();
    pressDay('2026-01-30', 'End');
    expect(calendarDay('2026-01-31')).toHaveFocus();
    fireEvent.keyDown(calendarDay('2026-01-31'), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled(); expect(trigger).toHaveFocus();
  });

  it('exposes one calendar date to Tab and closes when focus moves outside', async () => {
    render(<><DateField value="2026-01-31" onChange={vi.fn()} presets={false} /><button>outside</button></>);
    fireEvent.click(screen.getAllByRole('button')[0]!);
    const grid = screen.getByRole('grid');
    expect(within(grid).getAllByRole('gridcell').filter(cell => cell.tabIndex === 0)).toHaveLength(1);
    expect(within(grid).getAllByRole('row')).toHaveLength(7);
    screen.getByRole('button', { name: 'outside' }).focus();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('clamps a right-edge popup within a 320px viewport and repositions after resize', () => {
    const oldWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    const box = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { x: 250, y: 100, left: 250, right: 350, top: 100, bottom: 140, width: this.getAttribute('role') === 'dialog' ? 280 : 100, height: this.getAttribute('role') === 'dialog' ? 320 : 40, toJSON: () => ({}) };
    });
    try {
      render(<DateField value="2026-01-31" onChange={vi.fn()} presets={false} />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('dialog')).toHaveStyle({ left: '-222px', boxSizing: 'border-box' });
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      fireEvent(window, new Event('resize'));
      expect(screen.getByRole('dialog')).toHaveStyle({ left: '-152px' });
    } finally { box.mockRestore(); Object.defineProperty(window, 'innerWidth', { configurable: true, value: oldWidth }); }
  });
});
