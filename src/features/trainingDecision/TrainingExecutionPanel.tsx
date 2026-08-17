import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Input, Text } from "../../theme/components";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import {
  linkSessionExecutionActivity, listSessionExecutions, reserveSessionExecution, setSessionExecutionOutcome,
  startSessionExecution, unlinkSessionExecutionActivity,
} from "../../services/trainingExecutionClient";
import type { SessionExecutionLink } from "../../services/trainingExecutionContract";
import type { TodayTrainingDecisionProjection, TrainingDecisionSession } from "../../services/trainingDecisionContract";
import { logClientError } from "../../services/errorLogger";
import { useActivities } from "../../hooks/useActivities";
import { getDiscipline } from "../../utils/disciplineFilter";
import type { Activity } from "@shared/types";

type ActivityWithRevision = Activity & { activityRevision?: unknown };

function revisionOf(activity: Activity): string | null {
  const revision = (activity as ActivityWithRevision).activityRevision;
  return typeof revision === "string" && revision.length >= 3 ? revision : null;
}

function ExecutionSession({ decision, session, initialExecution, onChanged }: { decision: TodayTrainingDecisionProjection;
  session: TrainingDecisionSession; initialExecution: SessionExecutionLink | null; onChanged: () => void }) {
  const { t, i18n } = useTranslation("training");
  const [execution, setExecution] = useState<SessionExecutionLink | null>(initialExecution);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [manual, setManual] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [postponedTo, setPostponedTo] = useState("");
  const reserveKey = useRef(crypto.randomUUID());
  const startKey = useRef(crypto.randomUUID());
  const mutationKeys = useRef(new Map<string, string>());
  const manualPanelId = `training-execution-manual-${session.sessionId}`;
  const canMutate = decision.healthGate.state === "clear";
  const { activities: ownerActivities, loading: activitiesLoading } = useActivities("self", [], {
    enabled: manual && canMutate && execution?.status === "started",
  });
  const activityChoices = ownerActivities.filter((activity) => getDiscipline(activity.type) === decision.targetDiscipline
    && revisionOf(activity) !== null);
  const selectedActivity = activityChoices.find((activity) => activity.id === selectedActivityId) ?? null;
  const mutationKey = (operation: string) => {
    const existing = mutationKeys.current.get(operation);
    if (existing) return existing;
    const created = crypto.randomUUID();
    mutationKeys.current.set(operation, created);
    return created;
  };

  useEffect(() => setExecution(initialExecution), [initialExecution]);

  async function start() {
    if (!decision.planSource || !canMutate || busy) return;
    setBusy(true); setError(false);
    try {
      const reserved = execution ?? await reserveSessionExecution({
        dayRef: session.dayRef, scheduledSessionId: session.scheduledSessionId,
        scheduledSessionRevision: session.scheduledSessionRevision, planRevision: decision.planSource.planRevision,
        projectionId: decision.projectionId, prescriptionId: decision.sourceRefs.prescriptionId,
        prescriptionValidFrom: decision.prescription.validFrom, proposalId: decision.sourceRefs.proposalId,
        receiptAuditId: decision.sourceRefs.receiptAuditId,
        discipline: decision.targetDiscipline, idempotencyKey: reserveKey.current,
      });
      const started = await startSessionExecution(reserved.executionId, startKey.current);
      setExecution(started); onChanged();
    } catch (cause) { logClientError("TrainingExecutionPanel.start", cause, { sessionId: session.sessionId }); setError(true); } finally { setBusy(false); }
  }

  async function link() {
    const revision = selectedActivity ? revisionOf(selectedActivity) : null;
    if (!canMutate || !execution || execution.status !== "started" || execution.outcomeStatus !== "pending"
      || !selectedActivity || !revision || busy) return;
    setBusy(true); setError(false);
    const operation = `link:${execution.executionId}:${selectedActivity.id}:${revision}`;
    try { setExecution(await linkSessionExecutionActivity(execution.executionId, selectedActivity.id, revision,
      mutationKey(operation))); mutationKeys.current.delete(operation); setManual(false); onChanged(); }
    catch (cause) { logClientError("TrainingExecutionPanel.link", cause, { executionId: execution.executionId }); setError(true); } finally { setBusy(false); }
  }

  async function outcome(value: "completed" | "partial" | "skipped" | "postponed") {
    const linkedOutcome = value === "completed" || value === "partial";
    if (!canMutate || !execution || busy || (linkedOutcome ? !exactLink : execution.status === "linked" || execution.outcomeStatus !== "pending")
      || (value === "postponed" && !/^\d{4}-\d{2}-\d{2}$/u.test(postponedTo))) return;
    setBusy(true); setError(false);
    const operation = `outcome:${execution.executionId}:${value}:${value === "postponed" ? postponedTo : ""}`;
    try { setExecution(await setSessionExecutionOutcome(execution.executionId, value,
      mutationKey(operation), value === "postponed" ? postponedTo : undefined));
      mutationKeys.current.delete(operation); onChanged(); }
    catch (cause) { logClientError("TrainingExecutionPanel.outcome", cause, { executionId: execution.executionId, value }); setError(true); } finally { setBusy(false); }
  }

  /**
   * 시간창 추정(probable) 매칭은 완료·부분 완료도, 건너뛰기·연기도 막혀 교착이 된다.
   * 사용자가 "이 활동이 맞다" 고 확인하면 같은 활동을 manual 로 다시 링크해 exact 권한으로 승격시킨다.
   * (백엔드 linkActivity 는 동일 activityId 재링크를 허용하고, manual 은 즉시 completed 로 기록한다.)
   */
  async function confirmProbable(then?: "partial") {
    if (!canMutate || !execution || busy || execution.status !== "linked" || execution.matchConfidence !== "probable"
      || !execution.activityId || !execution.activityRevision) return;
    setBusy(true); setError(false);
    const operation = `confirm:${execution.executionId}:${execution.activityId}:${execution.activityRevision}:${then ?? "completed"}`;
    try {
      const confirmed = await linkSessionExecutionActivity(execution.executionId, execution.activityId,
        execution.activityRevision, mutationKey(operation));
      const next = then === "partial"
        ? await setSessionExecutionOutcome(confirmed.executionId, "partial", mutationKey(`${operation}:outcome`))
        : confirmed;
      mutationKeys.current.delete(operation); mutationKeys.current.delete(`${operation}:outcome`);
      setExecution(next); onChanged();
    } catch (cause) {
      logClientError("TrainingExecutionPanel.confirmProbable", cause,
        { executionId: execution.executionId, activityId: execution.activityId, then: then ?? "completed" });
      setError(true);
    } finally { setBusy(false); }
  }

  async function unlink() {
    if (!canMutate || !execution || execution.status !== "linked" || busy) return;
    setBusy(true); setError(false);
    const operation = `unlink:${execution.executionId}`;
    try { setExecution(await unlinkSessionExecutionActivity(execution.executionId,
      mutationKey(operation))); mutationKeys.current.delete(operation); onChanged(); }
    catch (cause) { logClientError("TrainingExecutionPanel.unlink", cause, { executionId: execution.executionId }); setError(true); } finally { setBusy(false); }
  }

  const exactLink = execution?.status === "linked" && execution.matchConfidence !== "probable";
  const probableLink = execution?.status === "linked" && execution.matchConfidence === "probable";
  const presentationState = error ? "error" : !execution ? "executable" : execution.outcomeStatus !== "pending" ? "completed"
    : execution.status === "reserved" ? "reserved" : execution.status === "started" ? "in-progress"
      : probableLink ? "probable" : "link";
  return <article className="training-execution-session" data-execution-state={presentationState}>
    <Text as="h4" variant="label">{t(`decision.workout.${session.current.workout}`, { defaultValue: session.current.workout })}</Text>
    <Text as="p" variant="caption" tone={presentationState === "error" ? "warning" : "secondary"}
      role="status" aria-live="polite" aria-atomic="true">{t(`decision.execution.presentation.${presentationState}`)}</Text>
    {!execution && decision.capabilities.execution.reserve === "available" && decision.capabilities.execution.start === "available"
      && <Button size="sm" variant="primary" loading={busy} onClick={() => void start()}>{busy ? t("decision.execution.starting") : t("decision.execution.start")}</Button>}
    {execution && <>
      <Text as="p" variant="caption" tone="secondary">{t(`decision.execution.state.${execution.status}`)} · {t(`decision.execution.outcome.${execution.outcomeStatus}`)}</Text>
      {execution.status === "reserved" && decision.capabilities.execution.start === "available"
        && <Button size="sm" variant="primary" loading={busy} onClick={() => void start()}>{busy ? t("decision.execution.starting") : t("decision.execution.start")}</Button>}
      {decision.capabilities.execution.link === "available" && execution.status === "started" && execution.outcomeStatus === "pending"
        && <Button size="sm" variant="outline" aria-expanded={manual} aria-controls={manualPanelId}
          onClick={() => setManual((value) => !value)}>{t("decision.execution.manualLink")}</Button>}
      {/* 추정 매칭 확인 동선 — 확인하면 완료 권한이 열리고, 아니면 해제해서 건너뛰기·연기로 빠져나간다. */}
      {probableLink && execution.outcomeStatus === "pending" && decision.capabilities.execution.link === "available"
        && <div className="training-execution-actions__row" data-probable-confirm="true">
          <Text as="p" variant="caption" tone="secondary">{t("decision.execution.probablePrompt")}</Text>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void confirmProbable()}>{t("decision.execution.confirmMatch")}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void confirmProbable("partial")}>{t("decision.execution.confirmPartial")}</Button>
        </div>}
      {decision.capabilities.execution.unlink === "available" && execution.status === "linked"
        && (execution.matchMethod === "manual" || probableLink)
        && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unlink()}>
          {t(probableLink ? "decision.execution.rejectMatch" : "decision.execution.unlink")}</Button>}
      {manual && <div id={manualPanelId} className="training-execution-actions__manual">
        <label><Text as="span" variant="caption" tone="secondary">{t("decision.execution.activityPicker")}</Text>
          <select value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.target.value)} disabled={activitiesLoading}>
            <option value="">{activitiesLoading ? t("decision.execution.activityLoading") : t("decision.execution.activitySelect")}</option>
            {activityChoices.map((activity) => <option key={activity.id} value={activity.id}>
              {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.startTime))}
              {` · ${t(`discipline.${getDiscipline(activity.type)}`)}`}
            </option>)}
          </select>
        </label>
        {!activitiesLoading && activityChoices.length === 0 && <Text as="p" variant="caption" tone="secondary">{t("decision.execution.noActivities")}</Text>}
        <Button size="sm" disabled={busy || !selectedActivity} onClick={() => void link()}>{t("decision.execution.link")}</Button>
      </div>}
      {decision.capabilities.execution.outcome === "available" && execution.outcomeStatus === "pending"
        && (exactLink || execution.status === "started") && <div className="training-execution-actions__row">
        {exactLink && <><Button size="sm" variant="primary" onClick={() => void outcome("completed")}>{t("decision.execution.complete")}</Button>
          <Button size="sm" variant="outline" onClick={() => void outcome("partial")}>{t("decision.execution.partial")}</Button></>}
        {!exactLink && <><Button size="sm" variant="ghost" onClick={() => void outcome("skipped")}>{t("decision.execution.skip")}</Button>
          <label><Text as="span" variant="caption" tone="secondary">{t("decision.execution.postponeDate")}</Text>
            <Input type="date" value={postponedTo} onChange={(event) => setPostponedTo(event.target.value)} />
          </label>
          <Button size="sm" variant="ghost" disabled={!postponedTo} onClick={() => void outcome("postponed")}>{t("decision.execution.postpone")}</Button></>}
      </div>}
    </>}
    {error && <Alert variant="warning" title={t("decision.execution.error")} />}
  </article>;
}

function TrainingExecutionPanelBody({ decision, sessions, onChanged }: { decision: TodayTrainingDecisionProjection;
  sessions: TrainingDecisionSession[]; onChanged: () => void }) {
  const { t } = useTranslation("training");
  const [executions, setExecutions] = useState<SessionExecutionLink[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listKey, setListKey] = useState(0);
  const executionTupleKey = [decision.projectionId, decision.planSource?.planRevision,
    decision.sourceRefs.prescriptionId, decision.prescription.validFrom, decision.sourceRefs.proposalId,
    decision.sourceRefs.receiptAuditId].join(":");

  useEffect(() => {
    let active = true;
    setListState("loading");
    void listSessionExecutions(decision.targetDiscipline).then((items) => {
      if (!active) return;
      setExecutions(items);
      setListState("ready");
    }).catch((cause) => {
      if (!active) return;
      logClientError("TrainingExecutionPanel.list", cause, { discipline: decision.targetDiscipline });
      setListState("error");
    });
    return () => { active = false; };
  }, [decision.targetDiscipline, executionTupleKey, listKey]);

  return <section className="training-execution-panel" aria-labelledby="training-execution-title"
    data-execution-state={listState}>
    <Text id="training-execution-title" as="h3" variant="subtitle">{t("decision.execution.title")}</Text>
    {listState === "loading" && <Text as="p" variant="caption" tone="secondary" role="status" aria-live="polite">{t("decision.execution.loading")}</Text>}
    {listState === "error" && <Alert variant="warning" title={t("decision.execution.listError")}>
      <Button size="sm" variant="outline" onClick={() => setListKey((value) => value + 1)}>{t("decision.refresh")}</Button>
    </Alert>}
    {listState === "ready" && sessions.map((session) => <ExecutionSession key={`${executionTupleKey}:${session.sessionId}`} decision={decision} session={session}
      initialExecution={executions.find((item) => item.scheduledSessionId === session.scheduledSessionId
        && item.scheduledSessionRevision === session.scheduledSessionRevision && item.status !== "invalidated"
        && item.discipline === decision.targetDiscipline && item.dayRef.goalId === session.dayRef.goalId
        && item.dayRef.weekId === session.dayRef.weekId && item.dayRef.dayIndex === session.dayRef.dayIndex
        && item.dayRef.localDate === session.dayRef.localDate && item.planRevision === decision.planSource?.planRevision
        && item.projectionId === decision.projectionId
        && item.prescriptionId === decision.sourceRefs.prescriptionId
        && item.prescriptionValidFrom === decision.prescription.validFrom
        && item.proposalId === decision.sourceRefs.proposalId
        && item.receiptAuditId === decision.sourceRefs.receiptAuditId) ?? null}
      onChanged={onChanged} />)}
  </section>;
}

export function TrainingExecutionPanel({ decision, sessions, onChanged }: { decision: TodayTrainingDecisionProjection;
  sessions: TrainingDecisionSession[]; onChanged: () => void }) {
  const executableSessions = sessions.filter((session) => session.status === "scheduled" && !session.current.completed);
  if (getRuntimeConfig().trainingExecutionEnabled !== true || decision.capabilities.execution.status !== "available"
      || decision.healthGate.state !== "clear" || !decision.planSource || executableSessions.length === 0) return null;
  return <TrainingExecutionPanelBody decision={decision} sessions={executableSessions} onChanged={onChanged} />;
}
