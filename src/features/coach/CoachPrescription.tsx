import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Chip, Text } from "../../theme/components";
import {
  confirmCoachProgressProposal, createCoachProgressProposal, getCoachProgressPlannerCapabilities,
  getCoachProgressProposalRecovery, isCoachClientError, rollbackCoachProgressProposal,
  submitCoachPrescriptionCheckIn,
} from "../../services/coachClient";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import type {
  CoachChangeProposal, CoachChangeReceipt, CoachProgressPlannerCapabilities, CoachProposalRecovery,
} from "../../services/coachProgressPlannerContract";
import type {
  CoachCheckInSignal, CoachPrescriptionCheckInRequest, CoachPrescriptionDTO, CoachPrescriptionEvidence,
  CoachReassessmentCondition,
} from "../../services/coachPrescriptionContract";

interface Props { initial: CoachPrescriptionDTO; parentRequestId: string; locale: string; onReanalyze: () => void;
  onQuestionSelect?: (question: string, prescriptionId: string, sourceRequestId: string) => void }
type Answers = CoachPrescriptionCheckInRequest["answers"];
type SubmitState = "idle" | "submitting" | "network_error" | "reanalyze" | "error";

const REANALYZE_CODES = new Set([
  "invalid_checkin_token", "invalid_checkin_signature",
  "invalid_or_expired_checkin_token", "checkin_parent_mismatch", "checkin_parent_not_found", "checkin_parent_invalid",
  "checkin_facts_mismatch", "checkin_revision_changed", "checkin_reanalysis_required", "checkin_request_mismatch",
]);

function date(value: string, locale: string, withTime = false): string {
  try {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    return new Intl.DateTimeFormat(locale, withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { weekday: "short", month: "short", day: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) })
      .format(new Date(dateOnly ? `${value}T00:00:00Z` : value));
  } catch { return value; }
}

function displayEvidence(item: CoachPrescriptionEvidence, locale: string): string {
  const value = typeof item.value === "string" || typeof item.value === "number" || typeof item.value === "boolean"
    ? String(item.value) : JSON.stringify(item.value);
  return `${item.field}: ${value} · ${date(item.asOf, locale, true)}`;
}

function Condition({ condition, evidenceById, locale }: { condition: CoachReassessmentCondition;
  evidenceById: Map<string, CoachPrescriptionEvidence>; locale: string }) {
  const { t } = useTranslation("coach");
  return <li><p>{t(`prescription.metric.${condition.metric}`)} {t(`prescription.operator.${condition.operator}`)} {condition.threshold.value}
    {condition.maxAgeHours ? ` · ${t("prescription.maxAge", { hours: condition.maxAgeHours })}` : ""}
    {` · ${condition.ruleId}`}</p>
  <details><summary>{t("prescription.evidence", { count: condition.evidenceIds.length })}</summary><ul>
    {condition.evidenceIds.map((evidenceId) => <li key={evidenceId} data-evidence-id={evidenceId}>
      {displayEvidence(evidenceById.get(evidenceId)!, locale)}</li>)}
  </ul></details></li>;
}

const STALE_CODES = new Set(["proposal_expired", "proposal_revision_changed", "proposal_weekly_checkin_changed",
  "consent_not_active", "proposal_source_terminal_invalid", "proposal_source_invalid", "proposal_nonce_invalid"]);

function errorState(error: unknown): "stale" | "disabled" | "conflict" | "error" {
  const code = isCoachClientError(error) ? error.code : "";
  if (STALE_CODES.has(code)) return "stale";
  if (code === "proposal_feature_disabled" || code === "proposal_confirm_feature_disabled") return "disabled";
  if (code === "rollback_conflict" || code === "confirm_request_mismatch") return "conflict";
  return "error";
}

type ProposalUiState = "idle" | "creating" | "review" | "confirming" | "applied" | "reverted" |
  "stale" | "disabled" | "conflict" | "error";
interface ProposalView { proposal: CoachChangeProposal | null; nonce: string | null; receipt: CoachChangeReceipt | null;
  rollbackRequestId: string | null; state: ProposalUiState }

function proposalViewFromRecovery(recovered: CoachProposalRecovery): ProposalView {
  const state: ProposalUiState = recovered.recoveryStatus === "not_found" ? "idle"
    : recovered.recoveryStatus === "pending" ? "review" : recovered.recoveryStatus === "applied" ? "applied"
      : recovered.recoveryStatus === "reverted" ? "reverted" : "stale";
  return { proposal: recovered.proposal, nonce: recovered.confirmNonce, receipt: recovered.receipt,
    rollbackRequestId: recovered.rollbackRequestId, state };
}

function ProposalReview({ prescription, locale, sourceRequestId, capabilities, onReanalyze, onQuestionSelect }: {
  prescription: CoachPrescriptionDTO; locale: string; sourceRequestId: string;
  capabilities: CoachProgressPlannerCapabilities; onReanalyze: Props["onReanalyze"];
  onQuestionSelect?: Props["onQuestionSelect"] }) {
  const { t } = useTranslation("coach");
  const eligible = prescription.nextDays.filter((item) => ["rest", "recovery", "modified_workout"].includes(item.action));
  const [selectedDates, setSelectedDates] = useState<string[]>(eligible.map((item) => item.localDate));
  const [view, setView] = useState<ProposalView>({ proposal: null, nonce: null, receipt: null,
    rollbackRequestId: null, state: "idle" });
  const { proposal, nonce, receipt, rollbackRequestId, state } = view;
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [confirmRetryable, setConfirmRetryable] = useState(false);
  const [rollbackRetryable, setRollbackRetryable] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const createRequestId = useRef<string | null>(null);
  const confirmRequestId = useRef<string | null>(null);
  const evidenceById = useMemo(() => new Map(proposal?.evidence.map((item) => [item.evidenceId, item]) ?? []), [proposal]);
  const busy = state === "creating" || state === "confirming";

  useEffect(() => {
    let active = true;
    void getCoachProgressProposalRecovery(prescription.prescriptionId, sourceRequestId).then((result) => {
      if (!active) return;
      if (result.status === "error") {
        setRecoveryFailed(true);
        setView((current) => ({ ...current, state: result.error.code === "proposal_recovery_revision_invalid" ? "stale" : "error" }));
        return;
      }
      setView(proposalViewFromRecovery(result.data));
    }).catch((error) => { if (active) { setRecoveryFailed(true); setView((current) => ({ ...current, state: errorState(error) })); } })
      .finally(() => { if (active) setRecovering(false); });
    return () => { active = false; };
  }, [prescription.prescriptionId, sourceRequestId]);

  async function hydrateRecovery(): Promise<boolean> {
    const result = await getCoachProgressProposalRecovery(prescription.prescriptionId, sourceRequestId);
    if (result.status === "error") {
      setView((current) => ({ ...current, state: result.error.code === "proposal_recovery_revision_invalid" ? "stale" : "error" }));
      return false;
    }
    setView(proposalViewFromRecovery(result.data));
    setConfirmArmed(false); setConfirmRetryable(false); setRollbackRetryable(false);
    return true;
  }

  async function createProposal() {
    if (!capabilities.progressPlanner.proposal.enabled || selectedDates.length === 0 || busy || recovering || recoveryFailed) return;
    setView((current) => ({ ...current, state: "creating" })); setConfirmArmed(false); setConfirmRetryable(false);
    try {
      createRequestId.current ??= crypto.randomUUID();
      const result = await createCoachProgressProposal({ requestId: createRequestId.current,
        checkInRequestId: sourceRequestId, localDates: selectedDates });
      if (result.status === "error") { setView((current) => ({ ...current,
        state: result.error.code.includes("disabled") ? "disabled" : "stale" })); return; }
      await hydrateRecovery();
    } catch (error) { setView((current) => ({ ...current, state: errorState(error) })); }
  }

  async function refreshProposal() {
    if (busy) return;
    try {
      await hydrateRecovery();
    } catch (error) { setView((current) => ({ ...current, state: errorState(error) })); }
  }

  async function confirmProposal() {
    if (!proposal || !nonce || !capabilities.progressPlanner.confirm.enabled || busy) return;
    if (!confirmArmed) { setConfirmArmed(true); return; }
    setView((current) => ({ ...current, state: "confirming" }));
    try {
      confirmRequestId.current ??= crypto.randomUUID();
      const result = await confirmCoachProgressProposal(proposal.proposalId,
        { requestId: confirmRequestId.current, nonce });
      if (result.status === "error") { setView((current) => ({ ...current,
        state: result.error.code.includes("disabled") ? "disabled" : "stale" })); return; }
      await hydrateRecovery();
    } catch (error) {
      const nextState = errorState(error);
      setConfirmRetryable(nextState === "error");
      setView((current) => ({ ...current, state: nextState }));
    }
  }

  async function rollbackProposal() {
    if (!proposal || !rollbackRequestId || (state !== "applied" && !rollbackRetryable) || busy) return;
    setView((current) => ({ ...current, state: "confirming" }));
    try {
      const result = await rollbackCoachProgressProposal(proposal.proposalId, { requestId: rollbackRequestId });
      if (result.status === "error") { setView((current) => ({ ...current, state: "conflict" })); return; }
      await hydrateRecovery();
    } catch (error) {
      const nextState = errorState(error);
      setRollbackRetryable(nextState === "error"); setView((current) => ({ ...current, state: nextState }));
    }
  }

  return <section className="coach-progress-review" aria-labelledby={`proposal-review-${prescription.prescriptionId}`}>
    <div className="coach-progress-review__heading"><div>
      <Text id={`proposal-review-${prescription.prescriptionId}`} as="h4" variant="subtitle">{t("progress.review.title")}</Text>
      <Text as="p" variant="bodySmall" tone="secondary">{t("progress.review.body")}</Text>
    </div><Chip variant="accent">{t("progress.origin.aiCoach")}</Chip></div>
    <Text as="p" variant="caption" tone="secondary">{t("progress.origin.separate")}</Text>
    {!proposal && !recovering && eligible.length > 0 && <fieldset disabled={!capabilities.progressPlanner.proposal.enabled || busy || recoveryFailed}>
      <legend>{t("progress.review.selectDates")}</legend>
      <div className="coach-progress-review__dates">{eligible.map((item) => <label key={item.localDate}>
        <input type="checkbox" checked={selectedDates.includes(item.localDate)} onChange={(event) => {
          createRequestId.current = null;
          setSelectedDates((current) => event.target.checked ? [...current, item.localDate]
            : current.filter((dateValue) => dateValue !== item.localDate));
        }} /><time dateTime={item.localDate}>{date(item.localDate, locale)}</time>
      </label>)}</div>
      <Button type="button" variant="outline" disabled={selectedDates.length === 0 || !capabilities.progressPlanner.proposal.enabled || recovering || recoveryFailed}
        onClick={() => void createProposal()}>{state === "creating" ? t("progress.review.creating") : t("progress.review.create")}</Button>
      {!capabilities.progressPlanner.proposal.enabled && <Text as="p" variant="caption" tone="warning">{t("progress.states.proposalDisabled")}</Text>}
    </fieldset>}
    {proposal && <div className="coach-progress-review__changes" aria-live="polite">
      {proposal.changes.map((change) => <article key={`${change.weekId}-${change.dayIndex}`} className="coach-progress-review__change">
        <Text as="h5" variant="label"><time dateTime={change.localDate}>{date(change.localDate, locale)}</time></Text>
        <div className="coach-progress-review__before-after">
          <div><Text as="strong" variant="caption">{t("progress.review.before")}</Text><span>{t(`prescription.workout.${change.before.workout.kind}`)}</span>
            <span>{t("prescription.duration", { minutes: change.before.workout.durationMin })}</span><span>{t("prescription.targetTss", { value: change.before.workout.targetTss })}</span></div>
          <div><Text as="strong" variant="caption">{t("progress.review.after")}</Text><span>{t(`prescription.workout.${change.workout.kind}`)}</span>
            <span>{t("prescription.duration", { minutes: change.workout.durationMin })}</span>
            {change.workout.targetTss !== undefined && <span>{t("prescription.targetTss", { value: change.workout.targetTss })}</span>}</div>
        </div>
        <Text as="p" variant="caption">{t("progress.review.reasons")}: {change.reasonCodes.map((code) => t(`progress.reason.${code}`, { defaultValue: code })).join(", ")}</Text>
        <details><summary>{t("prescription.evidence", { count: change.evidenceIds.length })}</summary><ul>
          {change.evidenceIds.map((evidenceId) => <li key={evidenceId}>{evidenceById.has(evidenceId)
            ? displayEvidence(evidenceById.get(evidenceId)!, locale) : evidenceId}</li>)}</ul></details>
      </article>)}
      <div className="coach-progress-review__actions">
        <Button type="button" variant="outline" onClick={() => void refreshProposal()}>{t("progress.review.refresh")}</Button>
        {state === "review" && <Button type="button" variant={confirmArmed ? "primary" : "secondary"}
          disabled={!capabilities.progressPlanner.confirm.enabled || !nonce} onClick={() => void confirmProposal()}>
          {confirmArmed ? t("progress.confirm.final") : t("progress.confirm.review")}</Button>}
        {state === "error" && confirmRetryable && <Button type="button" variant="outline"
          onClick={() => void confirmProposal()}>{t("progress.states.retryConfirm")}</Button>}
        {state === "error" && rollbackRetryable && <Button type="button" variant="outline"
          onClick={() => void rollbackProposal()}>{t("progress.states.retryRollback")}</Button>}
        {state === "applied" && <Button type="button" variant="outline" disabled={!rollbackRequestId}
          onClick={() => void rollbackProposal()}>{t("progress.rollback.action")}</Button>}
      </div>
      {!capabilities.progressPlanner.confirm.enabled && state === "review" && <Alert variant="warning" title={t("progress.states.confirmDisabled")} />}
      {capabilities.progressPlanner.confirm.enabled && state === "review" && !nonce
        && <Alert variant="warning" title={t("progress.states.confirmRecoveryUnavailable")} />}
      {confirmArmed && <Alert variant="warning" title={t("progress.confirm.title")}>{t("progress.confirm.body")}</Alert>}
    </div>}
    {state === "applied" && receipt && <Alert variant="success" title={t("progress.states.applied")}>{t("progress.states.receipt", { id: receipt.auditId })}</Alert>}
    {state === "reverted" && receipt && <Alert variant="success" title={t("progress.states.reverted")}>{t("progress.states.receipt", { id: receipt.auditId })}</Alert>}
    {["stale", "disabled", "conflict", "error"].includes(state) && <Alert variant="warning" title={t(`progress.states.${state}`)}>
      {state === "stale" ? <Button type="button" variant="outline" onClick={onReanalyze}>
        {t("progress.states.reanalyze")}</Button> : null}</Alert>}
    <div className="coach-progress-review__questions" aria-label={t("progress.questions.label")}>{[
      t("progress.questions.priority"), t("progress.questions.changed"),
    ].map((question) => <Button key={question} type="button" variant="ghost"
      onClick={() => onQuestionSelect?.(question, prescription.prescriptionId, sourceRequestId)}>{question}</Button>)}</div>
    <Text as="p" variant="caption" tone="tertiary">{t("progress.review.noCharge")}</Text>
  </section>;
}

function PrescriptionDetails({ prescription, locale, sourceRequestId, capabilities, onReanalyze, onQuestionSelect }: {
  prescription: CoachPrescriptionDTO; locale: string; sourceRequestId: string;
  capabilities: CoachProgressPlannerCapabilities | null; onReanalyze: Props["onReanalyze"];
  onQuestionSelect?: Props["onQuestionSelect"] }) {
  const { t } = useTranslation("coach");
  const evidenceById = useMemo(() => new Map(prescription.evidence.map((item) => [item.evidenceId, item])), [prescription.evidence]);
  return <section className="coach-prescription" aria-labelledby={`prescription-${prescription.prescriptionId}`}>
    <header className="coach-prescription__header">
      <Text id={`prescription-${prescription.prescriptionId}`} as="h3" variant="subtitle">{t("prescription.title")}</Text>
      <p>{t("prescription.validUntil", { at: date(prescription.validUntil, locale, true) })}</p>
    </header>
    <p className="coach-prescription__proposal">{t("prescription.proposalNotice")}</p>
    <ol className="coach-prescription__days">
      {prescription.nextDays.map((item) => <li key={item.localDate} className="coach-prescription__day">
        <div className="coach-prescription__day-title"><time dateTime={item.localDate}>{date(item.localDate, locale)}</time>
          <strong>{t(`prescription.action.${item.action}`)}</strong></div>
        {item.workout && <p className="coach-prescription__workout">
          <span>{t(`prescription.workout.${item.workout.kind}`)}</span>
          <span>{t("prescription.duration", { minutes: item.workout.durationMin })}</span>
          {item.workout.zone && <span>{item.workout.zone}</span>}
          {item.workout.targetTss !== undefined && <span>{t("prescription.targetTss", { value: item.workout.targetTss })}</span>}
        </p>}
        {item.reassessBefore?.length ? <div><p>{t("prescription.reassessTitle")}</p><ul>
          {item.reassessBefore.map((condition) => <Condition key={condition.ruleId} condition={condition}
            evidenceById={evidenceById} locale={locale} />)}
        </ul></div> : null}
        <details><summary>{t("prescription.evidence", { count: item.evidenceIds.length })}</summary><ul>
          {item.evidenceIds.map((evidenceId) => <li key={evidenceId} data-evidence-id={evidenceId}>{displayEvidence(evidenceById.get(evidenceId)!, locale)}</li>)}
        </ul></details>
      </li>)}
    </ol>
    {prescription.nextWeekLoad && <section className="coach-prescription__week" aria-labelledby={`week-${prescription.prescriptionId}`}>
      <Text id={`week-${prescription.prescriptionId}`} as="h4" variant="subtitle">{t("prescription.weekTitle")}</Text>
      <p className="coach-prescription__week-value">{prescription.nextWeekLoad.minTss}–{prescription.nextWeekLoad.maxTss} TSS</p>
      <details><summary>{t("prescription.evidence", { count: prescription.nextWeekLoad.evidenceIds.length })}</summary><ul>
        {prescription.nextWeekLoad.evidenceIds.map((evidenceId) => <li key={evidenceId} data-evidence-id={evidenceId}>{displayEvidence(evidenceById.get(evidenceId)!, locale)}</li>)}
      </ul></details>
    </section>}
    <dl className="coach-prescription__meta">
      <div><dt>{t("prescription.confidenceLabel")}</dt><dd>{t(`prescription.confidence.${prescription.confidence}`)}</dd></div>
      <div><dt>{t("prescription.dataAsOf")}</dt><dd>{date(prescription.validFrom, locale, true)}</dd></div>
      <div><dt>{t("prescription.factsId")}</dt><dd>{prescription.factsId}</dd></div>
      <div><dt>{t("prescription.planRevision")}</dt><dd>{prescription.planRevision ?? t("prescription.none")}</dd></div>
      <div><dt>{t("prescription.rulesVersion")}</dt><dd>{prescription.rulesVersion}</dd></div>
    </dl>
    {capabilities?.progressPlanner.read.enabled && <ProposalReview prescription={prescription} locale={locale}
      sourceRequestId={sourceRequestId} capabilities={capabilities} onReanalyze={onReanalyze}
      onQuestionSelect={onQuestionSelect} />}
  </section>;
}

function Signal({ signal, answers, onChange }: { signal: CoachCheckInSignal; answers: Answers; onChange: (answers: Answers) => void }) {
  const { t } = useTranslation("coach");
  const options = signal === "subjective_fatigue" ? [["normal", "normal"], ["tired", "tired"]] as const
    : signal === "soreness" ? [["none", "none"], ["present", "present"]] as const
      : [["false", "none"], ["true", "present"]] as const;
  const selected = signal === "subjective_fatigue" ? answers.subjectiveFatigue
    : signal === "soreness" ? answers.soreness : answers.painOrIllness === undefined ? undefined : String(answers.painOrIllness);
  return <fieldset className="coach-checkin__signal"><legend>{t(`prescription.signal.${signal}`)}</legend>
    <div>{options.map(([value, label]) => <label key={value}><input type="radio" name={`coach-checkin-${signal}`} value={value}
      checked={selected === value} onChange={() => onChange(signal === "subjective_fatigue" ? { ...answers, subjectiveFatigue: value as "normal" | "tired" }
        : signal === "soreness" ? { ...answers, soreness: value as "none" | "present" }
          : { ...answers, painOrIllness: value === "true" })} />{t(`prescription.option.${signal}.${label}`)}</label>)}</div>
  </fieldset>;
}

export function CoachPrescription({ initial, parentRequestId, locale, onReanalyze, onQuestionSelect }: Props) {
  const { t } = useTranslation("coach");
  const [prescription, setPrescription] = useState(initial);
  const [answers, setAnswers] = useState<Answers>({});
  const [state, setState] = useState<SubmitState>("idle");
  const [sourceRequestId, setSourceRequestId] = useState(parentRequestId);
  const [capabilities, setCapabilities] = useState<CoachProgressPlannerCapabilities | null>(null);
  const [capabilityFailed, setCapabilityFailed] = useState(false);
  const requestRef = useRef<CoachPrescriptionCheckInRequest | null>(null);
  const inFlightRef = useRef(false);
  const required = prescription.requiredSignals ?? [];
  const complete = required.every((signal) => signal === "subjective_fatigue" ? answers.subjectiveFatigue !== undefined
    : signal === "soreness" ? answers.soreness !== undefined : answers.painOrIllness !== undefined);
  const locallyEnabled = getRuntimeConfig().coachProgressPlannerEnabled === true;
  const checkInEnabled = !locallyEnabled || capabilities?.prescription.checkIn.enabled === true;

  useEffect(() => {
    let active = true;
    if (!locallyEnabled) return () => { active = false; };
    void getCoachProgressPlannerCapabilities().then((value) => { if (active) setCapabilities(value); })
      .catch(() => { if (active) setCapabilityFailed(true); });
    return () => { active = false; };
  }, [locallyEnabled]);

  async function submit(retry = false) {
    if (inFlightRef.current || prescription.status !== "needs_checkin" || !prescription.checkInToken || !complete) return;
    const request = retry && requestRef.current ? requestRef.current : {
      requestId: crypto.randomUUID(), parentRequestId, checkInToken: prescription.checkInToken, answers,
    };
    requestRef.current = request; inFlightRef.current = true; setState("submitting");
    try {
      const result = await submitCoachPrescriptionCheckIn(request);
      if (result.status === "ok") { setPrescription(result.prescription); setSourceRequestId(request.requestId); setState("idle"); }
      else setState(REANALYZE_CODES.has(result.error.code) ? "reanalyze" : result.error.retryable ? "network_error" : "error");
    } catch (error) {
      if (isCoachClientError(error) && error.kind === "http" && REANALYZE_CODES.has(error.code)) setState("reanalyze");
      else setState(isCoachClientError(error) && (error.kind === "transport" || error.kind === "http") ? "network_error" : "error");
    } finally { inFlightRef.current = false; }
  }

  if (prescription.status === "ready") return <>
    <PrescriptionDetails prescription={prescription} locale={locale} sourceRequestId={sourceRequestId}
      capabilities={capabilities} onReanalyze={onReanalyze} onQuestionSelect={onQuestionSelect} />
    {locallyEnabled && capabilityFailed && <Alert variant="warning" title={t("progress.states.unavailable")} />}
  </>;
  if (prescription.status === "safety_blocked") return <section className="coach-prescription coach-prescription--safety" role="alert">
    <Text as="h3" variant="subtitle">{t("prescription.safety.title")}</Text><p>{t("prescription.safety.body")}</p>
  </section>;
  if (prescription.status === "insufficient_data") return <section className="coach-prescription" role="status">
    <Text as="h3" variant="subtitle">{t("prescription.insufficient.title")}</Text><p>{t("prescription.insufficient.body")}</p>
    {prescription.missingSignals.length > 0 && <ul>{prescription.missingSignals.map((item) => <li key={item}>{item}</li>)}</ul>}
    <Button variant="outline" onClick={onReanalyze}>{t("prescription.existingPlan")}</Button>
  </section>;
  return <section className="coach-prescription coach-checkin" aria-labelledby={`checkin-${prescription.prescriptionId}`}>
    <Text id={`checkin-${prescription.prescriptionId}`} as="h3" variant="subtitle">{t("prescription.checkin.title")}</Text>
    <p>{t("prescription.checkin.body")}</p>
    {required.map((signal) => <Signal key={signal} signal={signal} answers={answers} onChange={(next) => {
      setAnswers(next); requestRef.current = null; setState("idle");
    }} />)}
    <Button disabled={!complete || state === "submitting" || !checkInEnabled} onClick={() => void submit()}>{state === "submitting" ? t("prescription.checkin.submitting") : t("prescription.checkin.submit")}</Button>
    {capabilities?.prescription.checkIn.enabled === false && <Text as="p" variant="caption" tone="warning">{t("progress.states.proposalDisabled")}</Text>}
    {locallyEnabled && capabilityFailed && <Alert variant="warning" title={t("progress.states.unavailable")} />}
    {state === "network_error" && <div role="alert"><p>{t("prescription.checkin.networkError")}</p><Button variant="outline" onClick={() => void submit(true)}>{t("prescription.checkin.retry")}</Button></div>}
    {state === "reanalyze" && <div role="alert"><p>{t("prescription.checkin.reanalyze")}</p><Button variant="outline" onClick={onReanalyze}>{t("prescription.checkin.newAnalysis")}</Button></div>}
    {state === "error" && <p role="alert">{t("prescription.checkin.error")}</p>}
    <p className="coach-checkin__policy">{t("prescription.checkin.noCharge")}</p>
  </section>;
}
