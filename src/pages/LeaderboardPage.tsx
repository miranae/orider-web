import { loadSegmentMetadataPage } from "../services/segmentMetadata";
import { SEARCH_PAGE_SIZE, usePagedSearch } from "../hooks/usePagedSearch";
import { useMemo, useState, useRef } from "react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { EmptyState, LoadingSkeleton } from "../components/redesign";
import { Button, Card, Chip, Text } from "../theme/components";
import { formatElapsedMillis } from "../features/leaderboard/leaderboardFormat";
import { localizeRegionName } from "../utils/regionName";


interface SegmentInfo {
  id: string;
  name: string;
  distance: number;
  elevationGain?: number;
  discipline?: string;
  region?: string;
  totalEfforts?: number;
  climbCategory?: number;
}

interface UserPrInfo {
  bestTime?: number;
  elapsedTime?: number;
  rank?: number;
  prRank?: number;
}

export default function LeaderboardPage({ search = "", discipline = "bike", category = "all" }: { search?: string; discipline?: string; category?: "all" | "climb" | "flat" }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("segment");
  const [myBest, setMyBest] = useState<Map<string, number>>(new Map());
  const [myRanks, setMyRanks] = useState<Map<string, number>>(new Map());
  const searchQuery = search;
  const disciplineFilter = discipline;

  const currentOwner = useRef(user?.uid);
  currentOwner.current = user?.uid;
  const segmentPages = usePagedSearch(JSON.stringify([user?.uid, discipline, category, search]), async (cursor: string | null) => {
    const uid = user?.uid;
    if (!cursor) { setMyBest(new Map()); setMyRanks(new Map()); }
    const page = await loadSegmentMetadataPage({ mode: "popular", ...(cursor ? { cursor } : {}) });
    const items: SegmentInfo[] = page.items.map(data => ({ ...data, name: String(data.name ?? t("leaderboardPage.unnamed")), distance: Number(data.distance ?? 0), discipline: String(data.discipline ?? data.sport ?? "bike") }));
    if (uid && items.length) {
      try {
        const prSnap = await getDocs(query(collection(firestore, "user_prs", uid, "segments"), where("__name__", "in", items.map(item => item.id)), limit(SEARCH_PAGE_SIZE)));
        const best = new Map<string, number>();
        const ranks = new Map<string, number>();
        prSnap.forEach(doc => {
          const data = doc.data() as UserPrInfo;
          const time = data.bestTime ?? data.elapsedTime;
          if (typeof time === "number" && time > 0) best.set(doc.id, time);
          const rank = data.rank ?? data.prRank;
          if (typeof rank === "number" && rank > 0) ranks.set(doc.id, rank);
        });
        if (currentOwner.current === uid) {
          setMyBest(previous => new Map([...previous, ...best]));
          setMyRanks(previous => new Map([...previous, ...ranks]));
        }
      } catch (err) { logClientError("LeaderboardPage.loadMyBest", err); }
    }
    return { items, cursor: page.cursor, hasMore: page.hasMore };
  });
  const { items: segments, loading } = segmentPages;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return segments.filter((s) => {
      if (category === "climb" && !s.climbCategory) return false;
      if (category === "flat" && s.climbCategory) return false;
      if (disciplineFilter !== "ALL" && s.discipline !== disciplineFilter) return false;
      if (q) {
        const text = `${s.name} ${s.region ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [segments, disciplineFilter, searchQuery, category]);

  return (
    /* 순위 목록은 한 행의 시선 이동 거리를 제한해 기존 정보 밀도를 보존한다. */
    <div className="mx-auto max-w-[1120px] space-y-4">
      {segmentPages.hasMore && !loading && <Button variant="secondary" disabled={segmentPages.loadingMore} onClick={segmentPages.loadMore}>{t("common:button.more")}</Button>}
      {!!segmentPages.error && <Button variant="secondary" onClick={segmentPages.retry}>{t("common:button.retry")}</Button>}
      {loading && <LoadingSkeleton kind="list" count={8} />}
      {!loading && (<>
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
              const myRank = myRanks.get(s.id);
              return (
                <li key={s.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <Link data-testid="E2-3-2"
                    to={`/segment/${s.id}`}
                    className="flex items-center justify-between"
                    style={{ padding: "var(--space-3) var(--space-4)", gap: 'var(--space-3)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap" style={{ gap: "var(--space-1-5)" }}>
                        <span className="text-[length:var(--fs-sm)] font-semibold truncate" style={{ color: "var(--ink-0)" }}>{s.name}</span>
                        {s.region && <Chip style={{ fontSize: "var(--fs-2xs)" }}>{localizeRegionName(s.region, i18n.language)}</Chip>}
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
                          <Text data-testid="E2-3-3" as="div" variant="eyebrow" style={{ marginBottom: "var(--space-0-5)" }}>{t("leaderboardPage.myBest")}</Text>
                          {myRank != null && (
                            <div className="text-[length:var(--fs-xs)] font-bold rounded-[var(--r-sm)] inline-block" style={{ color: "var(--lime)", border: "1px solid color-mix(in oklch, var(--lime) 35%, transparent)", padding: "var(--space-0-5) var(--space-1)", marginBottom: "var(--space-1)" }}>
                              {t("leaderboardPage.myRankShort", { rank: myRank })}
                            </div>
                          )}
                          <Text as="div" variant="dataMedium" style={{ color: "var(--lime)" }}>{formatElapsedMillis(best)}</Text>
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
