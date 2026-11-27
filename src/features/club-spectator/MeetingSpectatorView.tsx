import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import EventMap, { type LocationData } from "../../components/event/EventMap";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { logClientError } from "../../services/errorLogger";
import { LocateFixed } from "lucide-react";
import { Button, Card, IconButton, Input } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";
import { liveRiders, staleRider } from "./presentation";
import { spectatorPeople, spectatorStatus } from "./people";
import { emptySpectatorPreferences, type SpectatorPreferences } from "./preferences";
import type { MeetingSpectatorSnapshot } from "./types";
import "./spectator.css";

export default function MeetingSpectatorView({snapshot, now, receivedAt, en, preferences, onPreferencesChange}: {preferences?: SpectatorPreferences; onPreferencesChange?: (patch: Partial<SpectatorPreferences>) => void; snapshot: MeetingSpectatorSnapshot; now: number; receivedAt: number; en: boolean}) {
  const services = useFirebaseServices();
  const user = services.auth?.currentUser ?? null;
  const { t: clubText } = useTranslation("clubMeeting");
  const [local, setLocal] = useState(emptySpectatorPreferences);
  const prefs = preferences ?? local;
  const update = (patch: Partial<SpectatorPreferences>) => { setLocal(old => ({...old, ...patch})); onPreferencesChange?.(patch); };
  const {search, followed, followingOnly, selectedUid: selected} = prefs;
  const setSelected = (uid: string | null) => update({selectedUid: uid, mapMode: "rider"});
  const [mapRevision, setMapRevision] = useState(0);
  const riders = liveRiders(snapshot, now);
  const reference = riders.find(r => r.uid === selected);
  const people = spectatorPeople(snapshot, now);
  const selectedPerson = people.find(p => p.uid === selected);
  const visible = people.filter(r => (!followingOnly || followed.includes(r.uid)) && `${r.displayName} ${r.uid}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const courseLatlngs = useMemo(() => snapshot.course ? [snapshot.course.points.map(p => [p.lat, p.lon] as [number, number])] : [], [snapshot.course]);
  const locations: LocationData[] = riders.filter(r => visible.some(p => p.uid === r.uid)).map(r => ({uid: r.uid, lat: r.lat, lng: r.lng, displayName: r.displayName,
    speedAvailable: r.speedMps !== null, distanceAvailable: r.progressM !== null,
    speed: r.speedMps === null ? 0 : r.speedMps * 3.6, distance: r.progressM ?? 0, status: r.status,
    bib: null, category: null, rank: null, overallRank: null, lastCp: null, geohash: null}));
  const finished = snapshot.status === "FINISHED" || snapshot.status === "CANCELLED";
  const gap = (meters: number | null) => meters === null ? "—" : `${meters >= 0 ? "+" : "−"}${Math.abs(meters).toFixed(0)} m`;

  return <div className="club-live-stack">
    <header className="club-live-heading"><div><p>{clubText("meetingSpectatorViewCopy.club_meeting_spectator")}</p><h1>{snapshot.title}</h1></div>
      <strong>{snapshot.status === "OPEN" ? clubText("meetingSpectatorViewCopy.waiting_to_start") : snapshot.status === "LIVE" ? clubText("meetingSpectatorViewCopy.riding_together") : snapshot.status === "FINISHED" ? clubText("meetingSpectatorViewCopy.meeting_finished") : clubText("meetingSpectatorViewCopy.cancelled")}</strong>
    </header>
    <p className="club-live-muted">{clubText("meetingSpectatorViewCopy.last_response")} · {new Date(receivedAt).toLocaleTimeString(en ? "en-US" : "ko-KR")} · {clubText("meetingSpectatorViewCopy.positions")} {riders.length} {snapshot.participants && <> · {clubText("meetingSpectatorViewCopy.attendees")} {people.length}</>}</p>
    {snapshot.status === "CANCELLED" ? <Card><h2>{clubText("meetingSpectatorViewCopy.this_meeting_was_cancelled")}</h2><Link to={`/club/${snapshot.groupId}/meetings/${snapshot.eventId}`}>{clubText("meetingSpectatorViewCopy.view_meeting_details")}</Link></Card> : finished ? <Card><h2>{clubText("meetingSpectatorViewCopy.this_meeting_has_ended")}</h2><p>{clubText("meetingSpectatorViewCopy.record_uploads_and_results_may_take")}</p>
      <Link to={`/club/${snapshot.groupId}/meetings/${snapshot.eventId}#meeting-results`}>{clubText("meetingSpectatorViewCopy.view_meeting_results")}</Link>{" · "}<Link to={`/club/${snapshot.groupId}/rides`}>{clubText("meetingSpectatorViewCopy.group_ride_recordings")}</Link></Card> : <div className="club-live-workspace">
      <div className="club-live-stage">{snapshot.course && <Card><div className="club-live-heading"><div><div className="club-live-title-action"><h2>{snapshot.course.name}</h2>
          {/* 코스 전체 보기는 글자 버튼 대신 코스 이름 옆 작은 맞춤 아이콘으로 둔다(코스맵의 전체 경로 보기와 같은 모양). */}
          <IconButton size="sm" variant="ghost" aria-label={clubText("meetingSpectatorViewCopy.show_entire_course")} title={clubText("meetingSpectatorViewCopy.show_entire_course")} icon={<LocateFixed size={ICON_SIZE.sm} />} onClick={() => { update({mapMode: "course"}); setMapRevision(v => v + 1); }} /></div>
          <p>{(snapshot.course.distanceM / 1000).toFixed(1)} km</p></div></div>
        <div className="club-live-map"><EventMap key={`${snapshot.course.courseId}/${mapRevision}`} locations={locations} selectedUid={prefs.mapMode === "rider" && reference && !staleRider(reference, now) ? selected : null} onSelectParticipant={uid => { if (uid) setSelected(uid); }} courseLatlngs={courseLatlngs} preserveSelectionOnPopupClose followSelected onLogError={(source, error, context) => logClientError(source, error, context, services, user)} /></div>
      </Card>}
      <Card aria-label={clubText("meetingSpectatorViewCopy.selected_rider")}>
        <div className="club-live-heading"><h2>{selectedPerson?.displayName ?? clubText("meetingSpectatorViewCopy.choose_a_friend_to_watch")}</h2>
        {selectedPerson && <Button size="sm" variant="secondary" onClick={() => update({mapMode: "rider"})} aria-pressed={prefs.mapMode === "rider"}>{clubText("meetingSpectatorViewCopy.follow_friend_on_map")}</Button>}</div>
        <p>{selectedPerson ? spectatorStatus(selectedPerson.state, en) : clubText("meetingSpectatorViewCopy.find_a_friend_in_the_list")}</p>
        {reference && <p>{reference.speedMps === null ? "—" : `${(reference.speedMps * 3.6).toFixed(1)} km/h`} · {reference.powerWatts === null ? "—" : `${reference.powerWatts} W`} · {clubText("meetingSpectatorViewCopy.gap_to_front")} {gap(reference.gapToLeaderM)}</p>}
        {selected && !selectedPerson && <p role="status">{clubText("meetingSpectatorViewCopy.waiting_for_your_selected_friend_s")}</p>}
        {!snapshot.course && <p>{clubText("meetingSpectatorViewCopy.the_course_is_being_prepared_you")}</p>}
      </Card></div>
      <Card><div className="club-live-heading"><h2>{clubText("meetingSpectatorViewCopy.rider_positions")}</h2><Button size="sm" variant="secondary" onClick={() => update({followingOnly: !followingOnly})} aria-pressed={followingOnly}>{clubText("meetingSpectatorViewCopy.following_only")} ({followed.filter(uid => people.some(r => r.uid === uid)).length})</Button></div>
        <Input aria-label={clubText("meetingSpectatorViewCopy.search_name_or_rider_id")} placeholder={clubText("meetingSpectatorViewCopy.name_or_rider_id")} value={search} maxLength={200} onChange={e => update({search: e.target.value})} />
        <p className="club-live-muted">{clubText("meetingSpectatorViewCopy.gaps_compare_positions_on_the_same")}</p>
        {visible.length === 0 && <p role="status">{people.length ? clubText("meetingSpectatorViewCopy.no_riders_match_your_filters") : clubText("meetingSpectatorViewCopy.waiting_for_virtual_rider_positions")}</p>}
        <ul className="club-live-riders">{visible.map(r => <li key={r.uid} className={selected === r.uid ? "club-live-selected" : undefined}>
          <div className="club-live-heading"><Button size="sm" variant="secondary" aria-pressed={selected === r.uid} onClick={() => setSelected(r.uid)}>{r.displayName}</Button><span>{spectatorStatus(r.state, en)}</span><Button size="sm" variant="secondary" aria-label={`${r.displayName} ${clubText("meetingSpectatorViewCopy.follow_2")}`} aria-pressed={followed.includes(r.uid)} onClick={() => update({followed: followed.includes(r.uid) ? followed.filter(id => id !== r.uid) : [...followed, r.uid]})}>{followed.includes(r.uid) ? clubText("meetingSpectatorViewCopy.following") : clubText("meetingSpectatorViewCopy.follow")}</Button></div>
          {r.rider && <><dl className="club-live-metrics">
            <div><dt>{clubText("meetingSpectatorViewCopy.course_position")}</dt><dd>{r.rider.progressM === null ? "—" : `${(r.rider.progressM / 1000).toFixed(2)} km`}</dd></div>
            <div><dt>{clubText("meetingSpectatorViewCopy.gap_to_front")}</dt><dd>{gap(r.rider.gapToLeaderM)}</dd></div>
            <div><dt>{clubText("meetingSpectatorViewCopy.gap_to_selected")}</dt><dd>{gap(snapshot.selectedUid === selected ? r.rider.gapToSelectedM : null)}</dd></div>
            <div><dt>{clubText("meetingSpectatorViewCopy.speed")}</dt><dd>{r.rider.speedMps === null ? "—" : `${(r.rider.speedMps * 3.6).toFixed(1)} km/h`}</dd></div>
            <div><dt>{clubText("meetingSpectatorViewCopy.power")}</dt><dd>{r.rider.powerWatts === null ? "—" : `${r.rider.powerWatts} W`}</dd></div>
          </dl><p className="club-live-muted">{clubText("meetingSpectatorViewCopy.position_sample")} · {Math.max(0, Math.floor((now - r.rider.sampledAtMs) / 1000))}{clubText("meetingSpectatorViewCopy.s_ago")}</p></>}
        </li>)}</ul>
      </Card>
    </div>}
  </div>;
}
