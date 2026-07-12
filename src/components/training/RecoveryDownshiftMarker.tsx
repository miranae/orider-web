/**
 * "회복 다운시프트 제안" 마이크로 칩 — 계획된 하드데이가 TSB 회복 신호와 충돌할 때
 * PlanDay 셀 위에 노출 (#365). evaluateRecoveryDownshift(shared/training/recoveryDownshift.ts)
 * 판정 결과를 시각화만 한다 — 판정 로직은 여기 없음.
 */
import { useTranslation } from "react-i18next";
import type { DownshiftSwap } from "@shared/training/recoveryDownshift";

interface Props {
  suggestedSwap: Exclude<DownshiftSwap, null>;
  tsb: number;
}

export default function RecoveryDownshiftMarker({ suggestedSwap, tsb }: Props) {
  const { t } = useTranslation("training");
  const isRest = suggestedSwap === "rest";
  const ink = isRest ? "var(--rose)" : "var(--amber)";
  const label = isRest ? t("downshift.restLabel") : t("downshift.easyLabel");
  const tooltip = t(isRest ? "downshift.restTooltip" : "downshift.easyTooltip", { tsb: Math.round(tsb) });

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "1px 6px",
        fontSize: "var(--fs-2xs)",
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        color: ink,
        background: `color-mix(in srgb, ${ink} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ink} 35%, transparent)`,
        borderRadius: "var(--r-xs)",
        letterSpacing: "0.04em",
        cursor: "help",
      }}
    >
      ⚠ {label}
    </span>
  );
}
