import InfoTip from "../../components/InfoTip";
import { doc, onSnapshot } from "firebase/firestore";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClubMeetingsApi } from "./useClubMeetingsApi";
import type { MeetingDiscordView } from "../../services/clubMeetings";
import { PhoneOff } from "lucide-react";
import { Button, Card, IconButton, Stack, buttonClass } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";
import { DiscordLogo } from "../../components/auth/DiscordLogo";
import { LocalizedLink } from "../../components/LocalizedLink";
import { logClientError } from "../../services/errorLogger";
import { getRuntimeConfig, isEmulatorRuntime } from "../../services/runtimeConfig";
import { useWorldEvent } from "../ride-world/useWorldEvent";

/** Independent from attendance: spectators can use/share the same public Discord invite. */
export default function MeetingDiscord({ eventId, groupId, uid, ended = false, en }: {
  eventId: string; groupId: string; uid: string; ended?: boolean; en: boolean;
}) {
  const services = useFirebaseServices();
  const viewer = services.auth?.currentUser ?? null;
  const queued = useRef(false);
  const {getClubMeetingDiscord, openClubMeetingDiscord, closeClubMeetingDiscord} = useClubMeetingsApi();
  const text = (ko: string, english: string) => en ? english : ko;
  const scope = `${uid}/${groupId}/${eventId}`, current = useRef(scope), mounted = useRef(false), generation = useRef(0);
  current.current = scope;
  const [result, setResult] = useState<{scope: string; value: MeetingDiscordView} | null>(null);
  const [error, setError] = useState(false);
  const [signalRetry, setSignalRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const reload = useCallback(async () => {
    if (busy.current) { queued.current = true; return; }
    const request = ++generation.current;
    try {
      const value = await getClubMeetingDiscord(eventId);
      if (mounted.current && current.current === scope && request === generation.current) {
        setResult({scope, value}); setError(false);
      }
    } catch (reason) {
      if (mounted.current && current.current === scope && request === generation.current) setError(true);
      logClientError("MeetingDiscord.load", reason, undefined, services, viewer);
    }
  }, [eventId, scope, getClubMeetingDiscord, services, viewer]);
  const [worldScope, setWorldScope] = useState<{ scope: string; viewer: typeof viewer; services: typeof services } | null>(null);
  const activeWorldScope = useRef<typeof worldScope>(null);
  useEffect(() => {
    activeWorldScope.current = null;
    setWorldScope(null);
  }, [scope, viewer, services, ended]);
  const worldOwnsSignals = worldScope?.scope === scope && worldScope.viewer === viewer && worldScope.services === services;
  const redisSignals = import.meta.env.DEV && import.meta.env.VITE_ORIDER_LOCAL_WORLD === "1" &&
    import.meta.env.VITE_ORIDER_LOCAL_DISCORD_REDIS === "1" && isEmulatorRuntime() &&
    getRuntimeConfig().firebaseProjectId?.startsWith("demo-") === true && viewer?.uid === uid;
  useWorldEvent(redisSignals && !ended ? eventId : undefined, viewer, undefined, undefined, {
    topic: "discord",
    changed: () => {
      const binding = { scope, viewer, services };
      activeWorldScope.current = binding;
      setWorldScope(binding);
      if (!document.hidden) void reload();
    },
    disconnected: code => {
      if (!mounted.current || current.current !== scope) return;
      const denied = code === 4003 || code === 4004;
      const binding = activeWorldScope.current;
      if ((binding?.scope !== scope || binding.viewer !== viewer || binding.services !== services) && !denied) return;
      activeWorldScope.current = null;
      setWorldScope(null);
      generation.current++; busy.current = false; queued.current = false;
      setPending(false); setResult(null); setConfirmClose(false);
      if (denied) setError(true);
    },
  });
  useEffect(() => {
    mounted.current = true; queued.current = false; busy.current = false; setPending(false); setResult(null); setError(false); setConfirmClose(false);
    void reload();
    const focus = () => { if (!document.hidden) void reload(); };
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; generation.current++; window.removeEventListener("focus", focus); };
  }, [reload]);
  const data = result?.scope === scope ? result.value : null;
  useEffect(() => {
    let disposed = false;
    const stops: (() => void)[] = [];
    const changed = () => { if (!disposed && !document.hidden) void reload(); };
    const failed = (reason: unknown) => {
      if (disposed) return;
      generation.current++; busy.current = false; queued.current = false; setPending(false);
      setResult(null); setError(true);
      logClientError("MeetingDiscord.signal", reason, undefined, services, viewer);
      stops.forEach(stop => stop());
    };
    void services.ensureAppCheckReady().then(() => {
      if (disposed) return;
      const paths = [`events/${eventId}`, `groups/${groupId}`, `groups/${groupId}/members/${uid}`];
      if (!worldOwnsSignals) paths.unshift(`events/${eventId}/discord_signals/latest`);
      for (const path of paths) {
        stops.push(onSnapshot(doc(services.firestore, path), changed, failed));
      }
    }).catch(failed);
    document.addEventListener("visibilitychange", changed);
    return () => { disposed = true; stops.forEach(stop => stop()); document.removeEventListener("visibilitychange", changed); };
  }, [services, eventId, groupId, uid, reload, signalRetry, worldOwnsSignals, scope, viewer]);
  const mutate = async (close: boolean) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false); const operation = ++generation.current;
    try {
      const value = await (close ? closeClubMeetingDiscord(eventId) : openClubMeetingDiscord(eventId));
      if (mounted.current && current.current === scope && operation === generation.current) { setResult({scope, value}); setConfirmClose(false); }
    } catch (reason) {
      if (mounted.current && current.current === scope && operation === generation.current) setError(true);
      logClientError("MeetingDiscord.change", reason, undefined, services, viewer);
    } finally {
      if (mounted.current && current.current === scope && operation === generation.current) { busy.current = false; setPending(false); if (queued.current) { queued.current = false; void reload(); } }
    }
  };
  const ready = !ended && !pending && !error && data?.state === "ready";
  const safeInvite = data?.inviteUrl && /^https:\/\/discord\.gg\/[A-Za-z0-9_-]+$/.test(data.inviteUrl) ? data.inviteUrl : null;
  const safeServer = data?.serverInviteUrl && /^https:\/\/discord\.gg\/[A-Za-z0-9_-]+$/.test(data.serverInviteUrl) ? data.serverInviteUrl : null;
  const canOpen = data?.available && data.isHost && data.linked && !ended && !["ready", "closing"].includes(data.state);
  if (data && !data.available && !error) return null;
  return <Card className="space-y-3">
    {/* 주최자의 음성 채널 닫기는 카드 제목 옆 작은 통화 종료 아이콘으로 두고, 확정 단계는 그대로 거친다. */}
    <div className="cp-heading-with-edit">
      <h2><InfoTip label={text("디스코드 음성 모임", "Discord voice room")} title={text("디스코드 음성 모임", "Discord voice room")} content={[
        text("참석자와 관전자가 함께 사용하는 공개 음성 채널이며, 모임 종료·취소 후 자동 삭제됩니다.", "A public voice room for riders and spectators, removed automatically when the meeting ends or is cancelled."),
        ...(data?.isHost ? [text("처음에는 계정을 연결하고 오라이더 디스코드 서버에 참가해주세요. 디스코드에서 참가자를 우클릭하면 음성 연결을 끊을 수 있습니다.", "For first use, link your account and join the ORider Discord server. Right-click a participant in Discord to disconnect them from voice.")] : []),
      ].join(" ")}>{text("디스코드 음성 모임", "Discord voice room")}</InfoTip></h2>
      {!ended && data?.isHost && ["ready", "preparing", "closing"].includes(data.state) && <IconButton size="sm" variant="ghost" aria-label={text("음성 채널 닫기", "Close voice room")} title={text("음성 채널 닫기", "Close voice room")} icon={<PhoneOff size={ICON_SIZE.sm} />} disabled={pending} onClick={() => setConfirmClose(true)} />}
    </div>
    {ended && <p>{text("모임이 끝나 음성 채널을 정리합니다.", "The meeting has ended. Its voice channel is being removed.")}</p>}
    {error && <p role="alert">{text("음성 채널 상태를 확인하지 못했어요. 다시 확인해주세요.", "Could not confirm the voice room. Please retry.")} <Button variant="ghost" size="sm" onClick={() => { setSignalRetry(value => value + 1); void reload(); }} disabled={pending}>{text("다시 확인", "Retry")}</Button></p>}
    {!data && !error && <p role="status">{text("음성 채널을 확인하고 있어요.", "Checking the voice room…")}</p>}
    {ready && safeInvite && <Stack direction="row" wrap><a href={safeInvite} target="_blank" rel="noopener noreferrer" className={buttonClass({variant: "discord", size: "sm"})}><DiscordLogo />{text("디스코드에서 함께하기", "Join on Discord")}</a></Stack>}
    {!ended && data?.state === "preparing" && <p role="status">{text("음성 채널을 준비하고 있어요. 잠시 후 다시 확인해주세요.", "Preparing the room. Please check again shortly.")}</p>}
    {!ended && data?.state === "closing" && <p role="status">{text("음성 채널을 정리하고 있어요.", "Removing the voice room…")}</p>}
    {!ended && data?.isHost && <>
      {!data.linked && <Stack direction="row" wrap><LocalizedLink to="/settings/account" className={buttonClass({variant:"outline", size:"sm"})}>{text("디스코드 계정 연결", "Link Discord account")}</LocalizedLink></Stack>}
      {safeServer && data.state !== "ready" && <p><a href={safeServer} target="_blank" rel="noopener noreferrer">{text("오라이더 디스코드 서버 참가", "Join the ORider Discord server")}</a></p>}
      {canOpen && <Stack direction="row" wrap><Button variant="discord" size="sm" leadingIcon={<DiscordLogo />} loading={pending} onClick={() => void mutate(false)}>{text(data.state === "preparing" ? "채널 준비 다시 시도" : "음성 채널 열기", data.state === "preparing" ? "Retry room setup" : "Open voice room")}</Button></Stack>}
      {confirmClose && <div role="group" aria-label={text("음성 채널 닫기 확인", "Confirm closing the voice room")}>
        <p>{text("음성 채널을 닫으면 연결 중인 사람들의 통화도 끝납니다.", "Closing the room also ends the call for everyone connected.")}</p>
        <Button variant="danger" loading={pending} onClick={() => void mutate(true)}>{text("채널 닫기 확정", "Confirm close")}</Button>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirmClose(false)}>{text("돌아가기", "Go back")}</Button>
      </div>}
    </>}
    {!ended && data && !data.isHost && ["none", "closed"].includes(data.state) && <p>{text("주최자가 음성 채널을 열면 여기에서 함께할 수 있어요.", "Join here after the organizer opens a voice room.")}</p>}
  </Card>;
}
