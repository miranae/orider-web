import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const dateStr = date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const distanceKm = (ride.totalDistance / 1000).toFixed(1);

  // Average duration across participants
  const avgTimeMs = ride.activities.reduce((sum, a) => sum + a.summary.ridingTimeMillis, 0) / ride.activities.length;
  const hours = Math.floor(avgTimeMs / 3600000);
  const mins = Math.floor((avgTimeMs % 3600000) / 60000);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Average elevation gain across participants
  const avgElevation = Math.round(
    ride.activities.reduce((sum, a) => sum + (a.summary.elevationGain ?? 0), 0) / ride.activities.length,
  );

  return (
    <Link
      to={`/group/${groupId}/ride/${ride.groupRideId}`}
      className="block rounded-[var(--r-lg)] shadow-sm p-4 hover:shadow-md transition-shadow border"
      style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[length:var(--fs-sm)] font-medium" style={{ color: "var(--ink-0)" }}>{dateStr}</div>
          <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-2)" }}>
            {t("ridePage.participants", { count: ride.participantCount })} · {distanceKm}km · {durationStr}
            {avgElevation > 0 && ` · ↑${avgElevation}m`}
          </div>
        </div>
        <div className="flex -space-x-2">
          {ride.activities.slice(0, 4).map((a) => (
            <Avatar key={a.id} name={a.nickname} imageUrl={a.profileImage} size="sm" />
          ))}
          {ride.activities.length > 4 && (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[length:var(--fs-xs)] ring-2" style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>
              +{ride.activities.length - 4}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
