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

export interface PartialRetry { executionId: string; operation: string }

/** 재시도는 같은 실행에서만 유효하다 — 실행이 사라지거나 다른 실행으로 바뀌면 폐기한다. */
export function keepPartialRetry(current: PartialRetry | null,
  next: Pick<SessionExecutionLink, "executionId"> | null): PartialRetry | null {
  return current && next && current.executionId === next.executionId ? current : null;
}

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
  const [partialRetry, setPartialRetry] = useState<PartialRetry | null>(null);
  const reserveKey = useRef(crypto.randomUUID());
  const startKey = useRef(crypto.randomUUID());
  const mutationKeys = useRef(new Map<string, string>());
  const manualPanelId = `training-execution-manual-${session.sessionId}`;
  // 패널 자체가 healthGate clear 가 아니면 렌더되지 않는다(하단 TrainingExecutionPanel 가드).
  // 즉 여기서 canMutate 는 항상 true 이고, 아래 mutation 함수의 방어 조건으로만 쓴다.
  // 렌더 조건에는 넣지 않는다 — 잘못된 연결을 거부·해제하는 교정 동선까지 함께 숨어버린다.
  const canMutate = decision.healthGate.state === "clear";
  const probableLink = execution?.status === "linked" && execution.matchConfidence === "probable";
  const probablePending = probableLink && execution?.outcomeStatus === "pending";
  // 추정 매칭 확인도 활동 목록이 필요하다 — 저장된 revision 은 재처리로 낡을 수 있어 현재 값을 쓴다.
  const { activities: ownerActivities, loading: activitiesLoading } = useActivities("self", [], {
    enabled: canMutate && ((manual && execution?.status === "started") || probablePending === true),
  });
  const activityChoices = ownerActivities.filter((activity) => getDiscipline(activity.type) === decision.targetDiscipline
    && revisionOf(activity) !== null);
  const selectedActivity = activityChoices.find((activity) => activity.id === selectedActivityId) ?? null;
  const matchedActivity = execution?.activityId
    ? ownerActivities.find((activity) => activity.id === execution.activityId) ?? null : null;
  // 자동 매칭 당시의 revision 은 활동 재처리로 낡을 수 있다(백엔드가 stale 을 거부) — 현재 값을 우선한다.
  // 둘 다 없으면(legacy 매칭 등) 확인 자체가 불가능하므로 버튼을 잠그고 사유를 밝힌다.
  const confirmRevision = (matchedActivity ? revisionOf(matchedActivity) : null) ?? execution?.activityRevision ?? null;
  const mutationKey = (operation: string) => {
    const existing = mutationKeys.current.get(operation);
    if (existing) return existing;
    const created = crypto.randomUUID();
    mutationKeys.current.set(operation, created);
    return created;
  };

  // invalidated 는 닫힌 실행이다 — 붙들고 있으면 시작도 결과 기록도 못 하므로 없는 것으로 다룬다.
  useEffect(() => {
    const next = initialExecution?.status === "invalidated" ? null : initialExecution;
    // 다른 탭의 해제나 서버측 무효화로 들어온 경우에도 멱등키를 회전한다 — 그대로 두면 재시작이
    // 같은 executionId(hash(uid, idempotencyKey))를 되짚어 무효화된 실행으로 돌아간다.
    if (initialExecution?.status === "invalidated") {
      reserveKey.current = crypto.randomUUID(); startKey.current = crypto.randomUUID();
    }
    setExecution(next);
    // 같은 실행이 갱신돼 돌아온 것뿐이면 재시도 정보를 지우지 않는다. partial 실패 직후 부모 재조회가
    // 도착하면서 재시도 버튼이 사라지면, 서버의 completed 를 되돌릴 경로가 없어진다.
    setPartialRetry((current) => keepPartialRetry(current, next));
  }, [initialExecution]);

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
    const revision = confirmRevision;
    if (!canMutate || !execution || busy || activitiesLoading || execution.status !== "linked"
      || execution.matchConfidence !== "probable" || !execution.activityId || !revision) return;
    setBusy(true); setError(false);
    // 링크 키에는 then 을 넣지 않는다 — 두 확인 버튼이 만드는 링크 요청은 서버 입장에서 동일하다.
    // 키가 갈리면 응답 유실 후 다른 버튼을 눌렀을 때 dedup 이 깨져 링크가 재실행된다.
    const operation = `confirm:${execution.executionId}:${execution.activityId}:${revision}`;
    try {
      const confirmed = await linkSessionExecutionActivity(execution.executionId, execution.activityId,
        revision, mutationKey(operation));
      mutationKeys.current.delete(operation);
      // 링크는 이미 서버에 기록됐다 — 뒤따르는 outcome 이 실패해도 확정된 상태를 먼저 반영한다.
      // 다만 부모 재조회(onChanged)는 결합 작업이 끝난 뒤 한 번만 — 두 번 부르면 늦게 도착한
      // completed 스냅샷이 partial 을 덮어쓸 수 있다.
      setExecution(confirmed);
      if (then === "partial") await recordPartial(confirmed.executionId, operation);
    } catch (cause) {
      logClientError("TrainingExecutionPanel.confirmProbable", cause,
        { executionId: execution.executionId, activityId: execution.activityId, then: then ?? "completed" });
      setError(true);
    } finally { setBusy(false); onChanged(); }
  }

  /**
   * 확인 링크는 서버에서 즉시 completed 로 기록된다. 뒤따르는 partial 이 실패하면 사용자의 "부분 완료"
   * 의도가 completed 로 굳어버리므로, 실패를 기억해 재시도 버튼을 남긴다(멱등키도 그대로 유지).
   */
  async function recordPartial(executionId: string, operation: string) {
    const outcomeOperation = `${operation}:outcome:partial`;
    try {
      const next = await setSessionExecutionOutcome(executionId, "partial", mutationKey(outcomeOperation));
      mutationKeys.current.delete(outcomeOperation);
      setExecution(next); setPartialRetry(null);
    } catch (cause) {
      setPartialRetry({ executionId, operation });
      throw cause;
    }
  }

  async function retryPartial() {
    if (!canMutate || !partialRetry || busy) return;
    setBusy(true); setError(false);
    try { await recordPartial(partialRetry.executionId, partialRetry.operation); }
    catch (cause) {
      logClientError("TrainingExecutionPanel.retryPartial", cause, { executionId: partialRetry.executionId });
      setError(true);
    } finally { setBusy(false); onChanged(); }
  }

  async function unlink() {
    if (!canMutate || !execution || execution.status !== "linked" || busy) return;
    setBusy(true); setError(false);
    const operation = `unlink:${execution.executionId}`;
    try {
      const next = await unlinkSessionExecutionActivity(execution.executionId, mutationKey(operation));
      mutationKeys.current.delete(operation);
      // 해제된 실행은 서버에서 invalidated 로 닫힌다. 그 상태로 붙들고 있으면 시작도 결과 기록도 못 하는
      // 또 다른 교착이 되므로, 실행 없음으로 되돌리고 새 예약을 만들 수 있게 키를 갱신한다.
      if (next.status === "invalidated") {
        reserveKey.current = crypto.randomUUID(); startKey.current = crypto.randomUUID();
        setExecution(null);
      } else setExecution(next);
      setPartialRetry(null);
      onChanged();
    }
    catch (cause) { logClientError("TrainingExecutionPanel.unlink", cause, { executionId: execution.executionId }); setError(true); } finally { setBusy(false); }
  }

  const exactLink = execution?.status === "linked" && execution.matchConfidence !== "probable";
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
          {confirmRevision === null && !activitiesLoading && <Text as="p" variant="caption" tone="warning">
            {t("decision.execution.probableRevisionMissing")}</Text>}
          <Button size="sm" variant="primary" loading={busy} disabled={activitiesLoading || confirmRevision === null}
            onClick={() => void confirmProbable()}>{t("decision.execution.confirmMatch")}</Button>
          {/* 부분 완료는 outcome 호출까지 필요하다 — 그 권한이 없으면 반쯤 적용된 상태로 끝난다. */}
          {decision.capabilities.execution.outcome === "available"
            && <Button size="sm" variant="outline" disabled={busy || activitiesLoading || confirmRevision === null}
              onClick={() => void confirmProbable("partial")}>{t("decision.execution.confirmPartial")}</Button>}
        </div>}
      {/* 부분 완료가 중간에 끊긴 경우 — 서버는 completed 로 남아 있으므로 되돌릴 경로를 남긴다. */}
      {partialRetry?.executionId === execution.executionId
        && decision.capabilities.execution.outcome === "available"
        && <Button size="sm" variant="outline" loading={busy} onClick={() => void retryPartial()}>
          {t("decision.execution.partialRetry")}</Button>}
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
  const sessionKey = (session: TrainingDecisionSession) => [decision.planSource?.planRevision,
    decision.targetDiscipline, session.status, session.scheduledSessionId, session.scheduledSessionRevision,
    session.dayRef.goalId, session.dayRef.weekId, session.dayRef.dayIndex, session.dayRef.localDate].join(":");
  const executionIdentityKey = sessions.map(sessionKey).join("|");

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
  }, [decision.targetDiscipline, executionIdentityKey, listKey]);

  return <section className="training-execution-panel" aria-labelledby="training-execution-title"
    data-execution-state={listState}>
    <Text id="training-execution-title" as="h3" variant="subtitle">{t("decision.execution.title")}</Text>
    {listState === "loading" && <Text as="p" variant="caption" tone="secondary" role="status" aria-live="polite">{t("decision.execution.loading")}</Text>}
    {listState === "error" && <Alert variant="warning" title={t("decision.execution.listError")}>
      <Button size="sm" variant="outline" onClick={() => setListKey((value) => value + 1)}>{t("decision.refresh")}</Button>
    </Alert>}
    {listState === "ready" && sessions.map((session) => <ExecutionSession key={sessionKey(session)} decision={decision} session={session}
      initialExecution={executions.find((item) => item.scheduledSessionId === session.scheduledSessionId
        && item.scheduledSessionRevision === session.scheduledSessionRevision && item.status !== "invalidated"
        && item.discipline === decision.targetDiscipline && item.dayRef.goalId === session.dayRef.goalId
        && item.dayRef.weekId === session.dayRef.weekId && item.dayRef.dayIndex === session.dayRef.dayIndex
        && item.dayRef.localDate === session.dayRef.localDate
        && item.planRevision === decision.planSource?.planRevision) ?? null}
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
