import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock3, History, MessageCircle, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useDialog } from "../contexts/DialogContext";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { LocalizedLink } from "../components/LocalizedLink";
import { Alert, Button, Card, Chip, Text, Textarea, buttonClass } from "../theme/components";
import { CoachAnswerDocumentView } from "../features/coach/CoachAnswerDocument";
import { safeClarificationText } from "../features/coach/coachClarificationText";
import { FirstUseCoachConsent } from "../features/coach/FirstUseCoachConsent";
import { getCoachConsentPolicy, type CoachConsentPolicy } from "../services/coachConsentClient";
import { getCoachStatus, type CoachQuota } from "../services/coachClient";
import {
  COACH_P1_CAPABILITY_VERSION, COACH_V2_API_VERSION, COACH_V2_REQUEST_SCHEMA_VERSION,
  type CoachAnswerActionCode, type CoachEntityRef, type CoachV2QuestionRequest, type CoachV2Response,
} from "../services/coachV2Contract";
import {
  continueCoachThread, deleteAllCoachThreads, deleteCoachThread, getCoachThread, getCoachThreads,
  type CoachThread, type CoachThreadSummary,
} from "../services/coachHistoryClient";
import "../features/coach/coach-question.css";
import "../features/coach/coach-history.css";

const PAGE_SIZE = 20;

interface PendingFollowUp {
  body: CoachV2QuestionRequest;
  threadId: string;
  uid: string;
  generation: number;
  routeGeneration: number;
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

function CoachStoredTurnResult({ response }: { response: CoachV2Response }) {
  const { t } = useTranslation("coach");
  if (response.outcome === "answer") return null;
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
  const { user } = useAuth();
  const dialog = useDialog();
  const navigate = useLocalizedNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const uid = user?.uid ?? null;
  const generationRef = useRef(0);
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
  const [threadError, setThreadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [policy, setPolicy] = useState<CoachConsentPolicy | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [quota, setQuota] = useState<CoachQuota | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState(false);
  const [stateUid, setStateUid] = useState(uid);

  const current = useCallback((generation: number, expectedUid: string, expectedThread?: string, expectedRouteGeneration?: number) =>
    generationRef.current === generation && uidRef.current === expectedUid
      && (expectedThread === undefined || routeThreadRef.current === expectedThread)
      && (expectedRouteGeneration === undefined || routeGenerationRef.current === expectedRouteGeneration), []);

  const loadList = useCallback(async (generation = generationRef.current, expectedUid = uidRef.current) => {
    if (!expectedUid) { setLoadingList(false); return; }
    setLoadingList(true); setLoadError(false);
    try {
      const page = await getCoachThreads(PAGE_SIZE);
      if (!current(generation, expectedUid)) return;
      setThreads(page.threads); setCursor(page.nextCursor);
    } catch { if (current(generation, expectedUid)) setLoadError(true); }
    finally { if (current(generation, expectedUid)) setLoadingList(false); }
  }, [current]);

  const loadQuota = useCallback(async (generation = generationRef.current, expectedUid = uidRef.current) => {
    if (!expectedUid) return;
    setLoadingQuota(true); setQuotaError(false);
    try {
      const status = await getCoachStatus();
      if (current(generation, expectedUid)) setQuota(status.quota);
    } catch { if (current(generation, expectedUid)) { setQuota(null); setQuotaError(true); } }
    finally { if (current(generation, expectedUid)) setLoadingQuota(false); }
  }, [current]);

  const loadThread = useCallback(async (targetId: string, generation = generationRef.current, expectedUid = uidRef.current,
    routeGeneration = routeGenerationRef.current) => {
    if (!expectedUid) return;
    setLoadingThread(true); setThreadError(false);
    try {
      const loaded = await getCoachThread(targetId, PAGE_SIZE);
      if (!current(generation, expectedUid, targetId, routeGeneration)) return;
      setThread(loaded.thread); setThreadCursor(loaded.nextCursor);
    } catch { if (current(generation, expectedUid, targetId, routeGeneration)) setThreadError(true); }
    finally { if (current(generation, expectedUid, targetId, routeGeneration)) setLoadingThread(false); }
  }, [current]);

  useEffect(() => {
    const generation = userGeneration;
    setStateUid(uid);
    pendingBodyRef.current = null;
    setThreads([]); setCursor(null); setThread(null); setThreadCursor(null); setQuota(null); setPolicy(null);
    setLoadingList(Boolean(uid)); setLoadingThread(false); setLoadingMore(false); setLoadingEarlierTurns(false); setLoadingQuota(false);
    setLoadError(false); setThreadError(false); setQuotaError(false); setDraft(""); setSubmitError(false); setFollowUpSuccess(false);
    setSubmitting(false); setDeleting(false); setConsentOpen(false);
    if (uid) { void loadList(generation, uid); void loadQuota(generation, uid); }
  }, [loadList, loadQuota, uid, userGeneration]);

  useEffect(() => {
    pendingBodyRef.current = null;
    setThread(null); setThreadCursor(null); setThreadError(false); setDraft(""); setSubmitError(false); setFollowUpSuccess(false);
    setSubmitting(false); setConsentOpen(false);
    if (uid && threadId) void loadThread(threadId, userGeneration, uid, routeGeneration);
  }, [loadThread, routeGeneration, threadId, uid, userGeneration]);

  async function loadMore() {
    if (!cursor || loadingMore || !uid) return;
    const generation = generationRef.current; const expectedUid = uid;
    setLoadingMore(true);
    try {
      const page = await getCoachThreads(PAGE_SIZE, cursor);
      if (!current(generation, expectedUid)) return;
      setThreads((current) => [...current, ...page.threads.filter((next) => !current.some((item) => item.threadId === next.threadId))]);
      setCursor(page.nextCursor);
    } catch { if (current(generation, expectedUid)) setLoadError(true); }
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
    } catch { if (current(generation, expectedUid, expectedThread, routeGeneration)) setThreadError(true); }
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
      if (routeThreadRef.current === target.threadId) navigate("/coach");
    } catch { if (current(generation, expectedUid)) setThreadError(true); }
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
      setThreads([]); setCursor(null); setThread(null); navigate("/coach");
    } catch { if (current(generation, expectedUid)) setLoadError(true); }
    finally { if (current(generation, expectedUid)) setDeleting(false); }
  }

  async function executeFollowUp(pending: PendingFollowUp) {
    if (submitting || !current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
    setSubmitting(true); setSubmitError(false); setFollowUpSuccess(false);
    try {
      const response = await continueCoachThread(pending.threadId, pending.body);
      if (!current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
      const canonical = await getCoachThread(pending.threadId, PAGE_SIZE);
      if (!current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
      setThread(canonical.thread); setThreadCursor(canonical.nextCursor); setDraft(""); pendingBodyRef.current = null;
      setQuota((current) => current ? { ...current, remaining: response.quota.remaining, resetAt: response.quota.resetAt } : current);
      setThreads((items) => items.map((item) => item.threadId === canonical.thread.threadId
        ? { ...item, updatedAt: canonical.thread.updatedAt, turnCount: canonical.thread.turnCount,
          revision: canonical.thread.revision, title: canonical.thread.title } : item));
      setFollowUpSuccess(true);
    } catch { if (current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) setSubmitError(true); }
    finally { if (current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) setSubmitting(false); }
  }

  async function submitFollowUp() {
    if (!thread || !uid || submitting || !quota || quota.remaining === 0) return;
    const question = draft.trim();
    if (question.length < 2 || question.length > 1000) return;
    const body: CoachV2QuestionRequest = {
      requestId: crypto.randomUUID(), question, discipline: thread.discipline,
      locale: i18n.language.startsWith("ko") ? "ko-KR" : "en-US", apiVersion: COACH_V2_API_VERSION,
      schemaVersion: COACH_V2_REQUEST_SCHEMA_VERSION, capabilityVersion: COACH_P1_CAPABILITY_VERSION,
      contextFilters: {}, responseFormat: "auto", expectedSessionRevision: thread.revision,
    };
    const pending = { body, threadId: thread.threadId, uid, generation: generationRef.current, routeGeneration: routeGenerationRef.current };
    pendingBodyRef.current = pending;
    try {
      const loadedPolicy = await getCoachConsentPolicy();
      if (!current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
      setPolicy(loadedPolicy);
      if (!consentActive(loadedPolicy)) { setConsentOpen(true); return; }
      await executeFollowUp(pending);
    } catch { if (current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) setSubmitError(true); }
  }

  async function retryPendingFollowUp() {
    const pending = pendingBodyRef.current;
    if (!pending || submitting || !current(pending.generation, pending.uid, pending.threadId, pending.routeGeneration)) return;
    await executeFollowUp(pending);
  }

  function startEditedFollowUp() {
    pendingBodyRef.current = null;
    setSubmitError(false);
    setFollowUpSuccess(false);
  }

  function answerAction(code: CoachAnswerActionCode, entity?: CoachEntityRef) {
    if (code === "OPEN_ACTIVITY" && entity?.entityType === "activity") navigate(`/activity/${encodeURIComponent(entity.entityId)}`);
    else navigate(code === "VIEW_TRAINING_LOAD" ? "/fitness" : "/my");
  }

  const followUpUnavailable = submitting || loadingQuota || quotaError || !quota || quota.remaining === 0;

  if (!user) return <main className="coach-history-page"><Alert variant="warning">{t("history.signInRequired")}</Alert></main>;
  if (stateUid !== uid) return <main className="coach-history-page"><Card role="status">{t("history.loading")}</Card></main>;

  return <main className={`coach-history-page${threadId ? " has-selection" : ""}`}>
    <header className="coach-history-page__header">
      <div><Text className="coach-history-page__eyebrow" as="p" variant="eyebrow" tone="accent"><History size={16} aria-hidden /> {t("history.eyebrow")}</Text>
        <Text className="coach-history-page__title" as="h1" variant="title">{t("history.title")}</Text><Text className="coach-history-page__description" as="p" variant="bodySmall" tone="secondary">{t("history.description")}</Text></div>
      {threads.length > 0 && <Button variant="ghost" size="sm" leadingIcon={<Trash2 size={16} />} disabled={deleting || submitting} onClick={() => void removeAll()}>{t("history.deleteAll")}</Button>}
    </header>
    <div className={`coach-history-layout${threadId ? " has-selection" : ""}`}>
      <section className="coach-history-list" aria-labelledby="coach-history-list-title">
        <Text id="coach-history-list-title" as="h2" variant="subtitle">{t("history.listTitle")}</Text>
        {loadingList && <Card role="status">{t("history.loading")}</Card>}
        {loadError && <Alert variant="danger" title={t("history.loadFailed")}><Button variant="outline" onClick={() => void loadList()}>{t("history.retry")}</Button></Alert>}
        {!loadingList && !loadError && threads.length === 0 && <Card className="coach-history-empty"><History aria-hidden /><Text as="h3" variant="subtitle">{t("history.emptyTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("history.emptyBody")}</Text></Card>}
        <div className="coach-history-list__items">{threads.map((item) => <article key={item.threadId} className={`coach-history-item${threadId === item.threadId ? " is-active" : ""}`}>
          <LocalizedLink to={`/coach/${item.threadId}`} className="coach-history-item__link" aria-current={threadId === item.threadId ? "page" : undefined}
            aria-disabled={submitting && threadId === item.threadId ? true : undefined}
            onClick={(event) => { if (submitting && threadId === item.threadId) event.preventDefault(); }}>
            <Text as="strong" variant="body">{item.title}</Text>
            <span className="coach-history-item__meta"><Chip>{t(`discipline.${item.discipline}`)}</Chip><span><Clock3 size={14} aria-hidden />{formatDate(item.updatedAt, i18n.language)}</span><span>{t("history.turnCount", { count: item.turnCount })}</span></span>
          </LocalizedLink>
          <Button iconOnly dense size="sm" variant="ghost" aria-label={t("history.deleteNamed", { title: item.title })}
            disabled={deleting || (submitting && threadId === item.threadId)} onClick={() => void removeThread(item)}><Trash2 size={18} /></Button>
        </article>)}</div>
        {cursor && <Button block variant="ghost" loading={loadingMore} onClick={() => void loadMore()}>{t("history.loadMore")}</Button>}
      </section>
      <section className="coach-thread-detail" aria-labelledby="coach-thread-title">
        {!threadId && <Card className="coach-history-selection"><History aria-hidden /><Text as="h2" variant="subtitle">{t("history.selectTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("history.selectBody")}</Text></Card>}
        {loadingThread && <Card role="status">{t("history.loadingThread")}</Card>}
        {threadError && <Alert variant="danger" title={t("history.threadLoadFailed")}>
          {threadId && <Button variant="outline" onClick={() => void loadThread(threadId, generationRef.current, uidRef.current)}>{t("history.retry")}</Button>}
        </Alert>}
        {threadId && thread?.threadId === threadId && !loadingThread && <>
          <header className="coach-thread-detail__header">
            <LocalizedLink to="/coach" className={buttonClass({ variant: "ghost", size: "sm", iconOnly: true })} aria-label={t("history.back")}><ArrowLeft aria-hidden /></LocalizedLink>
            <div><Text id="coach-thread-title" as="h2" variant="subtitle">{thread.title}</Text><Text as="p" variant="caption" tone="tertiary">{t(`discipline.${thread.discipline}`)} · {formatDate(thread.updatedAt, i18n.language)}</Text></div>
            <Button iconOnly dense size="sm" variant="ghost" aria-label={t("history.deleteNamed", { title: thread.title })} disabled={deleting || submitting} onClick={() => void removeThread(thread)}><Trash2 size={18} /></Button>
          </header>
          <Button className="coach-thread-follow-up-jump" block variant="outline" size="sm" leadingIcon={<MessageCircle size={16} />}
            disabled={followUpUnavailable} onClick={() => followUpRef.current?.focus()}>{t("history.jumpToFollowUp")}</Button>
          <div className="coach-thread-turns">{threadCursor && <Button block variant="ghost" loading={loadingEarlierTurns} onClick={() => void loadEarlierTurns()}>{t("history.loadEarlierTurns")}</Button>}
            {thread.turns.map((turn) => <article key={turn.turnId} className="coach-thread-turn">
            <Card variant="inset" className="coach-thread-turn__question"><Text as="p" variant="body">{turn.question}</Text><time dateTime={turn.createdAt}><Text as="span" variant="caption" tone="tertiary">{formatDate(turn.createdAt, i18n.language)}</Text></time></Card>
            <div className="coach-thread-turn__answer"><CoachAnswerDocumentView response={turn.response}
              locale={i18n.language} onAction={answerAction} historical />
              <CoachStoredTurnResult response={turn.response} />
            </div>
          </article>)}</div>
          <div className="coach-thread-composer"><label htmlFor="coach-follow-up"><Text variant="label">{t("history.followUpLabel")}</Text></label>
            <Textarea ref={followUpRef} id="coach-follow-up" rows={3} maxLength={1000} value={draft}
              disabled={followUpUnavailable}
              placeholder={t("history.followUpPlaceholder")} onChange={(event) => { startEditedFollowUp(); setDraft(event.target.value); }} />
            <div className="coach-thread-composer__meta"><Text variant="caption" tone="tertiary">{t("history.contextNote")}</Text><Text variant="caption" tone="tertiary" mono>{draft.length}/1000</Text></div>
            {quotaError && <Alert variant="warning" title={t("history.quotaLoadFailed")}><Button variant="outline" size="sm" onClick={() => void loadQuota()}>{t("history.retryQuota")}</Button></Alert>}
            {submitError && pendingBodyRef.current && <div className="coach-thread-composer__retry">
              <Text as="p" variant="bodySmall" tone="danger" role="alert">{t("history.submitFailed")}</Text>
              <Text as="p" variant="caption" tone="tertiary">{t("history.sameRequestRetryNote")}</Text>
              <Button variant="outline" size="sm" disabled={submitting} onClick={() => void retryPendingFollowUp()}>{t("history.sameRequestRetry")}</Button>
            </div>}
            {followUpSuccess && <Text as="p" variant="bodySmall" tone="success" role="status" aria-live="polite">{t("history.followUpSaved")}</Text>}
            <div className="coach-thread-composer__actions">{loadingQuota && <Text variant="caption" tone="tertiary">{t("history.loadingQuota")}</Text>}
              {quota && <Text variant="caption" tone={quota.remaining === 0 ? "warning" : "tertiary"}>{t("quota.remaining", { count: quota.remaining })}</Text>}
              <Button variant="primary" loading={submitting} disabled={draft.trim().length < 2 || loadingQuota || quotaError || !quota || quota.remaining === 0
                || Boolean(pendingBodyRef.current)}
                onClick={() => void submitFollowUp()}>{t("history.followUp")}</Button></div>
          </div>
        </>}
      </section>
    </div>
    {policy && <FirstUseCoachConsent open={consentOpen} policy={policy} onCancel={() => setConsentOpen(false)} onConsented={(saved) => {
      setPolicy(saved); setConsentOpen(false); if (pendingBodyRef.current) void executeFollowUp(pendingBodyRef.current);
    }} />}
  </main>;
}
