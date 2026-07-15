import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";

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
      <div aria-hidden style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
        {STAGES.map((stage, index) => (
          <span
            key={stage}
            data-ability-stage={stage}
            data-active={index === activeStage || undefined}
            style={{
              minWidth: 0,
              height: "var(--space-2)",
              borderRadius: "var(--r-pill)",
              background: index === activeStage ? accentColor : "var(--bg-3)",
            }}
          />
        ))}
      </div>
      <div aria-hidden style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
        {STAGES.map((stage) => (
          <Text key={stage} as="span" variant="caption" tone="tertiary" style={{ minWidth: 0, textAlign: "center", overflowWrap: "anywhere" }}>
            {t(`mobileFitness.abilityScore.stage.${stage}`)}
          </Text>
        ))}
      </div>
      <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>
        {t("mobileFitness.abilityScore.guide")}
      </Text>
    </div>
  );
}
