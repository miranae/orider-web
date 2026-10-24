import { isSportUiEnabled } from "../config/sportFeatures";
import { useCallback, useEffect, useRef, useState } from "react";
import { coachRoute } from "../utils/coachRoute";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Bot, Clock3, History, Trash2, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useDialog } from "../contexts/DialogContext";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { LocalizedLink } from "../components/LocalizedLink";
import { Alert, Button, Card, Chip, Text, Textarea, buttonClass } from "../theme/components";
import { CoachAnswerDocumentView } from "../features/coach/CoachAnswerDocument";
import { CoachQuestionLauncher } from "../features/coach/CoachQuestionLauncher";
import { safeClarificationText } from "../features/coach/coachClarificationText";
import { FirstUseCoachConsent } from "../features/coach/FirstUseCoachConsent";
import { getCoachConsentPolicy, type CoachConsentPolicy } from "../services/coachConsentClient";
import { getCoachStatus, type CoachQuota } from "../services/coachClient";
import {
  COACH_P1_CAPABILITY_VERSION, COACH_V2_API_VERSION, COACH_V2_REQUEST_SCHEMA_VERSION,
  type CoachAnswerActionCode, type CoachEntityRef, type CoachV2QuestionRequest,
} from "../services/coachV2Contract";
import {
  continueCoachThread, deleteAllCoachThreads, deleteCoachThread, getCoachThread, getCoachThreads,
  isCoachHistoryTransportError,
  type CoachHistoryResponse, type CoachThread, type CoachThreadSummary,
} from "../services/coachHistoryClient";
import { reportCoachReadError, type CoachReadErrorKind } from "../services/coachReadError";
import "../features/coach/coach-question.css";
import "../features/coach/coach-history.css";
import { ICON_SIZE } from "../theme/tokens/icon";

const PAGE_SIZE = 20;

interface PendingFollowUp {
  body: CoachV2QuestionRequest;
  threadId: string;
  uid: string;
  generation: number;
  routeGeneration: number;
  turnCount: number;
}

function consentActive(policy: CoachConsentPolicy): boolean {
  return policy.consent.active && policy.consent.current && !policy.consent.revoked
    && policy.consent.currentPolicyVersion === policy.policyVersion
    && policy.consent.storedPolicyVersion === policy.policyVersion;
}

function formatDate(value: string, locale: string): string {
  try { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

function hasStoredAnswer(response: CoachHistoryResponse): boolean {
  return "answer" in response && Boolean(response.answer);
}

function CoachStoredTurnResult({ response }: { response: CoachHistoryResponse }) {
  const { t } = useTranslation("coach");
  if (response.outcome === "answer") return null;
  if (response.schemaVersion === "coach-history-failure-v1") {
    return <Card className="coach-thread-turn__outcome coach-thread-turn__outcome--warning" variant="inset">
      <Text as="p" variant="bodySmall" tone="warning">{t("v2State.failed")}</Text>
    </Card>;
  }
  if (response.capabilityVersion === "p2") {
    return <Card className="coach-thread-turn__outcome coach-thread-turn__outcome--warning" variant="inset">
      <Text as="h3" variant="subtitle" tone="warning">{t("p2Unavailable.title")}</Text>
      <Text as="p" variant="bodySmall" tone="secondary">{t(`p2Unavailable.${response.error.code}`)}</Text>
    </Card>;
  }
  if (response.outcome === "unsupported") {
    return <Card className="coach-thread-turn__outcome coach-thread-turn__outcome--warning" variant="inset">
      <Text as="h3" variant="subtitle" tone="warning">{t("unsupportedV2.title")}</Text>
      <Text as="p" variant="bodySmall" tone="secondary">{t("unsupportedV2.body")}</Text>
    </Card>;
  }
  if (response.outcome === "clarification_required" && response.clarification) {
    const prompt = safeClarificationText(response.clarification.promptKey, "prompt", t);
    return <Card className="coach-thread-turn__outcome" variant="inset">
      <Text as="h3" variant="subtitle">{t("clarification.title")}</Text>
      <Text as="p" variant="bodySmall" tone="secondary">{prompt}</Text>
      <div className="coach-thread-turn__options" aria-label={prompt}>{response.clarification.options.map((option) => <Chip key={option.optionId}>
        {safeClarificationText(option.labelKey, "option", t, option.optionId)}
      </Chip>)}</div>
    </Card>;
  }
  if (["quota_exceeded", "budget_blocked", "failed"].includes(response.outcome)) {
    return <Card className="coach-thread-turn__outcome coach-thread-turn__outcome--warning" variant="inset">
      <Text as="p" variant="bodySmall" tone="warning">{t(`v2State.${response.outcome}`)}</Text>
    </Card>;
  }
  return null;
}

export default function CoachHistoryPage() {
  const { t, i18n } = useTranslation("coach");
  const { user, profile, signIn } = useAuth();
  const dialog = useDialog();
  const navigate = useLocalizedNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const [params] = useSearchParams();
  const requestedSport = params.get("sport");
  const preferredSport = requestedSport ?? profile?.primaryDiscipline;
  const coachDiscipline = preferredSport && isSportUiEnabled(preferredSport) && (preferredSport === "bike" || preferredSport === "run" || preferredSport === "swim") ? preferredSport : "bike";
  const uid = user?.uid ?? null;
  const generationRef = useRef(0);
  const listRequestRef = useRef(0);
  const quotaRequestRef = useRef(0);
  const routeGenerationRef = useRef(0);
  const uidRef = useRef(uid);
  const routeThreadRef = useRef(threadId);
  const renderedUidRef = useRef(uid);
  const renderedRouteRef = useRef(threadId);
  if (renderedUidRef.current !== uid) {
    renderedUidRef.current = uid;
    generationRef.current += 1;
  }
  if (renderedRouteRef.current !== threadId) {
    renderedRouteRef.current = threadId;
    routeGenerationRef.current += 1;
  }
  uidRef.current = uid;
  routeThreadRef.current = threadId;
  const userGeneration = generationRef.current;
  const routeGeneration = routeGenerationRef.current;
  const pendingBodyRef = useRef<PendingFollowUp | null>(null);
  const executingFollowUpRef = useRef<PendingFollowUp | null>(null);
  const consentPendingRef = useRef<PendingFollowUp | null>(null);
  const followUpRef = useRef<HTMLTextAreaElement>(null);
  const [threads, setThreads] = useState<CoachThreadSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [thread, setThread] = useState<CoachThread | null>(null);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingEarlierTurns, setLoadingEarlierTurns] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [listFailure, setListFailure] = useState<CoachReadErrorKind>("unknown");
  const [detailFailure, setDetailFailure] = useState<CoachReadErrorKind>("unknown");
  const [quotaFailure, setQuotaFailure] = useState<CoachReadErrorKind>("unknown");
  const [threadError, setThreadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<"transport" | "rejected" | "unavailable" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [policy, setPolicy] = useState<CoachConsentPolicy | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [quota, setQuota] = useState<CoachQuota | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState<"answer" | "terminal" | null>(null);
  const [stateUid, setStateUid] = useState(uid);

  const current = useCallback((generation: number, expectedUid: string, expectedThread?: string, expectedRouteGeneration?: number) =>
    generationRef.current === generation && uidRef.current === expectedUid
      && (expectedThread === undefined || routeThreadRef.current === expectedThread)
      && (expectedRouteGeneration === undefined || routeGenerationRef.current === expectedRouteGeneration), []);

  const loadList = useCallback(async (generation = generationRef.current, expectedUid = uidRef.current) => {
    if (!expectedUid) { setLoadingList(false); return; }
    const requestSequence = ++listRequestRef.current;
    setLoadingList(true); setLoadError(false);
    try {
      const page = await getCoachThreads(PAGE_SIZE);
      if (!current(generation, expectedUid) || listRequestRef.current !== requestSequence) return;
      setThreads(page.threads); setCursor(page.nextCursor);
    } catch (error) { if (current(generation, expectedUid) && listRequestRef.current === requestSequence) { setListFailure(reportCoachReadError("history-list", error)); setLoadError(true); } }
    finally { if (current(generation, expectedUid) && listRequestRef.current === requestSequence) setLoadingList(false); }
  }, [current]);

  const loadQuota = useCallback(async (generation = generationRef.current, expectedUid = uidRef.current) => {
    if (!expectedUid) return;
    const requestSequence = ++quotaRequestRef.current;
    setLoadingQuota(true); setQuotaError(false);
    try {
      const status = await getCoachStatus();
      if (current(generation, expectedUid) && quotaRequestRef.current === requestSequence) setQuota(status.quota);
    } catch (error) { if (current(generation, expectedUid) && quotaRequestRef.current === requestSequence) { setQuotaFailure(reportCoachReadError("history-quota", error)); setQuota(null); setQuotaError(true); } }
    finally { if (current(generation, expectedUid) && quotaRequestRef.current === requestSequence) setLoadingQuota(false); }
  }, [current]);

  const loadThread = useCallback(async (targetId: string, generation = generationRef.current, expectedUid = uidRef.current,
    routeGeneration = routeGenerationRef.current) => {
    if (!expectedUid) return;
    setLoadingThread(true); setThreadError(false);
    try {
      const loaded = await getCoachThread(targetId, PAGE_SIZE);
      if (!current(generation, expectedUid, targetId, routeGeneration)) return;
      setThread(loaded.thread); setThreadCursor(loaded.nextCursor);
    } catch (error) { if (current(generation, expectedUid, targetId, routeGeneration)) { setDetailFailure(reportCoachReadError("history-detail", error)); setThreadError(true); } }
    finally { if (current(generation, expectedUid, targetId, routeGeneration)) setLoadingThread(false); }
  }, [current]);

  useEffect(() => {
    const generation = userGeneration;
    setStateUid(uid);
    pendingBodyRef.current = null;
    consentPendingRef.current = null;
    setThreads([]); setCursor(null); setThread(null); setThreadCursor(null); setQuota(null); setPolicy(null);
    setLoadingList(Boolean(uid)); setLoadingThread(false); setLoadingMore(false); setLoadingEarlierTurns(false); setLoadingQuota(false);
    setLoadError(false); setThreadError(false); setQuotaError(false); setDraft(""); setSubmitError(null); setFollowUpSuccess(null);
    setSubmitting(false); setDeleting(false); setConsentOpen(false);
    if (uid) { void loadList(generation, uid); void loadQuota(generation, uid); }
  }, [loadList, loadQuota, uid, userGeneration]);

  useEffect(() => {
    pendingBodyRef.current = null;
    consentPendingRef.current = null;
    setThread(null); setThreadCursor(null); setThreadError(false); setDraft(""); setSubmitError(null); setFollowUpSuccess(null);
    setSubmitting(false); setConsentOpen(false);
    if (uid && threadId) void loadThread(threadId, userGeneration, uid, routeGeneration);
  }, [loadThread, routeGeneration, threadId, uid, userGeneration]);

  async function loadMore() {
    if (!cursor || loadingMore || !uid) return;
    const generation = generationRef.current; const expectedUid = uid;
    const listRequest = listRequestRef.current;
    setLoadingMore(true);
    try {
      const page = await getCoachThreads(PAGE_SIZE, cursor);
      if (!current(generation, expectedUid) || listRequestRef.current !== listRequest) return;
      setThreads((current) => [...current, ...page.threads.filter((next) => !current.some((item) => item.threadId === next.threadId))]);
      setCursor(page.nextCursor);
    } catch (error) { if (current(generation, expectedUid) && listRequestRef.current === listRequest) { setListFailure(reportCoachReadError("history-list", error)); setLoadError(true); } }
    finally { if (current(generation, expectedUid)) setLoadingMore(false); }
  }

  async function loadEarlierTurns() {
    if (!thread || !threadCursor || loadingEarlierTurns || !uid) return;
    const generation = generationRef.current; const expectedUid = uid; const expectedThread = thread.threadId;
    const routeGeneration = routeGenerationRef.current;
    setLoadingEarlierTurns(true);
    try {
      const page = await getCoachThread(expectedThread, PAGE_SIZE, threadCursor);
      if (!current(generation, expectedUid, expectedThread, routeGeneration)) return;
      setThread((current) => current ? { ...current, ...page.thread,
        turns: [...page.thread.turns.filter((next) => !current.turns.some((turn) => turn.turnId === next.turnId)), ...current.turns] } : current);
      setThreadCursor(page.nextCursor);
    } catch (error) { if (current(generation, expectedUid, expectedThread, routeGeneration)) { setDetailFailure(reportCoachReadError("history-detail", error)); setThreadError(true); } }
    finally { if (current(generation, expectedUid, expectedThread, routeGeneration)) setLoadingEarlierTurns(false); }
  }

  async function removeThread(target: CoachThreadSummary) {
    if (!uid || (submitting && target.threadId === threadId)) return;
    const generation = generationRef.current; const expectedUid = uid;
    const confirmed = await dialog.confirm(t("history.deleteConfirm", { title: target.title }), {
      title: t("history.deleteTitle"), confirmLabel: t("history.delete"), destructive: true,
    });
    if (!confirmed || !current(generation, expectedUid)) return;
    setDeleting(true);
    try {
      await deleteCoachThread(target.threadId);
      if (!current(generation, expectedUid)) return;
      setThreads((current) => current.filter((item) => item.threadId !== target.threadId));
      if (routeThreadRef.current === target.threadId) navigate(coachRoute("/coach/chat", coachDiscipline));
    } catch { if (current(generation, expectedUid)) { setDetailFailure("unknown"); setThreadError(true); } }
    finally { if (current(generation, expectedUid)) setDeleting(false); }
  }

  async function removeAll() {
    if (!uid || submitting) return;
    const generation = generationRef.current; const expectedUid = uid;
    const confirmed = await dialog.confirm(t("history.deleteAllConfirm"), {
      title: t("history.deleteAllTitle"), confirmLabel: t("history.deleteAll"), destructive: true,
    });
    if (!confirmed || !current(generation, expectedUid)) return;
    setDeleting(true);
    try {
      await deleteAllCoachThreads();
      if (!current(generation, expectedUid)) return;
      setThreads([]); setCursor(null); setThread(null); navigate(coachRoute("/coach/chat", coachDiscipline));
    } catch { if (current(generation, expectedUid)) { setListFailure("unknown"); setLoadError(true); } }
    finally { if (current(generation, expectedUid)) setDeleting(false); }
  }

  async function executeFollowUp(pending: PendingFollowUp) {
    if (submitting || executingFollowUpRef.current === pending || pendingBodyRef.current !== pending
      || !current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
    executingFollowUpRef.current = pending;
    setSubmitting(true); setSubmitError(null); setFollowUpSuccess(null);
    try {
      const response = await continueCoachThread(pending.threadId, pending.body);
      if (!current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
      setQuota((current) => current ? { ...current, remaining: response.quota.remaining, resetAt: response.quota.resetAt } : current);
      let canonical: Awaited<ReturnType<typeof getCoachThread>>;
      try {
        canonical = await getCoachThread(pending.threadId, PAGE_SIZE);
      } catch {
        if (current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) { setThreadError(true); setSubmitError("transport"); }
        return;
      }
      if (!current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
      setThreadError(false);
      setThread(canonical.thread); setThreadCursor(canonical.nextCursor);
      setThreads((items) => items.map((item) => item.threadId === canonical.thread.threadId
        ? { ...item, updatedAt: canonical.thread.updatedAt, turnCount: canonical.thread.turnCount,
          revision: canonical.thread.revision, title: canonical.thread.title } : item));
      const persisted = canonical.thread.turns.find((turn) => turn.requestId === pending.body.requestId
        && turn.response.requestId === pending.body.requestId && turn.question === pending.body.question
        && turn.sessionRevision > pending.body.expectedSessionRevision!
        && turn.sessionRevision <= canonical.thread.revision);
      if (!persisted || canonical.thread.revision <= pending.body.expectedSessionRevision!
        || canonical.thread.turnCount <= pending.turnCount) {
        setSubmitError(response.httpOk ? "transport" : "unavailable");
        return;
      }
      setDraft(""); pendingBodyRef.current = null;
      setFollowUpSuccess(persisted.response.outcome === "answer" ? "answer" : "terminal");
    } catch (error) {
      if (current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) {
        if (isCoachHistoryTransportError(error)) setSubmitError("transport");
        else { pendingBodyRef.current = null; setSubmitError("rejected"); }
      }
    }
    finally {
      if (executingFollowUpRef.current === pending) executingFollowUpRef.current = null;
      if (current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) setSubmitting(false);
    }
  }

  async function submitFollowUp() {
    if (!thread || !uid || submitting || pendingBodyRef.current || !quota || quota.remaining === 0) return;
    const question = draft.trim();
    if (question.length < 2 || question.length > 1000) return;
    const body: CoachV2QuestionRequest = {
      requestId: crypto.randomUUID(), question, discipline: thread.discipline,
      locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US", apiVersion: COACH_V2_API_VERSION,
      schemaVersion: COACH_V2_REQUEST_SCHEMA_VERSION, capabilityVersion: COACH_P1_CAPABILITY_VERSION,
      contextFilters: {}, responseFormat: "auto", expectedSessionRevision: thread.revision,
    };
    const pending = { body, threadId: thread.threadId, uid, generation: generationRef.current, routeGeneration: routeGenerationRef.current, turnCount: thread.turnCount };
    pendingBodyRef.current = pending;
    try {
      const loadedPolicy = await getCoachConsentPolicy();
      if (pendingBodyRef.current !== pending || !current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
      setPolicy(loadedPolicy);
      if (!consentActive(loadedPolicy)) { consentPendingRef.current = pending; setConsentOpen(true); return; }
      await executeFollowUp(pending);
    } catch {
      if (pendingBodyRef.current === pending && current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) {
        pendingBodyRef.current = null; setSubmitError("rejected");
      }
    }
  }

  async function retryPendingFollowUp() {
    const pending = pendingBodyRef.current;
    if (!pending || submitting || !current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
    await executeFollowUp(pending);
  }

  function startEditedFollowUp() {
    pendingBodyRef.current = null;
    if (consentPendingRef.current) { consentPendingRef.current = null; setConsentOpen(false); }
    setSubmitError(null);
    setFollowUpSuccess(null);
  }

  function answerAction(code: CoachAnswerActionCode, entity?: CoachEntityRef) {
    if (code === "OPEN_ACTIVITY" && entity?.entityType === "activity") navigate(`/activity/${encodeURIComponent(entity.entityId)}`);
    else navigate(code === "VIEW_TRAINING_LOAD" ? coachRoute("/coach/condition", thread?.discipline ?? coachDiscipline) : "/athlete/me");
  }

  const followUpUnavailable = submitting || loadingQuota || quotaError || threadError || !quota || quota.remaining === 0;
  const dialogPending = consentOpen ? consentPendingRef.current : null;
  const launcher = <div data-testid="K6-0-3"><CoachQuestionLauncher
    user={user}
    discipline={coachDiscipline}
    onSignIn={signIn}
    onRequestSettled={() => { void loadList(); void loadQuota(); }}
    triggerBlock={false}
  /></div>;

  if (!user) return <section className="coach-history-page coach-history-page--signed-out">
    <header data-testid="K6-0" className="coach-history-page__header">
      <div><Text className="coach-history-page__eyebrow" as="p" variant="eyebrow" tone="accent"><Bot size={ICON_SIZE.md} aria-hidden /> {t("history.eyebrow")}</Text>
        <Text data-testid="K6-0-1" className="coach-history-page__title" as="h1" variant="pageTitle">{t("history.entryTitle")}</Text>
        <Text className="coach-history-page__description" as="p" variant="bodySmall" tone="secondary">{t("history.entryDescription")}</Text></div>
      {launcher}
    </header>
    <Card className="coach-history-entry"><Bot aria-hidden /><Text as="h2" variant="subtitle">{t("history.signInTitle")}</Text>
      <Text as="p" variant="bodySmall" tone="secondary">{t("history.signInRequired")}</Text></Card>
  </section>;
  if (stateUid !== uid) return <section className="coach-history-page"><Card role="status">{t("history.loading")}</Card></section>;

  return <section className={`coach-history-page${threadId ? " has-selection" : ""}`}>
    <header data-testid="K6-0" className="coach-history-page__header">
      <div><Text className="coach-history-page__eyebrow" as="p" variant="eyebrow" tone="accent"><History size={ICON_SIZE.md} aria-hidden /> {t("history.eyebrow")}</Text>
        <Text data-testid="K6-0-1" className="coach-history-page__title" as="h1" variant="pageTitle">{t("history.title")}</Text><Text className="coach-history-page__description" as="p" variant="bodySmall" tone="secondary">{t("history.description")}</Text></div>
      <div className="coach-history-page__actions">{launcher}
        {threads.length > 0 && <Button data-testid="K6-0-4" className="coach-history-page__delete-all" variant="ghost" size="sm"
          disabled={deleting || submitting} onClick={() => void removeAll()}>{t("history.deleteAll")}</Button>}</div>
    </header>
    <div className={`coach-history-layout${threadId ? " has-selection" : ""}`}>
      <section data-testid="K6-1" className="coach-history-list" aria-labelledby="coach-history-list-title">
        <Text id="coach-history-list-title" as="h2" variant="subtitle">{t("history.listTitle")}</Text>
        {loadingList && <Card role="status">{t("history.loading")}</Card>}
        {loadError && <Alert variant="danger" title={t("history.loadFailed")}><Text as="p" variant="bodySmall">{t(`readError.${listFailure}`)}</Text><Button variant="outline" onClick={() => void loadList()}>{t("history.retry")}</Button></Alert>}
        {!loadingList && !loadError && threads.length === 0 && <Card data-testid="K6-1-4" className="coach-history-empty"><History aria-hidden /><Text as="h3" variant="subtitle">{t("history.emptyTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("history.emptyBody")}</Text></Card>}
        <div className="coach-history-list__items">{threads.map((item) => <article key={item.threadId} className={`coach-history-item${threadId === item.threadId ? " is-active" : ""}`}>
          <LocalizedLink to={coachRoute(`/coach/chat/${item.threadId}`, item.discipline)} data-testid="K6-1-1" className="coach-history-item__link" aria-current={threadId === item.threadId ? "page" : undefined}
            aria-disabled={submitting && threadId === item.threadId ? true : undefined}
            onClick={(event) => { if (submitting && threadId === item.threadId) event.preventDefault(); }}>
            <Text as="strong" variant="body">{item.title}</Text>
            <span className="coach-history-item__meta"><Chip>{t(`discipline.${item.discipline}`)}</Chip><span><Clock3 size={ICON_SIZE.sm} aria-hidden />{formatDate(item.updatedAt, i18n.language)}</span><span>{t("history.turnCount", { count: item.turnCount })}</span></span>
          </LocalizedLink>
          <Button data-testid="K6-1-2" className="coach-history-item__delete" iconOnly dense size="sm" variant="ghost" aria-label={t("history.deleteNamed", { title: item.title })}
            disabled={deleting || (submitting && threadId === item.threadId)} onClick={() => void removeThread(item)}><Trash2 size={ICON_SIZE.md} /></Button>
        </article>)}</div>
        {cursor && <Button block variant="ghost" loading={loadingMore} data-testid="K6-1-3" onClick={() => void loadMore()}>{t("history.loadMore")}</Button>}
      </section>
      <section data-testid="K6-2" className="coach-thread-detail" aria-labelledby="coach-thread-title">
        {!threadId && <Card className="coach-history-selection"><History aria-hidden /><Text as="h2" variant="subtitle">{t("history.selectTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("history.selectBody")}</Text></Card>}
        {loadingThread && <Card role="status">{t("history.loadingThread")}</Card>}
        {threadError && <Alert variant="danger" title={t("history.threadLoadFailed")}>
          <Text as="p" variant="bodySmall">{t(`readError.${detailFailure}`)}</Text>
          {threadId && <Button variant="outline" onClick={() => void loadThread(threadId, generationRef.current, uidRef.current)}>{t("history.retry")}</Button>}
        </Alert>}
        {threadId && thread?.threadId === threadId && !loadingThread && <>
          <header className="coach-thread-detail__header">
            <LocalizedLink data-testid="K6-2-9" to={coachRoute("/coach/chat", thread.discipline)} className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })} aria-label={t("history.back")}><ArrowLeft aria-hidden /></LocalizedLink>
            <div><Text id="coach-thread-title" as="h2" variant="subtitle">{thread.title}</Text><Text as="p" variant="caption" tone="tertiary">{t(`discipline.${thread.discipline}`)} · {formatDate(thread.updatedAt, i18n.language)}</Text></div>
            <Button className="coach-thread-detail__delete" iconOnly dense size="sm" variant="ghost" aria-label={t("history.deleteNamed", { title: thread.title })}
              disabled={deleting || submitting} onClick={() => void removeThread(thread)}><Trash2 size={ICON_SIZE.md} /></Button>
          </header>
          <div data-testid="K6-2-1" className="coach-thread-turns">{threadCursor && <Button block variant="ghost" loading={loadingEarlierTurns} data-testid="K6-2-2" onClick={() => void loadEarlierTurns()}>{t("history.loadEarlierTurns")}</Button>}
            {thread.turns.map((turn, index) => {
              const turnNumber = thread.turnCount - thread.turns.length + index + 1;
              const turnLabel = t("history.turnNumber", { count: turnNumber });
              return <article key={turn.turnId} className="coach-thread-turn"
              aria-labelledby={`coach-turn-${turn.turnId}`}>
              <header className="coach-thread-turn__chronology">
                <Text id={`coach-turn-${turn.turnId}`} as="h3" variant="eyebrow" tone="tertiary">
                  {turnLabel}
                </Text>
                <time dateTime={turn.createdAt}><Text as="span" variant="caption" tone="tertiary">{formatDate(turn.createdAt, i18n.language)}</Text></time>
              </header>
              <section className="coach-thread-message coach-thread-message--user" aria-label={`${turnLabel} · ${t("history.you")}`}>
                <div className="coach-thread-message__identity"><span className="coach-thread-message__avatar" aria-hidden><UserRound size={ICON_SIZE.md} /></span>
                  <Text as="h4" variant="label">{t("history.you")}</Text></div>
                <Card variant="inset" className="coach-thread-turn__question"><Text as="p" variant="body">{turn.question}</Text></Card>
              </section>
              <section className="coach-thread-message coach-thread-message--coach" aria-label={`${turnLabel} · ${t("history.coachName")}`}>
                <div className="coach-thread-message__identity"><span className="coach-thread-message__avatar" aria-hidden><Bot size={ICON_SIZE.md} /></span>
                  <Text as="h4" variant="label">{t("history.coachName")}</Text></div>
                <div className={`coach-thread-turn__answer${turn.response.outcome !== "answer" && !hasStoredAnswer(turn.response) ? " coach-thread-turn__answer--terminal" : ""}`}>{turn.response.schemaVersion !== "coach-history-failure-v1" && <CoachAnswerDocumentView response={turn.response}
                  locale={i18n.language} onAction={answerAction} historical />}
                  <CoachStoredTurnResult response={turn.response} />
                </div>
              </section>
            </article>;
            })}</div>
          <div data-testid="K6-3" className="coach-thread-composer"><label htmlFor="coach-follow-up"><Text variant="label">{t("history.followUpLabel")}</Text></label>
            <Textarea ref={followUpRef} id="coach-follow-up" rows={3} maxLength={1000} value={draft}
              disabled={followUpUnavailable}
              placeholder={t("history.followUpPlaceholder")} onChange={(event) => { startEditedFollowUp(); setDraft(event.target.value); }} />
            <div className="coach-thread-composer__meta"><Text variant="caption" tone="tertiary">{t("history.contextNote")}</Text><Text variant="caption" tone="tertiary" mono>{draft.length}/1000</Text></div>
            {quotaError && <Alert variant="warning" title={t("history.quotaLoadFailed")}><Text as="p" variant="bodySmall">{t(`readError.${quotaFailure}`)}</Text><Button variant="outline" size="sm" onClick={() => void loadQuota()}>{t("history.retryQuota")}</Button></Alert>}
            {submitError && <div className="coach-thread-composer__retry">
              <Text as="p" variant="bodySmall" tone="danger" role="alert">{t("history.submitFailed")}</Text>
              {(submitError === "transport" || submitError === "unavailable") && pendingBodyRef.current && <>
                <Text as="p" variant="caption" tone="tertiary">{t("history.sameRequestRetryNote")}</Text>
                <Button variant="outline" size="sm" disabled={submitting} data-testid="K6-3-2" onClick={() => void retryPendingFollowUp()}>{t("history.sameRequestRetry")}</Button>
              </>}
            </div>}
            {followUpSuccess && <Text as="p" variant="bodySmall" tone={followUpSuccess === "answer" ? "success" : "secondary"} role="status" aria-live="polite">{t(followUpSuccess === "answer" ? "history.followUpSaved" : "history.followUpTerminalSaved")}</Text>}
            <div className="coach-thread-composer__actions">{loadingQuota && <Text variant="caption" tone="tertiary">{t("history.loadingQuota")}</Text>}
              {quota && <Text data-testid="K6-0-2" variant="caption" tone={quota.remaining === 0 ? "warning" : "tertiary"}>{t("quota.remaining", { count: quota.remaining })}</Text>}
              <Button variant="primary" loading={submitting} disabled={draft.trim().length < 2 || loadingQuota || quotaError || !quota || quota.remaining === 0
                || Boolean(pendingBodyRef.current)}
                data-testid="K6-3-1" onClick={() => void submitFollowUp()}>{t("history.followUp")}</Button></div>
          </div>
        </>}
      </section>
    </div>
    {policy && dialogPending && <FirstUseCoachConsent
      key={`${dialogPending.uid}:${dialogPending.generation}:${dialogPending.routeGeneration}:${dialogPending.body.requestId}`}
      open policy={policy} onCancel={() => {
      if (pendingBodyRef.current !== dialogPending || consentPendingRef.current !== dialogPending
        || !current(dialogPending.generation, dialogPending.uid, dialogPending.threadId, dialogPending.routeGeneration)) return;
      pendingBodyRef.current = null; consentPendingRef.current = null; setConsentOpen(false);
    }} onConsented={(saved) => {
      if (pendingBodyRef.current !== dialogPending || consentPendingRef.current !== dialogPending
        || !current(dialogPending.generation, dialogPending.uid, dialogPending.threadId, dialogPending.routeGeneration)) return;
      consentPendingRef.current = null; setConsentOpen(false); setPolicy(saved);
      void executeFollowUp(dialogPending);
    }} />}
  </section>;
}
