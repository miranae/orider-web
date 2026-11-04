import { useMemo, useState } from "react";
import EventMap, { type LocationData } from "../../components/event/EventMap";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { Button, Card, Input } from "../../theme/components";
import { liveRiders, staleRider } from "./presentation";
import type { MeetingSpectatorSnapshot } from "./types";
import "./spectator.css";

export default function MeetingSpectatorView({snapshot, now, receivedAt, en}: {snapshot: MeetingSpectatorSnapshot; now: number; receivedAt: number; en: boolean}) {
  const text = (ko: string, english: string) => en ? english : ko;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [mapRevision, setMapRevision] = useState(0);
  const riders = liveRiders(snapshot, now);
  const leader = riders.find(r => r.progressM !== null);
  const reference = riders.find(r => r.uid === selected);
  const visible = riders.filter(r => (!followingOnly || followed.includes(r.uid)) && `${r.displayName} ${r.uid}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const courseLatlngs = useMemo(() => snapshot.course ? [snapshot.course.points.map(p => [p.lat, p.lon] as [number, number])] : [], [snapshot.course]);
  const locations: LocationData[] = riders.map(r => ({uid: r.uid, lat: r.lat, lng: r.lng, displayName: r.displayName,
    speed: r.speedMps === null ? 0 : r.speedMps * 3.6, distance: r.progressM ?? 0, status: r.status,
    bib: null, category: null, rank: null, overallRank: null, lastCp: null, geohash: null}));
  const finished = snapshot.status === "FINISHED" || snapshot.status === "CANCELLED";
  const gap = (progress: number | null, baseline: number | null | undefined) => progress === null || baseline == null ? "—" : `${baseline - progress >= 0 ? "+" : "−"}${Math.abs(baseline - progress).toFixed(0)} m`;
  const statusLabel = (status: string) => ({RIDING: text("주행 중", "Riding"), STOPPED: text("정지", "Stopped"), LOST_SIGNAL: text("수신 지연", "Signal delayed"), FINISHED: text("주행 완료", "Finished"), DNF: text("중도 종료", "DNF")})[status] ?? status;
  return <div className="club-live-stack">
    <header className="club-live-heading"><div><p>{text("클럽 모임 관전", "Club meeting spectator")}</p><h1>{snapshot.title}</h1></div>
      <strong>{snapshot.status === "OPEN" ? text("출발 대기", "Waiting to start") : snapshot.status === "LIVE" ? text("함께 달리는 중", "Riding together") : snapshot.status === "FINISHED" ? text("모임 종료", "Meeting finished") : text("모임 취소", "Cancelled")}</strong>
    </header>
    <p className="club-live-muted">{text("마지막 응답", "Last response")} · {new Date(receivedAt).toLocaleTimeString(en ? "en-US" : "ko-KR")} · {text("참가자", "Riders")} {riders.length}</p>
    {finished ? <Card><h2>{text("모임이 마무리됐어요", "This meeting has ended")}</h2><p>{text("개인 기록 업로드와 결과 확인에는 시간이 걸릴 수 있어요.", "Record uploads and results may take a moment.")}</p>
      <Link to={`/club/${snapshot.groupId}/meetings/${snapshot.eventId}`}>{text("모임 결과 확인", "View meeting results")}</Link>{" · "}<Link to={`/club/${snapshot.groupId}/rides`}>{text("그룹 주행 기록", "Group ride recordings")}</Link></Card> : <>
      {snapshot.course && <Card><div className="club-live-heading"><div><h2>{snapshot.course.name}</h2><p>{(snapshot.course.distanceM / 1000).toFixed(1)} km</p></div><Button variant="secondary" onClick={() => { setSelected(null); setMapRevision(v => v + 1); }}>{text("코스 전체 보기", "Show entire course")}</Button></div>
        <div className="club-live-map"><EventMap key={`${snapshot.course.courseId}/${mapRevision}`} locations={locations} selectedUid={reference && !staleRider(reference, now) ? selected : null} onSelectParticipant={setSelected} courseLatlngs={courseLatlngs} followSelected /></div>
      </Card>}
      <Card><div className="club-live-heading"><h2>{text("참가자 현황", "Rider positions")}</h2><Button variant="secondary" onClick={() => setFollowingOnly(v => !v)} aria-pressed={followingOnly}>{text("팔로우만 보기", "Following only")} ({followed.filter(uid => riders.some(r => r.uid === uid)).length})</Button></div>
        <Input aria-label={text("이름 또는 참가자 ID 검색", "Search name or rider ID")} placeholder={text("이름 또는 참가자 ID", "Name or rider ID")} value={search} onChange={e => setSearch(e.target.value)} />
        <p className="club-live-muted">{text("같은 코스에서의 앞뒤 간격이에요. 위치를 정확히 구분하기 어려우면 격차를 표시하지 않아요.", "Gaps compare positions on the same course. They are unavailable when positions cannot be distinguished reliably.")}</p>
        {visible.length === 0 && <p role="status">{riders.length ? text("검색 또는 팔로우 조건에 맞는 참가자가 없어요.", "No riders match your filters.") : text("참가자의 가상 주행 위치를 기다리고 있어요.", "Waiting for virtual rider positions.")}</p>}
        <ul className="club-live-riders">{visible.map(r => <li key={r.uid} className={selected === r.uid ? "club-live-selected" : undefined}>
          <div className="club-live-heading"><Button variant="secondary" aria-pressed={selected === r.uid} onClick={() => setSelected(selected === r.uid ? null : r.uid)}>{r.displayName}</Button><span>{statusLabel(r.status)}</span><Button size="sm" variant="secondary" aria-label={`${r.displayName} ${text("팔로우", "follow")}`} aria-pressed={followed.includes(r.uid)} onClick={() => setFollowed(ids => ids.includes(r.uid) ? ids.filter(id => id !== r.uid) : [...ids, r.uid])}>{followed.includes(r.uid) ? text("팔로우 중", "Following") : text("팔로우", "Follow")}</Button></div>
          <dl className="club-live-metrics">
            <div><dt>{text("코스 위치", "Course position")}</dt><dd>{r.progressM === null ? "—" : `${(r.progressM / 1000).toFixed(2)} km`}</dd></div>
            <div><dt>{text("선두 격차", "Gap to front")}</dt><dd>{gap(r.progressM, leader?.progressM)}</dd></div>
            <div><dt>{text("선택 선수 격차", "Gap to selected")}</dt><dd>{gap(r.progressM, reference?.progressM)}</dd></div>
            <div><dt>{text("속도", "Speed")}</dt><dd>{r.speedMps === null ? "—" : `${(r.speedMps * 3.6).toFixed(1)} km/h`}</dd></div>
            <div><dt>{text("파워", "Power")}</dt><dd>{r.powerWatts === null ? "—" : `${r.powerWatts} W`}</dd></div>
          </dl><p className="club-live-muted">{text("위치 수신", "Position sample")} · {Math.max(0, Math.floor((now - r.sampledAtMs) / 1000))}{text("초 전", "s ago")}</p>
        </li>)}</ul>
      </Card>
    </>}
  </div>;
}
