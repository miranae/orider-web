import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SportIcon from "../common/SportIcon";
import RideCard from "./RideCard";
import { EmptyState, LoadingSkeleton } from "../redesign";
import { Button } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";
import type { useGroupRideStats } from "../../hooks/useGroupRides";

type GroupRideStats = Pick<ReturnType<typeof useGroupRideStats>, "rides" | "loading" | "loadingMore" | "loadMoreError" | "hasMore" | "loadMore">;

/** 공동 기록 목록(참가 인원 필터 + 카드 + 더 보기). 공동 기록 화면과 휴대폰 활동 화면이 함께 쓴다. */
export default function GroupRideList({ stats, showScope = true }: { stats: GroupRideStats; showScope?: boolean }) {
  const { t } = useTranslation("group");
  const { rides, loading, loadingMore, loadMoreError, hasMore, loadMore } = stats;
  const [minActivities, setMinActivities] = useState(0);
  const filteredRides = useMemo(() => {
    if (minActivities === 0) return rides;
    return rides.filter((r) => r.participantCount >= minActivities);
  }, [rides, minActivities]);
  return <>
      {showScope && <p className="club-record-scope" data-testid="club-ride-list-scope">{t("rides.listScope")}</p>}
      <div data-testid="C2-0" className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[length:var(--ft-body-medium-size)]" style={{ color: "var(--ink-2)" }}>{t("rides.activityCountFilter")}:</span>
        {[0, 2, 5].map((n) => (
          <Button size="sm" variant={minActivities === n ? "primary" : "secondary"} data-testid="C2-0-1"
            key={n}
            onClick={() => setMinActivities(n)}
            aria-pressed={minActivities === n}
          >
            {n === 0 ? t("filter.all") : t("rides.minimumActivityCount", { count: n })}
          </Button>
        ))}
      </div>

      {loading && rides.length === 0 ? (
        <LoadingSkeleton kind="list" count={5} />
      ) : filteredRides.length === 0 && !hasMore ? (
        <EmptyState icon={<SportIcon sport="bike" size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />} title={t("empty.noRides")} compact
          // 참가 인원 필터 때문에 비었으면 문구를 누르면 필터를 푼다.
          resolve={minActivities > 0 ? { onClick: () => setMinActivities(0) } : undefined} />
      ) : (
        <div data-testid="C2-1" className="space-y-3">
          {filteredRides.map((r) => (
            <RideCard key={r.groupRideId} ride={r} />
          ))}
          {loadMoreError && <p role="alert">{t(loadMoreError === "unavailable" ? "error.rideStatsUnavailable" : "error.rideStatsLoadFailed")}</p>}
          {hasMore && (
            <Button size="sm" variant="secondary" data-testid="C2-1-2"
              type="button"
              onClick={() => { void loadMore(); }}
              disabled={loadingMore}
            >
              {loadingMore ? t("rides.loadingMore") : loadMoreError ? t("invite.retry") : t("rides.loadMore")}
            </Button>
          )}
        </div>
      )}
  </>;
}
