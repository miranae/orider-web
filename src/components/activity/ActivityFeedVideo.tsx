import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type Hls from "hls.js";
import type { ActivityFeedContentProjection } from "@shared/types/activity-feed-content";
import { IconButton } from "../../theme/components";
import "./ActivityFeedVideo.css";

type Media = ActivityFeedContentProjection["photos"][number];

export default function ActivityFeedVideo({ media, remainingCount = 0, expanded = false, expandedOutlet, onExpansionChange }: {
  media: Media;
  remainingCount?: number;
  expanded?: boolean;
  expandedOutlet?: HTMLElement | null;
  onExpansionChange?: (id: string | null) => void;
}) {
  const { t } = useTranslation("activity");
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const resumeTime = useRef(0);
  const resumePaused = useRef(false);
  const playIntent = useRef(false);
  const disposing = useRef(false);
  const [requestedUrl, setRequestedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(media.durationSeconds ?? null);
  const url = media.videoUrl ?? "";
  const active = requestedUrl === url && (!narrow || expanded);
  const expansionState = useRef({ requestedUrl, expanded, expandedOutlet, onExpansionChange });
  expansionState.current = { requestedUrl, expanded, expandedOutlet, onExpansionChange };

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !url || !video) return;
    let cancelled = false;
    disposing.current = false;
    let hls: Hls | undefined;
    setLoading(true);
    const fail = () => {
      if (cancelled) return;
      playIntent.current = false;
      setFailed(true);
      setLoading(false);
      setRequestedUrl(null);
    };
    const play = () => {
      if (cancelled) return;
      if (resumePaused.current) setLoading(false);
      else void video.play().catch(fail);
    };
    void (async () => {
      if (video.canPlayType("application/vnd.apple.mpegurl") || video.canPlayType("application/x-mpegURL")) {
        video.preload = "metadata";
        video.src = url;
        play();
        return;
      }
      const { default: HlsPlayer } = await import("hls.js");
      if (cancelled) return;
      if (!HlsPlayer.isSupported()) { fail(); return; }
      hls = new HlsPlayer({ debug: false });
      hls.on(HlsPlayer.Events.MANIFEST_PARSED, play);
      hls.on(HlsPlayer.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
      hls.loadSource(url);
      hls.attachMedia(video);
    })().catch(fail);
    return () => {
      cancelled = true;
      resumeTime.current = video.currentTime;
      resumePaused.current = !playIntent.current;
      disposing.current = true;
      video.pause();
      hls?.destroy();
      video.removeAttribute("src");
      video.preload = "none";
      video.load();
    };
  }, [active, url, attempt, expanded]);

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return;
    const measure = () => {
      const width = tile.getBoundingClientRect().width;
      const minimum = getComputedStyle(tile).getPropertyValue("--space-7");
      const padding = getComputedStyle(tile).getPropertyValue("--space-3");
      const target = parseFloat(minimum) + parseFloat(padding);
      if (width > 0 && Number.isFinite(target)) {
        const compact = width < target * 2;
        setNarrow(compact);
        const current = expansionState.current;
        if (compact && current.requestedUrl && !current.expanded && current.expandedOutlet) current.onExpansionChange?.(media.id);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(tile);
    return () => observer?.disconnect();
  }, [media.id]);

  useEffect(() => {
    if (expanded) {
      containerRef.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
      videoRef.current?.focus({ preventScroll: true });
    }
    const stop = () => {
      playIntent.current = false;
      videoRef.current?.pause();
      setRequestedUrl(null);
      setPlaying(false);
      setLoading(false);
      setMuted(true);
      if (expanded) onExpansionChange?.(null);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting)) stop();
    });
    if (containerRef.current) observer?.observe(containerRef.current);
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [expanded, onExpansionChange]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video || !url) return;
    if (!active || failed) {
      if (narrow && expandedOutlet) onExpansionChange?.(media.id);
      resumeTime.current = 0;
      resumePaused.current = false;
      playIntent.current = true;
      setFailed(false);
      setRemaining(media.durationSeconds ?? null);
      setAttempt(value => value + 1);
      setRequestedUrl(url);
    } else if (loading) {
      playIntent.current = false;
      setRequestedUrl(null);
      setLoading(false);
    } else if (!video.paused) { playIntent.current = false; video.pause(); }
    else {
      playIntent.current = true;
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => { playIntent.current = false; setFailed(true); setRequestedUrl(null); });
    }
  };
  const updateRemaining = () => {
    const video = videoRef.current;
    const duration = video && Number.isFinite(video.duration) ? video.duration : media.durationSeconds;
    if (video && duration != null) setRemaining(Math.max(0, Math.ceil(duration - video.currentTime)));
  };
  const seconds = remaining == null ? null : Math.max(0, Math.ceil(remaining));
  const player = <div ref={containerRef} className="activity-feed-video-player" aria-busy={loading} onClick={event => event.stopPropagation()}>
    <video ref={videoRef} poster={media.url} playsInline muted={muted} preload="none" aria-hidden={!active || undefined} tabIndex={active ? 0 : -1} role={active ? "button" : undefined}
      aria-label={t(playing ? "card.videoPause" : "card.videoPlay")}
      onClick={toggle} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}
      onPlaying={event => { if (event.currentTarget !== videoRef.current) return; playIntent.current = true; setPlaying(true); setLoading(false); }} onPause={event => {
        if (event.currentTarget !== videoRef.current) return;
        if (!disposing.current && event.currentTarget === videoRef.current && event.currentTarget.isConnected) playIntent.current = false;
        setPlaying(false);
      }}
      onEnded={event => { if (event.currentTarget !== videoRef.current) return; playIntent.current = false; setPlaying(false); setRemaining(0); }} onTimeUpdate={updateRemaining} onLoadedMetadata={event => {
        if (event.currentTarget !== videoRef.current) return;
        if (resumeTime.current > 0 && videoRef.current) {
          videoRef.current.currentTime = resumeTime.current;
          resumeTime.current = 0;
        }
        if (resumePaused.current) setLoading(false);
        updateRemaining();
      }}
      onError={event => { if (active && event.currentTarget === videoRef.current) { playIntent.current = false; setFailed(true); setLoading(false); setRequestedUrl(null); } }} />
    {expanded && <span className="activity-feed-video-close"><IconButton variant="neutral" size="sm" aria-label={t("card.videoClose")} icon={<X size={16} />} onClick={() => { playIntent.current = false; setRequestedUrl(null); onExpansionChange?.(null); }} /></span>}
    {seconds != null && <span className="activity-feed-video-time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}
    {failed && <span role="status" className="activity-feed-video-error">{t("card.videoUnavailable")}</span>}
    {!active && remainingCount > 0 && <span className="mobile-feed-photo-remaining">+{remainingCount}</span>}
    <span className="activity-feed-video-play">
      <IconButton variant="neutral" size="sm" aria-label={t(failed ? "card.videoRetry" : playing || loading ? "card.videoPause" : "card.videoPlay")}
        aria-pressed={playing} icon={failed ? <RotateCcw size={16} /> : playing || loading ? <Pause size={16} /> : <Play size={16} />} onClick={toggle} />
    </span>
    {active && <span className="activity-feed-video-mute">
      <IconButton variant="neutral" size="sm" aria-label={t(muted ? "card.videoUnmute" : "card.videoMute")} aria-pressed={!muted}
        icon={muted ? <VolumeX size={16} /> : <Volume2 size={16} />} onClick={() => setMuted(value => !value)} />
    </span>}
  </div>;
  return <>
    <div ref={tileRef} className="mobile-feed-photo activity-feed-video">
      {expanded && expandedOutlet ? <>
        <img src={media.url} alt={media.caption ?? ""} loading="lazy" />
        <span className="activity-feed-video-play"><IconButton variant="neutral" size="sm" aria-label={t(playing ? "card.videoPause" : "card.videoPlay")} icon={playing ? <Pause size={16} /> : <Play size={16} />} onClick={toggle} /></span>
      </> : player}
    </div>
    {expanded && expandedOutlet && createPortal(<div className="activity-feed-video activity-feed-video--expanded">{player}</div>, expandedOutlet)}
  </>;
}
