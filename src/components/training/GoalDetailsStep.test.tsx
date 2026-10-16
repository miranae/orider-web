import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import GoalDetailsStep, { type GoalDetailsStepValue } from './GoalDetailsStep';

const initial: GoalDetailsStepValue = { eventType: 'completion', eventDate: '2027-05-01', targetDurationMin: 390, weeklySessions: 3 };
function Fixture({ onChange }: { onChange: (value: GoalDetailsStepValue) => void }) {
  const [value, setValue] = useState(initial);
  return <GoalDetailsStep courseDist={100} courseElev={1000} userFtp={200} userWeightKg={70} value={value}
    onChange={(next) => { onChange(next); setValue(next); }} />;
}
describe('GoalDetailsStep controls', () => {
  it('supports native radio keyboard selection and preserves the rest of the goal payload', async () => {
    const onChange = vi.fn();
    render(<Fixture onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3); expect(radios[0]).toBeChecked();
    radios[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radios[1]).toHaveFocus(); expect(radios[1]).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, eventType: 'time' });
    expect(screen.getByTestId('K3-3-4')).toHaveClass('grid-cols-1', 'md:grid-cols-2');
  });
  it('names hours and minutes independently and keeps the duration value in minutes', async () => {
    const onChange = vi.fn();
    render(<Fixture onChange={onChange} />);
    await userEvent.click(screen.getAllByRole('radio')[1]!);
    const hours = screen.getByRole('spinbutton', { name: '목표 시간 · 시간' });
    const minutes = screen.getByRole('spinbutton', { name: '목표 시간 · 분' });
    expect(hours).toHaveValue(6); expect(minutes).toHaveValue(30);
    await userEvent.clear(minutes); await userEvent.type(minutes, '45');
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, eventType: 'time', targetDurationMin: 405 });
  });
});


describe('goal date evidence', () => {
  it.each(['', 'not-a-date', '2020-01-01'])('does not invent remaining time or a verdict before a valid target date: %s', (eventDate) => {
    render(<GoalDetailsStep courseDist={100} courseElev={1000} userFtp={200} userWeightKg={70}
      value={{ ...initial, eventDate }} onChange={vi.fn()} />);
    const assessment = within(screen.getByTestId('K3-3-5'));
    expect(assessment.getByText('목표일 선택')).toBeInTheDocument();
    expect(assessment.queryByText('운동 가능 기간')).not.toBeInTheDocument();
    expect(screen.queryByText(/D-.*남은 주수/)).not.toBeInTheDocument();
  });
  it('shows the existing assessment after a valid future target date is selected', () => {
    render(<GoalDetailsStep courseDist={100} courseElev={1000} userFtp={200} userWeightKg={70}
      value={{ ...initial, eventDate: '2099-05-01' }} onChange={vi.fn()} />);
    expect(within(screen.getByTestId('K3-3-5')).getByText('운동 가능 기간')).toBeInTheDocument();
    expect(screen.getByText(/D-.*남은 주수/)).toBeInTheDocument();
  });
});
