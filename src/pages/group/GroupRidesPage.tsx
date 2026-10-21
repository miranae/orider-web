import { Button } from "../../theme/components";
import { Users } from "lucide-react";
import SportIcon from "../../components/common/SportIcon";
import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMemberRole } from "../../hooks/useGroup";
import { useGroupRideStats } from "../../hooks/useGroupRides";
import { canManageGroup } from "../../features/group/groupPermissions";
import GroupSubNav from "../../components/group/GroupSubNav";
import RideCard from "../../components/group/RideCard";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { ICON_SIZE } from "../../theme/tokens/icon";

export default function GroupRidesPage() {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { group, loading: groupLoading, error: groupError, retry: groupRetry } = useGroup(groupId);
  const { role, loading: roleLoading, error: roleError, retry: roleRetry } = useGroupMemberRole(groupId, user?.uid);
  const { rides, loading, loadingMore, error, loadMoreError, retry, hasMore, loadMore } = useGroupRideStats(groupId);

  const [minActivities, setMinActivities] = useState(0);

  const filteredRides = useMemo(() => {
    if (minActivities === 0) return rides;
    return rides.filter((r) => r.participantCount >= minActivities);
  }, [rides, minActivities]);

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

      <p className="club-record-scope" data-testid="club-ride-list-scope">{t("rides.listScope")}</p>
      <div data-testid="C2-0" className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[length:var(--ft-body-medium-size)]" style={{ color: "var(--ink-2)" }}>{t("rides.activityCountFilter")}:</span>
        {[0, 2, 5].map((n) => (
          <Button variant="secondary" data-testid="C2-0-1"
            key={n}
            onClick={() => setMinActivities(n)}
            aria-pressed={minActivities === n}
            className="px-3 py-1 text-[length:var(--fs-xs)] rounded-full transition-colors"
            style={
              minActivities === n
                ? { background: "var(--lime)", color: "var(--bg-0)" }
                : { background: "var(--bg-2)", color: "var(--ink-2)" }
            }
          >
            {n === 0 ? t("filter.all") : t("rides.minimumActivityCount", { count: n })}
          </Button>
        ))}
      </div>

      {loading && rides.length === 0 ? (
        <LoadingSkeleton kind="list" count={5} />
      ) : filteredRides.length === 0 && !hasMore ? (
        <EmptyState icon={<SportIcon sport="bike" size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />} title={t("empty.noRides")} compact />
      ) : (
        <div data-testid="C2-1" className="space-y-3">
          {filteredRides.map((r) => (
            <RideCard key={r.groupRideId} ride={r} />
          ))}
          {loadMoreError && <p role="alert">{t(loadMoreError === "unavailable" ? "error.rideStatsUnavailable" : "error.rideStatsLoadFailed")}</p>}
          {hasMore && (
            <Button variant="secondary" data-testid="C2-1-2"
              type="button"
              onClick={() => { void loadMore(); }}
              disabled={loadingMore}
              className="w-full rounded-[var(--r-sm)] py-3 text-[length:var(--ft-body-medium-size)] disabled:opacity-50"
              style={{ background: "var(--bg-2)", color: "var(--ink-1)" }}
            >
              {loadingMore ? t("rides.loadingMore") : loadMoreError ? t("invite.retry") : t("rides.loadMore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
