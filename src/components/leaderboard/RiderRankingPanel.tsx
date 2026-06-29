/**
 * RiderRankingPanel — 라이더 W/kg 순위, 3스코프(친구·그룹·전체) (#492).
 *
 * '글로벌 1등' 대신 **도달 가능한 순위**('친구 사이 #K', '내 그룹 #K', '동급 코호트 상위 X%')를
 * 강조. 모두 결정적(학습 불필요)이고 배포 안전(신규 CF 0):
 *   - 친구(상호팔로우): 타인의 FTP/체중 직접 읽기는 공개 클라이언트에서 제외.
 *   - 그룹: groups/{gid}/rankings/ftp_per_kg **단일 스냅샷 doc** 구독(fan-out read 회피).
 *   - 전체: 기존 CohortRankingCard 재사용(stats/percentiles_bike → 코호트 상위 X%).
 *
 * 보류(후속): KOM/Local Legend 메트릭 토글은 본질적으로 세그먼트 단위라 세그먼트 상세에 존재.
 *  전체 전수 랭킹 리스트는 글로벌 스냅샷 CF 필요(배포 의존) → 코호트 백분위로 대체.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useMyGroups } from "../../hooks/useGroup";
import { usePdc } from "../../hooks/usePdc";
import { useCohortPercentiles } from "../../hooks/useCohortPercentiles";
import { useDocument } from "../../hooks/useFirestore";
import { Button, Card, Text } from "../../theme/components";
import { EmptyState, LoadingSkeleton } from "../redesign";
import GroupLeaderboardTable from "../group/GroupLeaderboardTable";
import CohortRankingCard from "../CohortRankingCard";
import type { GroupLeaderboardEntry, GroupLeaderboard } from "@shared/types";

type Scope = "friends" | "group" | "all";

export default function RiderRankingPanel() {
  const { t } = useTranslation("segment");
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>(user ? "friends" : "all");

  return (
    <div className="space-y-4">
      {/* 스코프 토글 */}
      <div className="flex items-center flex-wrap" style={{ gap: "var(--space-1)" }}>
        {(["friends", "group", "all"] as Scope[]).map((s) => {
          const active = scope === s;
          return (
            <Button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={active}
              variant="secondary"
              size="sm"
              style={{ background: active ? "var(--bg-3)" : "transparent", fontWeight: active ? 600 : 400 }}
            >
              {t(`leaderboardPage.scope.${s}`)}
            </Button>
          );
        })}
      </div>

      {scope === "friends" && <FriendsScope uid={user?.uid} />}
      {scope === "group" && <GroupScope uid={user?.uid} />}
      {scope === "all" && <AllScope />}
    </div>
  );
}

/** 친구 W/kg 순위는 서버 집계 스냅샷 도입 전까지 클라이언트에서 계산하지 않는다. */
function FriendsScope({ uid }: { uid: string | undefined }) {
  const { t } = useTranslation("segment");
  if (!uid) return <EmptyState icon="👥" title={t("leaderboardPage.rider.loginTitle")} description={t("leaderboardPage.rider.loginDesc")} />;
  return <EmptyState icon="⚡" title={t("leaderboardPage.rider.noData")} description={t("leaderboardPage.rider.noDataDesc")} />;
}

/** 그룹 W/kg 순위 — groups/{gid}/rankings/ftp_per_kg 스냅샷. */
function GroupScope({ uid }: { uid: string | undefined }) {
  const { t } = useTranslation("segment");
  const { groups, loading } = useMyGroups(uid);
  const [groupId, setGroupId] = useState<string | null>(null);
  const activeGroupId = groupId ?? groups[0]?.id ?? null;
  const { data: snapshot } = useDocument<GroupLeaderboard>(
    activeGroupId ? `groups/${activeGroupId}/rankings` : "groups/_/rankings",
    activeGroupId ? "ftp_per_kg" : undefined,
  );

  if (!uid) return <EmptyState icon="🏢" title={t("leaderboardPage.rider.loginTitle")} description={t("leaderboardPage.rider.loginDesc")} />;
  if (loading) return <LoadingSkeleton kind="list" count={5} />;
  if (groups.length === 0) return <EmptyState icon="🏢" title={t("leaderboardPage.rider.noGroup")} description={t("leaderboardPage.rider.noGroupDesc")} actions={[{ label: t("leaderboardPage.rider.findGroup"), variant: "primary", href: "/groups" }]} />;

  const entries = snapshot?.entries ?? [];
  return (
    <div className="space-y-3">
      {groups.length > 1 && (
        <div className="flex items-center flex-wrap" style={{ gap: "var(--space-1)" }}>
          {groups.map((g) => {
            const active = activeGroupId === g.id;
            return (
              <Button key={g.id} type="button" onClick={() => setGroupId(g.id)} aria-pressed={active} variant="secondary" size="sm"
                style={{ background: active ? "var(--bg-3)" : "transparent", fontWeight: active ? 600 : 400 }}>
                {g.name}
              </Button>
            );
          })}
        </div>
      )}
      {entries.length === 0 ? (
        <EmptyState icon="📊" title={t("leaderboardPage.rider.noRanking")} description={t("leaderboardPage.rider.noRankingDesc")} />
      ) : (
        <>
          <MyRankBadge entries={entries} uid={uid} />
          <GroupLeaderboardTable entries={entries} metric="ftp_per_kg" highlightUserId={uid} />
        </>
      )}
    </div>
  );
}

/** 전체(코호트) — 기존 CohortRankingCard 재사용. */
function AllScope() {
  const { t } = useTranslation("segment");
  const { user, profile } = useAuth();
  const { pdc } = usePdc(user?.uid);
  const cohortStats = useCohortPercentiles(!!user);

  if (!user) return <EmptyState icon="🌐" title={t("leaderboardPage.rider.loginTitle")} description={t("leaderboardPage.rider.loginDesc")} />;
  if (pdc != null && cohortStats.status === "ready") {
    return (
      <CohortRankingCard
        pdc={pdc}
        stats={cohortStats.stats}
        demographics={{
          gender: (profile as { gender?: string | null } | null)?.gender ?? null,
          birthYear: (profile as { birthYear?: number | null } | null)?.birthYear ?? null,
        }}
      />
    );
  }
  return <EmptyState icon="📈" title={t("leaderboardPage.rider.noCohort")} description={t("leaderboardPage.rider.noCohortDesc")} />;
}

/** 내 순위 한 줄 배지. */
function MyRankBadge({ entries, uid }: { entries: GroupLeaderboardEntry[]; uid: string }) {
  const { t } = useTranslation("segment");
  const mine = entries.find((e) => e.userId === uid);
  if (!mine) return null;
  return (
    <Card padding="none" className="p-3!">
      <div className="flex items-center justify-between">
        <Text as="span" variant="eyebrow">{t("leaderboardPage.rider.myRank")}</Text>
        <Text as="span" variant="dataMedium" style={{ color: "var(--lime)" }}>
          {t("leaderboardPage.rider.rankOf", { rank: mine.rank, total: entries.length })}
        </Text>
      </div>
    </Card>
  );
}
