import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../../utils/localeDate";
import { LocalizedLink as Link } from "../LocalizedLink";
import Avatar from "../Avatar";
import type { GroupRideSummary } from "../../hooks/useGroupRides";

interface RideCardProps {
  ride: GroupRideSummary;
}

export default function RideCard({ ride }: RideCardProps) {
  const { t } = useTranslation("group");
  const { groupId } = useParams();
  const date = new Date(ride.startTime);
  const dateStr = date.toLocaleDateString(localeTag(), { year: "numeric", month: localeTag().startsWith("ko") ? "numeric" : "short", day: "numeric" });
  const distanceKm = (ride.totalDistance / 1000).toFixed(1);
  const summarizedActivities = ride.activities.filter((activity) => activity.summary != null);

  const memberPreview = [...new Map(ride.activities.map(activity => [activity.userId || activity.id, activity])).values()].slice(0, 4);

  // Average duration across activity records
  const avgTimeMs = ride.averageRidingTimeMillis ?? (summarizedActivities.length > 0
    ? summarizedActivities.reduce((sum, a) => sum + a.summary.ridingTimeMillis, 0) / summarizedActivities.length
    : 0);
  const hours = Math.floor(avgTimeMs / 3600000);
  const mins = Math.floor((avgTimeMs % 3600000) / 60000);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Average elevation gain across activity records
  const avgElevation = Math.round(ride.averageElevationGain ?? (summarizedActivities.length > 0
    ? summarizedActivities.reduce((sum, a) => sum + (a.summary.elevationGain ?? 0), 0) / summarizedActivities.length
    : 0));

  return (
    <Link data-testid="C2-1-1"
      to={`/club/${groupId}/rides/${ride.groupRideId}`}
      className="block rounded-[var(--r-lg)] shadow-sm p-4 hover:shadow-md transition-shadow border"
      style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[length:var(--ft-subtitle-size)] font-medium" style={{ color: "var(--ink-0)" }}>{dateStr}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--ft-body-medium-size)] mt-1" style={{ color: "var(--ink-2)" }}>
            <span>{t("rides.card.activityCount", { count: ride.participantCount })}</span>
            <span>{t("rides.card.totalDistance")} <span className="font-mono whitespace-nowrap">{distanceKm} km</span></span>
            <span>{t("rides.card.averageTime")} <span className="font-mono whitespace-nowrap">{durationStr}</span></span>
            {avgElevation > 0 && <span>{t("rides.card.averageElevation")} <span className="font-mono whitespace-nowrap">{avgElevation} m</span></span>}
          </div>
        </div>
        {memberPreview.length > 0 && <div className="flex flex-col items-end" style={{ gap: "var(--space-1)" }}>
          <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("rides.card.membersPreview")}</span>
          <div className="flex -space-x-2" role="group" aria-label={t("rides.card.membersPreview")}>
            {memberPreview.map(activity => (
              <Avatar key={activity.userId || activity.id} name={activity.nickname} imageUrl={activity.profileImage} size="sm" />
            ))}
          </div>
        </div>}
      </div>
    </Link>
  );
}
