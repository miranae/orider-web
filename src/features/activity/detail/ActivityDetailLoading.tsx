import { useTranslation } from "react-i18next";
import type { PublicActivityDetail } from "../../../services/publicActivityDetail";
import { useLocale } from "../../../contexts/LocaleContext";
import LoadingSkeleton from "../../../components/redesign/states/LoadingSkeleton";
import { Stack, Stat, Text } from "../../../theme/components";
import { formatDistance } from "../../../utils/units";
import { resolveDuration } from "../../../utils/activityTime";

/** Only a current, ACL-authorized projection may appear before the full detail module. */
export default function ActivityDetailLoading({ activity }: { activity?: PublicActivityDetail["activity"] }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const distance = activity?.summary.distance;
  const summary = activity?.summary;
  const duration = summary ? resolveDuration({
    ridingTimeMillis: typeof summary.ridingTimeMillis === "number" ? summary.ridingTimeMillis : NaN,
    elapsedTimeMillis: typeof summary.elapsedTimeMillis === "number" ? summary.elapsedTimeMillis : null,
    movingTimeSec: typeof summary.movingTimeSec === "number" ? summary.movingTimeSec : null,
    pauseTimeSec: typeof summary.pauseTimeSec === "number" ? summary.pauseTimeSec : null,
    startTime: activity?.startTime, endTime: activity?.endTime,
  }).displayMs : NaN;
  const seconds = Math.floor(duration / 1000);
  return <div className="site-shell activity-detail" aria-busy="true">
    <Stack gap="var(--dim-section-gap)">
      {activity ? <header>
        <Text as="h1" variant="pageTitle">{activity.description || t("publicDetail.title")}</Text>
        <Text tone="secondary">{activity.nickname}</Text>
        <Stack direction="row" wrap gap="var(--dim-section-gap)">
          {typeof distance === "number" && Number.isFinite(distance) && distance >= 0
            && <Stat label={t("publicDetail.distance")} value={formatDistance(distance, units)} />}
          {Number.isFinite(duration) && duration >= 0 && <Stat label={t("publicDetail.duration")}
            value={[Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":")} />}
        </Stack>
      </header> : <LoadingSkeleton kind="card" />}
      <LoadingSkeleton kind="chart" />
      <LoadingSkeleton kind="card" />
    </Stack>
  </div>;
}
