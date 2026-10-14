import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useMaintenanceSnapshot } from "../../hooks/useMaintenanceSnapshot";
import { canonicalDisplayShowsValue } from "@shared/types/canonicalDisplay";
import { formatDistance } from "../../utils/units";
import { Text } from "../../theme/components";

export function BikeMileage({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  const { units } = useLocale();
  const { t } = useTranslation("settings");
  const { envelope, display } = useMaintenanceSnapshot(user?.uid, profileId);
  const distance = envelope?.data?.odometerKm;
  const showValue = display !== null && canonicalDisplayShowsValue(display) && typeof distance === "number" && Number.isFinite(distance) && distance >= 0;
  return <Text as="p" variant="caption" tone="secondary" data-testid="P4-1-1">
    {showValue ? t("bikeMileage.total", { distance: formatDistance(distance * 1000, units) })
      : t(display === "loading" ? "bikeMileage.loading" : display === "error" ? "bikeMileage.error" : "bikeMileage.unavailable")}
    {showValue && display === "value_with_stale_hint" && <> · {t("bikeMileage.stale")}</>}
  </Text>;
}
