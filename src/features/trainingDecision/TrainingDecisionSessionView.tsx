import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";
import type { PresentedTrainingDecisionSession } from "./decisionPresentation";

export function TrainingDecisionSessionView({ label, session, tone = "neutral" }: {
  label: string; session: PresentedTrainingDecisionSession | null; tone?: "neutral" | "recommended" | "effective";
}) {
  const { t } = useTranslation("training");
  if (!session) return null;
  return <div className={`training-decision-session training-decision-session--${tone}`} data-session-role={tone}>
    <Text as="span" variant="caption" tone="secondary">{label}</Text>
    <div className="training-decision-session__summary">
      <Text as="strong" variant="subtitle">{t(`decision.workout.${session.current.workout}`, { defaultValue: session.current.workout })}</Text>
      <div className="training-decision-session__meta">
        <span>{t("decision.duration", { value: session.current.durationMin })}</span>
        <span>{session.current.targetTss === null ? t("decision.tssUnavailable")
          : t("decision.tss", { value: session.current.targetTss })}</span>
        {/* 존은 권고 워크아웃에만 계약상 존재 — 있을 때만 노출한다. */}
        {session.current.zone && <span data-session-zone={session.current.zone}>
          {t("decision.zone", { value: session.current.zone })}</span>}
      </div>
    </div>
  </div>;
}
