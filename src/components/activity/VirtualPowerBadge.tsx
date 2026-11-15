import { useTranslation } from "react-i18next";
import { Chip } from "../../theme/components";
import { Resolvable, type Resolve } from "../redesign";

interface Props {
  params?: {
    riderWeightKg: number;
    bikeWeightKg: number;
    rollingResistance: number;
    cdA: number;
  };
  /** 주인에게만 — 칩을 누르면 기기 설정의 가상 파워 칸으로. */
  resolve?: Resolve;
}

export function VirtualPowerBadge({ params, resolve }: Props) {
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
      <Resolvable resolve={resolve}>{t("vp.badge")}</Resolvable>
    </Chip>
  );
}
