import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import EventMap from "../../components/event/EventMap";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card, Text } from "../../theme/components";

interface SnapshotLocation {
  uid: string;
  lat: number;
  lng: number;
  speed: number;
  distance: number;
  status: string;
  displayName: string;
  bib: number | null;
  category: string | null;
  rank: number | null;
  overallRank: number | null;
  lastCp: number | null;
  geohash: string | null;
  /** 활동 운동시간(초). 앱이 publish 한 경우에만 채워짐. null 가능 (옛 스냅샷 호환). */
  durationSec?: number | null;
  /** 심박(bpm). HR 공유 OFF 또는 HRM 미연결 멤버는 null. */
  hr?: number | null;
}

interface SnapshotData {
  timestamp: number;
  counts: {
    riding: number;
    finished: number;
    dnf: number;
    sos: number;
    offCourse: number;
    total: number;
  };
  checkpoints: Array<{ cpId: string; name: string; passedCount: number }>;
  locations: SnapshotLocation[];
}

interface HighlightItem {
  key: string;
  ts: number;
  bib: number | null;
  name: string;
  color: string;
  message: string;
  sub?: string;
}

const FOLLOW_COLORS = ["var(--lime)", "var(--aqua)", "var(--amber)", "var(--rose)"] as const;

/** Format duration in seconds as h:mm:ss or m:ss. Returns "—" for null/zero. */
function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function loadFollowedBibs(eventId: string): number[] {
  try {
    const raw = localStorage.getItem(`event-follow:${eventId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b) => typeof b === "number") : [];
  } catch {
    return [];
  }
}

function saveFollowedBibs(eventId: string, bibs: number[]): void {
  try {
    localStorage.setItem(`event-follow:${eventId}`, JSON.stringify(bibs));
  } catch {
    // ignore
  }
}

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function RiderCard({
  loc,
  totalDistKm,
  color,
  onUnfollow,
}: {
  loc: SnapshotLocation;
  totalDistKm: number;
  color: string;
  onUnfollow: () => void;
}) {
  const { t } = useTranslation("event");
  const distKm = loc.distance / 1000;
  const pct = totalDistKm > 0 ? Math.min(100, (distKm / totalDistKm) * 100) : 0;
  const initial = loc.displayName?.charAt(0) ?? "?";
  const statusText =
    loc.status === "FINISHED" ? t("liveView.finished") :
    loc.status === "DNF" ? "DNF" :
    loc.status === "SOS" ? "SOS" :
    t("liveView.riding");
  return (
    <Card padding="none"
      style={{ padding: 'var(--space-5)', borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--bg-3)",
            display: "grid",
            placeItems: "center",
            fontSize: "var(--fs-sm)",
            fontWeight: 600,
            color: "var(--ink-0)",
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)", fontSize: "var(--fs-sm)" }}>
            {loc.displayName}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
            {loc.bib != null ? `#${String(loc.bib).padStart(3, "0")}` : "—"}
            {loc.category ? ` · ${loc.category}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", letterSpacing: "0.05em" }}>{t("liveView.rankLabel")}</div>
          <div style={{ fontSize: "var(--fs-xl)", fontFamily: "var(--font-mono)", color, fontWeight: 600 }}>
            {loc.overallRank ?? "—"}
          </div>
        </div>
        <Button
          type="button"
          onClick={onUnfollow}
          aria-label={t("action.unfollowAthlete")} variant="secondary" size="sm"
          style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--fs-xs)" }}
        >
          ×
        </Button>
      </div>

      <div style={{ marginBottom: "var(--space-3)" }}>
        <div className="flex justify-between" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--space-1-5)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
            {distKm.toFixed(1)} km
          </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
            {totalDistKm > 0 ? `${totalDistKm.toFixed(1)} km` : "—"}
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: "var(--bg-3)",
            borderRadius: "var(--r-xs)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: color,
              transition: "width .6s",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: -3,
              transform: "translateX(-50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: color,
              border: "2px solid var(--bg-1)",
            }}
          />
        </div>
        <div
          style={{
            fontSize: "var(--fs-xs)",
            color: "var(--ink-3)",
            fontFamily: "var(--font-mono)",
            marginTop: 'var(--space-1)',
            textAlign: "right",
          }}
        >
          {pct.toFixed(1)}%
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 1,
          background: "var(--line-soft)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r-sm)",
          overflow: "hidden",
        }}
      >
        {[
          [t("liveView.speed"), loc.speed > 0 ? loc.speed.toFixed(1) : "—", "km/h"],
          [t("time"), formatDuration(loc.durationSec), ""],
          ["HR", loc.hr != null && loc.hr > 0 ? String(loc.hr) : "—", "bpm"],
          ["CP", `${loc.lastCp ?? 0}`, ""],
          [t("liveView.statusLabel"), statusText, ""],
        ].map(([k, v, u]) => (
          <div key={k} style={{ padding: "10px 12px", background: "var(--bg-1)" }}>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: 'var(--space-1)' }}>
              {k}
            </Text>
            <div className="flex items-baseline" style={{ gap: "var(--space-1)" }}>
              <Text variant="dataMedium" style={{ fontSize: "var(--fs-sm)" }}>
                {v}
              </Text>
              {u && (
                <Text variant="unit" style={{ fontSize: "var(--fs-xs)" }}>
                  {u}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function EventLivePage() {
  const { t } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightBib = searchParams.get("bib") ? Number(searchParams.get("bib")) : null;

  const [eventName, setEventName] = useState<string>("");
  const [eventStartTime, setEventStartTime] = useState<number | null>(null);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [searchBib, setSearchBib] = useState(highlightBib?.toString() || "");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followBibs, setFollowBibs] = useState<number[]>(() => (eventId ? loadFollowedBibs(eventId) : []));
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);

  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const prevCpRef = useRef<Map<string, number>>(new Map());

  // URL bib 쿼리 → 팔로우 리스트에 자동 추가
  useEffect(() => {
    if (!eventId || !highlightBib) return;
    setFollowBibs((prev) => (prev.includes(highlightBib) ? prev : [...prev, highlightBib]));
  }, [eventId, highlightBib]);

  // 팔로우 저장
  useEffect(() => {
    if (!eventId) return;
    saveFollowedBibs(eventId, followBibs);
  }, [eventId, followBibs]);

  // 이벤트 메타 로드
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, "events", eventId));
        if (snap.exists()) {
          const info = snap.data().info || {};
          setEventName(info.name || t("title"));
          const st = info.startTime;
          const startMs = typeof st === "number" ? st :
            st?._seconds ? st._seconds * 1000 :
            st?.seconds ? st.seconds * 1000 :
            typeof st?.toMillis === "function" ? st.toMillis() : null;
          setEventStartTime(startMs ?? null);

          // 첫 코스로 totalDistance
          const courseIds: string[] = Array.isArray(info.courseIds) ? info.courseIds : [];
          if (courseIds.length > 0 && courseIds[0]) {
            try {
              const cs = await getDoc(doc(firestore, "courses", courseIds[0]));
              if (cs.exists()) {
                const d = typeof cs.data().distance === "number" ? cs.data().distance : 0;
                setTotalDistanceKm(d / 1000);
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        logClientError("EventLivePage.loadEvent", err, { eventId });
      }
    })();
  }, [eventId]);

  const fetchSnapshot = useCallback(async () => {
    if (!eventId) return;
    try {
      const storage = getStorage();
      const fileRef = ref(storage, `snapshots/${eventId}/latest.json`);
      const url = await getDownloadURL(fileRef);
      const response = await fetch(url);
      const data: SnapshotData = await response.json();
      setSnapshot(data);
      setLoadError(null);

      const newHighlights: HighlightItem[] = [];
      const tsNow = data.timestamp || Date.now();
      const followSet = new Set(followBibs);
      const colorFor = (bib: number | null): string => {
        if (bib == null) return "var(--ink-3)";
        const idx = followBibs.indexOf(bib);
        return idx >= 0 ? FOLLOW_COLORS[idx % FOLLOW_COLORS.length] ?? "var(--lime)" : "var(--ink-3)";
      };
      for (const loc of data.locations ?? []) {
        if (loc.bib == null || !followSet.has(loc.bib)) continue;
        const prev = prevStatusRef.current.get(loc.uid);
        if (prev && prev !== loc.status) {
          if (loc.status === "FINISHED") {
            newHighlights.push({
              key: `${loc.uid}-fin-${tsNow}`,
              ts: tsNow,
              bib: loc.bib,
              name: loc.displayName,
              color: colorFor(loc.bib),
              message: t("liveView.highlight.finished", { name: loc.displayName }),
              sub: loc.overallRank ? t("liveView.highlight.overallRank", { rank: loc.overallRank }) : undefined,
            });
          } else if (loc.status === "DNF") {
            newHighlights.push({
              key: `${loc.uid}-dnf-${tsNow}`,
              ts: tsNow,
              bib: loc.bib,
              name: loc.displayName,
              color: colorFor(loc.bib),
              message: `${loc.displayName} DNF`,
              sub: loc.lastCp ? t("liveView.highlight.abandonedAfterCp", { cp: loc.lastCp }) : undefined,
            });
          }
        }
        prevStatusRef.current.set(loc.uid, loc.status);
      }
      for (const cp of data.checkpoints ?? []) {
        const prev = prevCpRef.current.get(cp.cpId) ?? 0;
        if (cp.passedCount > prev && prev > 0) {
          newHighlights.push({
            key: `cp-${cp.cpId}-${tsNow}`,
            ts: tsNow,
            bib: null,
            name: cp.name,
            color: "var(--aqua)",
            message: t("liveView.highlight.cpPassed", { name: cp.name, count: cp.passedCount - prev }),
            sub: t("liveView.highlight.cpTotal", { count: cp.passedCount }),
          });
        }
        prevCpRef.current.set(cp.cpId, cp.passedCount);
      }
      if (newHighlights.length > 0) {
        setHighlights((prev) => [...newHighlights, ...prev].slice(0, 20));
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "storage/object-not-found") {
        setSnapshot(null);
        setLoadError(null);
      } else {
        logClientError("EventLivePage.fetchSnapshot", err, { eventId });
        if (!snapshot) setLoadError(err instanceof Error ? err.message : t("liveView.snapshotLoadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [eventId, snapshot, followBibs]);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedLabel = useMemo(() => {
    if (!eventStartTime) return "";
    const diff = Math.max(0, now - eventStartTime);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [eventStartTime, now]);

  const followedParticipants = useMemo(() => {
    if (!snapshot) return [] as SnapshotLocation[];
    return snapshot.locations.filter((l) => l.bib != null && followBibs.includes(l.bib));
  }, [snapshot, followBibs]);

  const colorByBib = useCallback(
    (bib: number | null): string => {
      if (bib == null) return "var(--ink-3)";
      const idx = followBibs.indexOf(bib);
      return idx >= 0 ? FOLLOW_COLORS[idx % FOLLOW_COLORS.length] ?? "var(--lime)" : "var(--ink-3)";
    },
    [followBibs]
  );

  const searchedParticipant = snapshot?.locations.find((l) => l.bib != null && String(l.bib) === searchBib.trim());

  useEffect(() => {
    setSelectedUid(searchedParticipant?.uid ?? null);
  }, [searchedParticipant?.uid]);

  const addFollow = () => {
    const n = Number(searchBib.trim());
    if (!Number.isFinite(n)) return;
    if (!followBibs.includes(n)) setFollowBibs([...followBibs, n]);
    setSearchBib("");
  };

  const removeFollow = (bib: number) => {
    setFollowBibs(followBibs.filter((b) => b !== bib));
  };

  const handleShare = () => {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: eventName, url }).catch(() => undefined);
    } else {
      navigator.clipboard?.writeText(url).then(() => alert(t("liveView.linkCopied")));
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState
          title={t("liveView.errorTitle")}
          description={loadError}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🚦"
          title={eventName ? `${eventName}` : t("label.spectatorView")}
          description={t("liveView.notStartedDesc")}
        />
      </div>
    );
  }

  return (
    <div>
      <style>{`@keyframes orp { 0%, 50% { opacity: 1 } 51%, 100% { opacity: 0 } }`}</style>

      {/* Header — full-width, 시안 스타일 */}
      <div
        className="flex items-center flex-wrap"
        style={{
          borderBottom: "1px solid var(--line-soft)",
          padding: "14px 24px",
          gap: 'var(--space-4)',
          background: "linear-gradient(to right, color-mix(in oklch, var(--lime) 4%, var(--bg-0)), var(--bg-0))",
        }}
      >
        <Link
          to={`/event/${eventId}`}
          style={{
            color: "var(--ink-3)",
            fontSize: "var(--fs-xs)",
            display: "inline-flex",
            alignItems: "center",
            gap: 'var(--space-1)',
          }}
        >
          ← {t("title")}
        </Link>
        <div style={{ width: 1, height: 16, background: "var(--line-soft)" }} aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: "var(--space-0-5)" }}>
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                background: "var(--lime)",
                borderRadius: "50%",
                animation: "orp 1s infinite",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: "var(--fs-xs)",
                letterSpacing: "0.08em",
                color: "var(--lime)",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              LIVE · {t("label.spectatorView")}
            </span>
          </div>
          <div className="truncate" style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
            {eventName}
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 'var(--space-3)', marginLeft: "auto" }}>
          {elapsedLabel && (
            <div style={{ textAlign: "right", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
              <div style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>{t("label.elapsed")}</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-sm)",
                  color: "var(--ink-0)",
                  fontWeight: 500,
                }}
              >
                {elapsedLabel}
              </div>
            </div>
          )}
          <Button type="button" onClick={handleShare} variant="secondary" size="sm">
            🔗 {t("button.share")}
          </Button>
          <Button
            type="button"
            onClick={() => navigate(`/event/${eventId}/dashboard`)} variant="secondary" size="sm"
            style={{ color: "var(--ink-2)" }}
          >
            {t("label.hostView")}
          </Button>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 24px 40px" }}>
        {/* 팔로우 헤더 */}
        <div className="flex items-end justify-between flex-wrap" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)" }}>
              {t("liveView.followingCount", { count: followedParticipants.length })}
            </Text>
            <h2 style={{ fontSize: "var(--fs-xl)", letterSpacing: "-0.02em", margin: 0, color: "var(--ink-0)" }}>
              {t("label.followedAthletes")}
            </h2>
          </div>
          <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <input
              type="text"
              placeholder={t("liveView.bibPlaceholder")}
              value={searchBib}
              onChange={(e) => setSearchBib(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addFollow();
              }}
              aria-label={t("liveView.bibSearchLabel")}
              style={{
                padding: "7px 12px",
                fontSize: "var(--fs-xs)",
                background: "var(--bg-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-sm)",
                color: "var(--ink-0)",
                width: 140,
              }}
            />
            <Button
              type="button"
              onClick={addFollow}
              disabled={!searchBib.trim()} variant="primary" size="sm" className="disabled:opacity-50"
            >
              + {t("action.addAthlete")}
            </Button>
          </div>
        </div>

        {/* 검색 결과 (미팔로우 선수일 때만 카드 표시) */}
        {searchedParticipant && searchedParticipant.bib != null && !followBibs.includes(searchedParticipant.bib) && (
          <Card padding="none" className="flex items-center justify-between"
            style={{
              padding: "var(--space-3)",
              marginBottom: 'var(--space-4)',
              gap: 'var(--space-3)',
              borderColor: "color-mix(in oklch, var(--aqua) 30%, transparent)",
            }}
          >
            <div className="min-w-0">
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>
                #{String(searchedParticipant.bib).padStart(3, "0")} {searchedParticipant.displayName}
                {searchedParticipant.category && (
                  <span className="font-normal" style={{ color: "var(--ink-3)", marginLeft: "var(--space-1-5)", fontSize: "var(--fs-xs)" }}>
                    ({searchedParticipant.category})
                  </span>
                )}
              </div>
              <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)", marginTop: "var(--space-0-5)", fontFamily: "var(--font-mono)" }}>
                {searchedParticipant.overallRank != null ? `${t("liveView.highlight.overallRank", { rank: searchedParticipant.overallRank })} · ` : ""}
                CP{searchedParticipant.lastCp ?? 0} · {(searchedParticipant.distance / 1000).toFixed(1)}km · {searchedParticipant.speed.toFixed(1)}km/h
              </div>
            </div>
            <Button type="button" onClick={addFollow} variant="primary" size="sm">
              {t("action.followAthlete")}
            </Button>
          </Card>
        )}

        {/* RiderCard 그리드 */}
        {followedParticipants.length === 0 ? (
          <Card padding="none"
            style={{ padding: 'var(--space-7)', textAlign: "center", marginBottom: "var(--space-7)", color: "var(--ink-3)" }}
          >
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)", marginBottom: "var(--space-1-5)" }}>{t("liveView.noFollowing")}</div>
            <div style={{ fontSize: "var(--fs-xs)" }}>{t("liveView.noFollowingHint")}</div>
          </Card>
        ) : (
          <div
            className="event-live-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)", marginBottom: "var(--space-7)" }}
          >
            {followedParticipants.map((loc) => (
              <RiderCard
                key={loc.uid}
                loc={loc}
                totalDistKm={totalDistanceKm}
                color={colorByBib(loc.bib)}
                onUnfollow={() => loc.bib != null && removeFollow(loc.bib)}
              />
            ))}
          </div>
        )}

        {/* 코스 위치 카드 */}
        <Card padding="none" style={{ padding: 0, marginBottom: 'var(--space-4)', overflow: "hidden" }}>
          <div
            className="flex items-center justify-between flex-wrap"
            style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)", gap: 'var(--space-3)' }}
          >
            <div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", marginBottom: "var(--space-0-5)" }}>
                {t("label.courseLocation")}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                {followedParticipants.length > 0 ? t("liveView.followingLiveLocation") : t("liveView.allLiveLocation")}
              </div>
            </div>
            {followedParticipants.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: 'var(--space-3)', fontSize: "var(--fs-xs)" }}>
                {followedParticipants.map((p) => (
                  <span key={p.uid} className="inline-flex items-center" style={{ gap: "var(--space-1)" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: colorByBib(p.bib),
                        display: "inline-block",
                      }}
                    />
                    <span style={{ color: "var(--ink-2)" }}>{p.displayName}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 340 }}>
            <EventMap
              locations={followedParticipants.length > 0 ? followedParticipants : snapshot.locations}
              selectedUid={selectedUid}
              onSelectParticipant={setSelectedUid}
            />
          </div>
        </Card>

        {/* 최근 하이라이트 */}
        <Card padding="none" style={{ padding: 'var(--space-5)' }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.recentHighlights")}</div>
            <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-0-5)" }}>
              {t("liveView.highlightsDesc")}
            </div>
          </div>
          {highlights.length === 0 ? (
            <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("liveView.noHighlights")}</p>
          ) : (
            <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {highlights.map((h, i) => {
                const initial = h.name?.charAt(0) ?? "?";
                return (
                  <li
                    key={h.key}
                    className="flex"
                    style={{
                      gap: 'var(--space-3)',
                      padding: "12px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--line-soft)",
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "var(--bg-3)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "var(--fs-sm)",
                        fontWeight: 600,
                        color: "var(--ink-0)",
                        borderLeft: `3px solid ${h.color}`,
                        flexShrink: 0,
                      }}
                    >
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", marginBottom: "var(--space-0-5)" }}>
                        {h.message}
                      </div>
                      {h.sub && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{h.sub}</div>}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--fs-xs)",
                        color: "var(--ink-3)",
                        fontFamily: "var(--font-mono)",
                        flexShrink: 0,
                      }}
                    >
                      {formatHHMM(h.ts)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .event-live-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
