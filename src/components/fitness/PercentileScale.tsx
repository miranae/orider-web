import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";

type PercentileScaleProps = {
  percentile: number;
  ariaLabel: string;
  population?: string;
};

function normalizePercentile(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * A percentile is a position in a reference distribution, not completion progress.
 * Keep the track neutral and move a fixed marker so low and high edge values stay visible.
 */
export default function PercentileScale({ percentile, ariaLabel, population }: PercentileScaleProps) {
  const { t } = useTranslation("dashboard");
  const populationId = useId();
  const score = normalizePercentile(percentile);
  const top = Math.max(1, 100 - score);
  const valueText = t("mobileFitness.percentile.ariaValue", { score, top });

  return (
    <div style={{ minWidth: 0 }}>
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-describedby={population ? populationId : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={valueText}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-1) var(--space-3)" }}>
          <Text as="span" variant="label">{t("mobileFitness.percentile.raw", { score })}</Text>
          <Text as="span" variant="caption" style={{ color: "var(--aqua)", fontWeight: 600 }}>
            {t("mobileFitness.percentile.top", { top })}
          </Text>
        </div>
        <div aria-hidden style={{ position: "relative", height: "var(--space-4)", marginTop: "var(--space-1)" }}>
          <div style={{ position: "absolute", insetInline: 0, top: "50%", height: "var(--space-1)", transform: "translateY(-50%)", borderRadius: "var(--r-pill)", background: "var(--bg-3)" }} />
          {[25, 50, 75].map((tick) => (
            <span key={tick} style={{ position: "absolute", left: `${tick}%`, top: "50%", width: "var(--space-0-5)", height: "var(--space-2)", transform: "translate(-50%, -50%)", borderRadius: "var(--r-pill)", background: "var(--ink-4)" }} />
          ))}
          <span
            data-percentile-marker
            style={{
              position: "absolute",
              left: `clamp(var(--space-1), ${score}%, calc(100% - var(--space-1)))`,
              top: "50%",
              width: "var(--space-2)",
              height: "var(--space-4)",
              transform: "translate(-50%, -50%)",
              borderRadius: "var(--r-pill)",
              background: "var(--aqua)",
              border: "var(--space-0-5) solid var(--bg-1)",
            }}
          />
        </div>
        <div aria-hidden style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "var(--space-2)" }}>
          <Text as="span" variant="caption" tone="tertiary">{t("mobileFitness.percentile.low")}</Text>
          <Text as="span" variant="caption" tone="tertiary">50</Text>
          <Text as="span" variant="caption" tone="tertiary" style={{ textAlign: "right" }}>{t("mobileFitness.percentile.high")}</Text>
        </div>
      </div>
      {population && (
        <Text id={populationId} as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)", overflowWrap: "anywhere" }}>
          {population}
        </Text>
      )}
    </div>
  );
}
