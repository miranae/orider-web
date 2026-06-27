import { useTranslation } from "react-i18next";
import { Chip } from "../../theme/components";

interface Props {
  params?: {
    riderWeightKg: number;
    bikeWeightKg: number;
    rollingResistance: number;
    cdA: number;
  };
}

export function VirtualPowerBadge({ params }: Props) {
  const { t } = useTranslation("activity");
  const tooltip = params
    ? t("vp.tooltipWithParams", {
        riderKg: params.riderWeightKg,
        bikeKg: params.bikeWeightKg,
        cdA: params.cdA,
        crr: params.rollingResistance,
      })
    : t("vp.tooltip");
  return (
    <Chip
      title={tooltip} variant="warning" className="text-[length:var(--fs-xs)]"
      style={{ whiteSpace: "nowrap" }}
    >
      {t("vp.badge")}
    </Chip>
  );
}
