import { Users } from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMemberRole } from "../../hooks/useGroup";
import { useGroupRideStats } from "../../hooks/useGroupRides";
import { canManageGroup } from "../../features/group/groupPermissions";
import GroupSubNav from "../../components/group/GroupSubNav";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { ICON_SIZE } from "../../theme/tokens/icon";
import { useMobile } from "../../hooks/useMobile";
import GroupWeekPage from "./GroupWeekPage";
import GroupRideList from "../../components/group/GroupRideList";

/**
 * 휴대폰 회원은 공동 기록 주소(/rides)도 활동 화면(이번 주 + 공동 기록)으로 연다 — 기존 링크·앱 경로가 그대로 활동 탭에 닿는다.
 * 방문자(비회원·로그아웃)는 이번 주 집계가 회원 전용이라 #1811 이전처럼 공동 기록 화면을 그대로 본다.
 */
export default function GroupRidesPage() {
  const mobile = useMobile();
  const { groupId } = useParams();
  const { user } = useAuth();
  const { role, loading } = useGroupMemberRole(mobile ? groupId : undefined, mobile ? user?.uid : undefined);
  if (!mobile) return <GroupRidesContent />;
  if (user && loading) return <LoadingSkeleton kind="list" count={5} />;
  return role ? <GroupWeekPage /> : <GroupRidesContent />;
}

function GroupRidesContent() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading, error: groupError, retry: groupRetry } = useGroup(groupId);
  const { role, loading: roleLoading, error: roleError, retry: roleRetry } = useGroupMemberRole(groupId, user?.uid);
  const stats = useGroupRideStats(groupId);
  const { error, retry } = stats;

  if (groupLoading || roleLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-7 w-16 rounded-full" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
      </div>
    );
  }

  if (groupError || roleError) return <ErrorState title={t("error.loadFailed")} onRetry={groupError ? groupRetry : roleRetry} />;

  if (!group) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<Users size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
          title={t("empty.groupNotFound")}
          actions={[{ label: t("empty.goToList"), variant: "primary", href: "/clubs" }]}
        />
      </div>
    );
  }

  const isCreator = canManageGroup(group, user?.uid, role);

  if (error) {
    return (
      <div>
        <GroupSubNav group={group} isCreator={isCreator} />
        <ErrorState
          title={t(error === "unavailable" ? "error.rideStatsUnavailable" : "error.rideStatsLoadFailed")}
          description={t("error.rideStatsRetry")}
          onRetry={retry}
        />
      </div>
    );
  }

  return (
    <div className="club-surface">
      <GroupSubNav group={group} isCreator={isCreator} />

      <GroupRideList stats={stats} />
    </div>
  );
}
