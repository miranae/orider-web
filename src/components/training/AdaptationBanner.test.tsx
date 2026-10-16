import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdaptationFlag } from '@shared/types/goal';
import { mockCallableInvocations, setCallableImplementation } from '../../__tests__/mocks/firebase';
import AdaptationBanner from './AdaptationBanner';

const dialog = vi.hoisted(() => ({ confirm: vi.fn(), alert: vi.fn() }));
vi.mock('../../contexts/DialogContext', () => ({ useDialog: () => dialog }));
vi.mock('../../services/errorLogger', () => ({ logClientError: vi.fn() }));
const flag: AdaptationFlag = { severity: 'warn', shouldRerollSuggested: true, reason: '최근 수행량에 맞춰 계획 조정을 검토해 주세요.',
  evaluatedAt: 1, recent4wRatio: 0.635, streakWeeksOff: 2 };
const renderBanner = (value = flag, onChange = vi.fn()) => render(<AdaptationBanner goalId="goal-owned" flag={value} onChange={onChange} />);

beforeEach(() => {
  dialog.confirm.mockReset().mockResolvedValue(true); dialog.alert.mockReset();
  vi.mocked(updateDoc).mockReset().mockResolvedValue(undefined);
  vi.mocked(httpsCallable).mockClear(); mockCallableInvocations.length = 0;
  setCallableImplementation('rerollPlan', () => ({ data: {} }));
});
afterEach(() => vi.restoreAllMocks());

describe('AdaptationBanner visibility and evidence', () => {
  it.each([
    { ...flag, severity: 'info' as const },
    { ...flag, shouldRerollSuggested: false },
    { ...flag, snoozedUntil: Date.now() + 7 * 86400000 },
  ])('hides informational, not-suggested or snoozed flags without reading or writing', (value) => {
    const view = renderBanner(value);
    expect(view.container).toBeEmptyDOMElement();
    expect(httpsCallable).not.toHaveBeenCalled(); expect(updateDoc).not.toHaveBeenCalled();
  });

  it('shows a warning again once its server snooze has expired', () => {
    renderBanner({ ...flag, snoozedUntil: Date.now() - 1 });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지금 재생성' })).toBeEnabled();
    expect(updateDoc).not.toHaveBeenCalled(); expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('opens all evidence and presents the rounded ratio and off-track streak', async () => {
    renderBanner({ ...flag, severity: 'critical' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const summary = screen.getByText('근거 및 알림 설정');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    await userEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(/최근 4주 실행률 64%/)).toHaveTextContent('2주 연속 이탈');
    expect(screen.getByRole('button', { name: '1주 동안 보지 않기' })).toBeEnabled();
    expect(updateDoc).not.toHaveBeenCalled(); expect(httpsCallable).not.toHaveBeenCalled();
  });
});

describe('AdaptationBanner confirmation and recoverable failures', () => {
  it('does not invoke a callable when reroll confirmation is cancelled', async () => {
    dialog.confirm.mockResolvedValue(false);
    const changed = vi.fn(); renderBanner(flag, changed);
    await userEvent.click(screen.getByRole('button', { name: '지금 재생성' }));
    expect(dialog.confirm).toHaveBeenCalledOnce();
    expect(dialog.confirm.mock.calls[0]?.[1]).toEqual({ destructive: true });
    expect(httpsCallable).not.toHaveBeenCalled(); expect(mockCallableInvocations).toEqual([]);
    expect(changed).not.toHaveBeenCalled(); expect(screen.getByTestId('K4-1')).toBeInTheDocument();
  });

  it('reports reroll failure, restores the action and succeeds on a subsequent explicit retry', async () => {
    const reroll = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} });
    setCallableImplementation('rerollPlan', reroll);
    const changed = vi.fn(); renderBanner(flag, changed);
    await userEvent.click(screen.getByRole('button', { name: '지금 재생성' }));
    await waitFor(() => expect(dialog.alert).toHaveBeenCalledWith('계획 재생성에 실패했습니다.', { variant: 'danger' }));
    expect(screen.getByRole('button', { name: '지금 재생성' })).toBeEnabled();
    expect(changed).not.toHaveBeenCalled(); expect(screen.getByTestId('K4-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '지금 재생성' }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(reroll).toHaveBeenCalledTimes(2);
    expect(mockCallableInvocations).toEqual([{ name: 'rerollPlan', data: { goalId: 'goal-owned' } }, { name: 'rerollPlan', data: { goalId: 'goal-owned' } }]);
  });

  it('keeps a failed snooze visible and allows retry without claiming a successful change', async () => {
    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('permission-denied'));
    const changed = vi.fn(); renderBanner(flag, changed);
    await userEvent.click(screen.getByText('근거 및 알림 설정'));
    await userEvent.click(screen.getByRole('button', { name: '1주 동안 보지 않기' }));
    await waitFor(() => expect(dialog.alert).toHaveBeenCalledWith('1주 미루기에 실패했습니다.', { variant: 'danger' }));
    expect(screen.getByTestId('K4-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1주 동안 보지 않기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '지금 재생성' })).toBeEnabled();
    expect(changed).not.toHaveBeenCalled(); expect(mockCallableInvocations).toEqual([]);
  });

  it('hides a successful snooze immediately and reloads exactly once with a seven-day timestamp', async () => {
    const now = 1_800_000_000_000; vi.spyOn(Date, 'now').mockReturnValue(now);
    const changed = vi.fn(); renderBanner(flag, changed);
    fireEvent.click(screen.getByText('근거 및 알림 설정'));
    fireEvent.click(screen.getByRole('button', { name: '1주 동안 보지 않기' }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(updateDoc).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: 'goals/goal-owned' }), {
      'adaptationFlag.snoozedUntil': now + 7 * 86400000,
    });
    expect(screen.queryByTestId('K4-1')).not.toBeInTheDocument();
    expect(dialog.alert).not.toHaveBeenCalled(); expect(mockCallableInvocations).toEqual([]);
  });
});
