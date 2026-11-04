import { useMemo, useState } from "react";
import EventMap, { type LocationData } from "../../components/event/EventMap";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { Button, Card, Input } from "../../theme/components";
import { liveRiders, staleRider } from "./presentation";
import { spectatorPeople, spectatorStatus } from "./people";
import { emptySpectatorPreferences, type SpectatorPreferences } from "./preferences";
import type { MeetingSpectatorSnapshot } from "./types";
import "./spectator.css";

export default function MeetingSpectatorView({snapshot, now, receivedAt, en, preferences, onPreferencesChange}: {preferences?: SpectatorPreferences; onPreferencesChange?: (patch: Partial<SpectatorPreferences>) => void; snapshot: MeetingSpectatorSnapshot; now: number; receivedAt: number; en: boolean}) {
  const text = (ko: string, english: string) => en ? english : ko;
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
    <header className="club-live-heading"><div><p>{text("클럽 모임 관전", "Club meeting spectator")}</p><h1>{snapshot.title}</h1></div>
      <strong>{snapshot.status === "OPEN" ? text("출발 대기", "Waiting to start") : snapshot.status === "LIVE" ? text("함께 달리는 중", "Riding together") : snapshot.status === "FINISHED" ? text("모임 종료", "Meeting finished") : text("모임 취소", "Cancelled")}</strong>
    </header>
    <p className="club-live-muted">{text("마지막 응답", "Last response")} · {new Date(receivedAt).toLocaleTimeString(en ? "en-US" : "ko-KR")} · {text("위치 수신", "Positions")} {riders.length} {snapshot.participants && <> · {text("참석 명단", "Attendees")} {people.length}</>}</p>
    {snapshot.status === "CANCELLED" ? <Card><h2>{text("모임이 취소됐어요", "This meeting was cancelled")}</h2><Link to={`/club/${snapshot.groupId}/meetings/${snapshot.eventId}`}>{text("모임 상세 확인", "View meeting details")}</Link></Card> : finished ? <Card><h2>{text("모임이 마무리됐어요", "This meeting has ended")}</h2><p>{text("개인 기록 업로드와 결과 확인에는 시간이 걸릴 수 있어요.", "Record uploads and results may take a moment.")}</p>
      <Link to={`/club/${snapshot.groupId}/meetings/${snapshot.eventId}#meeting-results`}>{text("모임 결과 확인", "View meeting results")}</Link>{" · "}<Link to={`/club/${snapshot.groupId}/rides`}>{text("그룹 주행 기록", "Group ride recordings")}</Link></Card> : <div className="club-live-workspace">
      <div className="club-live-stage">{snapshot.course && <Card><div className="club-live-heading"><div><h2>{snapshot.course.name}</h2><p>{(snapshot.course.distanceM / 1000).toFixed(1)} km</p></div><Button variant="secondary" onClick={() => { update({mapMode: "course"}); setMapRevision(v => v + 1); }}>{text("코스 전체 보기", "Show entire course")}</Button></div>
        <div className="club-live-map"><EventMap key={`${snapshot.course.courseId}/${mapRevision}`} locations={locations} selectedUid={prefs.mapMode === "rider" && reference && !staleRider(reference, now) ? selected : null} onSelectParticipant={uid => { if (uid) setSelected(uid); }} courseLatlngs={courseLatlngs} followSelected /></div>
      </Card>}
      <Card aria-label={text("보고 있는 선수", "Selected rider")}>
        <div className="club-live-heading"><h2>{selectedPerson?.displayName ?? text("함께 볼 친구를 선택하세요", "Choose a friend to watch")}</h2>
        {selectedPerson && <Button size="sm" variant="secondary" onClick={() => update({mapMode: "rider"})} aria-pressed={prefs.mapMode === "rider"}>{text("친구 따라보기", "Follow friend on map")}</Button>}</div>
        <p>{selectedPerson ? spectatorStatus(selectedPerson.state, en) : text("명단에서 친구를 찾고 선택하면 위치를 따라갑니다.", "Find a friend in the list to follow their position.")}</p>
        {reference && <p>{reference.speedMps === null ? "—" : `${(reference.speedMps * 3.6).toFixed(1)} km/h`} · {reference.powerWatts === null ? "—" : `${reference.powerWatts} W`} · {text("선두 격차", "Gap to front")} {gap(reference.gapToLeaderM)}</p>}
        {selected && !selectedPerson && <p role="status">{text("선택한 친구의 참석 정보를 기다리고 있어요.", "Waiting for your selected friend's attendance.")}</p>}
        {!snapshot.course && <p>{text("모임 코스를 준비하고 있어요. 친구를 미리 선택할 수 있어요.", "The course is being prepared. You can select a friend now.")}</p>}
      </Card></div>
      <Card><div className="club-live-heading"><h2>{text("참가자 현황", "Rider positions")}</h2><Button variant="secondary" onClick={() => update({followingOnly: !followingOnly})} aria-pressed={followingOnly}>{text("팔로우만 보기", "Following only")} ({followed.filter(uid => people.some(r => r.uid === uid)).length})</Button></div>
        <Input aria-label={text("이름 또는 참가자 ID 검색", "Search name or rider ID")} placeholder={text("이름 또는 참가자 ID", "Name or rider ID")} value={search} maxLength={200} onChange={e => update({search: e.target.value})} />
        <p className="club-live-muted">{text("같은 코스에서의 앞뒤 간격이에요. 위치를 정확히 구분하기 어려우면 격차를 표시하지 않아요.", "Gaps compare positions on the same course. They are unavailable when positions cannot be distinguished reliably.")}</p>
        {visible.length === 0 && <p role="status">{people.length ? text("검색 또는 팔로우 조건에 맞는 참가자가 없어요.", "No riders match your filters.") : text("참가자의 가상 주행 위치를 기다리고 있어요.", "Waiting for virtual rider positions.")}</p>}
        <ul className="club-live-riders">{visible.map(r => <li key={r.uid} className={selected === r.uid ? "club-live-selected" : undefined}>
          <div className="club-live-heading"><Button variant="secondary" aria-pressed={selected === r.uid} onClick={() => setSelected(r.uid)}>{r.displayName}</Button><span>{spectatorStatus(r.state, en)}</span><Button size="sm" variant="secondary" aria-label={`${r.displayName} ${text("팔로우", "follow")}`} aria-pressed={followed.includes(r.uid)} onClick={() => update({followed: followed.includes(r.uid) ? followed.filter(id => id !== r.uid) : [...followed, r.uid]})}>{followed.includes(r.uid) ? text("팔로우 중", "Following") : text("팔로우", "Follow")}</Button></div>
          {r.rider && <><dl className="club-live-metrics">
            <div><dt>{text("코스 위치", "Course position")}</dt><dd>{r.rider.progressM === null ? "—" : `${(r.rider.progressM / 1000).toFixed(2)} km`}</dd></div>
            <div><dt>{text("선두 격차", "Gap to front")}</dt><dd>{gap(r.rider.gapToLeaderM)}</dd></div>
            <div><dt>{text("선택 선수 격차", "Gap to selected")}</dt><dd>{gap(snapshot.selectedUid === selected ? r.rider.gapToSelectedM : null)}</dd></div>
            <div><dt>{text("속도", "Speed")}</dt><dd>{r.rider.speedMps === null ? "—" : `${(r.rider.speedMps * 3.6).toFixed(1)} km/h`}</dd></div>
            <div><dt>{text("파워", "Power")}</dt><dd>{r.rider.powerWatts === null ? "—" : `${r.rider.powerWatts} W`}</dd></div>
          </dl><p className="club-live-muted">{text("위치 수신", "Position sample")} · {Math.max(0, Math.floor((now - r.rider.sampledAtMs) / 1000))}{text("초 전", "s ago")}</p></>}
        </li>)}</ul>
      </Card>
    </div>}
  </div>;
}
