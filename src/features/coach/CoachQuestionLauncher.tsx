import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { History, Sparkles, X } from "lucide-react";
import { Alert, Button, Card, Chip, Text, Textarea } from "../../theme/components";
import { useDialog } from "../../contexts/DialogContext";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import {
  askCoachP2, askCoachV2, CoachClientError, getCoachProgressPlannerCapabilities, getCoachStatus, isCoachClientError,
  type CoachActionCode, type CoachDiscipline,
  type CoachQuota, type CoachResponse, type CoachRetryMode,
} from "../../services/coachClient";
import {
  COACH_P2_CAPABILITY_VERSION, COACH_P2_REQUEST_SCHEMA_VERSION, COACH_P2_RESPONSE_SCHEMA_VERSION,
  type CoachP2Request, type CoachP2Response,
} from "../../services/coachP2Contract";
import {
  COACH_P1_CAPABILITY_VERSION, COACH_V2_API_VERSION, COACH_V2_REQUEST_SCHEMA_VERSION,
  type CoachAnswerActionCode, type CoachContextFilters, type CoachEntityRef, type CoachProgressPlannerContext,
  type CoachRidePlanContext,
  type CoachV2Request, type CoachV2Response,
} from "../../services/coachV2Contract";
import { getCoachConsentPolicy, type CoachConsentPolicy } from "../../services/coachConsentClient";
import { isCoachRidePlanRespondToken } from "../../services/coachRidePlanContract";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import { logClientError } from "../../services/errorLogger";
import { FirstUseCoachConsent } from "./FirstUseCoachConsent";
import { subscribeCoachConsentSessionReset } from "./consentSessionBoundary";
import { coachAnalytics, trackCoachFeedback } from "./coachAnalytics";
import { CoachAnswerDocumentView } from "./CoachAnswerDocument";
import { safeClarificationText } from "./coachClarificationText";
import { CoachPmcInsightCard, type CoachPmcQuestionSelection } from "./CoachPmcInsightCard";
import { CoachRiderInsightCard, type CoachRiderQuestionSelection } from "./CoachRiderInsightCard";
import "./coach-question.css";

type QuestionSource = "suggestion_1" | "suggestion_2" | "suggestion_3" | "free_text";
type Phase = "closed" | "loading_status" | "ready" | "submitting" | "complete" | "network_error" | "terminal_error" | "load_error";
type SubmitFailure = "compatibility" | "serviceUnavailable" | "terminal" | null;
type CoachRequest = CoachV2Request | CoachP2Request;
type CoachResponseEnvelope = CoachV2Response | CoachP2Response;

interface Props {
  user: User | null;
  discipline: CoachDiscipline;
  onSignIn: () => void;
  triggerBlock?: boolean;
  showPmcInsight?: boolean;
  ridePlanSelection?: { selectionId: string; question: string; context: CoachRidePlanContext } | null;
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

export function CoachQuestionLauncher({ user, discipline, onSignIn, triggerBlock = true, showPmcInsight = false,
  ridePlanSelection = null }: Props) {
  const { t, i18n } = useTranslation("coach");
  const dialog = useDialog();
  const navigate = useLocalizedNavigate();
  const runtimeConfig = getRuntimeConfig();
  const ridePlanRespondEnabled = runtimeConfig.coachRidePlanSnapshotEnabled === true
    && runtimeConfig.coachRidePlanAiEnabled === true && runtimeConfig.coachRidePlanRespondV2Enabled === true;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const inFlightRef = useRef(false);
  const activeRequestRef = useRef<string | null>(null);
  const activeBodyRef = useRef<CoachRequest | null>(null);
  const responseRef = useRef<CoachResponse | CoachResponseEnvelope | null>(null);
  const consentOpenRef = useRef(false);
  const phaseRef = useRef<Phase>("closed");
  const pendingPmcFocusRef = useRef(false);
  const openGenerationRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("closed");
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<QuestionSource>("free_text");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [quota, setQuota] = useState<CoachQuota | null>(null);
  const [policy, setPolicy] = useState<CoachConsentPolicy | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [response, setResponse] = useState<CoachResponse | CoachResponseEnvelope | null>(null);
  const [p2Advertised, setP2Advertised] = useState(false);
  const [productSlice, setProductSlice] = useState<"latest_activity_review" | null>(null);
  const [clarificationOption, setClarificationOption] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [submitFailure, setSubmitFailure] = useState<SubmitFailure>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [pmcSnapshotId, setPmcSnapshotId] = useState<string | null>(null);
  const [riderSnapshotId, setRiderSnapshotId] = useState<string | null>(null);
  const [plannerContext, setPlannerContext] = useState<CoachProgressPlannerContext | null>(null);
  const [ridePlanContext, setRidePlanContext] = useState<CoachRidePlanContext | null>(null);
  const ridePlanSelectionRef = useRef<string | null>(null);
  useEffect(() => { responseRef.current = response; }, [response]);
  useEffect(() => { consentOpenRef.current = consentOpen; }, [consentOpen]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    if (phase === "ready" && (pmcSnapshotId || riderSnapshotId) && pendingPmcFocusRef.current) {
      pendingPmcFocusRef.current = false;
      questionRef.current?.focus();
    }
  }, [phase, pmcSnapshotId, riderSnapshotId]);

  const clearSession = useCallback(() => {
    inFlightRef.current = false;
    openGenerationRef.current += 1;
    sessionGenerationRef.current += 1;
    activeRequestRef.current = null;
    activeBodyRef.current = null;
    pendingPmcFocusRef.current = false;
    setDraft(""); setPmcSnapshotId(null); setRiderSnapshotId(null); setPlannerContext(null); setRidePlanContext(null); setRequestId(null); setResponse(null); setClarificationOption(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null); setInputFocused(false); setP2Advertised(false); setProductSlice(null);
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
    setPhase("loading_status"); setP2Advertised(false);
    void getCoachProgressPlannerCapabilities().then((capabilities) => {
      if (openGenerationRef.current !== generation) return;
      setP2Advertised(capabilities.apiVersions.some((entry) => entry.apiVersion === "v2"
        && entry.capabilityVersion === "p2" && entry.requestSchemaVersion === COACH_P2_REQUEST_SCHEMA_VERSION
        && entry.responseSchemaVersion === COACH_P2_RESPONSE_SCHEMA_VERSION));
    }).catch((error) => {
      logClientError("CoachQuestionLauncher.capabilityDiscovery", error, { capabilityVersion: "p2" });
    });
    try {
      const [status, loadedPolicy] = await Promise.all([getCoachStatus(), getCoachConsentPolicy()]);
      if (openGenerationRef.current !== generation) return;
      setQuota(status.quota); setPolicy(loadedPolicy);
      setPhase("ready");
      if (status.quota.remaining === 0) coachAnalytics.limitSeen(0);
    } catch { if (openGenerationRef.current === generation) setPhase("load_error"); }
  }

  async function openSheet() {
    const generation = ++openGenerationRef.current;
    coachAnalytics.open();
    if (!user) { setPhase("ready"); return; }
    await loadInitial(generation);
  }

  useEffect(() => {
    const selectionId = ridePlanSelection?.selectionId ?? null;
    const validSelection = ridePlanRespondEnabled && ridePlanSelection && user
      && isCoachRidePlanRespondToken(ridePlanSelection.context.contextToken);
    if (validSelection && selectionId === ridePlanSelectionRef.current) return;
    if (!validSelection && ridePlanSelectionRef.current === null) return;
    openGenerationRef.current += 1; sessionGenerationRef.current += 1; inFlightRef.current = false;
    activeRequestRef.current = null; activeBodyRef.current = null;
    setDraft(""); setRidePlanContext(null); setRequestId(null); setResponse(null); setClarificationOption(null); setProductSlice(null);
    setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null); setInputFocused(false);
    if (!validSelection) {
      ridePlanSelectionRef.current = null;
      setPhase("closed");
      return;
    }
    ridePlanSelectionRef.current = selectionId;
    setDraft(ridePlanSelection.question); setRidePlanContext(ridePlanSelection.context);
    setPmcSnapshotId(null); setRiderSnapshotId(null); setPlannerContext(null); setSource("free_text"); setRequestId(null);
    pendingPmcFocusRef.current = true;
    void openSheet();
  }, [ridePlanRespondEnabled, ridePlanSelection, user]);

  function closeSheet() {
    if (inFlightRef.current || consentOpen) return;
    openGenerationRef.current += 1;
    if (!responseRef.current && (phaseRef.current === "network_error" || phaseRef.current === "terminal_error")) setRequestId(null);
    if (responseRef.current) clearSession(); else setPhase("closed");
  }

  async function execute(body: CoachRequest, submitSource: QuestionSource, trackSubmit = true) {
    if (inFlightRef.current) return;
    const id = body.requestId;
    const sessionGeneration = sessionGenerationRef.current;
    inFlightRef.current = true; activeRequestRef.current = id; activeBodyRef.current = body; setSubmitFailure(null); setPhase("submitting");
    const startedAt = Date.now();
    if (trackSubmit) coachAnalytics.submit(submitSource, body.capabilityVersion);
    try {
      const result = body.capabilityVersion === COACH_P2_CAPABILITY_VERSION ? await askCoachP2(body) : await askCoachV2(body);
      if (sessionGenerationRef.current !== sessionGeneration) return;
      if (result.requestId !== id || activeRequestRef.current !== id) throw new CoachClientError("contract", "REQUEST_ID_MISMATCH");
      // Runtime parser only returns V2. This guard preserves mounted P0 fixtures during a rolling web rollout.
      const legacy = !("outcome" in result) ? result as unknown as CoachResponse : null;
      setResponse(legacy ?? result); setClarificationOption(null);
      let remaining: number | null;
      let analyticsStatus: CoachResponse["status"];
      if (legacy) {
        remaining = legacy.quota.remaining; analyticsStatus = legacy.status; setQuota(legacy.quota);
      } else if (result.capabilityVersion === "p2") {
        analyticsStatus = result.outcome === "answer" && result.answer.status !== "partial" ? "ok" : "fallback";
        remaining = result.quota.consumed ? null : quota?.remaining ?? null;
        if (result.quota.consumed) setQuota(null);
        setPhase("complete");
        coachAnalytics.complete(analyticsStatus, Date.now() - startedAt, remaining);
        if (result.quota.consumed) {
          void getCoachStatus().then((refreshedStatus) => {
            if (sessionGenerationRef.current !== sessionGeneration) return;
            setQuota(refreshedStatus.quota);
            if (refreshedStatus.quota.remaining === 0) coachAnalytics.limitSeen(0);
          }).catch((error) => {
            if (sessionGenerationRef.current !== sessionGeneration) return;
            logClientError("CoachQuestionLauncher.refreshP2Quota", error, { capabilityVersion: "p2" });
            setQuota(null);
          });
        }
        return;
      } else {
        remaining = result.quota.remaining;
        analyticsStatus = result.outcome === "answer" ? (result.answer?.status === "partial" ? "fallback" : "ok")
          : result.outcome === "clarification_required" ? "insufficient_data"
            : result.outcome === "failed" ? "fallback" : result.outcome;
        setQuota((previous) => ({ limit: result.quota.limit, remaining: result.quota.remaining, resetAt: result.quota.resetAt,
          timezone: result.answer?.freshness.timezone ?? previous?.timezone ?? "UTC" }));
      }
      if (sessionGenerationRef.current !== sessionGeneration) return;
      setPhase("complete");
      coachAnalytics.complete(analyticsStatus, Date.now() - startedAt, remaining);
      if (remaining === 0) coachAnalytics.limitSeen(0);
    } catch (error) {
      if (sessionGenerationRef.current !== sessionGeneration) return;
      if (body.capabilityVersion === COACH_P2_CAPABILITY_VERSION) {
        logClientError("CoachQuestionLauncher.askP2", error, { capabilityVersion: "p2" });
      }
      if (isCoachClientError(error) && error.kind === "transport") setPhase("network_error");
      else {
        const providerUnavailable = isCoachClientError(error) && error.code === "provider_kill_switch";
        const compatibility = isCoachClientError(error)
          && (error.kind === "contract" || error.code === "unsupported_capability" || error.code === "unsupported_capability_version");
        setSubmitFailure(providerUnavailable ? "serviceUnavailable" : compatibility ? "compatibility" : "terminal"); setPhase("terminal_error");
      }
    }
    finally { if (sessionGenerationRef.current === sessionGeneration) inFlightRef.current = false; }
  }

  async function submit(submitSource = source, forceNew = false) {
    const question = draft.trim();
    if (inFlightRef.current || question.length < 2 || question.length > 1000 || !user || !quota || quota.remaining === 0) return;
    const id = forceNew || !requestId ? crypto.randomUUID() : requestId;
    setRequestId(id); setSource(submitSource);
    const contextFilters = currentContextFilters();
    const useP2 = productSlice === "latest_activity_review";
    if (useP2 && (!p2Advertised || Object.keys(contextFilters).length > 0)) {
      setSubmitFailure("compatibility"); setPhase("terminal_error"); return;
    }
    const body: CoachRequest = useP2 ? { requestId: id, question, discipline,
      locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US", apiVersion: COACH_V2_API_VERSION,
      schemaVersion: COACH_P2_REQUEST_SCHEMA_VERSION, capabilityVersion: COACH_P2_CAPABILITY_VERSION, contextFilters: {} }
      : { requestId: id, question, discipline, locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US",
        apiVersion: COACH_V2_API_VERSION, schemaVersion: COACH_V2_REQUEST_SCHEMA_VERSION,
        capabilityVersion: COACH_P1_CAPABILITY_VERSION, contextFilters, responseFormat: "auto" };
    activeBodyRef.current = body;
    let currentPolicy: CoachConsentPolicy;
    try { currentPolicy = await getCoachConsentPolicy(); setPolicy(currentPolicy); }
    catch { setPhase("load_error"); return; }
    if (!isConsentActive(currentPolicy)) { setConsentOpen(true); return; }
    await execute(body, submitSource);
  }

  async function retry() {
    if (!response) {
      if (activeBodyRef.current) await execute(activeBodyRef.current, source, false);
      return;
    }
    const reasonCodes = "outcome" in response ? [response.capabilityVersion === "p2"
      ? response.outcome === "unavailable" ? response.error.code : undefined : response.error?.code,
      response.capabilityVersion === "p1" ? response.clarification?.reasonCode : undefined,
      response.capabilityVersion === "p1" ? response.unsupported?.reasonCodes[0] : undefined,
      response.retry.reasonCode].filter((item): item is string => Boolean(item))
      : [response.reasonCode, response.retry.reasonCode];
    const action = retryActionFor(response.retry.mode, ...reasonCodes);
    if (action === "new") {
      const confirmed = await dialog.confirm(t("retry.newTurnConfirm"), { title: t("retry.newTurnTitle"), confirmLabel: t("retry.newTurnAction") });
      if (confirmed) await submit(source, true);
      return;
    }
    if (action !== "none" && activeBodyRef.current) await execute(activeBodyRef.current, source, false);
  }

  function chooseSuggestion(index: 1 | 2 | 3) {
    if (index === 2 && !p2Advertised) return;
    setDraft(t(`suggestions.${discipline}.${index}`)); setPmcSnapshotId(null); setRiderSnapshotId(null); setPlannerContext(null); setRidePlanContext(null); setProductSlice(index === 2 ? "latest_activity_review" : null); setSource(`suggestion_${index}`); setRequestId(null);
    questionRef.current?.focus();
  }

  function clearLatestActivityReviewMode() {
    activeRequestRef.current = null; activeBodyRef.current = null;
    setProductSlice(null); setSource("free_text"); setRequestId(null);
    questionRef.current?.focus();
  }

  function choosePmcQuestion(selection: CoachPmcQuestionSelection) {
    if (!user) return;
    activeRequestRef.current = null; activeBodyRef.current = null;
    setDraft(selection.question); setPmcSnapshotId(selection.snapshotId); setRiderSnapshotId(null); setSource("free_text"); setRequestId(null);
    setPlannerContext(null); setProductSlice(null);
    setRidePlanContext(null);
    setResponse(null); setClarificationOption(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null);
    pendingPmcFocusRef.current = true;
    void openSheet();
  }

  function chooseRiderQuestion(selection: CoachRiderQuestionSelection) {
    if (!user) return;
    activeRequestRef.current = null; activeBodyRef.current = null;
    setDraft(selection.question); setRiderSnapshotId(selection.snapshotId); setPmcSnapshotId(null); setSource("free_text"); setRequestId(null);
    setPlannerContext(null); setProductSlice(null);
    setRidePlanContext(null);
    setResponse(null); setClarificationOption(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null);
    pendingPmcFocusRef.current = true;
    void openSheet();
  }

  function startAnother() {
    const reloadQuota = quota === null;
    activeBodyRef.current = null;
    setDraft(""); setPmcSnapshotId(null); setRiderSnapshotId(null); setPlannerContext(null); setRidePlanContext(null); setProductSlice(null); setRequestId(null); setResponse(null); setClarificationOption(null); setEvidenceOpen(false); setFeedback(null); setSubmitFailure(null); setInputFocused(false); setSource("free_text");
    if (reloadQuota) void openSheet(); else setPhase("ready");
  }

  function choosePlannerQuestion(question: string, prescriptionId: string, sourceRequestId: string) {
    startAnother(); setDraft(question); setPlannerContext({ prescriptionId, sourceRequestId }); setProductSlice(null); setSource("free_text");
    queueMicrotask(() => questionRef.current?.focus());
  }

  function currentContextFilters(): CoachContextFilters {
    if (ridePlanRespondEnabled && ridePlanContext && isCoachRidePlanRespondToken(ridePlanContext.contextToken)) {
      return { ridePlan: ridePlanContext };
    }
    if (plannerContext) return { progressPlanner: plannerContext };
    if (riderSnapshotId) return { riderSnapshotId };
    if (pmcSnapshotId) return { pmcSnapshotId };
    return {};
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
      ? response.outcome === "answer" ? "ok" : response.outcome === "failed" || response.outcome === "unavailable" ? "fallback" : response.outcome === "clarification_required" ? "insufficient_data" : response.outcome
      : response.status);
  }

  async function submitClarification() {
    if (!(response && "outcome" in response && response.capabilityVersion === "p1"
      && response.outcome === "clarification_required" && response.clarification) || !clarificationOption) return;
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
      contextFilters: currentContextFilters(), responseFormat: "auto" }, source, false);
  }

  const retryReasonCodes = response ? ("outcome" in response
    ? [response.capabilityVersion === "p2" ? response.outcome === "unavailable" ? response.error.code : undefined : response.error?.code,
      response.capabilityVersion === "p1" ? response.clarification?.reasonCode : undefined,
      response.capabilityVersion === "p1" ? response.unsupported?.reasonCodes[0] : undefined,
      response.retry.reasonCode].filter((item): item is string => Boolean(item))
    : [response.reasonCode, response.retry.reasonCode]) : [];
  const retryAction = response ? retryActionFor(response.retry.mode, ...retryReasonCodes) : "none";
  const canRetry = (phase === "network_error" && requestId !== null)
    || (phase === "complete" && response !== null && retryAction !== "none" && !(retryAction === "new" && (!quota || quota.remaining === 0)));
  const exhausted = quota?.remaining === 0;
  const submissionBlocked = !quota || exhausted;
  const serviceUnavailable = (phase === "terminal_error" && submitFailure === "serviceUnavailable")
    || (response && "outcome" in response && response.capabilityVersion === "p1" && response.error?.code === "provider_kill_switch");
  const canRateResponse = phase !== "submitting" && Boolean(response && ("outcome" in response
    ? response.outcome === "answer"
    : response.answer));
  const showCounter = inputFocused || draft.length >= 900;
  const suggestions = ([1, 2, 3] as const).filter((index) => source !== `suggestion_${index}`
    && (index !== 2 || p2Advertised));
  return (
    <>
      {showPmcInsight && user && <CoachRiderInsightCard user={user} discipline={discipline} onQuestionSelect={chooseRiderQuestion} />}
      {showPmcInsight && user && <CoachPmcInsightCard user={user} discipline={discipline} onQuestionSelect={choosePmcQuestion} />}
      <Button ref={triggerRef} block={triggerBlock} variant="outline" leadingIcon={<Sparkles size={18} />} onClick={() => void openSheet()}>{t("open")}</Button>
      {open && createPortal(
        <div className="coach-sheet" role="presentation">
          <button type="button" className="coach-sheet__backdrop" tabIndex={-1} aria-hidden="true" aria-label={t("close")}
            disabled={phase === "submitting"} onMouseDown={(event) => event.preventDefault()} onClick={closeSheet} />
          <section ref={panelRef} tabIndex={-1} className="coach-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="coach-sheet-title">
            <header className="coach-sheet__header">
              <div className="coach-sheet__intro"><Text ref={titleRef} tabIndex={-1} id="coach-sheet-title" as="h2" variant="title">{t("title")}</Text>
                <Text as="p" variant="bodySmall" tone="secondary">{t("subtitle")}</Text></div>
              <div className="coach-sheet__header-actions">
                {user && <Button dense variant="ghost" size="sm" leadingIcon={<History size={17} />} disabled={phase === "submitting" || consentOpen}
                  onClick={() => { clearSession(); navigate("/coach"); }}>{t("history.open")}</Button>}
                <Button iconOnly dense variant="ghost" aria-label={t("close")} disabled={phase === "submitting" || consentOpen} onClick={closeSheet}><X size={20} /></Button>
              </div>
            </header>
            <div className="coach-sheet__content">
              {!user ? <Card className="coach-sheet__status"><Text as="p">{t("signInRequired")}</Text><Button block variant="primary" onClick={onSignIn}>{t("signIn")}</Button></Card> : (
                <>
                {phase === "loading_status" && <Card className="coach-sheet__status" role="status" aria-live="polite">
                  <span className="ds-btn__spinner" aria-hidden /><Text as="p" variant="bodySmall">{t("loadingStatus")}</Text>
                </Card>}
                {phase === "load_error" && <Alert className="coach-sheet__alert" variant="danger" title={t("loadError")}>
                  <Button variant="outline" onClick={() => void loadInitial(openGenerationRef.current)}>{t("reloadStatus")}</Button>
                </Alert>}
                {phase === "ready" && !response && <div className="coach-sheet__ready">
                  <Text as="p" variant="eyebrow" tone="accent">{t("context", { discipline: t(`discipline.${discipline}`) })}</Text>
                  <div className="coach-sheet__composer">
                    <label htmlFor="coach-question"><Text variant="label">{t("inputLabel")}</Text></label>
                    <Textarea ref={questionRef} id="coach-question" value={draft} maxLength={1000} rows={4} disabled={submissionBlocked}
                      placeholder={t(`placeholder.${discipline}`)} aria-describedby={showCounter ? "coach-question-note coach-question-counter" : "coach-question-note"}
                      onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
                      onChange={(event) => { setDraft(event.target.value); setPmcSnapshotId(null); setRiderSnapshotId(null); setPlannerContext(null); setRidePlanContext(null); setSource("free_text"); setRequestId(null); }} />
                    <div className="coach-sheet__composer-meta">
                      <Text id="coach-question-note" as="span" variant="caption" tone="tertiary">{t("independentNote")}</Text>
                      {plannerContext && <Text as="span" variant="caption" tone="accent"
                        data-prescription-id={plannerContext.prescriptionId} data-source-request-id={plannerContext.sourceRequestId}>{t("progress.questions.linked")}</Text>}
                      {ridePlanContext && <Text as="span" variant="caption" tone="accent">{t("ridePlan.questions.linked")}</Text>}
                      {productSlice === "latest_activity_review" && <Chip variant="accent" icon={<Sparkles size={12} />}
                        aria-label={t("latestActivityReviewClear")} onClick={clearLatestActivityReviewMode}>
                        {t("latestActivityReviewLinked")} <X size={12} aria-hidden />
                      </Chip>}
                      {showCounter && <Text id="coach-question-counter" as="span" className="coach-sheet__counter" variant="caption" tone="tertiary" mono>{draft.length}/1000</Text>}
                    </div>
                    <Button block variant="primary" disabled={draft.trim().length < 2 || submissionBlocked} onClick={() => void submit()}>{t("submit")}</Button>
                    {quota && <Text as="p" className="coach-sheet__quota" variant="caption" tone={exhausted ? "warning" : "tertiary"}>
                      {exhausted ? t("quota.exhausted", { resetAt: formatDate(quota.resetAt, i18n.language, quota.timezone) }) : t("quota.remaining", { count: quota.remaining })}
                    </Text>}
                  </div>
                  <div className="coach-sheet__quick-prompts">
                    <Text as="h3" variant="label" tone="secondary">{t("suggestions.title")}</Text>
                    <div className="coach-sheet__suggestions">
                      {suggestions.map((index) => {
                        const question = t(`suggestions.${discipline}.${index}`);
                        const label = t(`suggestions.labels.${discipline}.${index}`);
                        return <Button key={index} block variant="ghost" aria-label={`${label}: ${question}`} disabled={submissionBlocked} onClick={() => chooseSuggestion(index)}>
                          <span className="coach-sheet__suggestion-copy">
                            <Text as="span" variant="caption" tone="accent">{label}</Text>
                            <Text as="span" variant="bodySmall">{question}</Text>
                          </span>
                        </Button>;
                      })}
                    </div>
                  </div>
                </div>}
                {phase === "submitting" && <Card className="coach-sheet__loading" role="status" aria-live="polite"><span className="ds-btn__spinner" aria-hidden />
                  <Text as="p" variant="subtitle">{t("loadingAnswer")}</Text><Text as="small" variant="caption" tone="tertiary">{t("loadingHonest")}</Text></Card>}
                {phase === "network_error" && <Alert className="coach-sheet__alert" variant="warning" title={t("states.network.title")}>
                  <Text as="p" variant="bodySmall">{t("states.network.body")}</Text></Alert>}
                {phase === "terminal_error" && <Alert className="coach-sheet__alert" variant={submitFailure === "serviceUnavailable" ? "warning" : "danger"}
                  title={t(submitFailure === "serviceUnavailable" ? "serviceUnavailable.title" : `states.${submitFailure ?? "terminal"}.title`)}>
                  <Text as="p" variant="bodySmall">{t(submitFailure === "serviceUnavailable" ? "serviceUnavailable.body" : `states.${submitFailure ?? "terminal"}.body`)}</Text></Alert>}
                {response && phase !== "submitting" && ("outcome" in response
                  ? <CoachV2Result response={response} locale={i18n.language} selectedOption={clarificationOption} exhausted={submissionBlocked}
                    onSelectOption={setClarificationOption} onClarification={() => void submitClarification()} onAction={v2Action}
                    onReanalyze={startAnother}
                    onSuggested={(query, prescriptionId, sourceRequestId) => {
                      if (prescriptionId && sourceRequestId) choosePlannerQuestion(query, prescriptionId, sourceRequestId);
                      else { startAnother(); setDraft(query); setSource("free_text"); }
                    }} />
                  : <CoachResult response={response} evidenceOpen={evidenceOpen} locale={i18n.language}
                    onEvidence={() => { setEvidenceOpen((value) => !value); if (!evidenceOpen) coachAnalytics.evidenceExpand(response.status); }}
                    onAction={action} />)}
                </>
              )}
            </div>
            {user && (phase !== "ready" || response) && <div className="coach-sheet__dock">
              {canRateResponse && <CoachFeedback feedback={feedback} onFeedback={sendFeedback} />}
              <footer className="coach-sheet__footer">
                  {quota && <Text as="div" className="coach-sheet__quota" variant="caption" tone={exhausted ? "warning" : "tertiary"}>
                    {exhausted ? t("quota.exhausted", { resetAt: formatDate(quota.resetAt, i18n.language, quota.timezone) }) : t("quota.remaining", { count: quota.remaining })}
                    {(response && ("outcome" in response
                      ? response.capabilityVersion === "p2" ? response.quota.consumed : response.retry.previousTurnConsumed
                      : response.retry.previousTurnConsumed))
                      && <Text as="small" variant="caption" tone="tertiary">{t("quota.previousConsumed")}</Text>}
                  </Text>}
                  <div className="coach-sheet__actions">
                    {!serviceUnavailable && canRetry && <Button size="sm" variant="outline" onClick={() => void retry()}>{retryAction === "new"
                      ? t("retry.newTurnAction") : retryAction === "poll" ? t("retry.poll") : retryAction === "replay" ? t("retry.replay") : t("retry.same")}</Button>}
                    {serviceUnavailable && <Button size="sm" variant="primary" onClick={closeSheet}>{t("serviceUnavailable.close")}</Button>}
                    {!serviceUnavailable && (response || phase === "network_error" || phase === "terminal_error") && phase !== "submitting"
                      && <Button size="sm" variant="secondary" onClick={startAnother}>{t("another")}</Button>}
                  </div>
              </footer>
            </div>}
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

function CoachFeedback({ feedback, onFeedback }: { feedback: boolean | null; onFeedback: (helpful: boolean) => void }) {
  const { t } = useTranslation("coach");
  return <section className="coach-result__feedback-section">
    <Text as="p" variant="label">{t("feedback.prompt")}</Text>
    <div className="coach-result__feedback" role="group" aria-label={t("feedback.label")}>
      <Button size="sm" variant={feedback === true ? "primary" : "outline"} disabled={feedback !== null} onClick={() => onFeedback(true)}>{t("feedback.helpful")}</Button>
      <Button size="sm" variant={feedback === false ? "primary" : "outline"} disabled={feedback !== null} onClick={() => onFeedback(false)}>{t("feedback.notHelpful")}</Button>
    </div>
  </section>;
}

function CoachV2Result({ response, locale, selectedOption, exhausted, onSelectOption, onClarification, onAction, onSuggested, onReanalyze }: {
  response: CoachResponseEnvelope; locale: string; selectedOption: string | null; exhausted: boolean;
  onSelectOption: (option: string) => void; onClarification: () => void;
  onAction: (code: CoachAnswerActionCode, entity?: CoachEntityRef) => void;
  onSuggested: (query: string, prescriptionId?: string, sourceRequestId?: string) => void;
  onReanalyze: () => void;
}) {
  const { t } = useTranslation("coach");
  if (response.capabilityVersion === "p2") {
    return <div className="coach-result">
      {response.outcome === "answer" && <CoachAnswerDocumentView response={response} locale={locale} onAction={onAction}
        onReanalyze={onReanalyze} />}
      {response.outcome === "unavailable" && <Alert className="coach-result__state" variant="warning"
        title={t("p2Unavailable.title")}>{t(`p2Unavailable.${response.error.code}`)}</Alert>}
    </div>;
  }
  const spec = response.clarification;
  const expired = spec ? Date.parse(spec.expiresAt) <= Date.now() : false;
  const providerUnavailable = response.error?.code === "provider_kill_switch";
  return <div className="coach-result">
    {response.answer && <CoachAnswerDocumentView response={response} locale={locale} onAction={onAction}
      onReanalyze={onReanalyze}
      onPlannerQuestion={(question, prescriptionId, sourceRequestId) => onSuggested(question, prescriptionId, sourceRequestId)} />}
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
          return query && <Button key={suggestion.queryTemplateId} variant="outline" disabled={exhausted} onClick={() => onSuggested(query)}>{query}</Button>;
        })}
      </div>}
    </div>}
    {providerUnavailable && <Alert className="coach-result__state" variant="warning" title={t("serviceUnavailable.title")}>
      {t("serviceUnavailable.body")}
    </Alert>}
    {!providerUnavailable && (["quota_exceeded", "budget_blocked", "failed"] as const).includes(response.outcome as "quota_exceeded" | "budget_blocked" | "failed")
      && <Alert className="coach-result__state" variant="warning">{t(`v2State.${response.outcome}`)}</Alert>}
  </div>;
}

function CoachResult({ response, evidenceOpen, locale, onEvidence, onAction }: {
  response: CoachResponse; evidenceOpen: boolean; locale: string;
  onEvidence: () => void; onAction: (code: CoachActionCode) => void;
}) {
  const { t } = useTranslation("coach");
  return <div className="coach-result">
    {response.context && <div className="coach-sheet__chips"><Chip>{t(`discipline.${response.context.discipline}`)}</Chip><Chip>{t(`period.${response.context.period}`)}</Chip><Chip>{t(response.context.goalIncluded ? "goal.included" : "goal.notIncluded")}</Chip></div>}
    <div className="coach-result__answer coach-result__answer--hero">
      {response.answer.blocks.map((block, index) => <div key={`${block.kind}-${index}`} className={`coach-result__block coach-result__block--${block.kind}`}>
        {block.parts.map((part, partIndex) => <span key={`${part.type}-${partIndex}`}>{part.type === "text" ? part.text : part.displayValue}</span>)}
      </div>)}
    </div>
    {response.status !== "ok" && (["fallback", "quota_exceeded", "budget_blocked"].includes(response.status)
      ? <Alert className="coach-result__state" variant="warning">{t(`states.${response.status}.body`)}</Alert>
      : <Card className="coach-result__state" padding="compact" role="status"><Text as="p" variant="bodySmall">{t(`states.${response.status}.body`)}</Text></Card>)}
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
  </div>;
}
