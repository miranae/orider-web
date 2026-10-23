import "../EventControls.css";
import { Download, Flag, Hourglass, Image, Link2, LockKeyhole, Trophy } from "lucide-react";
import GlossaryProvider from "../../components/common/GlossaryProvider";
import GlossaryText from "../../components/common/GlossaryText";
import InfoTip from "../../components/InfoTip";
import "../../features/event/detail/event-linked-pages.css";
import EventDetailNavigation from "../../features/event/EventDetailNavigation";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, collection, getDocs, type DocumentData } from "firebase/firestore";
import { auth, firestore as db } from "../../services/firebase";
import { getEventPublicParticipants, publicParticipantTimestampMs } from "../../services/eventPublicParticipants";
import { logClientError } from "../../services/errorLogger";
import { isEventHost } from "../../features/event/eventHost";
import { getPublicUserProfile } from "../../services/publicProfiles";
import { useAuth } from "../../contexts/AuthContext";
import { useDialog } from "../../contexts/DialogContext";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { normalizeStartTime } from "../../utils/event-time";
import { Button, Card, Chip, Text } from "../../theme/components";
import { useGroup } from "../../hooks/useGroup";
import { useGroupNextEvents } from "../../hooks/useGroupNextEvents";
import AppInstallLinks from "../../components/AppInstallLinks";
import { buildOriderSharePayload, shareOrCopy } from "../../features/share/oriderShareText";
import { createEventShareImage, shareEventImage } from "../../features/event/share/eventShareCard";
import { isVerifiedEventFinisher } from "../../features/event/resultVerification";
import { ICON_SIZE } from "../../theme/tokens/icon";

export interface ResultEntry {
  userId: string;
  displayName: string;
  bibNumber: number | null;
  category: string;
  rank: number;
  overallRank: number;
  finishTime: number | null; // duration ms
  status: string;
  verifiedFinisher?: boolean;
  avgSpeed?: number | null;
  avgPower?: number | null;
  np?: number | null;
  avgHr?: number | null;
  tss?: number | null;
  calories?: number | null;
}

interface EventHead {
  name: string;
  date: string;
  distanceKm: number | null;
  elevationGain: number | null;
  status: string;
  resultContractVersion?: number;
  groupId?: string;
}

const MEDAL_COLORS: Record<number, string> = {
  1: "var(--lime)",
  2: "var(--ink-2)",
  3: "var(--amber)",
};

const CATEGORY_COLORS: Record<string, string> = {
  elite: "var(--lime)",
  엘리트: "var(--lime)",
  citizen: "var(--aqua)",
  시민: "var(--aqua)",
  female: "var(--amber)",
  women: "var(--amber)",
  여성: "var(--amber)",
};

export function displayRankFor(entry: ResultEntry, activeCategory: string): number {
  return activeCategory === "__overall__" ? entry.overallRank : entry.rank;
}

export function shouldShowResultsGroupCta(
  groupId: string | undefined,
  loadedGroupId: string | undefined,
  loading: boolean,
  inactive: boolean,
  hasError: boolean,
): boolean {
  return !!groupId && !loading && loadedGroupId === groupId && !inactive && !hasError;
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function eventStatusLabel(t: (key: string) => string, status: string): string {
  switch (status) {
    case "OPEN": return t("status.open");
    case "LIVE": return t("status.live");
    case "FINISHED": return t("status.finished");
    case "CANCELLED": return t("status.cancelled");
    case "DRAFT": return t("status.draft");
    default: return t("status.unknown");
  }
}

function formatGap(diffMs: number | null): string {
  if (diffMs == null || diffMs <= 0) return "—";
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `+${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function CategoryChip({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? "var(--ink-3)";
  return (
    <span
      style={{
        fontSize: "var(--ft-body-size)",
        color,
        fontWeight: 500,
      }}
    >
      {category}
    </span>
  );
}

export default function EventResultsPage() {
  const { t, i18n } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const dialog = useDialog();

  const [eventHead, setEventHead] = useState<EventHead | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("__overall__");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [privateResultsUnavailable, setPrivateResultsUnavailable] = useState(false);
  const [eventDateStr, setEventDateStr] = useState<string>("");
  const [csvNotice, setCsvNotice] = useState<{ eventId: string | undefined; sequence: number } | null>(null);
  useEffect(() => { setCsvNotice(null); }, [eventId]);
  const groupId = eventHead?.groupId;
  const { group, loading: groupLoading, error: groupError, inactive: groupInactive } = useGroup(groupId);
  const { eventByGroup: nextEvents } = useGroupNextEvents(groupId ? [groupId] : [], eventId, true);

  const shareResults = async () => {
    if (!eventHead) return;
    const payload = buildOriderSharePayload({ title: eventHead.name, body: eventHead.name, url: window.location.href, language: i18n.language });
    const result = await shareOrCopy(payload);
    if (result === "copied") await dialog.alert(t("resultsView.linkCopied"), { variant: "success" });
    else if (result === "failed") {
      logClientError("EventResultsPage.share", new Error("Share unavailable or failed"), { eventId });
      await dialog.alert(t("resultsView.shareFailed"), { variant: "danger" });
    }
  };

  useEffect(() => {
    if (groupError) logClientError("EventResultsPage.loadHostGroup", groupError, { eventId, groupId });
  }, [eventId, groupError, groupId]);

  useEffect(() => {
    if (!eventId || authLoading) return;
    let cancelled = false;
    const owner = auth.currentUser?.uid;
    setResults([]);
    setEventHead(null);
    (async () => {
      setLoading(true);
      setLoadError(null);
      setPrivateResultsUnavailable(false);
      try {
        const eventDoc = await getDoc(doc(db, `events/${eventId}`));
        if (cancelled || auth.currentUser?.uid !== owner) return;
        if (!eventDoc.exists()) {
          setLoadError(t("empty.noResults"));
          return;
        }
        const info = eventDoc.data()?.info || {};
        const startMs = normalizeStartTime(info.startTime) || null;
        if (typeof startMs === "number") {
          const d = new Date(startMs);
          setEventDateStr(d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }));
        }

        // 코스 거리·고도 — info에 없으면 첫 코스에서
        let distanceKm: number | null = typeof info.distance === "number" ? info.distance / 1000 : null;
        let elevationGain: number | null = typeof info.elevationGain === "number" ? info.elevationGain : null;
        const courseIds: string[] = Array.isArray(info.courseIds) ? info.courseIds : [];
        if ((distanceKm == null || elevationGain == null) && courseIds[0]) {
          try {
            const cs = await getDoc(doc(db, "courses", courseIds[0]));
            if (cs.exists()) {
              const cd = cs.data();
              if (distanceKm == null && typeof cd.distance === "number") distanceKm = cd.distance / 1000;
              if (elevationGain == null && typeof cd.elevationGain === "number") elevationGain = cd.elevationGain;
            }
          } catch {
            // ignore
          }
        }

        if (cancelled || auth.currentUser?.uid !== owner) return;
        setEventHead({
          name: info.name || t("title"),
          date: typeof startMs === "number" ? new Date(startMs).toLocaleDateString("ko-KR") : "",
          distanceKm,
          elevationGain,
          status: info.status || "FINISHED",
          resultContractVersion: typeof info.resultContractVersion === "number" ? info.resultContractVersion : undefined,
          groupId: typeof info.groupId === "string" ? info.groupId : undefined,
        });

        // 공개 결과는 허용된 projection만 읽는다. 주최자/admin의 비공개 관리 경로는 유지한다.
        const admin = user ? (await user.getIdTokenResult()).claims.admin === true : false;
        const privateAccess = isEventHost(user?.uid, info) || admin;
        if (cancelled || auth.currentUser?.uid !== owner || (privateAccess && owner !== user?.uid)) return;
        if (!privateAccess && info.type === "GROUP_RIDE") {
          setPrivateResultsUnavailable(true);
          return;
        }
        const participantDocs = privateAccess
          ? (await getDocs(collection(db, `events/${eventId}/participants`))).docs
          : (await getEventPublicParticipants(eventId)).participants.map((participant) => ({
            id: participant.userId, data: () => ({ ...participant }),
          }));
        const userNameMap: Record<string, string> = {};
        if (privateAccess) await Promise.all(participantDocs.map(async (pDoc) => {
          try {
            userNameMap[pDoc.id] = (await getPublicUserProfile(pDoc.id))?.nickname ?? "";
          } catch { userNameMap[pDoc.id] = ""; }
        }));
        if (cancelled || auth.currentUser?.uid !== owner || (privateAccess && owner !== user?.uid)) return;

        const eventStartMs = typeof startMs === "number" ? startMs : null;
        const entries: ResultEntry[] = participantDocs.map((pDoc) => {
          const data: DocumentData = pDoc.data();
          const finishedAt = publicParticipantTimestampMs(data.finishedAt);
          const finishTime =
            typeof finishedAt === "number" && eventStartMs != null ? finishedAt - eventStartMs : null;
          const verifiedFinisher = isVerifiedEventFinisher(info.resultContractVersion, data.status || "REGISTERED", data.resultVerified, finishedAt, eventStartMs);
          return {
            userId: pDoc.id,
            displayName: (privateAccess ? data.realName || userNameMap[pDoc.id] : data.displayName) || "—",
            bibNumber: privateAccess && typeof data.bib === "number" ? data.bib : data.bibNumber ?? null,
            category: data.category || "—",
            rank: 0,
            overallRank: 0,
            finishTime: verifiedFinisher ? finishTime : null,
            status: data.status || "REGISTERED",
            verifiedFinisher,
            avgSpeed: privateAccess && verifiedFinisher && typeof data.avgSpeed === "number" ? data.avgSpeed : null,
            avgPower: privateAccess && verifiedFinisher && typeof data.avgPower === "number" ? data.avgPower : null,
            np: privateAccess && verifiedFinisher && typeof data.np === "number" ? data.np : null,
            avgHr: privateAccess && verifiedFinisher && typeof data.avgHr === "number" ? data.avgHr : null,
            tss: privateAccess && verifiedFinisher && typeof data.tss === "number" ? data.tss : null,
            calories: privateAccess && verifiedFinisher && typeof data.calories === "number" ? data.calories : null,
          };
        });

        entries.sort((a, b) => {
          if (a.verifiedFinisher && !b.verifiedFinisher) return -1;
          if (!a.verifiedFinisher && b.verifiedFinisher) return 1;
          if (a.finishTime == null) return 1;
          if (b.finishTime == null) return -1;
          return a.finishTime - b.finishTime;
        });

        let overallRank = 0;
        const catRanks: Record<string, number> = {};
        for (const entry of entries) {
          if (entry.verifiedFinisher) {
            overallRank++;
            entry.overallRank = overallRank;
            catRanks[entry.category] = (catRanks[entry.category] || 0) + 1;
            entry.rank = catRanks[entry.category] ?? 0;
          }
        }
        if (!cancelled && auth.currentUser?.uid === owner) setResults(entries);
      } catch (err) {
        logClientError("EventResultsPage.loadResults", err, { eventId });
        if (!cancelled && auth.currentUser?.uid === owner) setLoadError(err instanceof Error ? err.message : t("resultsView.loadError"));
      } finally {
        if (!cancelled && auth.currentUser?.uid === owner) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, user, authLoading, t]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) if (r.category && r.category !== "—") set.add(r.category);
    return ["__overall__", ...Array.from(set).sort()];
  }, [results]);

  const filtered = useMemo(() => {
    if (activeCategory === "__overall__") return results;
    return results.filter((r) => r.category === activeCategory);
  }, [results, activeCategory]);

  const podium = useMemo(() => {
    return filtered
      .filter((r) => {
        const rank = displayRankFor(r, activeCategory);
        return r.verifiedFinisher && rank > 0 && rank <= 3;
      })
      .slice(0, 3);
  }, [filtered, activeCategory]);

  const counts = useMemo(() => {
    const total = results.length;
    const finished = results.filter((r) => r.verifiedFinisher).length;
    const pending = results.filter((r) => !r.verifiedFinisher && ["FINISHED", "RIDING", "RACING"].includes(r.status)).length;
    const dnf = results.filter((r) => r.status === "DNF" || r.status === "DSQ").length;
    const rateDenominator = finished + dnf + (eventHead?.resultContractVersion && eventHead.resultContractVersion >= 2 ? pending : 0);
    const finishRate = rateDenominator > 0 ? Math.round((finished / rateDenominator) * 100) : 0;
    return { total, finished, pending, dnf, finishRate };
  }, [results, eventHead?.resultContractVersion]);

  // 카테고리 분포 (완주자 기준)
  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of results) {
      if (r.verifiedFinisher) {
        counts[r.category] = (counts[r.category] || 0) + 1;
        total++;
      }
    }
    return Object.entries(counts)
      .map(([cat, n]) => ({ cat, n, color: CATEGORY_COLORS[cat] ?? "var(--ink-2)", pct: total > 0 ? Math.round((n / total) * 100) : 0 }))
      .sort((a, b) => b.n - a.n);
  }, [results]);

  // 완주 시간 분포 (30분 단위 8 bin from 4h to 8h)
  const finishHistogram = useMemo(() => {
    const times = results
      .filter((r) => r.verifiedFinisher && r.finishTime != null)
      .map((r) => r.finishTime as number);
    if (times.length === 0) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const bins = 9;
    const binSize = Math.max(1, Math.ceil((max - min + 1) / bins));
    const counts = new Array<number>(bins).fill(0);
    for (const t of times) {
      const i = Math.min(bins - 1, Math.floor((t - min) / binSize));
      counts[i]!++;
    }
    const peak = Math.max(...counts);
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] ?? null : null;
    return { counts, peak, min, max, median, binSize };
  }, [results]);

  // 내 결과
  const myResult = useMemo(() => {
    if (!user) return null;
    return results.find((r) => r.userId === user.uid) ?? null;
  }, [user, results]);

  // 내 기록 bin index
  const myBinIndex = useMemo(() => {
    if (!finishHistogram || !myResult?.verifiedFinisher || myResult.finishTime == null) return -1;
    const i = Math.floor((myResult.finishTime - finishHistogram.min) / finishHistogram.binSize);
    return Math.max(0, Math.min(finishHistogram.counts.length - 1, i));
  }, [finishHistogram, myResult]);

  const navigation = eventId ? <div className="site-shell"><EventDetailNavigation eventId={eventId} live={eventHead?.status === "LIVE"} results={eventHead?.status === "LIVE" || eventHead?.status === "FINISHED"} /></div> : null;
  if (loading) {
    return (
      <>{navigation}<div className="max-w-3xl mx-auto py-8">
        <LoadingSkeleton kind="chart" />
      </div></>
    );
  }

  if (privateResultsUnavailable) {
    return <>{navigation}<div className="max-w-xl mx-auto py-16"><EmptyState icon={<LockKeyhole size={ICON_SIZE.xl} style={{ marginInline: "auto" }} />} title={t("resultsView.privateResultsUnavailable")} /></div></>;
  }

  if (loadError) {
    return (
      <>{navigation}<div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("resultsView.loadError")} description={loadError} onRetry={() => window.location.reload()} />
      </div></>
    );
  }

  if (!eventHead) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<Trophy size={ICON_SIZE.xl} style={{ marginInline: "auto" }} />}
          title={t("empty.noResults")}
          actions={[{ label: t("create.eventList"), variant: "primary", onClick: () => navigate("/explore/events") }]}
        />
      </div>
    );
  }

  const winnerTime = filtered.find((r) => r.verifiedFinisher)?.finishTime ?? null;
  const statusLabel = eventStatusLabel(t, eventHead.status);
  const resultsUnavailable = eventHead.status !== "FINISHED";
  const activeGroupId = shouldShowResultsGroupCta(groupId, group?.id, groupLoading, groupInactive, !!groupError) ? groupId : undefined;

  return (
    <GlossaryProvider scopeKey={`event-results:${eventId}`}>
    <div data-testid="D4-3" className="event-controls-surface event-results-surface">
      {navigation}
      {/* 헤더 — aqua gradient */}
      <div
        style={{
          borderBottom: "1px solid var(--line-soft)",
          background: "linear-gradient(to bottom, color-mix(in oklch, var(--aqua) 4%, var(--bg-0)), var(--bg-0))",
        }}
      >
        <div className="site-shell" style={{ padding: "14px 24px 0" }}>
          <div className="event-results-breadcrumb flex items-center" style={{ gap: 'var(--space-2)', fontSize: "var(--ft-body-size)", color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
            <Link to="/explore/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
            <span style={{ color: "var(--ink-4)" }}>›</span>
            <Link to={`/event/${eventId}`} style={{ color: "var(--ink-3)" }} className="truncate">
              {eventHead.name}
            </Link>
            <span style={{ color: "var(--ink-4)" }}>›</span>
            <span style={{ color: "var(--ink-2)" }}>{t("resultsTitle")}</span>
          </div>
        </div>

        <div className="site-shell" style={{ padding: "0 24px 28px" }}>
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Chip
              style={{
                fontSize: "var(--ft-body-size)",
                color: "var(--aqua)",
                borderColor: "color-mix(in oklch, var(--aqua) 40%, transparent)",
              }}
            >
              <Flag size={ICON_SIZE.sm} aria-hidden="true" /> {statusLabel}
            </Chip>
            {eventDateStr && (
              <Chip style={{ fontSize: "var(--ft-body-size)" }}>
                {eventDateStr}
              </Chip>
            )}
          </div>
          <Text as="h1" variant="pageTitle" style={{ marginBottom: 'var(--space-1)' }}>
            {eventHead.name}
          </Text>
          <div style={{ fontSize: "var(--ft-subtitle-size)", color: "var(--ink-3)" }}>{t("resultsTitle")}</div>

          <div className="event-results-metrics"
            style={{
              marginTop: "var(--space-5)",
              display: "grid",
              gap: 1,
              background: "var(--line-soft)",
              border: "1px solid var(--line-soft)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
            }}
          >
            {[
              [t("detail.metric.distance"), eventHead.distanceKm != null ? eventHead.distanceKm.toFixed(1) : "—", "km"],
              [t("detail.metric.elevationGain"), eventHead.elevationGain != null ? Math.round(eventHead.elevationGain).toString() : "—", "m"],
              [eventHead.resultContractVersion && eventHead.resultContractVersion >= 2 ? t("resultsView.verifiedFinishCount") : t("resultsView.metric.finishCount"), counts.finished.toString(), t("resultsView.unit.persons")],
              [t("resultsView.metric.dnfCount"), counts.dnf.toString(), t("resultsView.unit.persons")],
              [eventHead.resultContractVersion && eventHead.resultContractVersion >= 2 ? t("resultsView.verifiedFinishRate") : t("resultsView.metric.finishRate"), `${counts.finishRate}`, "%"],
            ].map(([k, v, u]) => (
              <div key={k} style={{ padding: "14px 16px", background: "var(--bg-1)" }}>
                <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1-5)" }}><GlossaryText>{k}</GlossaryText></Text>
                <div>
                  <Text variant="dataMedium">{v}</Text>
                  {u && <Text variant="unit">{u}</Text>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        className="site-shell event-results-body"
        style={{
          padding: "20px 24px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 'var(--space-5)',
          alignItems: "flex-start",
        }}
      >
        <div className="flex flex-col" style={{ gap: 'var(--space-4)', minWidth: 0 }}>
          {eventHead.resultContractVersion != null && eventHead.resultContractVersion >= 2 && counts.pending > 0 && (
            <Card padding="none" style={{ padding: "var(--space-4)" }}>
              <div style={{ fontSize: "var(--ft-subtitle-size)", color: "var(--ink-2)" }}>{t("resultsView.pendingCount", { count: counts.pending })}</div>
            </Card>
          )}
          {/* 포디움 */}
          {podium.length > 0 && (
            <Card padding="none" style={{ padding: 22 }}>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <div className="event-results-card-title text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.podium")}</div>
                <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-0-5)" }}>
                  {activeCategory === "__overall__"
                    ? t("resultsView.podiumTopThreeOverall")
                    : t("resultsView.podiumTopThreeCategory", { category: activeCategory })}
                  {" · "}{t("resultsView.timeFormat")}
                </div>
              </div>
              <div
                className="podium-grid"
                style={{ display: "grid", gridTemplateColumns: `repeat(${podium.length}, minmax(0, 1fr))`, gap: 'var(--space-3)' }}
              >
                {podium.map((p, i) => {
                  const rank = displayRankFor(p, activeCategory);
                  const medal = MEDAL_COLORS[rank] ?? "var(--ink-2)";
                  return (
                    <div
                      key={p.userId}
                      style={{
                        padding: "18px 16px",
                        background: `color-mix(in oklch, ${medal} ${i === 0 ? 10 : 5}%, var(--bg-2))`,
                        border: `1px solid color-mix(in oklch, ${medal} ${i === 0 ? 50 : 25}%, var(--line-soft))`,
                        borderRadius: "var(--r-md)",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 14,
                          fontSize: "var(--ft-body-size)",
                          fontFamily: "var(--font-mono)",
                          color: "var(--ink-3)",
                        }}
                      >
                        {p.bibNumber != null ? `#${String(p.bibNumber).padStart(3, "0")}` : ""}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--fs-4xl)",
                          fontWeight: 700,
                          color: medal,
                          fontFamily: "var(--font-mono)",
                          lineHeight: 1,
                          marginBottom: "var(--space-2)",
                        }}
                      >
                        {rank}
                      </div>
                      <div className="text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: "var(--space-1)", fontSize: "var(--ft-subtitle-size)" }}>
                        {p.displayName}
                      </div>
                      <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", marginBottom: "var(--space-3)" }}>
                        {p.category}
                      </div>
                      <div
                        className="flex items-baseline"
                        style={{
                          gap: 'var(--space-2)',
                          paddingTop: 'var(--space-3)',
                          borderTop: `1px solid color-mix(in oklch, ${medal} 20%, var(--line-soft))`,
                        }}
                      >
                        <Text variant="dataMedium" style={{ fontSize: "var(--fs-lg)", color: medal }}>
                          {formatDuration(p.finishTime)}
                        </Text>
                        {p.avgSpeed != null && (
                          <span style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                            {p.avgSpeed.toFixed(1)}km/h
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* 전체 결과 */}
          <Card padding="none" style={{ padding: 0 }}>
            <div
              className="flex items-center flex-wrap"
              style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)", gap: "var(--space-4)" }}
            >
              <div className="event-results-card-title text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.allResults")}</div>
              <div className="flex event-category-filters" style={{ gap: "var(--space-0-5)" }}>
                {categories.map((c) => {
                  const active = activeCategory === c;
                  return (
                    <Button
                      key={c}
                      type="button"
                      onClick={() => setActiveCategory(c)}
                      aria-pressed={active}
                      style={{
                        padding: "5px 12px",
                        fontSize: "var(--ft-body-size)",
                        fontWeight: 500,
                        borderRadius: "var(--r-sm)",
                        background: active ? "var(--bg-3)" : "transparent",
                        color: active ? "var(--ink-0)" : "var(--ink-3)",
                        border: "1px solid transparent",
                        cursor: "pointer",
                      }}
                    >
                      {c === "__overall__" ? t("resultsView.overall") : c}
                    </Button>
                  );
                })}
              </div>
              <div className="flex items-center" style={{ gap: "var(--space-1-5)", marginLeft: "auto" }}>
                <InfoTip title={t("termGlossary:terms.csv.label")} content={t("termGlossary:terms.csv.description")} label={t("termGlossary:terms.csv.label")}>CSV</InfoTip>
                <Button
                  type="button" variant="secondary" size="sm" aria-label={t("resultsView.csvExport")}
                  onClick={() => setCsvNotice(previous => ({
                    eventId,
                    sequence: previous && previous.eventId === eventId ? previous.sequence + 1 : 1,
                  }))}
                >
                  <Download size={ICON_SIZE.sm} aria-hidden="true" /> {t("resultsView.exportAction")}
                </Button>
                <Button
                  type="button" variant="secondary" size="sm"
                  onClick={shareResults}
                >
                  <Link2 size={ICON_SIZE.sm} aria-hidden="true" /> {t("button.share")}
                </Button>
              </div>
            </div>
            {csvNotice !== null && csvNotice.eventId === eventId && (
              <Text key={csvNotice.sequence} as="p" variant="caption" role="status" style={{ padding: "var(--space-3) var(--space-5)" }}>
                {t("resultsView.csvComingSoon")}
              </Text>
            )}

            {resultsUnavailable ? (
              <div style={{ padding: 'var(--space-7)', textAlign: "center", color: "var(--ink-3)", fontSize: "var(--ft-body-size)" }}>
                <div className="text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: "var(--space-1)" }}>
                  {t("resultsView.notFinishedTitle")}
                </div>
                {t("resultsView.notFinishedDesc", { status: statusLabel })}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 'var(--space-7)', textAlign: "center", color: "var(--ink-3)", fontSize: "var(--ft-body-size)" }}>
                {t("resultsView.noFilteredResults")}
              </div>
            ) : (
              <div>
                <Text as="p" variant="caption" tone="tertiary" id="event-results-scroll-hint" style={{ padding: "var(--space-3) var(--space-5)", margin: 0 }}>{t("resultsView.tableScrollHint")}</Text>
                <div role="region" aria-label={t("label.allResults")} aria-describedby="event-results-scroll-hint" tabIndex={0} className="event-results-table-scroll" style={{ overflowX: "auto", overscrollBehavior: "contain" }}>
                <table className="event-results-table" style={{ minWidth: 760, width: "100%", borderCollapse: "collapse", fontSize: "var(--ft-body-size)" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      {[
                        t("resultsView.col.rank"),
                        t("resultsView.col.bib"),
                        t("resultsView.col.name"),
                        t("resultsView.col.category"),
                        t("resultsView.col.finishTime"),
                        t("resultsView.col.avgSpeed"),
                        t("resultsView.col.avgPower"),
                        t("resultsView.col.gap"),
                      ].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            textAlign: [0, 1, 4, 5, 6, 7].includes(i) ? "right" : "left",
                            padding: "10px 16px",
                            fontSize: "var(--ft-body-size)",
                            letterSpacing: "normal",
                            color: "var(--ink-3)",
                            fontWeight: 500,
                            textTransform: "uppercase",
                          }}
                        >
                          <GlossaryText>{h}</GlossaryText>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const rank = r.verifiedFinisher ? displayRankFor(r, activeCategory) : 0;
                      const isMine = !!user && r.userId === user.uid;
                      const gap =
                        r.verifiedFinisher && r.finishTime != null && winnerTime != null
                          ? r.finishTime - winnerTime
                          : null;
                      return (
                        <tr
                          key={r.userId}
                          style={{
                            borderTop: "1px solid var(--line-soft)",
                            background: isMine ? "color-mix(in oklch, var(--lime) 6%, transparent)" : "transparent",
                          }}
                        >
                          <td
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              color: rank > 0 && rank <= 3 ? MEDAL_COLORS[rank] : "var(--ink-0)",
                              fontWeight: rank > 0 && rank <= 3 ? 600 : 500,
                            }}
                          >
                            {rank > 0 ? rank : "—"}
                          </td>
                          <td
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              color: "var(--ink-2)",
                            }}
                          >
                            {r.bibNumber != null ? `#${String(r.bibNumber).padStart(3, "0")}` : "—"}
                          </td>
                          <td style={{ padding: "10px 16px", color: "var(--ink-0)" }}>
                            <Button
                              type="button"
                              onClick={() => navigate(`/athlete/${r.userId}`)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "inherit",
                                font: "inherit",
                                cursor: "pointer",
                                padding: 0,
                                textAlign: "left",
                              }}
                            >
                              {r.displayName}
                            </Button>
                            {isMine && (
                              <Chip
                                style={{
                                  marginLeft: 'var(--space-2)',
                                  fontSize: "var(--ft-body-size)",
                                  color: "var(--lime)",
                                  borderColor: "color-mix(in oklch, var(--lime) 40%, transparent)",
                                }}
                              >
                                {t("resultsView.myTime")}
                              </Chip>
                            )}
                          </td>
                          <td style={{ padding: "10px 16px", color: "var(--ink-3)" }}>
                            <CategoryChip category={r.category} />
                          </td>
                          <td
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              color: r.verifiedFinisher ? "var(--ink-0)" : "var(--ink-3)",
                              fontWeight: 500,
                            }}
                          >
                            {r.verifiedFinisher
                              ? formatDuration(r.finishTime)
                              : eventHead.resultContractVersion && eventHead.resultContractVersion >= 2 && ["FINISHED", "RIDING", "RACING"].includes(r.status)
                              ? t("resultsView.verificationPending")
                              : r.status === "DNF"
                              ? <GlossaryText>{t("resultsView.dnfLabel")}</GlossaryText>
                              : r.status === "DSQ"
                              ? t("label.disqualified")
                              : "—"}
                          </td>
                          <td
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              color: "var(--ink-2)",
                            }}
                          >
                            {r.avgSpeed != null ? r.avgSpeed.toFixed(1) : "—"}
                          </td>
                          <td
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              color: "var(--ink-2)",
                            }}
                          >
                            {r.avgPower != null ? `${Math.round(r.avgPower)}w` : "—"}
                          </td>
                          <td
                            style={{
                              padding: "10px 16px",
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              color: "var(--ink-3)",
                            }}
                          >
                            {gap != null ? formatGap(gap) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </Card>

          {/* KOM/QOM 세그먼트 */}
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            <div style={{ marginBottom: "var(--space-3)" }}>
              <div className="event-results-card-title text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)" }}><InfoTip title={t("resultsView.segmentKomQom")} content={t("resultsView.segmentRecordsHelp")} label={t("resultsView.segmentKomQom")}>{t("resultsView.segmentKomQom")}</InfoTip></div>
              <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-0-5)" }}>
                {t("resultsView.segmentKomQomDesc")}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-6)',
                textAlign: "center",
                fontSize: "var(--ft-body-size)",
                color: "var(--ink-3)",
                background: "var(--bg-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-sm)",
              }}
            >
              {t("resultsView.segmentDataPending")}
            </div>
          </Card>
        </div>

        {/* 사이드바 */}
        <aside
          className="event-results-aside flex flex-col"
          style={{ gap: "var(--space-3)", alignSelf: "start", position: "sticky", top: 68 }}
        >
          {!authLoading && !myResult && (
            <Card padding="none" style={{ padding: "var(--space-4)", borderColor: "color-mix(in oklch, var(--aqua) 30%, var(--line-soft))" }}>
              <Text as="div" variant="eyebrow">{t("resultsView.nextAction.eyebrow")}</Text>
              <div className="text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)", marginTop: "var(--space-1)" }}>{t("resultsView.nextAction.title")}</div>
              {activeGroupId && (
                <div className="flex flex-col" style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                  {nextEvents.get(activeGroupId) && (
                    <Link to={`/event/${nextEvents.get(activeGroupId)!.id}`} className="text-[length:var(--ft-body-size)]" style={{ color: "var(--aqua)" }}>
                      {t("resultsView.nextAction.nextEvent", { name: nextEvents.get(activeGroupId)!.name })} →
                    </Link>
                  )}
                  <Link to={`/club/${activeGroupId}`} className="text-[length:var(--ft-body-size)]" style={{ color: "var(--aqua)" }}>
                    {t("resultsView.nextAction.group", { name: group?.name || t("group.fallbackName") })} →
                  </Link>
                </div>
              )}
              <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--line-soft)" }}>
                <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", marginBottom: "var(--space-2)" }}>{t("resultsView.nextAction.app")}</div>
                <AppInstallLinks compact appStoreLabel={t("resultsView.nextAction.ios")} playStoreLabel={t("resultsView.nextAction.android")} />
              </div>
            </Card>
          )}
          {/* 내 결과 */}
          {myResult && (
            <Card padding="none"
              style={{
                padding: "var(--space-4)",
                borderColor: "color-mix(in oklch, var(--lime) 30%, var(--line-soft))",
              }}
            >
              <div className="flex items-center" style={{ gap: "var(--space-1-5)", marginBottom: "var(--space-3)" }}>
                <span aria-hidden="true">{eventHead.resultContractVersion && eventHead.resultContractVersion >= 2 && !myResult.verifiedFinisher ? <Hourglass size={ICON_SIZE.md} /> : <Trophy size={ICON_SIZE.md} />}</span>
                <span className="event-results-card-title"
                  style={{
                    letterSpacing: "normal",
                    color: "var(--lime)",
                    fontWeight: 500,
                    textTransform: "uppercase",
                  }}
                >
                  {t("resultsView.myResultLabel", { name: myResult.displayName })}
                </span>
              </div>
              <div className="flex items-baseline" style={{ gap: "var(--space-1-5)", marginBottom: 'var(--space-1)' }}>
                <Text variant="dataLarge" style={{ color: "var(--lime)", fontSize: "var(--fs-3xl)", fontWeight: 600 }}>
                  {myResult.verifiedFinisher ? formatDuration(myResult.finishTime) : myResult.status === "DNF" ? <GlossaryText>{t("resultsView.dnfLabel")}</GlossaryText> : "—"}
                </Text>
              </div>
              {myResult.verifiedFinisher && <Text as="div" variant="caption" tone="tertiary">{t("resultsView.timeFormat")}</Text>}
              <div style={{ fontSize: "var(--ft-body-size)", color: "var(--ink-3)" }}>
                {myResult.verifiedFinisher
                  ? t("resultsView.myRankDetail", { rank1: myResult.overallRank, cat: myResult.category, rank2: myResult.rank })
                  : eventHead.resultContractVersion && eventHead.resultContractVersion >= 2 && ["FINISHED", "RIDING", "RACING"].includes(myResult.status)
                  ? t("resultsView.verificationPending")
                  : t("resultsView.resultNotTabulated")}
                {myResult.bibNumber != null ? ` · ${t("resultsView.bibLabel", { bib: String(myResult.bibNumber).padStart(3, "0") })}` : ""}
              </div>
              <div
                className="flex flex-col"
                style={{
                  marginTop: "var(--space-3)",
                  paddingTop: 14,
                  borderTop: "1px solid var(--line-soft)",
                  gap: 'var(--space-2)',
                  fontSize: "var(--ft-body-size)",
                }}
              >
                {[
                  [t("resultsView.stat.avgSpeed"), myResult.avgSpeed != null ? `${myResult.avgSpeed.toFixed(1)} km/h` : "—"],
                  [t("resultsView.stat.avgPower"), myResult.avgPower != null ? `${Math.round(myResult.avgPower)} W` : "—"],
                  [t("resultsView.stat.np"), myResult.np != null ? `${Math.round(myResult.np)} W` : "—"],
                  [t("resultsView.stat.avgHr"), myResult.avgHr != null ? `${Math.round(myResult.avgHr)} bpm` : "—"],
                  [t("resultsView.stat.tss"), myResult.tss != null ? `${Math.round(myResult.tss)}` : "—"],
                  [t("resultsView.stat.calories"), myResult.calories != null ? `${Math.round(myResult.calories).toLocaleString("ko-KR")} kcal` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span style={{ color: "var(--ink-3)" }}><GlossaryText>{k}</GlossaryText></span>
                    <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex" style={{ marginTop: "var(--space-3)", gap: "var(--space-1-5)" }}>
                <Button
                  type="button"
                  onClick={() => navigate(`/athlete/${myResult.userId}`)} variant="secondary" size="sm"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {t("resultsView.viewActivity")}
                </Button>
                <Button
                  type="button"
                  onClick={shareResults} variant="secondary" size="sm"
                  style={{ padding: "var(--space-1-5)" }}
                  aria-label={t("button.share")}
                >
                  <Link2 size={ICON_SIZE.sm} aria-hidden="true" />
                </Button>
                {myResult.verifiedFinisher && <Button type="button" variant="secondary" size="sm" aria-label={t("shareCard.completion")} onClick={async () => {
                  try {
                    const file = await createEventShareImage({ eventName: eventHead.name, riderName: myResult.displayName, date: eventHead.date, kind: "finished", result: formatDuration(myResult.finishTime), rank: t("resultsView.myRankDetail", { rank1: myResult.overallRank, cat: myResult.category, rank2: myResult.rank }) });
                    const result = await shareEventImage(file, eventHead.name);
                    if (result === "downloaded") await dialog.alert(t("shareCard.downloaded"), { variant: "success" });
                  } catch (err) {
                    logClientError("EventResultsPage.shareCompletionCard", err, { eventId });
                    await dialog.alert(t("resultsView.shareFailed"), { variant: "danger" });
                  }
                }}><Image size={ICON_SIZE.sm} aria-hidden="true" /></Button>}
              </div>
            </Card>
          )}

          {/* 카테고리별 분포 */}
          {categoryDistribution.length > 0 && (
            <Card padding="none" style={{ padding: "var(--space-4)" }}>
              <div className="event-results-card-title text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-3)' }}>
                {t("resultsView.categoryDistribution")}
              </div>
              <div className="flex flex-col" style={{ gap: 'var(--space-2)', fontSize: "var(--ft-body-size)" }}>
                {categoryDistribution.map(({ cat, n, color, pct }) => (
                  <div key={cat}>
                    <div className="flex justify-between" style={{ marginBottom: 'var(--space-1)' }}>
                      <span style={{ color: "var(--ink-2)" }}>{cat}</span>
                      <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                        {t("resultsView.countPct", { count: n, pct })}
                      </span>
                    </div>
                    <div style={{ height: 3, background: "var(--bg-3)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 완주 시간 분포 */}
          {finishHistogram && (
            <Card padding="none" style={{ padding: "var(--space-4)" }}>
              <div className="event-results-card-title text-[length:var(--ft-subtitle-size)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-3)' }}>
                {t("resultsView.finishTimeDistribution")}
              </div>
              <div className="flex" style={{ alignItems: "flex-end", gap: "var(--space-1)", height: 80 }}>
                {finishHistogram.counts.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${(v / Math.max(1, finishHistogram.peak)) * 100}%`,
                      background: i === myBinIndex ? "var(--lime)" : "var(--ink-4)",
                      opacity: i === myBinIndex ? 1 : 0.6,
                      borderRadius: "var(--r-sm)",
                    }}
                    aria-label={`${v}${t("resultsView.unit.persons")}`}
                  />
                ))}
              </div>
              <div
                className="flex justify-between"
                style={{ marginTop: "var(--space-1-5)", fontSize: "var(--ft-body-size)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
              >
                <span>{formatDuration(finishHistogram.min)}</span>
                <span>{formatDuration(finishHistogram.max)}</span>
              </div>
              <div style={{ marginTop: 'var(--space-2)', fontSize: "var(--ft-body-size)", color: "var(--ink-3)" }}>
                {t("resultsView.median")}{" "}
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {formatDuration(finishHistogram.median ?? null)}
                </span>
                {myResult?.finishTime != null && (
                  <>
                    {" · "}{t("resultsView.myTime")}{" "}
                    <span style={{ color: "var(--lime)", fontFamily: "var(--font-mono)" }}>
                      {formatDuration(myResult.finishTime)}
                    </span>
                  </>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .event-results-body { grid-template-columns: 1fr !important; }
          .event-results-aside { position: static !important; }
        }
        @media (max-width: 700px) {
          .podium-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
    </GlossaryProvider>
  );
}
