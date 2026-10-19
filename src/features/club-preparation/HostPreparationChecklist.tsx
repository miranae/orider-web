import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../theme/components/Card';
import { Button } from '../../theme/components/Button';
import type { Meeting, Member } from './domain';
import './hostPreparationChecklist.css';

/** 현재 신청 상태를 기준으로 운영자가 아직 챙겨야 할 회원만 모은다. */
export function preparationFollowUps(meeting: Meeting) {
  const joined = meeting.registrations.filter(person => person.status === 'joined');
  const active = new Set(meeting.registrations.filter(person => person.status !== 'cancelled').map(person => person.memberId));
  const unconfirmed = [...new Set(meeting.notices.flatMap(notice => notice.targets.filter(id => active.has(id) && !notice.confirmed.includes(id))))];
  const unsetTravel = joined.filter(person => !meeting.joins.some(join => join.id === person.joinId)).map(person => person.memberId);
  return { unconfirmed, unsetTravel };
}

export default function HostPreparationChecklist({ meeting, members, unassignedCount }: {
  meeting: Meeting;
  members: Member[];
  unassignedCount?: number;
}) {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const text = (ko: string, english: string) => en ? english : ko;
  const { unconfirmed, unsetTravel } = preparationFollowUps(meeting);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [lastCopiedText, setLastCopiedText] = useState('');
  const name = (id: string) => members.find(member => member.id === id)?.name ?? text('클럽 회원', 'Club member');
  const reminderText = [meeting.title, ...meeting.notices.flatMap(notice => {
    const pending = notice.targets.filter(id => unconfirmed.includes(id) && !notice.confirmed.includes(id));
    return pending.length ? [`${notice.title}: ${pending.map(name).join(', ')}`] : [];
  })].join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reminderText);
      setLastCopiedText(reminderText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  return (
    <Card className="cp-followups" id="meeting-followups">
      <div className="cp-section-heading"><h2>{text('준비할 일 한눈에', 'Preparation at a glance')}</h2></div>
      <p className="cp-muted">{text('현재 명단에서 챙길 인원을 모았어요. 회원이 신청·취소하거나 내용을 확인하면 갱신됩니다.', 'See who still needs attention. This updates as members register, cancel, or confirm notices.')}</p>
      <div className="cp-followup-links">
        {unassignedCount !== undefined && <a href="#meeting-teams"><strong>{unassignedCount}</strong><span>{text('조 미배정', 'Unassigned')}</span></a>}
        <a href="#meeting-travel"><strong>{unsetTravel.length}</strong><span>{text('합류 지점 미정', 'Meeting point not selected')}</span></a>
        <a href="#meeting-notices"><strong>{unconfirmed.length}</strong><span>{text('공지 미확인', 'Unconfirmed notices')}</span></a>
      </div>
      {unsetTravel.length > 0 && <p>{text('합류 확인 필요', 'Check meeting points')}: {unsetTravel.map(name).join(', ')}</p>}
      {unconfirmed.length > 0 && <>
        <p>{text('공지 확인 필요', 'Check notices')}: {unconfirmed.map(name).join(', ')}</p>
        <Button size="sm" onClick={() => void copy()}>{text('공지 미확인 명단 복사', 'Copy notice follow-up list')}</Button>
      </>}
      <p className="cp-muted">{text('공지는 모임 화면에서 확인합니다. 명단 복사는 메시지를 발송하지 않습니다.', 'Notices are available on this meeting page. Copying the list does not send a message.')}</p>
      <span role="status">{copyState === 'copied' && lastCopiedText === reminderText ? text('명단을 복사했어요.', 'List copied.') : copyState === 'failed' ? text('복사할 수 없어 아래에 명단을 열었어요. 직접 선택해 복사해주세요.', 'Copy is unavailable. Select and copy the text below.') : ''}</span>
      {copyState === 'failed' && <textarea readOnly aria-label={text('복사용 공지 미확인 명단', 'Notice follow-up text to copy')} value={reminderText} />}
    </Card>
  );
}
