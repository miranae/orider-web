import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { User } from "firebase/auth";
import { useTodayTrainingDecision } from "../../hooks/useTodayTrainingDecision";
import { LocalizedLink } from "../../components/LocalizedLink";
import TodayPlanLink from "../../components/training/TodayPlanLink";
import TodaysWorkoutCard from "../../components/training/TodaysWorkoutCard";
import { Alert, Button, Card, Chip, Text, buttonClass } from "../../theme/components";
import {
  canShowRecommendation, decisionAction, primaryEffectiveSession, primaryRecommendedAdjustment,
  primaryRecommendedSession, primaryScheduledSession,
} from "./decisionPresentation";
import { TrainingDecisionSessionView } from "./TrainingDecisionSessionView";
import { useTrainingProposalController } from "./useTrainingProposalController";
import { CoachQuestionLauncher } from "../coach/CoachQuestionLauncher";
import { TrainingExecutionPanel } from "./TrainingExecutionPanel";
import "./training-decision.css";

export type TrainingDecisionSurface = "home" | "fitness" | "plan";

function ProposalPanel({ decision, recommendationVisible, refresh }: {
  decision: NonNullable<ReturnType<typeof useTodayTrainingDecision>["decision"]>;
  recommendationVisible: boolean; refresh: () => void }) {
  const { t, i18n } = useTranslation("training");
  const controller = useTrainingProposalController(decision, refresh);
  const hasAdjustments = decision.recommendedAdjustments.length > 0;
  const canApplyRecommendation = decision.healthGate.state === "clear" && recommendationVisible;
  return <section className="training-decision-proposal" aria-labelledby="training-decision-proposal-title"
    data-proposal-state={controller.state}>
    <div className="training-decision-proposal__heading">
      <Text id="training-decision-proposal-title" as="h3" variant="subtitle">{t("decision.proposal.title")}</Text>
      <Chip variant={controller.state === "applied" ? "accent" : "default"}>
        {t(`decision.proposal.state.${controller.state}`, { defaultValue: t("decision.proposal.state.loading") })}
      </Chip>
    </div>
    <Text as="p" variant="caption" tone="secondary">{t("decision.proposal.body")}</Text>
    {canApplyRecommendation && controller.proposal?.changes.map((change) => <article key={`${change.weekId}:${change.dayIndex}`} className="training-decision-proposal__change"
      data-current-day={change.localDate === decision.localDate ? "true" : undefined}>
      <time dateTime={change.localDate}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${change.localDate}T00:00:00Z`))}</time>
      <div className="training-decision-proposal__comparison">
        <div><Text as="span" variant="caption" tone="secondary">{t("decision.scheduled")}</Text><strong>{t(`decision.workout.${change.before.workout.kind}`, { defaultValue: change.before.workout.kind })}</strong><span>{t("decision.duration", { value: change.before.workout.durationMin })}</span></div>
        <div><Text as="span" variant="caption" tone="secondary">{t("decision.recommended")}</Text><strong>{t(`decision.workout.${change.workout.kind}`, { defaultValue: change.workout.kind })}</strong><span>{t("decision.duration", { value: change.workout.durationMin })}</span></div>
      </div>
    </article>)}
    <Text className="sr-only" as="p" role="status" aria-live="polite" aria-atomic="true">
      {t(`decision.proposal.state.${controller.state}`, { defaultValue: t("decision.proposal.state.loading") })}
    </Text>
    <div className="training-decision-proposal__actions">
      {controller.state === "idle" && canApplyRecommendation && hasAdjustments && decision.capabilities.proposal === "available" && <Button variant="primary" onClick={() => void controller.create()}>{t("decision.proposal.review")}</Button>}
      {controller.state === "pending" && canApplyRecommendation && decision.capabilities.confirm === "available" && <Button variant="primary" onClick={() => void controller.confirm()}>{t("decision.proposal.confirm")}</Button>}
      {controller.state === "pending" && decision.capabilities.decline === "available" && <Button variant="outline" onClick={() => void controller.decline()}>{t("decision.proposal.keepScheduled")}</Button>}
      {controller.state === "applied" && decision.capabilities.rollback === "available" && <Button variant="outline" onClick={() => void controller.rollback()}>{t("decision.proposal.rollback")}</Button>}
      {controller.state === "applied" && <Text as="p" variant="caption" tone="secondary">{t("decision.proposal.applied")}</Text>}
      {(controller.state === "declined" || controller.state === "reverted") && <Text as="p" variant="caption" tone="secondary">{t("decision.proposal.keptScheduled")}</Text>}
      {controller.state === "busy" && <Text as="span" variant="caption">{t("decision.proposal.busy")}</Text>}
      {controller.state === "stale" && <Alert variant="warning" title={t("decision.proposal.stale")}><Button size="sm" variant="outline" onClick={() => void controller.refresh()}>{t("decision.refresh")}</Button></Alert>}
      {controller.state === "error" && <Alert variant="warning" title={t("decision.proposal.error")}><Button size="sm" variant="outline" onClick={() => void controller.refresh()}>{t("decision.refresh")}</Button></Alert>}
    </div>
  </section>;
}

export default function TodayTrainingDecisionCard({ user, discipline, surface = "home", onSignIn = () => undefined,
  onAvailabilityChange }: { user: User | null;
  discipline: "bike" | "run" | "swim"; surface?: TrainingDecisionSurface; onSignIn?: () => void;
  onAvailabilityChange?: (available: boolean) => void }) {
  const { t } = useTranslation("training");
  const { decision, loading, scheduledOnly, unavailable, refresh } = useTodayTrainingDecision(user?.uid, discipline);
  useEffect(() => onAvailabilityChange?.(!loading && decision !== null), [decision, loading, onAvailabilityChange]);
  if (!user) return null;
  if (!decision && !loading) {
    if (surface === "plan") return <TodaysWorkoutCard />;
    if (surface === "fitness") return null;
  }
  if (loading) return <Card className="training-decision-card" aria-busy="true"><Text tone="secondary">{t("decision.loading")}</Text></Card>;
  if (!decision) return <div className="training-decision-fallback" data-training-decision-fallback={unavailable ? "unavailable" : "empty"}>
    <TodayPlanLink discipline={discipline} />
  </div>;

  const scheduled = primaryScheduledSession(decision);
  const recommendationVisible = decision.healthGate.state === "clear" && canShowRecommendation(decision);
  const recommendedAdjustment = recommendationVisible ? primaryRecommendedAdjustment(decision) : null;
  const recommended = recommendedAdjustment ? primaryRecommendedSession(decision) : null;
  const effective = primaryEffectiveSession(decision);
  const action = recommendedAdjustment ? decisionAction(decision) : null;
  const applied = decision.receipt?.status === "applied";
  const recommendationPending = Boolean(recommendedAdjustment && !applied);
  const displayScheduledOnly = !applied && !recommendationPending;
  const homeSessionLayout = recommendationPending ? "comparison" : "single";
  const statusKey = applied ? "applied"
    : recommendationPending ? "recommendationPending" : displayScheduledOnly || scheduledOnly || !action ? "scheduledOnly" : action;
  const extraCount = Math.max(0, decision.scheduledSessions.length - 1);
  const tupleId = decision.projectionId;
  const reasonCodes = recommendedAdjustment
    ? [...new Set((decision.loadAdjustment?.reasonCodes.length
      ? decision.loadAdjustment.reasonCodes
      : recommendedAdjustment?.recommendation.reasonCodes) ?? [])].slice(0, 2)
    : [];
  const deltaTarget = applied ? effective : recommended;
  const durationDelta = deltaTarget && scheduled ? deltaTarget.current.durationMin - scheduled.current.durationMin : 0;
  const tssDelta = deltaTarget && scheduled && deltaTarget.current.targetTss !== null
    ? deltaTarget.current.targetTss - scheduled.current.targetTss : null;
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const blockedExecutionSessionIds = new Set(applied || recommendationVisible
    ? decision.recommendedAdjustments.filter((item) => item.recommendation.action === "rest"
      || item.recommendation.action === "reassess").map((item) => item.sessionId)
    : []);
  const executableSessions = decision.effectiveSessions
    .filter((session) => session.current.workout !== "rest" && !blockedExecutionSessionIds.has(session.sessionId));

  return <Card className={`training-decision-card training-decision-card--${surface}`} data-decision-id={tupleId}
    data-facts-id={decision.recommendationSource?.factsId ?? ""} data-plan-revision={decision.planSource?.planRevision ?? ""}>
    <header className="training-decision-card__header">
      <div><Text as="span" variant="eyebrow">{t("decision.eyebrow")}</Text><Text as="h2" variant="title">{t(`decision.status.${statusKey}`)}</Text></div>
      <Chip variant={decision.healthGate.state === "stop" ? "danger" : applied ? "accent" : "default"}>
        {t(recommendationPending ? "decision.mode.not-applied" : `decision.mode.${displayScheduledOnly ? "scheduled-only" : decision.mode}`)}
      </Chip>
    </header>
    {decision.healthGate.state === "stop" && <Alert variant="danger" title={t("decision.healthStop")} />}
    {!scheduled && <Text as="p" tone="secondary">{t("decision.noScheduled")}</Text>}
    {surface === "fitness" ? <>
      <TrainingDecisionSessionView label={t("decision.effective")} session={effective} tone="effective" />
      <Text as="p" variant="caption" tone="secondary">{t("decision.sourceTuple", { classification: decision.loadAdjustment?.classification ?? decision.prescription.status, phase: decision.plan?.phase ?? "unknown" })}</Text>
    </> : surface === "home" ? <div data-session-layout={homeSessionLayout}
      className={`training-decision-card__sessions training-decision-card__sessions--compact training-decision-card__sessions--${homeSessionLayout}`}>
      <TrainingDecisionSessionView label={t(applied ? "decision.effective" : "decision.effectiveScheduled")} session={effective} tone="effective" />
      {recommendationPending && <TrainingDecisionSessionView label={t("decision.recommendedPending")} session={recommended} tone="recommended" />}
      {recommendationPending && !recommended && <div className="training-decision-session training-decision-session--recommended" data-session-role="recommended">
        <Text as="span" variant="caption" tone="secondary">{t("decision.recommendedPending")}</Text>
        <Text as="strong" variant="subtitle">{t(`decision.status.${action}`)}</Text>
      </div>}
      {deltaTarget && scheduled && <Text className="training-decision-card__delta" as="p" variant="caption" tone="secondary">
        {tssDelta === null ? t("decision.deltaDurationOnly", { duration: signed(durationDelta) })
          : t("decision.delta", { duration: signed(durationDelta), tss: signed(tssDelta) })}
      </Text>}
    </div> : <div className="training-decision-card__sessions">
      <TrainingDecisionSessionView label={t("decision.scheduled")} session={scheduled} />
      {recommended && <TrainingDecisionSessionView label={t("decision.recommended")} session={recommended} tone="recommended" />}
      {recommendationPending && !recommended && <div className="training-decision-session training-decision-session--recommended" data-session-role="recommended">
        <Text as="span" variant="caption" tone="secondary">{t("decision.recommended")}</Text>
        <Text as="strong" variant="subtitle">{t(`decision.status.${action}`)}</Text>
      </div>}
      <TrainingDecisionSessionView label={t("decision.effective")} session={effective} tone="effective" />
      {extraCount > 0 && <Text as="p" variant="caption" tone="secondary">{t("decision.extraSessions", { count: extraCount })}</Text>}
    </div>}
    {reasonCodes.length > 0 && <section className="training-decision-card__reasons" aria-label={t("decision.reasonTitle")}>
      <Text as="span" variant="caption" tone="secondary">{t("decision.reasonTitle")}</Text>
      <div>{reasonCodes.map((code) => <Chip key={code} variant="default">
        {t(`decision.reason.${code}`, { defaultValue: t("decision.reasonFallback") })}
      </Chip>)}</div>
    </section>}
    {surface === "home" && <TrainingExecutionPanel decision={decision}
      sessions={executableSessions} onChanged={refresh} />}
    {(surface === "home" || surface === "fitness") && <footer className="training-decision-card__actions">
      {surface === "home" && <LocalizedLink to={{ pathname: "/plan", search: `?sport=${discipline}` }} className={buttonClass({ variant: "outline", size: "sm" })}>
        {t("decision.viewPlan")}<ChevronRight size={16} aria-hidden />
      </LocalizedLink>}
      {surface === "fitness" && decision.capabilities.explain === "available" && decision.recommendationSource && <CoachQuestionLauncher user={user} discipline={discipline} onSignIn={onSignIn}
        triggerBlock={false} triggerLabel={t("decision.askCoach")} progressPlannerSelection={{ question: t("decision.coachQuestion"),
          context: { prescriptionId: decision.recommendationSource.prescriptionId, sourceRequestId: decision.recommendationSource.sourceRequestId } }} />}
    </footer>}
    {surface === "plan" && ((recommendationVisible && decision.recommendedAdjustments.length > 0)
      || decision.proposal !== null || decision.receipt !== null)
      && <ProposalPanel decision={decision} recommendationVisible={recommendationVisible} refresh={refresh} />}
  </Card>;
}
