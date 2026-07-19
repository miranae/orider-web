import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { Sparkles, X } from "lucide-react";
import { Button, Card, Chip, Text, Textarea } from "../../theme/components";
import { useDialog } from "../../contexts/DialogContext";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import {
  askCoachV2, CoachClientError, getCoachStatus, isCoachClientError, type CoachActionCode, type CoachDiscipline,
  type CoachQuota, type CoachResponse, type CoachRetryMode,
} from "../../services/coachClient";
import {
  COACH_P1_CAPABILITY_VERSION, COACH_V2_API_VERSION, COACH_V2_REQUEST_SCHEMA_VERSION,
  type CoachAnswerActionCode, type CoachEntityRef, type CoachV2QuestionRequest, type CoachV2Request, type CoachV2Response,
} from "../../services/coachV2Contract";
import { getCoachConsentPolicy, type CoachConsentPolicy } from "../../services/coachConsentClient";
import { FirstUseCoachConsent } from "./FirstUseCoachConsent";
import { subscribeCoachConsentSessionReset } from "./consentSessionBoundary";
import { coachAnalytics, trackCoachFeedback } from "./coachAnalytics";
import { CoachAnswerDocumentView } from "./CoachAnswerDocument";
import "./coach-question.css";

type QuestionSource = "suggestion_1" | "suggestion_2" | "free_text";
type Phase = "closed" | "loading_status" | "ready" | "submitting" | "complete" | "network_error" | "terminal_error" | "load_error";
type SubmitFailure = "compatibility" | "terminal" | null;

interface Props {
  user: User | null;
  discipline: CoachDiscipline;
  onSignIn: () => void;
}

const actionRoutes: Record<CoachActionCode, string> = {
  FOLLOW_EXISTING_PLAN: "/plan",
  REVIEW_RECOVERY_BEFORE_TRAINING: "/fitness",
  CHECK_MISSING_DATA: "/my",
  OPEN_PLAN: "/plan",
  NO_ACTIVE_GOAL: "/goal-setup",
};

const NO_RETRY_REASONS = new Set([
  "request_mismatch", "invalid_request", "unsupported_capability", "unsupported_capability_version", "token_cap_exceeded",
]);

export function retryActionFor(mode: CoachRetryMode, ...reasonCodes: string[]): "same" | "poll" | "replay" | "new" | "none" {
  if (reasonCodes.some((reasonCode) => NO_RETRY_REASONS.has(reasonCode))) return "none";
  if (mode === "same_request_resume") return "same";
  if (mode === "same_request_poll") return "poll";
  if (mode === "same_request_replay") return "replay";
  if (mode === "new_request_required") return "new";
  return "none";
}

function formatDate(value: string, locale: string, timezone?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(value));
  } catch { return value; }
}

function isConsentActive(policy: CoachConsentPolicy): boolean {
  return policy.consent.active && policy.consent.current && !policy.consent.revoked
    && policy.consent.currentPolicyVersion === policy.policyVersion
    && policy.consent.storedPolicyVersion === policy.policyVersion;
}

function clarificationQuestion(question: string, promptKey: string, optionId: string, locale: string): string {
  const ko = locale.startsWith("ko");
  if (promptKey === "coach.clarification.time_range" && ["this_week", "last_week"].includes(optionId)) {
    const period = optionId === "this_week" ? (ko ? "이번 주" : "this week") : (ko ? "지난주" : "last week");
    return ko ? `${question} 분석 기간은 ${period}로 해줘.` : `${question} Use ${period} as the analysis period.`;
  }
  if (promptKey === "coach.clarify.discipline" && ["bike", "run", "swim"].includes(optionId)) {
    const labels = ko ? { bike: "사이클", run: "러닝", swim: "수영" } : { bike: "cycling", run: "running", swim: "swimming" };
    return ko ? `${question} 종목은 ${labels[optionId as keyof typeof labels]}로 해줘.` : `${question} Use ${labels[optionId as keyof typeof labels]} as the discipline.`;
  }
  const safeOption = optionId.replace(/_/g, " ");
  return ko ? `${question} 추가 조건은 ${safeOption}(으)로 해줘.` : `${question} Use ${safeOption} as the additional condition.`;
}

export function CoachQuestionLauncher({ user, discipline, onSignIn }: Props) {
  const { t, i18n } = useTranslation("coach");
  const dialog = useDialog();
  const navigate = useLocalizedNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inFlightRef = useRef(false);
  const activeRequestRef = useRef<string | null>(null);
  const activeBodyRef = useRef<CoachV2Request | null>(null);
  const responseRef = useRef<CoachResponse | CoachV2Response | null>(null);
  const consentOpenRef = useRef(false);
  const phaseRef = useRef<Phase>("closed");
  const openGenerationRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("closed");
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<QuestionSource>("free_text");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [quota, setQuota] = useState<CoachQuota | null>(null);
  const [policy, setPolicy] = useState<CoachConsentPolicy | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [response, setResponse] = useState<CoachResponse | CoachV2Response | null>(null);
  const [clarificationOption, setClarificationOption] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [submitFailure, setSubmitFailure] = useState<SubmitFailure>(null);
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => { responseRef.current = response; }, [response]);
  useEffect(() => { consentOpenRef.current = consentOpen; }, [consentOpen]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const clearSession = useCallback(() => {
    inFlightRef.current = false;
    openGenerationRef.current += 1;
    sessionGenerationRef.current += 1;
    activeRequestRef.current = null;
    activeBodyRef.current = null;
    setDraft(""); setRequestId(null); setResponse(null); setClarificationOption(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null); setInputFocused(false);
    setConsentOpen(false); setPolicy(null); setQuota(null); setPhase("closed");
  }, []);

  useEffect(() => subscribeCoachConsentSessionReset(clearSession), [clearSession]);
  useEffect(() => clearSession(), [clearSession, discipline, user?.uid]);
  useEffect(() => () => {
    sessionGenerationRef.current += 1;
    inFlightRef.current = false;
    activeRequestRef.current = null;
  }, []);

  useEffect(() => {
    if (phase === "submitting") panelRef.current?.focus();
  }, [phase]);

  const open = phase !== "closed";
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const portalRoot = panel?.parentElement;
    const siblings = Array.from(document.body.children).filter((element) => element !== portalRoot).map((element) => ({
      element: element as HTMLElement, ariaHidden: element.getAttribute("aria-hidden"),
      inert: (element as HTMLElement & { inert?: boolean }).inert ?? false,
    }));
    siblings.forEach(({ element }) => { element.setAttribute("aria-hidden", "true"); (element as HTMLElement & { inert?: boolean }).inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inFlightRef.current && !consentOpenRef.current) closeSheet();
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = items[0]; const last = items[items.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      if (!panel.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (document.activeElement === titleRef.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown); document.body.style.overflow = overflow;
      siblings.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", ariaHidden);
        (element as HTMLElement & { inert?: boolean }).inert = inert;
      });
      previous?.focus();
    };
    // Sheet lifecycle only. Mutable submission/consent state is read from refs or blocks close in the UI.
  }, [open]);

  async function loadInitial(generation: number) {
    setPhase("loading_status");
    try {
      const [status, loadedPolicy] = await Promise.all([getCoachStatus(), getCoachConsentPolicy()]);
      if (openGenerationRef.current !== generation) return;
      setQuota(status.quota); setPolicy(loadedPolicy); setPhase("ready");
      if (status.quota.remaining === 0) coachAnalytics.limitSeen(0);
    } catch { if (openGenerationRef.current === generation) setPhase("load_error"); }
  }

  async function openSheet() {
    const generation = ++openGenerationRef.current;
    coachAnalytics.open();
    if (!user) { setPhase("ready"); return; }
    await loadInitial(generation);
  }

  function closeSheet() {
    if (inFlightRef.current || consentOpen) return;
    openGenerationRef.current += 1;
    if (!responseRef.current && (phaseRef.current === "network_error" || phaseRef.current === "terminal_error")) setRequestId(null);
    if (responseRef.current) clearSession(); else setPhase("closed");
  }

  async function execute(body: CoachV2Request, submitSource: QuestionSource, trackSubmit = true) {
    if (inFlightRef.current) return;
    const id = body.requestId;
    const sessionGeneration = sessionGenerationRef.current;
    inFlightRef.current = true; activeRequestRef.current = id; activeBodyRef.current = body; setSubmitFailure(null); setPhase("submitting");
    const startedAt = Date.now();
    if (trackSubmit) coachAnalytics.submit(submitSource);
    try {
      const result = await askCoachV2(body);
      if (sessionGenerationRef.current !== sessionGeneration) return;
      if (result.requestId !== id || activeRequestRef.current !== id) throw new CoachClientError("contract", "REQUEST_ID_MISMATCH");
      // Runtime parser only returns V2. This guard preserves mounted P0 fixtures during a rolling web rollout.
      const legacy = !("outcome" in result) ? result as unknown as CoachResponse : null;
      setResponse(legacy ?? result); setClarificationOption(null);
      setQuota((previous) => legacy ? legacy.quota : ({ limit: result.quota.limit, remaining: result.quota.remaining, resetAt: result.quota.resetAt,
        timezone: result.answer?.freshness.timezone ?? previous?.timezone ?? "UTC" })); setPhase("complete");
      const analyticsStatus = legacy ? legacy.status : result.outcome === "answer" ? (result.answer?.status === "partial" ? "fallback" : "ok")
        : result.outcome === "clarification_required" ? "insufficient_data"
          : result.outcome === "failed" ? "fallback" : result.outcome;
      coachAnalytics.complete(analyticsStatus, Date.now() - startedAt, result.quota.remaining);
      if (result.quota.remaining === 0) coachAnalytics.limitSeen(0);
    } catch (error) {
      if (sessionGenerationRef.current !== sessionGeneration) return;
      if (isCoachClientError(error) && error.kind === "transport") setPhase("network_error");
      else {
        const compatibility = isCoachClientError(error)
          && (error.kind === "contract" || error.code === "unsupported_capability" || error.code === "unsupported_capability_version");
        setSubmitFailure(compatibility ? "compatibility" : "terminal"); setPhase("terminal_error");
      }
    }
    finally { if (sessionGenerationRef.current === sessionGeneration) inFlightRef.current = false; }
  }

  async function submit(submitSource = source, forceNew = false) {
    const question = draft.trim();
    if (inFlightRef.current || question.length < 2 || question.length > 1000 || !user || quota?.remaining === 0) return;
    const id = forceNew || !requestId ? crypto.randomUUID() : requestId;
    setRequestId(id); setSource(submitSource);
    const body: CoachV2QuestionRequest = { requestId: id, question, discipline,
      locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US",
      apiVersion: COACH_V2_API_VERSION, schemaVersion: COACH_V2_REQUEST_SCHEMA_VERSION,
      capabilityVersion: COACH_P1_CAPABILITY_VERSION, contextFilters: {} };
    activeBodyRef.current = body;
    let currentPolicy = policy;
    if (!currentPolicy) {
      try { currentPolicy = await getCoachConsentPolicy(); setPolicy(currentPolicy); }
      catch { setPhase("load_error"); return; }
    }
    if (!isConsentActive(currentPolicy)) { setConsentOpen(true); return; }
    await execute(body, submitSource);
  }

  async function retry() {
    if (!response) {
      if (activeBodyRef.current) await execute(activeBodyRef.current, source, false);
      return;
    }
    const reasonCodes = "outcome" in response ? [response.error?.code, response.clarification?.reasonCode,
      response.unsupported?.reasonCodes[0], response.retry.reasonCode].filter((item): item is string => Boolean(item))
      : [response.reasonCode, response.retry.reasonCode];
    const action = retryActionFor(response.retry.mode, ...reasonCodes);
    if (action === "new") {
      const confirmed = await dialog.confirm(t("retry.newTurnConfirm"), { title: t("retry.newTurnTitle"), confirmLabel: t("retry.newTurnAction") });
      if (confirmed) await submit(source, true);
      return;
    }
    if (action !== "none" && activeBodyRef.current) await execute(activeBodyRef.current, source, false);
  }

  function chooseSuggestion(index: 1 | 2) {
    setDraft(t(`suggestions.${index}`)); setSource(`suggestion_${index}`); setRequestId(null);
  }

  function startAnother() {
    activeBodyRef.current = null;
    setDraft(""); setRequestId(null); setResponse(null); setClarificationOption(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null); setSource("free_text"); setPhase("ready");
  }

  function action(code: CoachActionCode) {
    coachAnalytics.actionClick(code); clearSession(); navigate(actionRoutes[code]);
  }

  function v2Action(code: CoachAnswerActionCode, entity?: CoachEntityRef) {
    coachAnalytics.actionClick(code);
    clearSession();
    if (code === "OPEN_ACTIVITY" && entity?.entityType === "activity") navigate(`/activity/${encodeURIComponent(entity.entityId)}`);
    else navigate(code === "VIEW_TRAINING_LOAD" ? "/fitness" : "/my");
  }

  function sendFeedback(helpful: boolean) {
    if (!response || feedback !== null) return;
    setFeedback(helpful); trackCoachFeedback(helpful, "outcome" in response
      ? response.outcome === "answer" ? "ok" : response.outcome === "failed" ? "fallback" : response.outcome === "clarification_required" ? "insufficient_data" : response.outcome
      : response.status);
  }

  async function submitClarification() {
    if (!(response && "outcome" in response && response.outcome === "clarification_required" && response.clarification) || !clarificationOption) return;
    const spec = response.clarification;
    if (Date.parse(spec.expiresAt) <= Date.now()) { setSubmitFailure("terminal"); return; }
    if (spec.resolutionMode === "continue_no_charge") {
      const id = crypto.randomUUID(); setRequestId(id);
      await execute({ requestId: id, parentRequestId: response.requestId, turnToken: spec.turnToken, optionId: clarificationOption,
        apiVersion: COACH_V2_API_VERSION, schemaVersion: COACH_V2_REQUEST_SCHEMA_VERSION, capabilityVersion: COACH_P1_CAPABILITY_VERSION }, source, false);
      return;
    }
    const confirmed = await dialog.confirm(t("clarification.newTurnConfirm"), { title: t("retry.newTurnTitle"), confirmLabel: t("retry.newTurnAction") });
    if (!confirmed) return;
    const prompt = clarificationQuestion(draft.trim(), spec.promptKey, clarificationOption, i18n.language);
    const id = crypto.randomUUID(); setRequestId(id);
    await execute({ requestId: id, question: prompt, discipline, locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US",
      apiVersion: COACH_V2_API_VERSION, schemaVersion: COACH_V2_REQUEST_SCHEMA_VERSION, capabilityVersion: COACH_P1_CAPABILITY_VERSION,
      contextFilters: {} }, source, false);
  }

  const retryReasonCodes = response ? ("outcome" in response
    ? [response.error?.code, response.clarification?.reasonCode, response.unsupported?.reasonCodes[0], response.retry.reasonCode].filter((item): item is string => Boolean(item))
    : [response.reasonCode, response.retry.reasonCode]) : [];
  const retryAction = response ? retryActionFor(response.retry.mode, ...retryReasonCodes) : "none";
  const canRetry = (phase === "network_error" && requestId !== null)
    || (phase === "complete" && response !== null && retryAction !== "none" && !(retryAction === "new" && quota?.remaining === 0));
  const exhausted = quota?.remaining === 0;
  const showCounter = inputFocused || draft.length >= 900;
  const suggestions = ([1, 2] as const).filter((index) => source !== `suggestion_${index}`);
  return (
    <>
      <Button ref={triggerRef} block variant="outline" leadingIcon={<Sparkles size={18} />} onClick={() => void openSheet()}>{t("open")}</Button>
      {open && createPortal(
        <div className="coach-sheet" role="presentation">
          <button type="button" className="coach-sheet__backdrop" tabIndex={-1} aria-hidden="true" aria-label={t("close")}
            disabled={phase === "submitting"} onMouseDown={(event) => event.preventDefault()} onClick={closeSheet} />
          <section ref={panelRef} tabIndex={-1} className="coach-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="coach-sheet-title">
            <header className="coach-sheet__header">
              <div className="coach-sheet__intro"><Text ref={titleRef} tabIndex={-1} id="coach-sheet-title" as="h2" variant="title">{t("title")}</Text>
                <Text as="p" variant="bodySmall" tone="secondary">{t("subtitle")}</Text></div>
              <Button iconOnly dense variant="ghost" aria-label={t("close")} disabled={phase === "submitting" || consentOpen} onClick={closeSheet}><X size={20} /></Button>
            </header>
            {!user ? <Card><Text as="p">{t("signInRequired")}</Text><Button block onClick={onSignIn}>{t("signIn")}</Button></Card> : (
              <>
                {phase === "loading_status" && <p aria-live="polite">{t("loadingStatus")}</p>}
                {phase === "load_error" && <div><p role="alert">{t("loadError")}</p>
                  <Button onClick={() => void loadInitial(openGenerationRef.current)}>{t("reloadStatus")}</Button></div>}
                {phase === "ready" && !response && <div className="coach-sheet__ready">
                  <Text as="p" variant="eyebrow" tone="accent">{t("context", { discipline: t(`discipline.${discipline}`) })}</Text>
                  <div className="coach-sheet__composer">
                    <label htmlFor="coach-question"><Text variant="label">{t("inputLabel")}</Text></label>
                    <Textarea id="coach-question" value={draft} maxLength={1000} rows={4} disabled={exhausted}
                      placeholder={t("placeholder")} aria-describedby={showCounter ? "coach-question-note coach-question-counter" : "coach-question-note"}
                      onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
                      onChange={(event) => { setDraft(event.target.value); setSource("free_text"); setRequestId(null); }} />
                    <div className="coach-sheet__composer-meta">
                      <Text id="coach-question-note" as="span" variant="caption" tone="tertiary">{t("independentNote")}</Text>
                      {showCounter && <Text id="coach-question-counter" as="span" className="coach-sheet__counter" variant="caption" tone="tertiary" mono>{draft.length}/1000</Text>}
                    </div>
                    <Button block variant="primary" disabled={draft.trim().length < 2 || exhausted} onClick={() => void submit()}>{t("submit")}</Button>
                    {quota && <Text as="p" className="coach-sheet__quota" variant="caption" tone={exhausted ? "warning" : "tertiary"}>
                      {exhausted ? t("quota.exhausted", { resetAt: formatDate(quota.resetAt, i18n.language, quota.timezone) }) : t("quota.remaining", { count: quota.remaining })}
                    </Text>}
                  </div>
                  <div className="coach-sheet__quick-prompts">
                    <Text as="h3" variant="label" tone="secondary">{t("suggestions.title")}</Text>
                    <div className="coach-sheet__suggestions">
                      {suggestions.map((index) => <Button key={index} block variant="ghost" onClick={() => chooseSuggestion(index)}>{t(`suggestions.${index}`)}</Button>)}
                    </div>
                  </div>
                </div>}
                {phase === "submitting" && <div className="coach-sheet__loading" aria-live="polite"><span className="ds-btn__spinner" aria-hidden /><p>{t("loadingAnswer")}</p><small>{t("loadingHonest")}</small></div>}
                {phase === "network_error" && <div role="alert"><Text as="h3" variant="subtitle">{t("states.network.title")}</Text><p>{t("states.network.body")}</p></div>}
                {phase === "terminal_error" && <div role="alert"><Text as="h3" variant="subtitle">{t(`states.${submitFailure ?? "terminal"}.title`)}</Text>
                  <p>{t(`states.${submitFailure ?? "terminal"}.body`)}</p></div>}
                {response && phase !== "submitting" && ("outcome" in response
                  ? <CoachV2Result response={response} locale={i18n.language} selectedOption={clarificationOption} feedback={feedback}
                    onSelectOption={setClarificationOption} onClarification={() => void submitClarification()} onAction={v2Action} onFeedback={sendFeedback}
                    onReanalyze={startAnother}
                    onSuggested={(query) => { startAnother(); setDraft(query); setSource("free_text"); }} />
                  : <CoachResult response={response} evidenceOpen={evidenceOpen} locale={i18n.language}
                    feedback={feedback} onEvidence={() => { setEvidenceOpen((value) => !value); if (!evidenceOpen) coachAnalytics.evidenceExpand(response.status); }}
                    onAction={action} onFeedback={sendFeedback} />)}
                {(phase !== "ready" || response) && <div className="coach-sheet__dock">
                  <footer className="coach-sheet__footer">
                  {quota && <div className="coach-sheet__quota">
                    {exhausted ? t("quota.exhausted", { resetAt: formatDate(quota.resetAt, i18n.language, quota.timezone) }) : t("quota.remaining", { count: quota.remaining })}
                    {response?.retry.previousTurnConsumed && <small>{t("quota.previousConsumed")}</small>}
                  </div>}
                    {canRetry && <Button onClick={() => void retry()}>{retryAction === "new"
                      ? t("retry.newTurnAction") : retryAction === "poll" ? t("retry.poll") : retryAction === "replay" ? t("retry.replay") : t("retry.same")}</Button>}
                    {(response || phase === "network_error" || phase === "terminal_error") && phase !== "submitting"
                      && <Button variant="secondary" onClick={startAnother}>{t("another")}</Button>}
                  </footer>
                </div>}
              </>
            )}
          </section>
        </div>, document.body,
      )}
      {policy && <FirstUseCoachConsent open={consentOpen} policy={policy} onCancel={() => setConsentOpen(false)} onConsented={(saved) => {
        setPolicy(saved); setConsentOpen(false);
        if (activeBodyRef.current && !inFlightRef.current) void execute(activeBodyRef.current, source);
      }} />}
    </>
  );
}

function safeClarificationText(key: string, kind: "prompt" | "option", t: (key: string, options?: Record<string, unknown>) => string,
  fallbackId?: string): string {
  const allowlist: Record<string, string> = {
    "coach.clarification.time_range": "clarification.prompt.time_range",
    "coach.clarify.discipline": "clarification.prompt.discipline",
    "coach.clarification.this_week": "clarification.option.this_week",
    "coach.clarification.last_week": "clarification.option.last_week",
    "coach.clarification.bike": "clarification.option.bike",
    "coach.clarification.run": "clarification.option.run",
    "coach.clarification.swim": "clarification.option.swim",
  };
  const mapped = allowlist[key];
  if (mapped) return t(mapped);
  return t(kind === "prompt" ? "clarification.prompt.generic" : "clarification.option.generic",
    { value: fallbackId?.replace(/_/g, " ") ?? "" });
}

function suggestedQuestion(templateId: string, locale: string): string | null {
  const ko = locale.startsWith("ko");
  const values: Record<string, [string, string]> = {
    compare_previous_period: ["최근 28일과 직전 28일을 비교해줘.", "Compare my last 28 days with the previous 28 days."],
    show_weekly_trend: ["최근 주별 운동 추세를 보여줘.", "Show my recent weekly training trend."],
    show_recent_activities: ["최근 활동을 순위와 함께 보여줘.", "Show and rank my recent activities."],
    review_missing_data: ["분석에 부족한 데이터를 알려줘.", "Show which data is missing from my analysis."],
  };
  const value = values[templateId];
  return value ? value[ko ? 0 : 1] : null;
}

function CoachV2Result({ response, locale, selectedOption, feedback, onSelectOption, onClarification, onAction, onFeedback, onSuggested, onReanalyze }: {
  response: CoachV2Response; locale: string; selectedOption: string | null; feedback: boolean | null;
  onSelectOption: (option: string) => void; onClarification: () => void;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void; onFeedback: (helpful: boolean) => void;
  onSuggested: (query: string) => void;
  onReanalyze: () => void;
}) {
  const { t } = useTranslation("coach");
  const spec = response.clarification;
  const expired = spec ? Date.parse(spec.expiresAt) <= Date.now() : false;
  return <div className="coach-result">
    {response.answer && <CoachAnswerDocumentView response={response} locale={locale} onAction={onAction} onReanalyze={onReanalyze} />}
    {response.outcome === "clarification_required" && spec && <form className="coach-clarification" onSubmit={(event) => { event.preventDefault(); onClarification(); }}>
      <fieldset disabled={expired}><legend>{safeClarificationText(spec.promptKey, "prompt", t)}</legend>
        {spec.options.map((option) => <label key={option.optionId} className="coach-clarification__option">
          <input type="radio" name="coach-clarification" value={option.optionId} checked={selectedOption === option.optionId} onChange={() => onSelectOption(option.optionId)} />
          <span>{safeClarificationText(option.labelKey, "option", t, option.optionId)}</span>
        </label>)}
      </fieldset>
      <p className="coach-clarification__policy">{spec.resolutionMode === "continue_no_charge" && !spec.consumesQuota
        ? t("clarification.policyContinue", { provider: spec.providerCalls })
        : t("clarification.policyNewTurn")}</p>
      {expired ? <p role="alert">{t("clarification.expired")}</p> : <Button type="submit" disabled={!selectedOption}>{t("clarification.submit")}</Button>}
    </form>}
    {response.outcome === "unsupported" && response.unsupported && <div className="coach-answer__unsupported" role="status">
      <Text as="h3" variant="subtitle">{t("unsupportedV2.title")}</Text><p>{t("unsupportedV2.body")}</p>
      {response.unsupported.suggestedQueries.length > 0 && <div className="coach-sheet__suggestions" aria-label={t("unsupportedV2.suggestions")}>
        {response.unsupported.suggestedQueries.map((suggestion) => {
          const query = suggestedQuestion(suggestion.queryTemplateId, locale);
          return query && <Button key={suggestion.queryTemplateId} variant="outline" onClick={() => onSuggested(query)}>{query}</Button>;
        })}
      </div>}
    </div>}
    {(["quota_exceeded", "budget_blocked", "failed"] as const).includes(response.outcome as "quota_exceeded" | "budget_blocked" | "failed")
      && <p className="coach-result__state" role="alert">{t(`v2State.${response.outcome}`)}</p>}
    {(response.outcome === "answer" || Boolean(response.answer)) && <div className="coach-result__feedback" role="group" aria-label={t("feedback.label")}>
      <Button size="sm" variant={feedback === true ? "primary" : "outline"} disabled={feedback !== null} onClick={() => onFeedback(true)}>{t("feedback.helpful")}</Button>
      <Button size="sm" variant={feedback === false ? "primary" : "outline"} disabled={feedback !== null} onClick={() => onFeedback(false)}>{t("feedback.notHelpful")}</Button>
    </div>}
  </div>;
}

function CoachResult({ response, evidenceOpen, locale, feedback, onEvidence, onAction, onFeedback }: {
  response: CoachResponse; evidenceOpen: boolean; locale: string; feedback: boolean | null;
  onEvidence: () => void; onAction: (code: CoachActionCode) => void; onFeedback: (helpful: boolean) => void;
}) {
  const { t } = useTranslation("coach");
  return <div className="coach-result">
    {response.context && <div className="coach-sheet__chips"><Chip>{t(`discipline.${response.context.discipline}`)}</Chip><Chip>{t(`period.${response.context.period}`)}</Chip><Chip>{t(response.context.goalIncluded ? "goal.included" : "goal.notIncluded")}</Chip></div>}
    <div className="coach-result__answer">
      {response.answer.blocks.map((block, index) => <div key={`${block.kind}-${index}`} className={`coach-result__block coach-result__block--${block.kind}`}>
        {block.parts.map((part, partIndex) => <span key={`${part.type}-${partIndex}`}>{part.type === "text" ? part.text : part.displayValue}</span>)}
      </div>)}
    </div>
    {response.status !== "ok" && <p className="coach-result__state" role={response.status === "fallback" ? "alert" : undefined}>{t(`states.${response.status}.body`)}</p>}
    {response.answer.actionCode && <Button variant="outline" onClick={() => onAction(response.answer.actionCode!)}>{t(`actions.${response.answer.actionCode}`)}</Button>}
    <button type="button" className="coach-result__evidence-toggle" aria-expanded={evidenceOpen} aria-controls="coach-evidence" onClick={onEvidence}>
      {t("evidence.toggle", { count: response.evidence.length })}
    </button>
    {evidenceOpen && <div id="coach-evidence" className="coach-result__evidence">
      {response.evidence.map((item) => <Card key={item.evidenceId} padding="compact">
        <Text as="div" variant="label">{item.label}</Text><Text as="div" variant="num">{item.value}{item.unit ? ` ${item.unit}` : ""}</Text>
        <small>{item.period ? t(`period.${item.period}`) : ""} · {formatDate(item.asOf, locale)}</small>
      </Card>)}
      {response.freshness.asOf && <small>{t("freshness", { at: formatDate(response.freshness.asOf, locale) })}</small>}
      {response.freshness.latestActivityAt && <small>{t("latestActivity", { at: formatDate(response.freshness.latestActivityAt, locale) })}</small>}
      {response.freshness.staleSources.length > 0 && <small>{t("staleSources", { count: response.freshness.staleSources.length })}</small>}
    </div>}
    <div className="coach-result__feedback" role="group" aria-label={t("feedback.label")}>
      <Button size="sm" variant={feedback === true ? "primary" : "outline"} disabled={feedback !== null} onClick={() => onFeedback(true)}>{t("feedback.helpful")}</Button>
      <Button size="sm" variant={feedback === false ? "primary" : "outline"} disabled={feedback !== null} onClick={() => onFeedback(false)}>{t("feedback.notHelpful")}</Button>
    </div>
  </div>;
}
