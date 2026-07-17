import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { Sparkles, X } from "lucide-react";
import { Button, Card, Chip, Text, Textarea } from "../../theme/components";
import { useDialog } from "../../contexts/DialogContext";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import {
  askCoach, CoachClientError, getCoachStatus, isCoachClientError, type CoachActionCode, type CoachDiscipline,
  type CoachQuota, type CoachResponse, type CoachRetryMode,
} from "../../services/coachClient";
import { getCoachConsentPolicy, type CoachConsentPolicy } from "../../services/coachConsentClient";
import { FirstUseCoachConsent } from "./FirstUseCoachConsent";
import { subscribeCoachConsentSessionReset } from "./consentSessionBoundary";
import { coachAnalytics, trackCoachFeedback } from "./coachAnalytics";
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

export function CoachQuestionLauncher({ user, discipline, onSignIn }: Props) {
  const { t, i18n } = useTranslation("coach");
  const dialog = useDialog();
  const navigate = useLocalizedNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inFlightRef = useRef(false);
  const activeRequestRef = useRef<string | null>(null);
  const responseRef = useRef<CoachResponse | null>(null);
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
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [submitFailure, setSubmitFailure] = useState<SubmitFailure>(null);
  useEffect(() => { responseRef.current = response; }, [response]);
  useEffect(() => { consentOpenRef.current = consentOpen; }, [consentOpen]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const clearSession = useCallback(() => {
    inFlightRef.current = false;
    openGenerationRef.current += 1;
    sessionGenerationRef.current += 1;
    activeRequestRef.current = null;
    setDraft(""); setRequestId(null); setResponse(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null);
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

  async function execute(id: string, question: string, submitSource: QuestionSource, trackSubmit = true) {
    if (inFlightRef.current) return;
    const sessionGeneration = sessionGenerationRef.current;
    inFlightRef.current = true; activeRequestRef.current = id; setSubmitFailure(null); setPhase("submitting");
    const startedAt = Date.now();
    if (trackSubmit) coachAnalytics.submit(submitSource);
    try {
      const result = await askCoach({
        requestId: id, question, discipline,
        locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US",
        capabilityVersion: "p0", contextFilters: {},
      });
      if (sessionGenerationRef.current !== sessionGeneration) return;
      if (result.requestId !== id || activeRequestRef.current !== id) throw new CoachClientError("contract", "REQUEST_ID_MISMATCH");
      setResponse(result); setQuota(result.quota); setPhase("complete");
      coachAnalytics.complete(result.status, Date.now() - startedAt, result.quota.remaining);
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
    let currentPolicy = policy;
    if (!currentPolicy) {
      try { currentPolicy = await getCoachConsentPolicy(); setPolicy(currentPolicy); }
      catch { setPhase("load_error"); return; }
    }
    if (!isConsentActive(currentPolicy)) { setConsentOpen(true); return; }
    await execute(id, question, submitSource);
  }

  async function retry() {
    if (!response) {
      if (requestId) await execute(requestId, draft.trim(), source, false);
      return;
    }
    const action = retryActionFor(response.retry.mode, response.reasonCode, response.retry.reasonCode);
    if (action === "new") {
      const confirmed = await dialog.confirm(t("retry.newTurnConfirm"), { title: t("retry.newTurnTitle"), confirmLabel: t("retry.newTurnAction") });
      if (confirmed) await submit(source, true);
      return;
    }
    if (action !== "none" && requestId) await execute(requestId, draft.trim(), source, false);
  }

  function chooseSuggestion(index: 1 | 2) {
    setDraft(t(`suggestions.${index}`)); setSource(`suggestion_${index}`); setRequestId(null);
  }

  function startAnother() {
    setDraft(""); setRequestId(null); setResponse(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null); setSource("free_text"); setPhase("ready");
  }

  function action(code: CoachActionCode) {
    coachAnalytics.actionClick(code); clearSession(); navigate(actionRoutes[code]);
  }

  function sendFeedback(helpful: boolean) {
    if (!response || feedback !== null) return;
    setFeedback(helpful); trackCoachFeedback(helpful, response.status);
  }

  const retryAction = response ? retryActionFor(response.retry.mode, response.reasonCode, response.retry.reasonCode) : "none";
  const canRetry = (phase === "network_error" && requestId !== null)
    || (phase === "complete" && response !== null && retryAction !== "none" && !(retryAction === "new" && quota?.remaining === 0));
  const exhausted = quota?.remaining === 0;
  return (
    <>
      <Button ref={triggerRef} block variant="outline" leadingIcon={<Sparkles size={18} />} onClick={() => void openSheet()}>{t("open")}</Button>
      {open && createPortal(
        <div className="coach-sheet" role="presentation">
          <button type="button" className="coach-sheet__backdrop" tabIndex={-1} aria-hidden="true" aria-label={t("close")}
            disabled={phase === "submitting"} onMouseDown={(event) => event.preventDefault()} onClick={closeSheet} />
          <section ref={panelRef} tabIndex={-1} className="coach-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="coach-sheet-title">
            <header className="coach-sheet__header">
              <div><Text ref={titleRef} tabIndex={-1} id="coach-sheet-title" as="h2" variant="title">{t("title")}</Text><Text as="p" tone="secondary">{t("subtitle")}</Text></div>
              <Button iconOnly dense variant="ghost" aria-label={t("close")} disabled={phase === "submitting" || consentOpen} onClick={closeSheet}><X size={20} /></Button>
            </header>
            {!user ? <Card><Text as="p">{t("signInRequired")}</Text><Button block onClick={onSignIn}>{t("signIn")}</Button></Card> : (
              <>
                {phase === "loading_status" && <p aria-live="polite">{t("loadingStatus")}</p>}
                {phase === "load_error" && <div><p role="alert">{t("loadError")}</p>
                  <Button onClick={() => void loadInitial(openGenerationRef.current)}>{t("reloadStatus")}</Button></div>}
                {phase === "ready" && !response && <>
                  <div className="coach-sheet__chips"><Chip>{t(`discipline.${discipline}`)}</Chip><Chip>{t("period.default")}</Chip></div>
                  <Text as="h3" variant="subtitle">{t("suggestions.title")}</Text>
                  <div className="coach-sheet__suggestions">
                    <Button variant="outline" onClick={() => chooseSuggestion(1)}>{t("suggestions.1")}</Button>
                    <Button variant="outline" onClick={() => chooseSuggestion(2)}>{t("suggestions.2")}</Button>
                  </div>
                </>}
                {phase === "submitting" && <div className="coach-sheet__loading" aria-live="polite"><span className="ds-btn__spinner" aria-hidden /><p>{t("loadingAnswer")}</p><small>{t("loadingHonest")}</small></div>}
                {phase === "network_error" && <div role="alert"><Text as="h3" variant="subtitle">{t("states.network.title")}</Text><p>{t("states.network.body")}</p></div>}
                {phase === "terminal_error" && <div role="alert"><Text as="h3" variant="subtitle">{t(`states.${submitFailure ?? "terminal"}.title`)}</Text>
                  <p>{t(`states.${submitFailure ?? "terminal"}.body`)}</p></div>}
                {response && phase !== "submitting" && <CoachResult response={response} evidenceOpen={evidenceOpen} locale={i18n.language}
                  feedback={feedback} onEvidence={() => { setEvidenceOpen((value) => !value); if (!evidenceOpen) coachAnalytics.evidenceExpand(response.status); }}
                  onAction={action} onFeedback={sendFeedback} />}
                <div className="coach-sheet__dock">
                  {phase === "ready" && !response && <div className="coach-sheet__composer">
                    <label htmlFor="coach-question">{t("inputLabel")}</label>
                    <Textarea id="coach-question" value={draft} maxLength={1000} rows={4} disabled={exhausted}
                      placeholder={t("placeholder")} onChange={(event) => { setDraft(event.target.value); setSource("free_text"); setRequestId(null); }} />
                    <div className="coach-sheet__counter"><span>{draft.length}/1000</span></div>
                  </div>}
                  <footer className="coach-sheet__footer">
                  {quota && <div className="coach-sheet__quota">
                    {exhausted ? t("quota.exhausted", { resetAt: formatDate(quota.resetAt, i18n.language, quota.timezone) }) : t("quota.remaining", { count: quota.remaining })}
                    {response?.retry.previousTurnConsumed && <small>{t("quota.previousConsumed")}</small>}
                  </div>}
                    {!response && phase === "ready" && <Button disabled={draft.trim().length < 2 || exhausted} onClick={() => void submit()}>{t("submit")}</Button>}
                    {canRetry && <Button onClick={() => void retry()}>{retryAction === "new"
                      ? t("retry.newTurnAction") : retryAction === "poll" ? t("retry.poll") : retryAction === "replay" ? t("retry.replay") : t("retry.same")}</Button>}
                    {(response || phase === "network_error" || phase === "terminal_error") && phase !== "submitting"
                      && <Button variant="secondary" onClick={startAnother}>{t("another")}</Button>}
                  </footer>
                </div>
              </>
            )}
          </section>
        </div>, document.body,
      )}
      {policy && <FirstUseCoachConsent open={consentOpen} policy={policy} onCancel={() => setConsentOpen(false)} onConsented={(saved) => {
        setPolicy(saved); setConsentOpen(false);
        if (requestId && !inFlightRef.current) void execute(requestId, draft.trim(), source);
      }} />}
    </>
  );
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
