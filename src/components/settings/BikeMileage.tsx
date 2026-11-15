import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useMaintenanceSnapshot } from "../../hooks/useMaintenanceSnapshot";
import { canonicalDisplayShowsValue } from "@shared/types/canonicalDisplay";
import { formatDistance } from "../../utils/units";
import { Text } from "../../theme/components";
import { Resolvable } from "../redesign/states/Resolvable";

export function BikeMileage({ profileId }: { profileId: string }) {
  const { user } = useAuth();
  const { units } = useLocale();
  const { t } = useTranslation("settings");
  const { envelope, display, reload } = useMaintenanceSnapshot(user?.uid, profileId);
  const distance = envelope?.data?.odometerKm;
  const showValue = display !== null && canonicalDisplayShowsValue(display) && typeof distance === "number" && Number.isFinite(distance) && distance >= 0;
  return <Text as="p" variant="caption" tone="secondary" data-testid="P4-1-1">
    {showValue ? t("bikeMileage.total", { distance: formatDistance(distance * 1000, units) })
      // 읽기 실패 문구는 누르면 다시 읽는다.
      : display === "error" ? <Resolvable resolve={{ onClick: reload }}>{t("bikeMileage.error")}</Resolvable>
      : t(display === "loading" ? "bikeMileage.loading" : "bikeMileage.unavailable")}
    {showValue && display === "value_with_stale_hint" && <> · {t("bikeMileage.stale")}</>}
  </Text>;
}
