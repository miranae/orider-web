import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";
import type { TrainingDecisionSession } from "../../services/trainingDecisionContract";

export function TrainingDecisionSessionView({ label, session, tone = "neutral" }: {
  label: string; session: TrainingDecisionSession | null; tone?: "neutral" | "recommended" | "effective";
}) {
  const { t } = useTranslation("training");
  if (!session) return null;
  return <div className={`training-decision-session training-decision-session--${tone}`}>
    <Text as="span" variant="caption" tone="secondary">{label}</Text>
    <div className="training-decision-session__summary">
      <Text as="strong" variant="subtitle">{t(`decision.workout.${session.current.workout}`, { defaultValue: session.current.workout })}</Text>
      <div className="training-decision-session__meta">
        <span>{t("decision.duration", { value: session.current.durationMin })}</span>
        <span>{t("decision.tss", { value: session.current.targetTss })}</span>
      </div>
    </div>
  </div>;
}
