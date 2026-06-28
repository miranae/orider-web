/**
 * "조정됨" 마이크로 칩 — 주간 미세 조정이 적용된 PlanDay 셀 위에 노출.
 */
import { useTranslation } from "react-i18next";

interface Props {
  factor: number; // adjustmentFactor (0.85 ~ 1.15)
}

export default function AdjustedChip({ factor }: Props) {
  const { t } = useTranslation("training");
  const pct = Math.round(factor * 100);
  const isDown = factor < 1.0;
  const ink = isDown ? "var(--aqua)" : "var(--amber)";
  const tooltip = isDown
    ? t("adaptation.adjustedTooltipDown", { pct })
    : t("adaptation.adjustedTooltipUp", { pct });

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
      {isDown ? "−" : "+"}{Math.abs(pct - 100)}%
    </span>
  );
}
