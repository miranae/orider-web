import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../theme/components/Card';
import { Chip } from '../../theme/components/Chip';
import { meetingHostId, memberName, occupied, type Meeting, type State } from './domain';
import { ICON_SIZE } from '../../theme/tokens/icon';

export default function MeetingPeople({ state, meeting, actor }: {
  state: State;
  meeting: Meeting;
  actor: string;
}) {
  const { i18n } = useTranslation();
  const english = i18n.language.startsWith('en');
  const text = (ko: string, en: string) => english ? en : ko;
  const joined = meeting.registrations.filter(person => person.status === 'joined');
  const waiting = meeting.registrations
    .filter(person => person.status === 'waiting' || person.status === 'offered')
    .sort((a, b) => a.order - b.order);
  const cancelled = meeting.registrations.filter(person => person.status === 'cancelled');
  const reserved = waiting.filter(person => person.status === 'offered').length;
  const isCancelled = meeting.status === 'cancelled';

  return (
    <Card id="meeting-people" className="cp-people">
      <div className="cp-section-heading">
        <h2>{isCancelled
          ? text('취소 당시 신청 인원', 'Registrations when cancelled')
          : text('누가 함께 오나요?', 'Who is joining?')}</h2>
        <Users size={ICON_SIZE.lg} />
      </div>
      <p className="cp-muted">
        {isCancelled
          ? text('취소 당시의 명단입니다. 취소 후 모집·충원은 진행하지 않습니다.', 'This is the roster at cancellation. Registration and place offers have ended.')
          : text(`정원 ${meeting.capacity}명${reserved ? ` · 자리 제안 ${reserved}석 예약 중` : ''}`, `Capacity ${meeting.capacity}${reserved ? ` · ${reserved} places reserved for offers` : ''}`)}
      </p>
      <div className="cp-roster-grid">
        <section aria-label={text('참석 명단', 'Attendees')}>
          <h3>{text('참석', 'Attending')} <Chip variant="success">{text(`${joined.length}명`, `${joined.length}`)}</Chip></h3>
          <ul className="cp-roster">
            {joined.map(person => (
              <li key={person.memberId}>
                <span className="cp-avatar" aria-hidden>{memberName(state, person.memberId).slice(0, 1)}</span>
                <strong>{memberName(state, person.memberId)}</strong>
                {person.memberId === actor && <Chip variant="accent">{text('나', 'You')}</Chip>}
                {person.memberId === meetingHostId(meeting) && <Chip>{text('주최자', 'Host')}</Chip>}
              </li>
            ))}
          </ul>
          {!joined.length && <p className="cp-muted">{text('아직 참석한 회원이 없어요.', 'No attendees yet.')}</p>}
        </section>
        <section aria-label={text('대기 명단', 'Waitlist')}>
          <h3>{text('대기', 'Waitlist')} <Chip>{text(`${waiting.length}명`, `${waiting.length}`)}</Chip></h3>
          {reserved > 0 && <p className="cp-muted">{text(`대기 중 ${waiting.length - reserved}명 · 자리 제안 중 ${reserved}명`, `${waiting.length - reserved} waiting · ${reserved} offered a place`)}</p>}
          <ol className="cp-roster cp-roster--waiting">
            {waiting.map((person, index) => (
              <li key={person.memberId}>
                <span className="cp-wait-number">{index + 1}</span>
                <strong>{memberName(state, person.memberId)}</strong>
                {person.memberId === actor && <Chip variant="accent">{text('나', 'You')}</Chip>}
                {person.status === 'offered' && <Chip variant="warning">{text('자리 제안 중', 'Place offered')}</Chip>}
              </li>
            ))}
          </ol>
          {!waiting.length && <p className="cp-muted">{text('기다리는 회원이 없어요.', 'No one is waiting.')}</p>}
        </section>
      </div>
      {reserved > 0 && <p className="cp-muted">{text(
        `확보된 자리 ${occupied(meeting)}/${meeting.capacity}석 = 참석 ${joined.length}명 + 자리 제안 ${reserved}명`,
        `${occupied(meeting)}/${meeting.capacity} places occupied: ${joined.length} attending + ${reserved} reserved offers`,
      )}</p>}
      {cancelled.length > 0 && (
        <details className="cp-divider">
          <summary>{text(`참석 취소 ${cancelled.length}명`, `${cancelled.length} cancelled`)}</summary>
          <ul className="cp-roster">{cancelled.map(person => <li key={person.memberId}>{memberName(state, person.memberId)}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}
