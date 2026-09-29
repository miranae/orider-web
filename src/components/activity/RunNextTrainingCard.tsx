import { useTranslation } from "react-i18next";
import { Card, Text, buttonClass } from "../../theme/components";
import { LocalizedLink } from "../LocalizedLink";
import { buildRunPlanTarget, type RunNextTrainingSession, type RunNextTrainingState } from "../../hooks/useRunNextTraining";

/** 저장된 운동의 시간·구성만 보여준다. 유형 목적은 개인 처방이 아닌 기존 설명이다. */
export function RunTrainingFacts({ session }: { session: RunNextTrainingSession }) {
  const { t } = useTranslation("activity");
  const { t: training } = useTranslation("training");

  return <div className="space-y-3" data-testid="run-training-facts">
    <Text as="h4" variant="subtitle">{session.title ?? training(`workouts.${session.workout}`)}</Text>
    <Text as="p" variant="caption" tone="secondary">{session.localDate}</Text>
    <div><Text as="div" variant="eyebrow">{t("analysis.run.nextPlan.purpose")}</Text><Text as="p" variant="bodySmall">{t(`analysis.run.nextPlan.kindDefinition.${session.workout}`)}</Text></div>
    <div><Text as="div" variant="eyebrow">{t("analysis.run.nextPlan.duration")}</Text><Text as="div" variant="dataSmall">{training("today.minutes", { value: session.durationMin })}</Text></div>
    {session.steps && session.steps.length > 0 && <div>
      <Text as="div" variant="eyebrow">{t("analysis.run.nextPlan.steps")}</Text>
      <ol className="space-y-1 mt-2">{session.steps.map((step, index) => <li key={index} className="text-[length:var(--fs-sm)]">{t(`analysis.run.nextPlan.step.${step.label}`)} · {training("today.minutes", { value: step.durationMin })}</li>)}</ol>
    </div>}
  </div>;
}

export default function RunNextTrainingCard({ state }: { state: RunNextTrainingState }) {
  const { t } = useTranslation("activity");
  const ready = state.status === "ready" ? state.session : null;
  return <Card padding="compact" className="min-w-0" data-testid="run-next-training-card">
    <Text as="h3" variant="subtitle" style={{ marginBottom: "var(--space-3)" }}>{t("analysis.run.nextPlan.title")}</Text>
    {ready ? <RunTrainingFacts session={ready} /> : <Text as="p" variant="bodySmall" tone="secondary" role={state.status === "loading" ? "status" : undefined}>{t(`analysis.run.nextPlan.${state.status}`)}</Text>}
    <LocalizedLink to={ready ? buildRunPlanTarget(ready) : { pathname: "/plan", search: "?sport=run" }} className={buttonClass({ variant: "primary", size: "sm" })} style={{ marginTop: "var(--space-3)" }}>
      {t(ready ? "analysis.run.nextPlan.open" : "analysis.run.nextPlan.viewPlan")}
    </LocalizedLink>
  </Card>;
}
