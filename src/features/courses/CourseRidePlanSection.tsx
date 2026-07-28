import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, Text } from "../../theme/components";
import { getCoachRidePlanAiContext, isCoachClientError, loadCoachRidePlan } from "../../services/coachClient";
import { logClientError } from "../../services/errorLogger";
import { isCoachRidePlanRespondToken,
  type CoachRidePlan, type CoachRidePlanAiProjection, type CoachRidePlanQuestionCode } from "../../services/coachRidePlanContract";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import type { CoachRidePlanContext } from "../../services/coachV2Contract";
import { CoachQuestionLauncher } from "../coach/CoachQuestionLauncher";
import "./course-ride-plan.css";

interface Props {
  courseId: string;
  isOwner: boolean;
  user: User | null;
  onSignIn: () => void;
}

type LoadState = "loading" | "ready" | "stale" | "missing_elevation" | "unavailable" | "error";
export interface RidePlanQuestionSelection {
  selectionId: string;
  question: string;
  context: CoachRidePlanContext;
}

function boundedState(error: unknown): LoadState {
  if (!isCoachClientError(error)) return "error";
  if (error.code === "aborted") return "stale";
  if (error.code === "failed-precondition") return "missing_elevation";
  if (error.code === "not-found" || error.code.startsWith("ride_plan_") && error.code.endsWith("_unsupported")) {
    return "unavailable";
  }
  return "error";
}

function formatDuration(seconds: number, locale: string): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const korean = locale.startsWith("ko");
  if (hours === 0) return korean ? `${minutes}분` : `${minutes}m`;
  if (minutes === 0) return korean ? `${hours}시간` : `${hours}h`;
  return korean ? `${hours}시간 ${minutes}분` : `${hours}h ${minutes}m`;
}

function projectionMatches(plan: CoachRidePlan, projection: CoachRidePlanAiProjection,
  questionCode: CoachRidePlanQuestionCode): boolean {
  return projection.inputRevision === plan.inputRevision && projection.questionCode === questionCode
    && JSON.stringify({ course: projection.course, estimate: projection.estimate, segments: projection.segments,
      assumptions: projection.assumptions }) === JSON.stringify({ course: plan.course, estimate: plan.estimate,
      segments: plan.segments, assumptions: plan.assumptions });
}

export function CourseRidePlanSection({ courseId, isOwner, user, onSignIn }: Props) {
  const { t } = useTranslation("course");
  const config = getRuntimeConfig();
  const cardEnabled = config.coachRidePlanTokenEnabled === true && config.coachRidePlanSnapshotEnabled === true;
  const aiEnabled = config.coachRidePlanAiEnabled === true && config.coachRidePlanRespondV2Enabled === true;
  const [plan, setPlan] = useState<CoachRidePlan | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<RidePlanQuestionSelection | null>(null);
  const [questionState, setQuestionState] = useState<"idle" | "loading" | "error">("idle");
  const planGenerationRef = useRef(0);
  const aiRequestRef = useRef<AbortController | null>(null);
  const currentPlanRef = useRef({ courseId, plan });
  currentPlanRef.current = { courseId, plan };
  const respondEnabled = aiEnabled && plan?.status === "ok" && isCoachRidePlanRespondToken(plan.contextToken);

  useEffect(() => {
    const generation = ++planGenerationRef.current;
    aiRequestRef.current?.abort();
    aiRequestRef.current = null;
    if (!cardEnabled || !user || !isOwner || !courseId) return undefined;
    let active = true;
    setState("loading"); setPlan(null); setSelection(null); setQuestionState("idle");
    void loadCoachRidePlan(courseId).then((value) => {
      if (!active || planGenerationRef.current !== generation) return;
      setPlan(value); setState("ready");
    }).catch((error) => {
      if (!active || planGenerationRef.current !== generation) return;
      logClientError("CourseRidePlanSection.load", error, {
        phase: "plan",
        code: isCoachClientError(error) ? error.code : "unknown",
      });
      setState(boundedState(error));
    });
    return () => {
      active = false;
      if (planGenerationRef.current === generation) planGenerationRef.current += 1;
      aiRequestRef.current?.abort();
      aiRequestRef.current = null;
    };
  }, [attempt, cardEnabled, courseId, isOwner, user]);

  if (!cardEnabled || !user || !isOwner) return null;

  async function chooseQuestion(code: CoachRidePlanQuestionCode, question: string) {
    if (!plan || plan.status !== "ok" || !respondEnabled || questionState === "loading") return;
    const requestCourseId = courseId;
    const requestPlan = plan;
    const contextToken = requestPlan.contextToken;
    if (!isCoachRidePlanRespondToken(contextToken)) return;
    const generation = planGenerationRef.current;
    const controller = new AbortController();
    aiRequestRef.current?.abort();
    aiRequestRef.current = controller;
    setQuestionState("loading");
    try {
      const projection = await getCoachRidePlanAiContext(requestCourseId, requestPlan.contextToken, code, controller.signal);
      const current = currentPlanRef.current;
      if (controller.signal.aborted || planGenerationRef.current !== generation
        || current.courseId !== requestCourseId || current.plan?.contextToken !== requestPlan.contextToken
        || current.plan.inputRevision !== requestPlan.inputRevision) return;
      if (!projectionMatches(requestPlan, projection, code)) throw new Error("ride_plan_projection_mismatch");
      setSelection({ selectionId: crypto.randomUUID(), question,
        context: { contextToken, inputRevision: requestPlan.inputRevision, questionCode: code } });
      setQuestionState("idle");
    } catch (error) {
      if (!controller.signal.aborted && planGenerationRef.current === generation) {
        logClientError("CourseRidePlanSection.loadAiContext", error, {
          phase: "ai-context",
          code: isCoachClientError(error) ? error.code : "unknown",
          questionCode: code,
        });
        setQuestionState("error");
      }
    } finally {
      if (aiRequestRef.current === controller) aiRequestRef.current = null;
    }
  }

  return (
    <section className="course-ride-plan" aria-labelledby="course-ride-plan-title">
      <Card>
        <header className="course-ride-plan__header">
          <div>
            <Text as="p" variant="eyebrow" tone="accent">{t("ridePlan.eyebrow")}</Text>
            <Text id="course-ride-plan-title" as="h2" variant="title">{t("ridePlan.title")}</Text>
          </div>
          <Sparkles aria-hidden size={20} />
        </header>
        <RidePlanContent state={state} plan={plan} aiEnabled={respondEnabled} questionState={questionState}
          onRetry={() => setAttempt((value) => value + 1)} onQuestionSelect={chooseQuestion} />
      </Card>
      {respondEnabled && <CoachQuestionLauncher user={user} discipline="bike" onSignIn={onSignIn}
        triggerBlock={false} ridePlanSelection={selection} />}
    </section>
  );
}

function RidePlanContent({ state, plan, aiEnabled, questionState, onRetry, onQuestionSelect }: {
  state: LoadState;
  plan: CoachRidePlan | null;
  aiEnabled: boolean;
  questionState: "idle" | "loading" | "error";
  onRetry: () => void;
  onQuestionSelect: (code: CoachRidePlanQuestionCode, question: string) => void;
}) {
  const { t, i18n } = useTranslation("course");
  if (state === "loading") return <Text as="p" role="status" aria-live="polite">{t("ridePlan.loading")}</Text>;
  if (state !== "ready" || !plan) {
    const key = state === "stale" ? "stale" : state === "missing_elevation" ? "missingElevation"
      : state === "unavailable" ? "unavailable" : "error";
    return <div className="course-ride-plan__notice" role="status">
      <Text as="p" variant="bodySmall">{t(`ridePlan.state.${key}`)}</Text>
      {(state === "stale" || state === "error") && <Button size="sm" variant="outline" onClick={onRetry}>{t("ridePlan.retry")}</Button>}
    </div>;
  }
  if (plan.status !== "ok" || !plan.estimate) {
    return <div className="course-ride-plan__notice" role="status">
      <Text as="p" variant="bodySmall">{t(`ridePlan.state.${plan.status === "missing_pdc" ? "missingPdc" : "missingWeight"}`)}</Text>
    </div>;
  }
  return <>
    <dl className="course-ride-plan__summary">
      <div><dt>{t("ridePlan.eta")}</dt><dd>{formatDuration(plan.estimate.totalTimeSec, i18n.language)}</dd></div>
      <div><dt>{t("ridePlan.averageSpeed")}</dt><dd>{plan.estimate.averageSpeedKph.toFixed(1)} km/h</dd></div>
      <div><dt>{t("ridePlan.distance")}</dt><dd>{(plan.course.distanceM / 1000).toFixed(1)} km</dd></div>
      <div><dt>{t("ridePlan.elevation")}</dt><dd>{plan.course.elevationGainM} m</dd></div>
    </dl>
    <div className="course-ride-plan__segments">
      <Text as="h3" variant="label">{t("ridePlan.segments")}</Text>
      <ol>
        {plan.segments.map((segment) => <li key={segment.index}>
          <Text as="span" variant="label">{t("ridePlan.segment", { number: segment.index + 1 })}</Text>
          <span>{(segment.startDistanceM / 1000).toFixed(1)}–{(segment.endDistanceM / 1000).toFixed(1)} km</span>
          <span>{segment.averageGradePct.toFixed(1)}%</span>
          <span>{segment.estimatedSpeedKph.toFixed(1)} km/h</span>
          <span>{formatDuration(segment.estimatedTimeSec, i18n.language)}</span>
        </li>)}
      </ol>
    </div>
    <div className="course-ride-plan__assumptions">
      <Text as="h3" variant="label">{t("ridePlan.assumptions.title")}</Text>
      <Text as="p" variant="caption" tone="secondary">{t("ridePlan.assumptions.description")}</Text>
    </div>
    {aiEnabled && <div className="course-ride-plan__questions">
      <Text as="h3" variant="label">{t("ridePlan.questions.title")}</Text>
      {plan.exampleQuestionCodes.map((code) => {
        const question = t(`ridePlan.questions.${code}`);
        return <Button key={code} variant="outline" disabled={questionState === "loading"}
          onClick={() => onQuestionSelect(code, question)}>{question}</Button>;
      })}
      {questionState !== "idle" && <Text as="p" role="status" variant="caption" tone={questionState === "error" ? "warning" : "secondary"}>
        {t(`ridePlan.questions.${questionState}`)}
      </Text>}
      <Text as="p" variant="caption" tone="tertiary">{t("ridePlan.questions.note")}</Text>
    </div>}
  </>;
}

export { boundedState as ridePlanBoundedState, formatDuration as formatRidePlanDuration, projectionMatches as ridePlanProjectionMatches };
