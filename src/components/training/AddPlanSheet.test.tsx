import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanDay } from '@shared/types/goal';
import { GlossaryProvider } from "../common/GlossaryProvider";
import AddPlanSheet from './AddPlanSheet';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), update: vi.fn(), alert: vi.fn(), date: 1000000 }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../contexts/DialogContext', () => ({ useDialog: () => ({ alert: mocks.alert }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({ id: 'week' })), runTransaction: mocks.transaction }));
const day: PlanDay = { date: 1000000, dayOfWeek: 0, workout: 'rest', plannedTSS: 0, plannedDurationMin: 0, completed: false, skipped: false };
function show() { return render(<AddPlanSheet goalId="g" weekId="w" days={[day]} initialDayIndex={0} onClose={vi.fn()} onUpdate={vi.fn()} />); }
beforeEach(() => {
  mocks.date = day.date; mocks.transaction.mockReset(); mocks.update.mockReset(); mocks.alert.mockReset();
  mocks.transaction.mockImplementation(async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ days: [{ ...day, date: mocks.date }] }) }), update: mocks.update,
  }));
});
afterEach(cleanup);

describe('운동 추가 선택과 적용', () => {
  it('종목·템플릿·휴식 선택만으로 저장하지 않고 명시적 적용만 쓴다', async () => {
    show();
    const dialog = screen.getByTestId('K4-7');
    expect(dialog).toHaveRole('dialog');
    expect(dialog).toHaveAccessibleName('add.title');
    expect(dialog).toBeVisible();
    const controls = within(dialog);
    expect(controls.queryByRole('button', { name: 'add.swimUnavailable' })).not.toBeInTheDocument();
    fireEvent.click(controls.getByRole('button', { name: 'discipline.rest' }));
    expect(mocks.transaction).not.toHaveBeenCalled();
    fireEvent.click(controls.getByRole('button', { name: 'discipline.bike' }));
    fireEvent.click(controls.getByRole('button', { name: /workouts.rec/ }));
    expect(mocks.transaction).not.toHaveBeenCalled();
    fireEvent.click(controls.getByRole('button', { name: 'add.applySelection' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0]?.[1].days[0]).toMatchObject({ workout: 'rec', plannedTSS: 25 });
  });
  it('선택 후 닫으면 저장하지 않는다', () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const view = show();
    fireEvent.click(screen.getByRole('button', { name: 'discipline.rest' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mocks.transaction).not.toHaveBeenCalled();
    view.unmount(); expect(trigger).toHaveFocus(); trigger.remove();
  });
  it('휴식도 별도 적용이 필요하고 서버 날짜가 달라졌으면 쓰지 않는다', async () => {
    show(); mocks.date += 86400000;
    fireEvent.click(screen.getByRole('button', { name: 'discipline.rest' }));
    fireEvent.click(screen.getByRole('button', { name: 'add.applyRest' }));
    await waitFor(() => expect(mocks.alert).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('성공한 휴식 적용만 0 부하로 저장한다', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'discipline.rest' }));
    fireEvent.click(screen.getByRole('button', { name: 'add.applyRest' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[0]?.[1].days[0]).toMatchObject({ workout: 'rest', plannedTSS: 0, plannedDurationMin: 0 });
  });
});

it('선택 버튼 밖 읽기 영역과 강도 범례에서 설명을 열고 선택은 쓰지 않는다', () => {
  render(<GlossaryProvider><AddPlanSheet goalId="g" weekId="w" days={[day]} initialDayIndex={0} onClose={vi.fn()} onUpdate={vi.fn()} /></GlossaryProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'discipline.bike' }));
  fireEvent.click(screen.getByRole('button', { name: /workouts.rec/ }));
  const explanation = screen.getByTestId('selected-workout-explanation');
  expect(explanation).toHaveAttribute('aria-live', 'polite');
  const trigger = explanation.querySelector('[data-glossary-term="tss"] button')!;
  expect(trigger).not.toBeNull();
  fireEvent.focus(trigger);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  const legend = screen.getByTestId('workout-intensity-glossary');
  fireEvent.click(legend.closest('details')!.querySelector('summary')!);
  expect(legend.closest('details')).toHaveAttribute('open');
  expect(legend.querySelector('[data-glossary-term="lsd"] button')).not.toBeNull();
  expect(document.querySelector('button button')).toBeNull();
  expect(mocks.transaction).not.toHaveBeenCalled();
});


it('labels a non-Monday week from canonical KST dates and applies to the original array index', async () => {
  const friday = { ...day, date: Date.parse('2026-10-16T00:00:00+09:00'), dayOfWeek: 0 as const };
  const saturday = { ...day, date: friday.date + 86400000, dayOfWeek: 0 as const };
  const days = [friday, saturday];
  mocks.transaction.mockImplementation(async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ days }) }), update: mocks.update,
  }));
  render(<AddPlanSheet goalId="g" weekId="w" days={days} onClose={vi.fn()} onUpdate={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'weekday.fri' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'weekday.sat' }));
  fireEvent.click(screen.getByRole('button', { name: 'discipline.bike' }));
  fireEvent.click(screen.getByRole('button', { name: /workouts.rec/ }));
  expect(mocks.transaction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'add.applySelection' }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  const saved = mocks.update.mock.calls[0]![1].days;
  expect(saved[0]).toEqual(friday);
  expect(saved[1]).toMatchObject({ date: saturday.date, dayOfWeek: 0, workout: 'rec' });
  expect(days[1]).toEqual(saturday);
});
