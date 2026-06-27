import { useEffect, useMemo, useState } from "react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { collection, collectionGroup, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { EmptyState, LoadingSkeleton, PageHeader } from "../components/redesign";
import { Button, Card, Chip, Text, buttonClass } from "../theme/components";
import RiderRankingPanel from "../components/leaderboard/RiderRankingPanel";

type LeaderboardTab = "segments" | "riders";

interface SegmentInfo {
  id: string;
  name: string;
  distance: number;
  elevationGain?: number;
  discipline?: string;
  region?: string;
  totalEfforts?: number;
}

interface EffortInfo {
  segmentId: string;
  elapsedTime: number;
  createdAt?: number;
}

function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation("segment");
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [myBest, setMyBest] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [disciplineFilter, setDisciplineFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<LeaderboardTab>("segments");

  useEffect(() => {
    (async () => {
      try {
        // 인기 세그먼트 (totalEfforts 기준 정렬)
        const segSnap = await getDocs(
          query(
            collection(firestore, "segments"),
            orderBy("totalEfforts", "desc"),
            limit(100),
          )
        );
        const segs: SegmentInfo[] = segSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? t("leaderboardPage.unnamed"),
            distance: data.distance ?? 0,
            elevationGain: data.elevationGain,
            discipline: data.discipline ?? data.sport ?? "bike",
            region: data.region,
            totalEfforts: data.totalEfforts,
          };
        });
        setSegments(segs);

        // 내 최고 기록 (본인 effort에서 가장 짧은 elapsedTime per segmentId)
        if (user) {
          try {
            const effortSnap = await getDocs(
              query(
                collectionGroup(firestore, "efforts"),
                where("userId", "==", user.uid),
                orderBy("elapsedTime", "asc"),
                limit(500),
              )
            );
            const best = new Map<string, number>();
            effortSnap.forEach((eDoc) => {
              const data = eDoc.data() as EffortInfo;
              const segId = eDoc.ref.parent.parent?.id;
              if (!segId) return;
              if (!best.has(segId)) best.set(segId, data.elapsedTime);
            });
            setMyBest(best);
          } catch (err) {
            console.warn("내 기록 조회 실패:", err);
          }
        }
      } catch (err) {
        console.error("세그먼트 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, t]);

  const disciplines = useMemo(() => {
    const set = new Set<string>();
    for (const s of segments) if (s.discipline) set.add(s.discipline);
    return Array.from(set).sort();
  }, [segments]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return segments.filter((s) => {
      if (disciplineFilter !== "ALL" && s.discipline !== disciplineFilter) return false;
      if (q) {
        const text = `${s.name} ${s.region ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [segments, disciplineFilter, searchQuery]);

  const disciplineLabel = (d: string) => {
    if (d === "bike") return t("leaderboardPage.filter.bike");
    if (d === "run") return t("leaderboardPage.filter.run");
    if (d === "swim") return t("leaderboardPage.filter.swim");
    return d;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t("leaderboardPage.eyebrow")}
        title={t("leaderboardPage.title")}
        subtitle={t("leaderboardPage.subtitle")}
        right={
          <Link to="/segment/create" className={`${buttonClass({ variant: 'primary', size: 'sm' })}`}>
            {t("leaderboardPage.create")}
          </Link>
        }
      />

      {/* 탭: 세그먼트 브라우저 / 라이더 W/kg 순위(#492) */}
      <div className="flex items-center" style={{ gap: 'var(--space-1)' }}>
        {(["segments", "riders"] as LeaderboardTab[]).map((tb) => {
          const active = tab === tb;
          return (
            <Button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              aria-pressed={active}
              variant="secondary"
              size="sm"
              style={{ background: active ? "var(--bg-3)" : "transparent", fontWeight: active ? 600 : 400 }}
            >
              {t(`leaderboardPage.tab.${tb}`)}
            </Button>
          );
        })}
      </div>

      {tab === "riders" && <RiderRankingPanel />}

      {tab === "segments" && loading && <LoadingSkeleton kind="list" count={8} />}

      {tab === "segments" && !loading && (
        <>
      {/* Filter bar */}
      <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("leaderboardPage.searchPlaceholder")}
          aria-label={t("leaderboardPage.searchAria")}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
        />
        <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-1)' }}>
          <Button
            type="button"
            onClick={() => setDisciplineFilter("ALL")}
            aria-pressed={disciplineFilter === "ALL"} variant="secondary" size="sm"
            style={{
              background: disciplineFilter === "ALL" ? "var(--bg-3)" : "transparent",
              fontWeight: disciplineFilter === "ALL" ? 600 : 400,
            }}
          >
            {t("leaderboardPage.filter.all")}
          </Button>
          {disciplines.map((d) => {
            const active = disciplineFilter === d;
            return (
              <Button
                key={d}
                type="button"
                onClick={() => setDisciplineFilter(d)}
                aria-pressed={active} variant="secondary" size="sm"
                style={{
                  background: active ? "var(--bg-3)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {disciplineLabel(d)}
              </Button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🏁"
          title={searchQuery ? t("leaderboardPage.empty.searchTitle") : t("leaderboardPage.empty.title")}
          description={searchQuery ? undefined : t("leaderboardPage.empty.desc")}
          actions={searchQuery ? undefined : [{ label: t("leaderboardPage.empty.cta"), variant: "primary", href: "/segment/create" }]}
        />
      ) : (
        <Card padding="none" style={{ padding: 0 }}>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {filtered.map((s) => {
              const best = myBest.get(s.id);
              return (
                <li key={s.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <Link
                    to={`/segment/${s.id}`}
                    className="flex items-center justify-between"
                    style={{ padding: "var(--space-3) var(--space-4)", gap: 'var(--space-3)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
                        <span className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{s.name}</span>
                        {s.region && <Chip style={{ fontSize: 10 }}>{s.region}</Chip>}
                      </div>
                      <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
                        {(s.distance / 1000).toFixed(1)}km
                        {s.elevationGain ? ` · ↑${Math.round(s.elevationGain)}m` : ""}
                        {s.totalEfforts != null ? ` · ${t("leaderboardPage.attempts", { count: s.totalEfforts })}` : ""}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {best != null ? (
                        <>
                          <Text as="div" variant="eyebrow" style={{ marginBottom: 2 }}>{t("leaderboardPage.myBest")}</Text>
                          <Text as="div" variant="dataMedium" style={{ color: "var(--lime)" }}>{formatDuration(best)}</Text>
                        </>
                      ) : (
                        <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("leaderboardPage.notTried")}</div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
        </>
      )}
    </div>
  );
}
