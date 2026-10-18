// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/utils/renderWithProviders';
import { newClubMeeting } from './meetingCopy';
import HostPreparationChecklist, { preparationFollowUps } from './HostPreparationChecklist';
import type { Registration } from './domain';
const person = (memberId: string, status: Registration['status'], joinId?: string): Registration => ({memberId, status, joinId, order: 1, payment: 'unpaid', refundDue: 0, refunded: 0, outbound: '', inbound: ''});
describe('주최자가 챙길 현재 회원', () => {
  it('취소자를 공지 추적에서 제외하고 여러 미확인 공지에 중복된 회원은 한 명으로 센다', () => {
    const meeting = newClubMeeting();
    meeting.registrations = [person('joined', 'joined', 'main'), person('waiter', 'waiting'), person('cancelled', 'cancelled')];
    meeting.notices = [
      {id: 'one', title: '코스 변경', body: '', targets: ['joined', 'waiter', 'cancelled'], confirmed: ['waiter'], at: 1},
      {id: 'two', title: '준비물', body: '', targets: ['joined', 'waiter', 'cancelled'], confirmed: [], at: 2},
    ];
    expect(preparationFollowUps(meeting)).toEqual({unconfirmed: ['joined', 'waiter'], unsetTravel: []});
    meeting.registrations[1]!.status = 'cancelled';
    expect(preparationFollowUps(meeting).unconfirmed).toEqual(['joined']);
  });
  it('삭제된 합류지를 선택한 참석자는 미정으로 잡고 대기자는 합류 미정에 세지 않는다', () => {
    const meeting = newClubMeeting();
    meeting.registrations = [person('valid', 'joined', 'main'), person('deleted-point', 'joined', 'removed'), person('unset', 'joined'), person('waiting', 'waiting')];
    expect(preparationFollowUps(meeting).unsetTravel).toEqual(['deleted-point', 'unset']);
  });
});

it('클립보드 사용이 거부되면 현재 미확인 명단을 직접 복사할 수 있게 제공한다', async () => {
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: vi.fn().mockRejectedValue(new Error('denied'))}});
  const meeting = newClubMeeting();
  meeting.title = '가을 라이딩';
  meeting.registrations = [person('current', 'joined'), person('cancelled', 'cancelled')];
  meeting.notices = [{id: 'notice', title: '출발 변경', body: '새 장소', targets: ['current', 'cancelled'], confirmed: [], at: 1}];
  const members = [{id: 'current', name: '현재회원'}, {id: 'cancelled', name: '취소회원'}];
  const view = renderWithProviders(<HostPreparationChecklist meeting={meeting} members={members} />);
  fireEvent.click(screen.getByRole('button', {name: '공지 미확인 명단 복사'}));
  const fallback = await screen.findByRole('textbox', {name: '복사용 공지 미확인 명단'});
  expect(fallback).toHaveValue('가을 라이딩\n출발 변경: 현재회원');
  meeting.registrations[0]!.status = 'cancelled';
  view.rerender(<HostPreparationChecklist meeting={meeting} members={members} />);
  expect(fallback).toHaveValue('가을 라이딩');
});
