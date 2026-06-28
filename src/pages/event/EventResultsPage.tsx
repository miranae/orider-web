import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { firestore as db } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { normalizeStartTime } from "../../utils/event-time";
import { Button, Card, Chip, Text } from "../../theme/components";

interface ResultEntry {
  userId: string;
  displayName: string;
  bibNumber: number | null;
  category: string;
  rank: number;
  overallRank: number;
  finishTime: number | null; // duration ms
  status: string;
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

function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
        fontSize: "var(--fs-xs)",
        color,
        fontWeight: 500,
      }}
    >
      {category}
    </span>
  );
}

export default function EventResultsPage() {
  const { t } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [eventHead, setEventHead] = useState<EventHead | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("__overall__");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventDateStr, setEventDateStr] = useState<string>("");

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const eventDoc = await getDoc(doc(db, `events/${eventId}`));
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

        setEventHead({
          name: info.name || t("title"),
          date: typeof startMs === "number" ? new Date(startMs).toLocaleDateString("ko-KR") : "",
          distanceKm,
          elevationGain,
          status: info.status || "FINISHED",
        });

        // 참가자 + 닉네임 비정규화
        const participantsSnap = await getDocs(collection(db, `events/${eventId}/participants`));
        const userNameMap: Record<string, string> = {};
        await Promise.all(
          participantsSnap.docs.map(async (pDoc) => {
            try {
              const userDoc = await getDoc(doc(db, `users/${pDoc.id}`));
              const data = userDoc.data();
              userNameMap[pDoc.id] = data?.nickname || data?.displayName || "";
            } catch {
              userNameMap[pDoc.id] = "";
            }
          })
        );

        const eventStartMs = typeof startMs === "number" ? startMs : null;
        const entries: ResultEntry[] = participantsSnap.docs.map((pDoc) => {
          const data = pDoc.data();
          const finishedAt =
            typeof data.finishedAt === "number"
              ? data.finishedAt
              : data.finishedAt?.toMillis?.() ??
                (data.finishedAt?._seconds ? data.finishedAt._seconds * 1000 : null);
          const finishTime =
            typeof finishedAt === "number" && eventStartMs != null ? finishedAt - eventStartMs : null;
          return {
            userId: pDoc.id,
            displayName: data.realName || userNameMap[pDoc.id] || "—",
            bibNumber: typeof data.bib === "number" ? data.bib : data.bibNumber ?? null,
            category: data.category || "—",
            rank: 0,
            overallRank: 0,
            finishTime,
            status: data.status || "REGISTERED",
            avgSpeed: typeof data.avgSpeed === "number" ? data.avgSpeed : null,
            avgPower: typeof data.avgPower === "number" ? data.avgPower : null,
            np: typeof data.np === "number" ? data.np : null,
            avgHr: typeof data.avgHr === "number" ? data.avgHr : null,
            tss: typeof data.tss === "number" ? data.tss : null,
            calories: typeof data.calories === "number" ? data.calories : null,
          };
        });

        entries.sort((a, b) => {
          if (a.status === "FINISHED" && b.status !== "FINISHED") return -1;
          if (a.status !== "FINISHED" && b.status === "FINISHED") return 1;
          if (a.finishTime == null) return 1;
          if (b.finishTime == null) return -1;
          return a.finishTime - b.finishTime;
        });

        let overallRank = 0;
        const catRanks: Record<string, number> = {};
        for (const entry of entries) {
          if (entry.status === "FINISHED") {
            overallRank++;
            entry.overallRank = overallRank;
            catRanks[entry.category] = (catRanks[entry.category] || 0) + 1;
            entry.rank = catRanks[entry.category] ?? 0;
          }
        }
        setResults(entries);
      } catch (err) {
        logClientError("EventResultsPage.loadResults", err, { eventId });
        setLoadError(err instanceof Error ? err.message : t("resultsView.loadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

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
    return filtered.filter((r) => r.status === "FINISHED" && r.rank > 0 && r.rank <= 3).slice(0, 3);
  }, [filtered]);

  const counts = useMemo(() => {
    const total = results.length;
    const finished = results.filter((r) => r.status === "FINISHED").length;
    const dnf = results.filter((r) => r.status === "DNF" || r.status === "DSQ").length;
    const finishRate = finished + dnf > 0 ? Math.round((finished / (finished + dnf)) * 100) : 0;
    return { total, finished, dnf, finishRate };
  }, [results]);

  // 카테고리 분포 (완주자 기준)
  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of results) {
      if (r.status === "FINISHED") {
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
      .filter((r) => r.status === "FINISHED" && r.finishTime != null)
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
    if (!finishHistogram || !myResult || myResult.finishTime == null) return -1;
    const i = Math.floor((myResult.finishTime - finishHistogram.min) / finishHistogram.binSize);
    return Math.max(0, Math.min(finishHistogram.counts.length - 1, i));
  }, [finishHistogram, myResult]);

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
        <ErrorState title={t("resultsView.loadError")} description={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!eventHead) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🏆"
          title={t("empty.noResults")}
          actions={[{ label: t("create.eventList"), variant: "primary", onClick: () => navigate("/events") }]}
        />
      </div>
    );
  }

  const winnerTime = filtered.find((r) => r.status === "FINISHED")?.finishTime ?? null;

  return (
    <div>
      {/* 헤더 — aqua gradient */}
      <div
        style={{
          borderBottom: "1px solid var(--line-soft)",
          background: "linear-gradient(to bottom, color-mix(in oklch, var(--aqua) 4%, var(--bg-0)), var(--bg-0))",
        }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 24px 0" }}>
          <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 'var(--space-4)' }}>
            <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
            <span style={{ color: "var(--ink-4)" }}>›</span>
            <Link to={`/event/${eventId}`} style={{ color: "var(--ink-3)" }} className="truncate">
              {eventHead.name}
            </Link>
            <span style={{ color: "var(--ink-4)" }}>›</span>
            <span style={{ color: "var(--ink-2)" }}>{t("resultsTitle")}</span>
          </div>
        </div>

        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 28px" }}>
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Chip
              style={{
                fontSize: "var(--fs-xs)",
                color: "var(--aqua)",
                borderColor: "color-mix(in oklch, var(--aqua) 40%, transparent)",
              }}
            >
              🏁 {eventHead.status === "FINISHED" ? t("finished") : eventHead.status}
            </Chip>
            {eventDateStr && (
              <Chip style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>
                {eventDateStr}
              </Chip>
            )}
          </div>
          <h1 style={{ fontSize: "var(--fs-4xl)", letterSpacing: "-0.025em", marginBottom: 'var(--space-1)', color: "var(--ink-0)" }}>
            {eventHead.name}
          </h1>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("resultsTitle")}</div>

          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 1,
              background: "var(--line-soft)",
              border: "1px solid var(--line-soft)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
            }}
          >
            {[
              [t("label.totalDistance"), eventHead.distanceKm != null ? eventHead.distanceKm.toFixed(1) : "—", "km"],
              [t("label.totalElevation"), eventHead.elevationGain != null ? Math.round(eventHead.elevationGain).toString() : "—", "m"],
              [t("label.finishCount"), counts.finished.toString(), t("resultsView.unit.persons")],
              [t("label.dnfCount"), counts.dnf.toString(), t("resultsView.unit.persons")],
              [t("label.finishRate"), `${counts.finishRate}`, "%"],
            ].map(([k, v, u]) => (
              <div key={k} style={{ padding: "14px 16px", background: "var(--bg-1)" }}>
                <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{k}</Text>
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
        className="event-results-body"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "20px 24px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 'var(--space-5)',
          alignItems: "flex-start",
        }}
      >
        <div className="flex flex-col" style={{ gap: 'var(--space-4)', minWidth: 0 }}>
          {/* 포디움 */}
          {podium.length > 0 && (
            <Card padding="none" style={{ padding: 22 }}>
              <div style={{ marginBottom: 14 }}>
                <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.podium")}</div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: 2 }}>
                  {activeCategory === "__overall__"
                    ? t("resultsView.podiumTopThreeOverall")
                    : t("resultsView.podiumTopThreeCategory", { category: activeCategory })}
                </div>
              </div>
              <div
                className="podium-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 'var(--space-3)' }}
              >
                {podium.map((p, i) => {
                  const medal = MEDAL_COLORS[p.rank] ?? "var(--ink-2)";
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
                          fontSize: "var(--fs-xs)",
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
                          marginBottom: 10,
                        }}
                      >
                        {p.rank}
                      </div>
                      <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 3, fontSize: "var(--fs-sm)" }}>
                        {p.displayName}
                      </div>
                      <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginBottom: 14 }}>
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
                          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
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
              style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)", gap: 18 }}
            >
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.allResults")}</div>
              <div className="flex" style={{ gap: 2 }}>
                {categories.map((c) => {
                  const active = activeCategory === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveCategory(c)}
                      aria-pressed={active}
                      style={{
                        padding: "5px 12px",
                        fontSize: "var(--fs-xs)",
                        fontWeight: 500,
                        borderRadius: "var(--r-sm)",
                        background: active ? "var(--bg-3)" : "transparent",
                        color: active ? "var(--ink-0)" : "var(--ink-3)",
                        border: "1px solid transparent",
                        cursor: "pointer",
                      }}
                    >
                      {c === "__overall__" ? t("resultsView.overall") : c}
                    </button>
                  );
                })}
              </div>
              <div className="flex" style={{ gap: 6, marginLeft: "auto" }}>
                <Button
                  type="button" variant="secondary" size="sm"
                  onClick={() => alert(t("resultsView.csvComingSoon"))}
                >
                  ⬇ CSV
                </Button>
                <Button
                  type="button" variant="secondary" size="sm"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.share) {
                      navigator.share({ title: eventHead.name, url: window.location.href }).catch(() => undefined);
                    } else {
                      navigator.clipboard?.writeText(window.location.href);
                      alert(t("resultsView.linkCopied"));
                    }
                  }}
                >
                  🔗 {t("button.share")}
                </Button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 'var(--space-7)', textAlign: "center", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>
                {t("resultsView.noFilteredResults")}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      {[
                        t("rank"),
                        t("bibNumber"),
                        t("resultsView.col.name"),
                        t("categories"),
                        t("bestTime"),
                        t("resultsView.col.avgSpeed"),
                        t("resultsView.col.avgPower"),
                        t("resultsView.col.gap"),
                      ].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            textAlign: [0, 1, 4, 5, 6, 7].includes(i) ? "right" : "left",
                            padding: "10px 16px",
                            fontSize: "var(--fs-xs)",
                            letterSpacing: "0.06em",
                            color: "var(--ink-3)",
                            fontWeight: 500,
                            textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const rank = r.status === "FINISHED" ? (activeCategory === "__overall__" ? r.overallRank : r.rank) : 0;
                      const isMine = !!user && r.userId === user.uid;
                      const gap =
                        r.status === "FINISHED" && r.finishTime != null && winnerTime != null
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
                            <button
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
                            </button>
                            {isMine && (
                              <Chip
                                style={{
                                  marginLeft: 'var(--space-2)',
                                  fontSize: "var(--fs-xs)",
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
                              color: r.status === "FINISHED" ? "var(--ink-0)" : "var(--ink-3)",
                              fontWeight: 500,
                            }}
                          >
                            {r.status === "FINISHED"
                              ? formatDuration(r.finishTime)
                              : r.status === "DNF"
                              ? "DNF"
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
            )}
          </Card>

          {/* KOM/QOM 세그먼트 */}
          <Card padding="none" style={{ padding: 'var(--space-5)' }}>
            <div style={{ marginBottom: 14 }}>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("resultsView.segmentKomQom")}</div>
              <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: 2 }}>
                {t("resultsView.segmentKomQomDesc")}
              </div>
            </div>
            <div
              style={{
                padding: 'var(--space-6)',
                textAlign: "center",
                fontSize: "var(--fs-xs)",
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
          style={{ gap: 14, alignSelf: "start", position: "sticky", top: 68 }}
        >
          {/* 내 결과 */}
          {myResult && (
            <Card padding="none"
              style={{
                padding: 18,
                borderColor: "color-mix(in oklch, var(--lime) 30%, var(--line-soft))",
              }}
            >
              <div className="flex items-center" style={{ gap: 6, marginBottom: 14 }}>
                <span aria-hidden="true">🏆</span>
                <span
                  style={{
                    fontSize: "var(--fs-xs)",
                    letterSpacing: "0.08em",
                    color: "var(--lime)",
                    fontWeight: 500,
                    textTransform: "uppercase",
                  }}
                >
                  {t("resultsView.myResultLabel", { name: myResult.displayName })}
                </span>
              </div>
              <div className="flex items-baseline" style={{ gap: 6, marginBottom: 'var(--space-1)' }}>
                <Text variant="dataLarge" style={{ color: "var(--lime)", fontSize: "var(--fs-3xl)", fontWeight: 600 }}>
                  {myResult.status === "FINISHED" ? formatDuration(myResult.finishTime) : myResult.status === "DNF" ? "DNF" : "—"}
                </Text>
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                {myResult.status === "FINISHED"
                  ? t("resultsView.myRankDetail", { rank1: myResult.overallRank, cat: myResult.category, rank2: myResult.rank })
                  : t("resultsView.resultNotTabulated")}
                {myResult.bibNumber != null ? ` · ${t("resultsView.bibLabel", { bib: String(myResult.bibNumber).padStart(3, "0") })}` : ""}
              </div>
              <div
                className="flex flex-col"
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--line-soft)",
                  gap: 'var(--space-2)',
                  fontSize: "var(--fs-xs)",
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
                    <span style={{ color: "var(--ink-3)" }}>{k}</span>
                    <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex" style={{ marginTop: 14, gap: 6 }}>
                <Button
                  type="button"
                  onClick={() => navigate(`/athlete/${myResult.userId}`)} variant="secondary" size="sm"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {t("resultsView.viewActivity")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.share) {
                      navigator.share({ title: eventHead.name, url: window.location.href }).catch(() => undefined);
                    } else {
                      navigator.clipboard?.writeText(window.location.href);
                    }
                  }} variant="secondary" size="sm"
                  style={{ padding: 6 }}
                  aria-label={t("button.share")}
                >
                  🔗
                </Button>
              </div>
            </Card>
          )}

          {/* 카테고리별 분포 */}
          {categoryDistribution.length > 0 && (
            <Card padding="none" style={{ padding: 18 }}>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-3)' }}>
                {t("resultsView.categoryDistribution")}
              </div>
              <div className="flex flex-col" style={{ gap: 'var(--space-2)', fontSize: "var(--fs-xs)" }}>
                {categoryDistribution.map(({ cat, n, color, pct }) => (
                  <div key={cat}>
                    <div className="flex justify-between" style={{ marginBottom: 'var(--space-1)' }}>
                      <span style={{ color: "var(--ink-2)" }}>{cat}</span>
                      <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                        {t("resultsView.countPct", { count: n, pct })}
                      </span>
                    </div>
                    <div style={{ height: 3, background: "var(--bg-3)", borderRadius: 1, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 완주 시간 분포 */}
          {finishHistogram && (
            <Card padding="none" style={{ padding: 18 }}>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 'var(--space-3)' }}>
                {t("resultsView.finishTimeDistribution")}
              </div>
              <div className="flex" style={{ alignItems: "flex-end", gap: 3, height: 80 }}>
                {finishHistogram.counts.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${(v / Math.max(1, finishHistogram.peak)) * 100}%`,
                      background: i === myBinIndex ? "var(--lime)" : "var(--ink-4)",
                      opacity: i === myBinIndex ? 1 : 0.6,
                      borderRadius: 1,
                    }}
                    aria-label={`${v}${t("resultsView.unit.persons")}`}
                  />
                ))}
              </div>
              <div
                className="flex justify-between"
                style={{ marginTop: 6, fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
              >
                <span>{formatDuration(finishHistogram.min)}</span>
                <span>{formatDuration(finishHistogram.max)}</span>
              </div>
              <div style={{ marginTop: 'var(--space-2)', fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
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
  );
}
