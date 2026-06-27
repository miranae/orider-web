import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup } from "../../hooks/useGroup";
import { logClientError } from "../../services/errorLogger";
import GroupSubNav from "../../components/group/GroupSubNav";
import GroupLeaderboardTable from "../../components/group/GroupLeaderboardTable";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import { Button, Text } from "../../theme/components";
import type { GroupLeaderboard, GroupLeaderboardMetric } from "@shared/types";

const METRICS: GroupLeaderboardMetric[] = ["ftp_per_kg", "weekly_wtss"];

export default function GroupLeaderboardPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading } = useGroup(groupId);

  const [metric, setMetric] = useState<GroupLeaderboardMetric>("ftp_per_kg");
  const [boards, setBoards] = useState<Record<string, GroupLeaderboard | null>>({});
  const [refreshing, setRefreshing] = useState(false);

  const isCreator = !!user && !!group && user.uid === group.creatorId;

  // 진입 시 1회: 신선도 판단은 서버(rebuildGroupLeaderboard)에 위임.
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setRefreshing(true);
    const fn = httpsCallable(functions, "rebuildGroupLeaderboard");
    fn({ groupId })
      // 폴백(기존 스냅샷 표시)은 유지하되, 권한 오설정·CF 내부오류·rate-limit 같은 비자명
      // 실패가 전 멤버에 발생해도 가시성이 0이 되지 않도록 표준 로거로 컨텍스트를 남긴다.
      .catch((err) => { logClientError("group-leaderboard:rebuild", err, { groupId }); })
      .finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [groupId]);

  // 메트릭별 단일 doc 구독 (멤버 fan-out 없음)
  useEffect(() => {
    if (!groupId) return;
    const unsubs = METRICS.map((m) =>
      onSnapshot(
        doc(firestore, "groups", groupId, "rankings", m),
        (snap) => {
          setBoards((prev) => ({
            ...prev,
            [m]: snap.exists() ? (snap.data() as GroupLeaderboard) : null,
          }));
        },
        (err) => {
          logClientError("group-leaderboard:snapshot", err, { groupId, metric: m });
          setBoards((prev) => ({ ...prev, [m]: null }));
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [groupId]);

  const current = boards[metric] ?? null;
  const entries = current?.entries ?? [];

  const computedLabel = useMemo(() => {
    if (!current?.computedAt) return null;
    return new Date(current.computedAt).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [current]);

  if (groupLoading || !group) {
    return (
      <div className="py-6">
        <LoadingSkeleton kind="list" count={5} />
      </div>
    );
  }

  return (
    <div>
      <GroupSubNav group={group} isCreator={isCreator} />

      <div className="flex items-center justify-between flex-wrap" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <div>
          <h2 className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>
            {t("leaderboard.title")}
          </h2>
          <p className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
            {t("leaderboard.desc")}
          </p>
        </div>
        {refreshing && (
          <Text as="span" className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
            {t("leaderboard.refreshing")}
          </Text>
        )}
      </div>

      {/* 메트릭 토글 */}
      <div className="flex items-center" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <Button
          variant={metric === "ftp_per_kg" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMetric("ftp_per_kg")}
        >
          {t("leaderboard.metric.ftpPerKg")}
        </Button>
        <Button
          variant={metric === "weekly_wtss" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMetric("weekly_wtss")}
        >
          {t("leaderboard.metric.weeklyWtss")}
        </Button>
        <div style={{ flex: 1 }} />
        {computedLabel && (
          <Text as="span" variant="num" className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
            {t("leaderboard.computedAt", { time: computedLabel })}
          </Text>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon="🏆" title={t("leaderboard.empty")} compact />
      ) : (
        <GroupLeaderboardTable entries={entries} metric={metric} highlightUserId={user?.uid} />
      )}
    </div>
  );
}
