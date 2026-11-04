import { useCallback, useEffect, useRef, useState } from "react";
import { useClubMeetingsApi } from "./useClubMeetingsApi";
import type { MeetingDiscordView } from "../../services/clubMeetings";
import { Button, Card, buttonClass } from "../../theme/components";
import { DiscordLogo } from "../../components/auth/DiscordLogo";
import { LocalizedLink } from "../../components/LocalizedLink";
import { logClientError } from "../../services/errorLogger";

/** Independent from attendance: spectators can use/share the same public Discord invite. */
export default function MeetingDiscord({ eventId, uid, ended = false, en }: {
  eventId: string; uid: string; ended?: boolean; en: boolean;
}) {
  const {getClubMeetingDiscord, openClubMeetingDiscord, closeClubMeetingDiscord} = useClubMeetingsApi();
  const text = (ko: string, english: string) => en ? english : ko;
  const scope = `${uid}/${eventId}`, current = useRef(scope), mounted = useRef(false), generation = useRef(0);
  current.current = scope;
  const [result, setResult] = useState<{scope: string; value: MeetingDiscordView} | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const reload = useCallback(async () => {
    if (busy.current) return;
    const request = ++generation.current;
    try {
      const value = await getClubMeetingDiscord(eventId);
      if (mounted.current && current.current === scope && request === generation.current) {
        setResult({scope, value}); setError(false);
      }
    } catch (reason) {
      if (mounted.current && current.current === scope && request === generation.current) setError(true);
      logClientError("MeetingDiscord.load", reason);
    }
  }, [eventId, scope, getClubMeetingDiscord]);
  useEffect(() => {
    mounted.current = true; busy.current = false; setPending(false); setResult(null); setError(false); setConfirmClose(false);
    void reload();
    const focus = () => { if (!document.hidden) void reload(); };
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; generation.current++; window.removeEventListener("focus", focus); };
  }, [reload]);
  const data = result?.scope === scope ? result.value : null;
  useEffect(() => {
    if (!data || ended || !["preparing", "closing"].includes(data.state)) return;
    const timer = window.setInterval(() => { if (!document.hidden && !busy.current) void reload(); }, 10000);
    return () => clearInterval(timer);
  }, [data, ended, reload]);
  const mutate = async (close: boolean) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false); const operation = ++generation.current;
    try {
      const value = await (close ? closeClubMeetingDiscord(eventId) : openClubMeetingDiscord(eventId));
      if (mounted.current && current.current === scope && operation === generation.current) { setResult({scope, value}); setConfirmClose(false); }
    } catch (reason) {
      if (mounted.current && current.current === scope && operation === generation.current) setError(true);
      logClientError("MeetingDiscord.change", reason);
    } finally {
      if (mounted.current && current.current === scope && operation === generation.current) { busy.current = false; setPending(false); }
    }
  };
  const ready = !ended && !pending && !error && data?.state === "ready";
  const safeInvite = data?.inviteUrl && /^https:\/\/discord\.gg\/[A-Za-z0-9_-]+$/.test(data.inviteUrl) ? data.inviteUrl : null;
  const safeServer = data?.serverInviteUrl && /^https:\/\/discord\.gg\/[A-Za-z0-9_-]+$/.test(data.serverInviteUrl) ? data.serverInviteUrl : null;
  const canOpen = data?.available && data.isHost && data.linked && !ended && !["ready", "closing"].includes(data.state);
  if (data && !data.available && !error) return null;
  return <Card className="space-y-3">
    <h2>{text("디스코드 음성 모임", "Discord voice room")}</h2>
    <p>{ended ? text("모임이 끝나 음성 채널을 정리합니다.", "The meeting has ended. Its voice channel is being removed.")
      : text("참석자와 관전자가 함께 사용하는 공개 음성 채널입니다. 모임 종료·취소 후 자동으로 삭제됩니다.", "A public voice room for riders and spectators. It is removed automatically when the meeting ends or is cancelled.")}</p>
    {error && <p role="alert">{text("음성 채널 상태를 확인하지 못했어요. 다시 확인해주세요.", "Could not confirm the voice room. Please retry.")} <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={pending}>{text("다시 확인", "Retry")}</Button></p>}
    {!data && !error && <p role="status">{text("음성 채널을 확인하고 있어요.", "Checking the voice room…")}</p>}
    {ready && safeInvite && <a href={safeInvite} target="_blank" rel="noopener noreferrer" className={buttonClass({variant: "discord", size: "lg"})}><DiscordLogo />{text("디스코드에서 함께하기", "Join on Discord")}</a>}
    {!ended && data?.state === "preparing" && <p role="status">{text("음성 채널을 준비하고 있어요. 잠시 후 다시 확인해주세요.", "Preparing the room. Please check again shortly.")}</p>}
    {!ended && data?.state === "closing" && <p role="status">{text("음성 채널을 정리하고 있어요.", "Removing the voice room…")}</p>}
    {!ended && data?.isHost && <>
      {!data.linked && <LocalizedLink to="/settings/account" className={buttonClass({variant:"outline"})}>{text("디스코드 계정 연결", "Link Discord account")}</LocalizedLink>}
      {safeServer && data.state !== "ready" && <p><a href={safeServer} target="_blank" rel="noopener noreferrer">{text("오라이더 디스코드 서버 참가", "Join the ORider Discord server")}</a></p>}
      {canOpen && <Button variant="discord" leadingIcon={<DiscordLogo />} loading={pending} onClick={() => void mutate(false)}>{text(data.state === "preparing" ? "채널 준비 다시 시도" : "음성 채널 열기", data.state === "preparing" ? "Retry room setup" : "Open voice room")}</Button>}
      <p>{text("처음 사용하실 때는 계정을 연결하고 오라이더 디스코드 서버에 참가해주세요. 주최자는 디스코드에서 참가자를 우클릭해 음성 연결을 끊을 수 있습니다.", "For first use, link your account and join the ORider Discord server. The organizer can right-click a participant in Discord to disconnect them from voice.")}</p>
      {["ready", "preparing", "closing"].includes(data.state) && <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirmClose(true)}>{text("음성 채널 닫기", "Close voice room")}</Button>}
      {confirmClose && <div role="group" aria-label={text("음성 채널 닫기 확인", "Confirm closing the voice room")}>
        <p>{text("음성 채널을 닫으면 연결 중인 사람들의 통화도 끝납니다.", "Closing the room also ends the call for everyone connected.")}</p>
        <Button variant="danger" loading={pending} onClick={() => void mutate(true)}>{text("채널 닫기 확정", "Confirm close")}</Button>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirmClose(false)}>{text("돌아가기", "Go back")}</Button>
      </div>}
    </>}
    {!ended && data && !data.isHost && ["none", "closed"].includes(data.state) && <p>{text("주최자가 음성 채널을 열면 여기에서 함께할 수 있어요.", "Join here after the organizer opens a voice room.")}</p>}
  </Card>;
}
