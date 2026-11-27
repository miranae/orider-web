import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../theme/components/Card';
import { Chip } from '../../theme/components/Chip';
import { meetingHostId, memberName, type Meeting, type State } from './domain';
import { ICON_SIZE } from '../../theme/tokens/icon';
import InfoTip from '../../components/InfoTip';

export default function MeetingPeople({ state, meeting, actor }: {
  state: State;
  meeting: Meeting;
  actor: string;
}) {
  const { t: clubText } = useTranslation("clubMeeting");
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
          ? clubText("meetingPeopleCopy.registrations_when_cancelled")
          : clubText("meetingPeopleCopy.who_is_joining")}</h2>
        <Users size={ICON_SIZE.lg} />
      </div>
      <p className="cp-muted">
        {isCancelled
          ? clubText("meetingPeopleCopy.this_is_the_roster_at_cancellation")
          : (reserved ? clubText("meetingPeopleCopy.capacity_with_reservations", { capacity: meeting.capacity, reserved }) : clubText("meetingPeopleCopy.capacity_count", { count: meeting.capacity }))}
      </p>
      <div className="cp-roster-grid">
        <section aria-label={clubText("meetingPeopleCopy.attendees")}>
          <h3>{clubText("meetingPeopleCopy.attending")} <Chip variant="success">{clubText("meetingPeopleCopy.message", { value1: joined.length })}</Chip></h3>
          <ul className="cp-roster">
            {joined.map(person => (
              <li key={person.memberId}>
                <span className="cp-avatar" aria-hidden>{memberName(state, person.memberId).slice(0, 1)}</span>
                <strong>{memberName(state, person.memberId)}</strong>
                {person.memberId === actor && <Chip variant="accent">{clubText("meetingPeopleCopy.you")}</Chip>}
                {person.memberId === meetingHostId(meeting) && <Chip>{clubText("meetingPeopleCopy.host")}</Chip>}
              </li>
            ))}
          </ul>
          {!joined.length && <p className="cp-muted">{clubText("meetingPeopleCopy.no_attendees_yet")}</p>}
        </section>
        <section aria-label={clubText("meetingPeopleCopy.waitlist_2")}>
          <h3><InfoTip
            title={clubText("meetingPeopleCopy.waitlist")}
            label={clubText("meetingPeopleCopy.waitlist")}
            content={clubText("meetingPeopleCopy.available_places_are_offered_in_waitlist")}
          >{clubText("meetingPeopleCopy.waitlist")}</InfoTip> <Chip>{clubText("meetingPeopleCopy.message", { value1: waiting.length })}</Chip></h3>
          <ol className="cp-roster cp-roster--waiting">
            {waiting.map((person, index) => (
              <li key={person.memberId}>
                <span className="cp-wait-number">{index + 1}</span>
                <strong>{memberName(state, person.memberId)}</strong>
                {person.memberId === actor && <Chip variant="accent">{clubText("meetingPeopleCopy.you")}</Chip>}
                {person.status === 'offered' && <Chip variant="warning">{clubText("meetingPeopleCopy.place_offered")}</Chip>}
              </li>
            ))}
          </ol>
          {!waiting.length && <p className="cp-muted">{clubText("meetingPeopleCopy.no_one_is_waiting")}</p>}
        </section>
      </div>
      {cancelled.length > 0 && (
        <details className="cp-divider">
          <summary>{clubText("meetingPeopleCopy.cancelled", { value1: cancelled.length })}</summary>
          <ul className="cp-roster">{cancelled.map(person => <li key={person.memberId}>{memberName(state, person.memberId)}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}
