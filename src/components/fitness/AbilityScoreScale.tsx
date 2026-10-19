import { useTranslation } from "react-i18next";
import { ReferenceGauge, Text } from "../../theme/components";

type AbilityScoreScaleProps = {
  score: number;
  ariaLabel: string;
  accentColor?: string;
};

const STAGES = ["entry", "foundation", "average", "excellent", "top"] as const;

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function AbilityScoreScale({ score, ariaLabel, accentColor = "var(--aqua)" }: AbilityScoreScaleProps) {
  const { t } = useTranslation("dashboard");
  const normalized = normalizeScore(score);
  const activeStage = Math.min(STAGES.length - 1, Math.floor(normalized / 20));
  const stageLabel = t(`mobileFitness.abilityScore.stage.${STAGES[activeStage]}`);

  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      aria-valuetext={t("mobileFitness.abilityScore.ariaValue", { score: normalized, stage: stageLabel })}
      style={{ minWidth: 0 }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-1) var(--space-2)" }}>
        <Text as="span" variant="label">{t("mobileFitness.abilityScore.raw", { score: normalized })}</Text>
        <Text as="span" variant="caption" style={{ color: accentColor, fontWeight: 600 }}>{stageLabel}</Text>
      </div>
      <ReferenceGauge value={normalized} domain={[0,100]} bands={STAGES.map((_, index) => ({ from: index * 20, to: (index + 1) * 20, active: index === activeStage, color: accentColor }))} ticks={STAGES.map((stage,index) => ({ value: index * 20 + 10, label: t(`mobileFitness.abilityScore.stage.${stage}`), compact: index === 0 || index === 2 || index === 4 }))} aria-label={ariaLabel} />
      <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>
        {t("mobileFitness.abilityScore.guide")}
      </Text>
    </div>
  );
}
