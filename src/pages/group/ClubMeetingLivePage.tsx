import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { Button } from "../../theme/components";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { useMeetingSpectator } from "../../features/club-spectator/useMeetingSpectator";
import { useSpectatorPreferences } from "../../features/club-spectator/preferences";
import MeetingSpectatorView from "../../features/club-spectator/MeetingSpectatorView";

export default function ClubMeetingLivePage() {
  const {groupId, meetingId} = useParams();
  const {user, loading, signIn} = useAuth();
  const {i18n} = useTranslation();
  const en = i18n.language.startsWith("en");
  const preferences = useSpectatorPreferences(user?.uid, groupId, meetingId);
  const live = useMeetingSpectator(groupId, meetingId, user?.uid, preferences.value.selectedUid);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (loading) return <LoadingSkeleton kind="list" count={3} />;
  if (!user) return <EmptyState title={en ? "Sign in to watch this club meeting." : "로그인하고 클럽 모임을 관전하세요."} actions={[{label: en ? "Sign in" : "로그인", onClick: () => void signIn()}]} />;
  return <main className="site-shell club-live-page">
    <Link to={`/club/${groupId}/meetings/${meetingId}`}>← {en ? "Meeting" : "모임 상세"}</Link>
    {live.loading && <LoadingSkeleton kind="list" count={3} />}
    {live.error != null && !live.data && <ErrorState title={en ? "Could not load live positions. Check your membership and connection." : "관전 정보를 불러오지 못했어요. 회원 자격과 연결 상태를 확인해주세요."} onRetry={live.reload} />}
    {live.error != null && live.data && <p role="status">{en ? "Reconnecting… Positions may be delayed." : "다시 연결하고 있어요. 위치 수신이 지연될 수 있어요."} <Button variant="secondary" onClick={live.reload}>{en ? "Retry" : "다시 시도"}</Button></p>}
    {live.data && <MeetingSpectatorView key={`${user.uid}/${meetingId}`} snapshot={live.data} preferences={preferences.value} onPreferencesChange={preferences.update} now={live.data.serverNowMs + Math.max(0, now - live.receivedAt)} receivedAt={live.receivedAt} en={en} />}
  </main>;
}
