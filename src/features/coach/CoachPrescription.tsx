import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "../../theme/components";
import { isCoachClientError, submitCoachPrescriptionCheckIn } from "../../services/coachClient";
import type {
  CoachCheckInSignal, CoachPrescriptionCheckInRequest, CoachPrescriptionDTO, CoachPrescriptionEvidence,
  CoachReassessmentCondition,
} from "../../services/coachPrescriptionContract";

interface Props { initial: CoachPrescriptionDTO; parentRequestId: string; locale: string; onReanalyze: () => void }
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

function PrescriptionDetails({ prescription, locale }: { prescription: CoachPrescriptionDTO; locale: string }) {
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

export function CoachPrescription({ initial, parentRequestId, locale, onReanalyze }: Props) {
  const { t } = useTranslation("coach");
  const [prescription, setPrescription] = useState(initial);
  const [answers, setAnswers] = useState<Answers>({});
  const [state, setState] = useState<SubmitState>("idle");
  const requestRef = useRef<CoachPrescriptionCheckInRequest | null>(null);
  const inFlightRef = useRef(false);
  const required = prescription.requiredSignals ?? [];
  const complete = required.every((signal) => signal === "subjective_fatigue" ? answers.subjectiveFatigue !== undefined
    : signal === "soreness" ? answers.soreness !== undefined : answers.painOrIllness !== undefined);

  async function submit(retry = false) {
    if (inFlightRef.current || prescription.status !== "needs_checkin" || !prescription.checkInToken || !complete) return;
    const request = retry && requestRef.current ? requestRef.current : {
      requestId: crypto.randomUUID(), parentRequestId, checkInToken: prescription.checkInToken, answers,
    };
    requestRef.current = request; inFlightRef.current = true; setState("submitting");
    try {
      const result = await submitCoachPrescriptionCheckIn(request);
      if (result.status === "ok") { setPrescription(result.prescription); setState("idle"); }
      else setState(REANALYZE_CODES.has(result.error.code) ? "reanalyze" : result.error.retryable ? "network_error" : "error");
    } catch (error) {
      if (isCoachClientError(error) && error.kind === "http" && REANALYZE_CODES.has(error.code)) setState("reanalyze");
      else setState(isCoachClientError(error) && (error.kind === "transport" || error.kind === "http") ? "network_error" : "error");
    } finally { inFlightRef.current = false; }
  }

  if (prescription.status === "ready") return <PrescriptionDetails prescription={prescription} locale={locale} />;
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
    <Button disabled={!complete || state === "submitting"} onClick={() => void submit()}>{state === "submitting" ? t("prescription.checkin.submitting") : t("prescription.checkin.submit")}</Button>
    {state === "network_error" && <div role="alert"><p>{t("prescription.checkin.networkError")}</p><Button variant="outline" onClick={() => void submit(true)}>{t("prescription.checkin.retry")}</Button></div>}
    {state === "reanalyze" && <div role="alert"><p>{t("prescription.checkin.reanalyze")}</p><Button variant="outline" onClick={onReanalyze}>{t("prescription.checkin.newAnalysis")}</Button></div>}
    {state === "error" && <p role="alert">{t("prescription.checkin.error")}</p>}
    <p className="coach-checkin__policy">{t("prescription.checkin.noCharge")}</p>
  </section>;
}
