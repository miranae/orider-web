import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";
import type { CohortDensityDistribution } from "../../hooks/useCohortPercentiles";

type PercentileScaleProps = {
  percentile: number;
  ariaLabel: string;
  population?: string;
  accentColor?: string;
  distribution?: CohortDensityDistribution | null;
  distributionValue?: number | null;
  fallbackComputedAt?: number | null;
  showRulerGuide?: boolean;
  floorClipped?: boolean;
  showContext?: boolean;
  hideScale?: boolean;
  contextId?: string;
  externalDescriptionId?: string;
  alwaysShowRulerGuide?: boolean;
};

function normalizePercentile(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * A percentile is a rank position, not completion progress or a measured density curve.
 * Five equal-width bands make that rank easier to scan without inventing cohort density.
 */
export default function PercentileScale({ percentile, ariaLabel, population, accentColor = "var(--aqua)", distribution, distributionValue, fallbackComputedAt, showRulerGuide = true, floorClipped = false, showContext = true, hideScale = false, contextId, externalDescriptionId, alwaysShowRulerGuide = false }: PercentileScaleProps) {
  const { t, i18n } = useTranslation("dashboard");
  const populationId = useId();
  const score = normalizePercentile(percentile);
  const valueText = t(floorClipped ? "mobileFitness.percentile.ariaValueFloor" : "mobileFitness.percentile.ariaValue", { score });
  const hasDensity = distribution != null
    && distributionValue != null
    && Number.isFinite(distributionValue)
    && distributionValue >= distribution.domain[0]
    && distributionValue <= distribution.domain[1];
  const markerPosition = hasDensity
    ? ((distributionValue - distribution.domain[0]) / (distribution.domain[1] - distribution.domain[0])) * 100
    : score;
  const computedAt = hasDensity ? distribution.computedAt ?? fallbackComputedAt : null;
  const computedLabel = computedAt && Number.isFinite(computedAt)
    ? new Date(computedAt).toLocaleDateString(i18n.resolvedLanguage === "en" ? "en-US" : "ko-KR")
    : null;
  const densityBasis = hasDensity
    ? t(`mobileFitness.percentile.basis.${distribution.basis === "coggan_score_v1" ? "cogganScore" : distribution.basis === "vo2max_ml_kg_min" ? "vo2maxEstimate" : "generic"}`)
    : null;

  return (
    <div style={{ minWidth: 0 }}>
      {!hideScale && <div
        role="meter"
        aria-label={ariaLabel}
        aria-describedby={externalDescriptionId ?? (showContext && (population || hasDensity || showRulerGuide) ? (contextId ?? populationId) : undefined)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={valueText}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <Text as="span" variant="label">{t(floorClipped ? "mobileFitness.percentile.rawFloor" : "mobileFitness.percentile.raw", { score })}</Text>
        </div>
        <div aria-hidden data-percentile-visual={hasDensity ? "density" : "ruler"} style={{ position: "relative", height: "var(--space-8)", marginTop: "var(--space-1)" }}>
          {hasDensity
            ? distribution.bins.map((bin, index) => (
                <span
                  key={`${bin.from}-${bin.to}`}
                  data-density-bin={index + 1}
                  data-density-level={bin.densityLevel}
                  style={{
                    position: "absolute",
                    left: `${((bin.from - distribution.domain[0]) / (distribution.domain[1] - distribution.domain[0])) * 100}%`,
                    width: `${((bin.to - bin.from) / (distribution.domain[1] - distribution.domain[0])) * 100}%`,
                    bottom: 0,
                    height: `${bin.densityLevel * 20}%`,
                    borderRadius: "var(--r-sm) var(--r-sm) 0 0",
                    background: accentColor,
                    opacity: 0.78,
                    boxShadow: "inset calc(var(--space-0-5) * -1) 0 0 var(--bg-1)",
                  }}
                />
              ))
            : <>
                <span style={{ position: "absolute", insetInline: 0, bottom: "50%", height: "var(--space-1)", borderRadius: "var(--r-pill)", background: "var(--bg-3)" }} />
                {[25, 50, 75].map((tick) => <span key={tick} style={{ position: "absolute", left: `${tick}%`, bottom: "calc(50% - var(--space-1))", width: "var(--space-0-5)", height: "var(--space-3)", background: "var(--ink-4)" }} />)}
              </>}
          <span
            data-percentile-marker
            style={{
              position: "absolute",
              left: `clamp(var(--space-1), ${markerPosition}%, calc(100% - var(--space-1)))`,
              bottom: 0,
              width: "var(--space-2)",
              height: "100%",
              transform: "translateX(-50%)",
              borderRadius: "var(--r-pill)",
              background: accentColor,
              border: "var(--space-0-5) solid var(--bg-1)",
              boxShadow: "0 0 0 var(--space-0-5) var(--line-soft)",
            }}
          />
        </div>
        <div aria-hidden style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "var(--space-2)" }}>
          <Text as="span" variant="caption" tone="tertiary">{t("mobileFitness.percentile.lower")}</Text>
          <Text as="span" variant="caption" tone="tertiary">{t("mobileFitness.percentile.middle")}</Text>
          <Text as="span" variant="caption" tone="tertiary" style={{ textAlign: "right" }}>{t("mobileFitness.percentile.upper")}</Text>
        </div>
      </div>}
      {showContext && (population || hasDensity || showRulerGuide || alwaysShowRulerGuide) && <div id={contextId ?? populationId} style={{ marginTop: hideScale ? 0 : "var(--space-1)" }}>
      {population && (
        <Text as="div" variant="caption" tone="tertiary" style={{ overflowWrap: "anywhere" }}>
          {population}
        </Text>
      )}
      {hasDensity ? (
        <div style={{ minWidth: 0, marginTop: "var(--space-1)" }}>
          <Text as="div" variant="caption" tone="secondary" style={{ overflowWrap: "anywhere" }}>
            {t("mobileFitness.percentile.densityPopulation", { count: distribution.approximateSampleSize })}
          </Text>
          <Text as="div" variant="caption" tone="tertiary" style={{ overflowWrap: "anywhere" }}>
            {densityBasis} · {t("mobileFitness.percentile.privacy", { minimum: distribution.privacy.minimumCellSize })}
            {computedLabel ? ` · ${t("mobileFitness.percentile.computedAt", { date: computedLabel })}` : ""}
          </Text>
          <Text as="div" variant="caption" tone="tertiary" style={{ overflowWrap: "anywhere" }}>
            {t("mobileFitness.percentile.densityGuide")}
          </Text>
        </div>
      ) : showRulerGuide ? (
        <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)", overflowWrap: "anywhere" }}>
          {t("mobileFitness.percentile.rulerGuide")}
        </Text>
      ) : null}
      {hasDensity && alwaysShowRulerGuide && (
        <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)", overflowWrap: "anywhere" }}>
          {t("mobileFitness.percentile.rulerGuide")}
        </Text>
      )}
      </div>}
    </div>
  );
}
