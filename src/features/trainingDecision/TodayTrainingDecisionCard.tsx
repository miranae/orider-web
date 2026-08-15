import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { User } from "firebase/auth";
import { useTodayTrainingDecision } from "../../hooks/useTodayTrainingDecision";
import { LocalizedLink } from "../../components/LocalizedLink";
import TodayPlanLink from "../../components/training/TodayPlanLink";
import { Alert, Button, Card, Chip, Text, buttonClass } from "../../theme/components";
import {
  canShowRecommendation, decisionAction, primaryEffectiveSession, primaryRecommendedSession, primaryScheduledSession,
} from "./decisionPresentation";
import { TrainingDecisionSessionView } from "./TrainingDecisionSessionView";
import { useTrainingProposalController } from "./useTrainingProposalController";
import { CoachQuestionLauncher } from "../coach/CoachQuestionLauncher";
import { TrainingExecutionPanel } from "./TrainingExecutionPanel";
import "./training-decision.css";

export type TrainingDecisionSurface = "home" | "fitness" | "plan";

function ProposalPanel({ decision, refresh }: { decision: NonNullable<ReturnType<typeof useTodayTrainingDecision>["decision"]>;
  refresh: () => void }) {
  const { t, i18n } = useTranslation("training");
  const controller = useTrainingProposalController(decision, refresh);
  const hasAdjustments = decision.recommendedAdjustments.length > 0;
  return <section className="training-decision-proposal" aria-labelledby="training-decision-proposal-title">
    <Text id="training-decision-proposal-title" as="h3" variant="subtitle">{t("decision.proposal.title")}</Text>
    {controller.proposal?.changes.map((change) => <article key={`${change.weekId}:${change.dayIndex}`} className="training-decision-proposal__change">
      <time dateTime={change.localDate}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${change.localDate}T00:00:00Z`))}</time>
      <div className="training-decision-proposal__comparison">
        <div><Text as="span" variant="caption" tone="secondary">{t("decision.scheduled")}</Text><strong>{t(`decision.workout.${change.before.workout.kind}`, { defaultValue: change.before.workout.kind })}</strong><span>{t("decision.duration", { value: change.before.workout.durationMin })}</span></div>
        <div><Text as="span" variant="caption" tone="secondary">{t("decision.recommended")}</Text><strong>{t(`decision.workout.${change.workout.kind}`, { defaultValue: change.workout.kind })}</strong><span>{t("decision.duration", { value: change.workout.durationMin })}</span></div>
      </div>
    </article>)}
    <div className="training-decision-proposal__actions">
      {controller.state === "idle" && hasAdjustments && decision.capabilities.proposal === "available" && <Button variant="outline" onClick={() => void controller.create()}>{t("decision.proposal.review")}</Button>}
      {controller.state === "pending" && decision.capabilities.confirm === "available" && <Button onClick={() => void controller.confirm()}>{t("decision.proposal.confirm")}</Button>}
      {controller.state === "pending" && decision.capabilities.decline === "available" && <Button variant="ghost" onClick={() => void controller.decline()}>{t("decision.proposal.keepScheduled")}</Button>}
      {controller.state === "applied" && decision.capabilities.rollback === "available" && <Button variant="outline" onClick={() => void controller.rollback()}>{t("decision.proposal.rollback")}</Button>}
      {controller.state === "declined" && <Text as="p" variant="caption" tone="secondary">{t("decision.proposal.keptScheduled")}</Text>}
      {controller.state === "busy" && <Text as="span" variant="caption">{t("decision.proposal.busy")}</Text>}
      {controller.state === "stale" && <Alert variant="warning" title={t("decision.proposal.stale")}><Button size="sm" variant="outline" onClick={() => void controller.refresh()}>{t("decision.refresh")}</Button></Alert>}
      {controller.state === "error" && <Alert variant="warning" title={t("decision.proposal.error")}><Button size="sm" variant="outline" onClick={() => void controller.refresh()}>{t("decision.refresh")}</Button></Alert>}
    </div>
  </section>;
}

export default function TodayTrainingDecisionCard({ user, discipline, surface = "home", onSignIn = () => undefined }: { user: User | null;
  discipline: "bike" | "run" | "swim"; surface?: TrainingDecisionSurface; onSignIn?: () => void }) {
  const { t } = useTranslation("training");
  const { decision, loading, scheduledOnly, unavailable, refresh } = useTodayTrainingDecision(user?.uid, discipline);
  if (!user) return null;
  if (loading) return <Card className="training-decision-card" aria-busy="true"><Text tone="secondary">{t("decision.loading")}</Text></Card>;
  if (!decision) return <div className="training-decision-fallback" data-training-decision-fallback={unavailable ? "unavailable" : "empty"}>
    <TodayPlanLink discipline={discipline} />
  </div>;

  const scheduled = primaryScheduledSession(decision);
  const recommended = canShowRecommendation(decision) ? primaryRecommendedSession(decision) : null;
  const effective = primaryEffectiveSession(decision);
  const action = decisionAction(decision);
  const statusKey = scheduledOnly || !action ? "scheduledOnly" : action;
  const extraCount = Math.max(0, decision.scheduledSessions.length - 1);
  const tupleId = decision.projectionId;
  const reasonCodes = recommended
    ? [...new Set((decision.loadAdjustment?.reasonCodes.length
      ? decision.loadAdjustment.reasonCodes
      : decision.recommendedAdjustments.find((item) => item.sessionId === recommended.sessionId)?.recommendation.reasonCodes) ?? [])].slice(0, 2)
    : [];

  return <Card className={`training-decision-card training-decision-card--${surface}`} data-decision-id={tupleId}
    data-facts-id={decision.recommendationSource?.factsId ?? ""} data-plan-revision={decision.planSource?.planRevision ?? ""}>
    <header className="training-decision-card__header">
      <div><Text as="span" variant="eyebrow">{t("decision.eyebrow")}</Text><Text as="h2" variant="title">{t(`decision.status.${statusKey}`)}</Text></div>
      <Chip variant={decision.healthGate.state === "stop" ? "danger" : scheduledOnly ? "default" : "accent"}>
        {t(`decision.mode.${scheduledOnly ? "scheduled-only" : decision.mode}`)}
      </Chip>
    </header>
    {decision.healthGate.state === "stop" && <Alert variant="danger" title={t("decision.healthStop")} />}
    {!scheduled && <Text as="p" tone="secondary">{t("decision.noScheduled")}</Text>}
    {surface === "fitness" ? <>
      <TrainingDecisionSessionView label={t("decision.effective")} session={effective} tone="effective" />
      <Text as="p" variant="caption" tone="secondary">{t("decision.sourceTuple", { classification: decision.loadAdjustment?.classification ?? decision.prescription.status, phase: decision.plan?.phase ?? "unknown" })}</Text>
    </> : <div className="training-decision-card__sessions">
      <TrainingDecisionSessionView label={t("decision.scheduled")} session={scheduled} />
      {recommended && <TrainingDecisionSessionView label={t("decision.recommended")} session={recommended} tone="recommended" />}
      {decision.receipt && <TrainingDecisionSessionView label={t("decision.effective")} session={effective} tone="effective" />}
      {extraCount > 0 && <Text as="p" variant="caption" tone="secondary">{t("decision.extraSessions", { count: extraCount })}</Text>}
    </div>}
    {reasonCodes.length > 0 && <section className="training-decision-card__reasons" aria-label={t("decision.reasonTitle")}>
      <Text as="span" variant="caption" tone="secondary">{t("decision.reasonTitle")}</Text>
      <div>{reasonCodes.map((code) => <Chip key={code} variant="default">
        {t(`decision.reason.${code}`, { defaultValue: t("decision.reasonFallback") })}
      </Chip>)}</div>
    </section>}
    <footer className="training-decision-card__actions">
      <LocalizedLink to={{ pathname: "/plan", search: `?sport=${discipline}` }} className={buttonClass({ variant: "outline", size: "sm" })}>
        {t(surface === "plan" ? "decision.viewCalendar" : "decision.viewPlan")}<ChevronRight size={16} aria-hidden />
      </LocalizedLink>
      {decision.capabilities.explain === "available" && decision.recommendationSource && <CoachQuestionLauncher user={user} discipline={discipline} onSignIn={onSignIn}
        triggerBlock={false} triggerLabel={t("decision.askCoach")} progressPlannerSelection={{ question: t("decision.coachQuestion"),
          context: { prescriptionId: decision.recommendationSource.prescriptionId, sourceRequestId: decision.recommendationSource.sourceRequestId } }} />}
    </footer>
    {surface === "plan" && (decision.recommendedAdjustments.length > 0 || decision.proposal !== null || decision.receipt !== null)
      && <ProposalPanel decision={decision} refresh={refresh} />}
    {(surface === "home" || surface === "plan") && <TrainingExecutionPanel decision={decision}
      sessions={surface === "plan" ? decision.effectiveSessions : effective ? [effective] : []} onChanged={refresh} />}
  </Card>;
}
