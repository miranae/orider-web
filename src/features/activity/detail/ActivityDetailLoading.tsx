import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import type { PublicActivityDetail } from "../../../services/publicActivityDetail";
import { useLocale } from "../../../contexts/LocaleContext";
import LoadingSkeleton from "../../../components/redesign/states/LoadingSkeleton";
import { Stack, Stat, Text } from "../../../theme/components";
import { formatDistance } from "../../../utils/units";
import { PUBLIC_ACCESS_VERIFIED_TTL_MS } from "../../../hooks/usePublicActivitySession";

/** Only a current, ACL-authorized projection may appear before the full detail module. */
export default function ActivityDetailLoading({ activity: preview, verifiedAt }: { activity?: PublicActivityDetail["activity"]; verifiedAt?: number }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const [expiredVerification, setExpiredVerification] = useState<number>();
  useEffect(() => {
    if (verifiedAt === undefined) return;
    const remaining = verifiedAt + PUBLIC_ACCESS_VERIFIED_TTL_MS - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setExpiredVerification(verifiedAt), remaining);
    return () => clearTimeout(timer);
  }, [verifiedAt]);
  const activity = verifiedAt === undefined || expiredVerification !== verifiedAt && Date.now() - verifiedAt < PUBLIC_ACCESS_VERIFIED_TTL_MS ? preview : undefined;
  const metrics = activity?.effectiveFacts?.metrics;
  const distanceKm = metrics?.distanceKm;
  const durationSec = metrics?.durationSec;
  const seconds = typeof durationSec === "number" ? Math.floor(durationSec) : NaN;
  return <div className="site-shell activity-detail" aria-busy="true">
    <Stack gap="var(--dim-section-gap)">
      {activity ? <header>
        <Text as="h1" variant="pageTitle">{activity.description || t("publicDetail.title")}</Text>
        <Text tone="secondary">{activity.nickname}</Text>
        <Stack direction="row" wrap gap="var(--dim-section-gap)">
          {typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm >= 0
            && <Stat label={t("publicDetail.distance")} value={formatDistance(distanceKm * 1000, units)} />}
          {Number.isFinite(seconds) && seconds >= 0 && <Stat label={t("publicDetail.duration")}
            value={[Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":")} />}
        </Stack>
      </header> : <LoadingSkeleton kind="card" />}
      <LoadingSkeleton kind="chart" />
      <LoadingSkeleton kind="card" />
    </Stack>
  </div>;
}
