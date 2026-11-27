import InfoTip from "../../components/InfoTip";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../theme/components/Card';
import { IconButton } from '../../theme/components/IconButton';
import { Copy } from 'lucide-react';
import { ICON_SIZE } from '../../theme/tokens/icon';
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

export default function HostPreparationChecklist({ meeting, members, unassignedCount, noticePageLimited }: {
  meeting: Meeting;
  members: Member[];
  unassignedCount?: number;
  noticePageLimited?: boolean;
}) {
  const { t: clubText } = useTranslation("clubMeeting");
  const { unconfirmed, unsetTravel } = preparationFollowUps(meeting);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [lastCopiedText, setLastCopiedText] = useState('');
  const name = (id: string) => members.find(member => member.id === id)?.name ?? clubText("hostPreparationChecklistCopy.club_member");
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
      <div className="cp-section-heading"><h2><InfoTip label={clubText("hostPreparationChecklistCopy.preparation_at_a_glance")} title={clubText("hostPreparationChecklistCopy.preparation_at_a_glance")} content={clubText("hostPreparationChecklistCopy.follow_ups_reflect_the_current_roster")}>{clubText("hostPreparationChecklistCopy.preparation_at_a_glance")}</InfoTip></h2></div>
      {noticePageLimited && <p className="cp-muted">{clubText("hostPreparationChecklistCopy.notice_follow_ups_cover_this_page")}</p>}
      <div className="cp-followup-links">
        {unassignedCount !== undefined && <a href="#meeting-teams"><strong>{unassignedCount}</strong><span>{clubText("hostPreparationChecklistCopy.unassigned")}</span></a>}
        <a href="#meeting-travel"><strong>{unsetTravel.length}</strong><span>{clubText("hostPreparationChecklistCopy.meeting_point_not_selected")}</span></a>
        <a href="#meeting-notices"><strong>{unconfirmed.length}</strong><span>{clubText("hostPreparationChecklistCopy.unconfirmed_notices")}</span></a>
      </div>
      {unsetTravel.length > 0 && <p>{clubText("hostPreparationChecklistCopy.check_meeting_points")}: {unsetTravel.map(name).join(', ')}</p>}
      {/* 미확인 명단 복사는 해당 줄 옆 작은 복사 아이콘으로 둔다. */}
      {unconfirmed.length > 0 && <div className="cp-heading-with-edit">
        <p><InfoTip label={clubText("hostPreparationChecklistCopy.check_notices")} title={clubText("hostPreparationChecklistCopy.check_notices")} content={clubText("hostPreparationChecklistCopy.notices_are_available_on_this_meeting")}>{clubText("hostPreparationChecklistCopy.check_notices")}</InfoTip>: {unconfirmed.map(name).join(', ')}</p>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={clubText("hostPreparationChecklistCopy.copy_notice_follow_up_list")}
          title={clubText("hostPreparationChecklistCopy.copy_notice_follow_up_list")}
          icon={<Copy size={ICON_SIZE.sm} />}
          onClick={() => void copy()}
        />
      </div>}
      <span role="status">{copyState === 'copied' && lastCopiedText === reminderText ? clubText("hostPreparationChecklistCopy.list_copied") : copyState === 'failed' ? clubText("hostPreparationChecklistCopy.copy_is_unavailable_select_and_copy") : ''}</span>
      {copyState === 'failed' && <textarea readOnly aria-label={clubText("hostPreparationChecklistCopy.notice_follow_up_text_to_copy")} value={reminderText} />}
    </Card>
  );
}
