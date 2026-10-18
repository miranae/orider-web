import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useStrava } from "../../hooks/useStrava";
import { logClientError } from "../../services/errorLogger";
import { Button, Card, Text } from "../../theme/components";
import type { NarrativeLang } from "../../hooks/useActivityNarrative";
import { isLocalStravaSummaryPreview, requestStravaSummaryPreview, type StravaSummaryPreview, type StravaSummaryPublishResult } from "../../services/stravaSummaryPreview";
import "./StravaSummaryPublishing.css";

export function parseStravaSummaryTarget(input: string): string | null {
  const value = input.trim();
  let id = value;
  if (!/^\d+$/.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !["www.strava.com", "strava.com"].includes(url.hostname)) return null;
      id = /^\/activities\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? "";
    } catch { return null; }
  }
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? String(Number(id)) : null;
}

function reportPublishingError(action: "preview" | "prepare" | "status" | "poll" | "publish", error: unknown, activityId: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  // 서버 메시지에는 요약 본문이 포함될 수 있어 코드만 기록한다.
  logClientError(`StravaSummaryPublishing.${action}`, new Error(/^[a-z0-9/_-]{1,80}$/i.test(code) ? code : "unknown"), { activityId });
}

const previewFailure = (reason?: string) => reason === "mapping-required" ? "mappingRequired"
  : reason === "summary-not-ready" ? "summaryNotReady" : reason === "activity-unavailable" ? "activityUnavailable"
    : reason === "invalid-strava-activity-id" ? "invalidTarget" : reason === "metrics-not-ready" ? "metricsNotReady"
      : reason === "activity-record-receipt-pending" ? "receiptPending" : reason === "inputs-changed" ? "inputsChanged" : "previewError";

const resultFeedback = (result: StravaSummaryPublishResult) => result.status === "unavailable" ? "statusUnavailable"
  : result.phase === "provisional" && (result.status === "published" || result.status === "unchanged") ? "provisionalPublished" : result.status;

/** 부모 key는 계정·활동·언어가 바뀌면 이전 미리보기와 요청 상태를 폐기한다. */
export default function StravaSummaryPublishing({ activityId, lang }: { activityId: string; lang: NarrativeLang }) {
  const { t } = useTranslation("activity");
  const { functions, ensureAppCheckReady } = useFirebaseServices();
  const { connectStrava } = useStrava();
  const localPreviewOnly = isLocalStravaSummaryPreview();
  const active = useRef(false), previewRequest = useRef(0), statusRequest = useRef(0);
  const lastResultTarget = useRef<string | null>(null);
  const [busy, setBusy] = useState(false), [loadingPreview, setLoadingPreview] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [uncertain, setUncertain] = useState(false), [checkingStatus, setCheckingStatus] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<StravaSummaryPublishResult | null>(null);
  const [preview, setPreview] = useState<Extract<StravaSummaryPreview, { status: "ready" }> | null>(null);
  const [target, setTarget] = useState("");
  const [requestedTarget, setRequestedTarget] = useState<string | undefined>();
  const [manualOpen, setManualOpen] = useState(false);
  const previewText = useRef<HTMLPreElement>(null);
  const [previewOverflow, setPreviewOverflow] = useState(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; previewRequest.current += 1; statusRequest.current += 1; };
  }, []);

  const rememberResult = useCallback((value: StravaSummaryPublishResult, targetId?: string, force = false) => {
    const id = value.stravaActivityId == null ? targetId : parseStravaSummaryTarget(String(value.stravaActivityId)) ?? undefined;
    if (!force && lastResultTarget.current && lastResultTarget.current !== id) return;
    lastResultTarget.current = id ?? null;
    setResult({ ...value, ...(id ? { stravaActivityId: id } : {}) });
    if (value.status !== "unavailable") setUncertain(false);
  }, []);

  const loadPreview = useCallback(async (stravaActivityId?: string, prepare = false) => {
    if (prepare && localPreviewOnly) return;
    const request = ++previewRequest.current;
    statusRequest.current += 1; setCheckingStatus(false);
    setLoadingPreview(true); setPreparing(prepare); setPreview(null); setMessage(null);
    try {
      await ensureAppCheckReady();
      if (!active.current || request !== previewRequest.current) return;
      const payload = { activityId, lang, ...(stravaActivityId ? { stravaActivityId } : {}) };
      const response = prepare
        ? await httpsCallable<typeof payload, StravaSummaryPreview>(functions, "stravaPrepareSummaryPreview")(payload)
        : await requestStravaSummaryPreview(functions, payload);
      if (!active.current || request !== previewRequest.current) return;
      if (response.data.status === "ready" && response.data.previewDigest && response.data.summaryBlock
        && parseStravaSummaryTarget(String(response.data.stravaActivityId))) {
        setPreview(response.data);
        if (response.data.publishStatus) rememberResult(response.data.publishStatus, String(response.data.stravaActivityId), !!stravaActivityId);
      } else {
        const reason = response.data.status === "unavailable" ? response.data.reason : undefined;
        setMessage(previewFailure(reason));
        if (reason === "mapping-required" || reason === "invalid-strava-activity-id") setManualOpen(true);
        let previous = response.data.publishStatus;
        const statusTarget = response.data.stravaActivityId == null ? null : parseStravaSummaryTarget(String(response.data.stravaActivityId));
        if (!previous && statusTarget) {
          try { previous = (await httpsCallable<{ activityId: string; stravaActivityId: string }, StravaSummaryPublishResult>(functions, "stravaSummaryPublishStatus")({ activityId, stravaActivityId: statusTarget })).data; }
          catch (error) { if (active.current && request === previewRequest.current) reportPublishingError("status", error, activityId); }
        }
        if (active.current && request === previewRequest.current && previous) rememberResult(previous, statusTarget ?? undefined, !!stravaActivityId);
      }
    } catch (error) { if (active.current && request === previewRequest.current) {
      reportPublishingError(prepare ? "prepare" : "preview", error, activityId); setMessage("previewError");
    } }
    finally { if (active.current && request === previewRequest.current) { setLoadingPreview(false); setPreparing(false); } }
  }, [activityId, lang, functions, ensureAppCheckReady, localPreviewOnly, rememberResult]);
  useEffect(() => { void loadPreview(); }, [loadPreview]);

  useEffect(() => {
    const text = previewText.current;
    if (!text) { setPreviewOverflow(false); return; }
    let cancelled = false;
    const update = () => { if (!cancelled) setPreviewOverflow(text.scrollHeight > text.clientHeight + 1); };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(text);
    window.addEventListener("resize", update);
    void document.fonts?.ready.then(update);
    return () => { cancelled = true; observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [preview?.summaryBlock]);

  const remoteId = result?.stravaActivityId == null ? null : parseStravaSummaryTarget(String(result.stravaActivityId));
  useEffect(() => {
    if (result?.status !== "queued" || !remoteId) return;
    let cancelled = false, checks = 0, failureLogged = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      checks += 1;
      try {
        await ensureAppCheckReady();
        if (cancelled) return;
        const response = await httpsCallable<{ activityId: string; stravaActivityId: string }, StravaSummaryPublishResult>(functions, "stravaSummaryPublishStatus")({ activityId, stravaActivityId: remoteId });
        if (cancelled) return;
        rememberResult(response.data, remoteId, true);
        if (response.data.status === "unavailable") setUncertain(true);
        if (response.data.reason === "preview-changed") { setPreview(null); setMessage("previewChanged"); }
        else setMessage(null);
        if (response.data.status !== "queued") return;
      } catch (error) {
        if (cancelled) return;
        if (!failureLogged) { reportPublishingError("poll", error, activityId); failureLogged = true; }
      }
      // 조회만 반복한다. 새 게시 요청은 만들지 않는다.
      if (checks < 120) timer = setTimeout(() => { void poll(); }, 15_000);
    };
    timer = setTimeout(() => { void poll(); }, 15_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activityId, remoteId, result?.status, functions, ensureAppCheckReady, rememberResult]);

  const publish = async () => {
    if (localPreviewOnly || checkingStatus || uncertain || !preview || busy || loadingPreview || result?.status === "queued") return;
    const submittedTarget = String(preview.stravaActivityId);
    setBusy(true); setMessage(null);
    let writeRequested = false;
    try {
      await ensureAppCheckReady();
      if (!active.current) return;
      writeRequested = true;
      const response = await httpsCallable<{ activityId: string; lang: NarrativeLang; stravaActivityId: string; expectedPreviewDigest: string }, StravaSummaryPublishResult>(functions, "stravaPublishActivitySummary")({
        activityId, lang, stravaActivityId: String(preview.stravaActivityId), expectedPreviewDigest: preview.previewDigest,
      });
      if (!active.current) return;
      rememberResult(response.data, submittedTarget, true);
      setUncertain(false);
      if (response.data.reason === "preview-changed") { setPreview(null); setMessage("previewChanged"); }
      else setMessage(null);
    } catch (error) { if (active.current) {
      reportPublishingError("publish", error, activityId);
      if (writeRequested) {
        rememberResult({ status: "unavailable", reason: "result-unconfirmed" }, submittedTarget, true);
        setUncertain(true); setMessage("publishUnconfirmed");
      } else setMessage("publishError");
    } }
    finally { if (active.current) setBusy(false); }
  };
  const refreshStatus = async () => {
    const id = lastResultTarget.current;
    if (!id || checkingStatus || busy || loadingPreview) return;
    const request = ++statusRequest.current, previewGeneration = previewRequest.current;
    const isCurrent = () => active.current && request === statusRequest.current && previewGeneration === previewRequest.current && lastResultTarget.current === id;
    setCheckingStatus(true);
    try {
      await ensureAppCheckReady();
      if (!isCurrent()) return;
      const response = await httpsCallable<{ activityId: string; stravaActivityId: string }, StravaSummaryPublishResult>(functions, "stravaSummaryPublishStatus")({ activityId, stravaActivityId: id });
      if (!isCurrent()) return;
      rememberResult(response.data, id, true);
      if (response.data.status === "unavailable" && (uncertain || result?.status === "queued")) setUncertain(true);
      if (response.data.reason === "preview-changed") { setPreview(null); setMessage("previewChanged"); }
      else setMessage(null);
    } catch (error) { if (isCurrent()) { reportPublishingError("status", error, activityId); setMessage("statusError"); } }
    finally { if (active.current && request === statusRequest.current) setCheckingStatus(false); }
  };
  const resultStatus = result ? resultFeedback(result) : null;
  const feedbacks = [message, ...(resultStatus && resultStatus !== message ? [resultStatus] : [])].filter((key): key is string => !!key);
  const targetId = preview ? parseStravaSummaryTarget(String(preview.stravaActivityId)) : remoteId;
  return <Card className="activity-strava-publishing">
    <section aria-label={t("stravaSummary.title")} className="activity-strava-publishing-content">
      <div><Text as="h3" variant="body" weight={600}>{t("stravaSummary.title")}</Text>
        <Text as="p" variant="bodySmall" tone="secondary">{t("stravaSummary.disclosure")}</Text></div>
      {loadingPreview && <p role="status">{t(preparing ? "stravaSummary.preparing" : "stravaSummary.loadingPreview")}</p>}
      {preview && <div className="activity-strava-publishing-target">
        <Text as="p" variant="caption" tone="secondary">{t("stravaSummary.resolvedTarget")}</Text>
        <a href={`https://www.strava.com/activities/${targetId}`} target="_blank" rel="noreferrer">{t("stravaSummary.targetActivity", { id: targetId })}</a>
        {!preview.targetVerified && <Text as="p" variant="bodySmall" tone="secondary">{t("stravaSummary.targetVerification")}</Text>}
      </div>}
      <div className="activity-strava-publishing-body">
        {preview && <div className="activity-strava-publishing-preview" data-overflow={previewOverflow}>
          <Text as="h4" variant="bodyMedium" weight={600}>{t("stravaSummary.previewLabel")}</Text>
          <div className="activity-strava-publishing-preview-frame"><Text as="pre" variant="body" ref={previewText} tabIndex={0} aria-label={t("stravaSummary.previewLabel")}>{preview.summaryBlock}</Text></div>
          <div className="activity-strava-publishing-footer">{previewOverflow && <Text as="p" variant="bodySmall" tone="secondary" className="activity-strava-publishing-scroll-hint"><span aria-hidden="true">↓ </span>{t("stravaSummary.scrollPreview")}</Text>}</div>
        </div>}
        <div className="activity-strava-publishing-controls">
          <Text as="h4" variant="bodyMedium" weight={600}>{t("stravaSummary.statusTitle")}</Text>
          <div className="activity-strava-publishing-control-body">
            {feedbacks.map(feedback => <div key={feedback} className="activity-strava-publishing-result" data-status={feedback}
            role={["publishError", "publishUnconfirmed", "invalidTarget", "previewError", "previewChanged", "statusError"].includes(feedback) ? "alert" : "status"}>
            {feedback === resultStatus && <Text as="p" variant="caption" tone="secondary">{t("stravaSummary.lastResult")}</Text>}
            <Text as="p" variant="bodyMedium" weight={600}>{t(`stravaSummary.resultTitle.${feedback}`)}</Text>
            <Text as="p" variant="bodySmall" tone="secondary">{t(`stravaSummary.${feedback}`)}</Text>
            {feedback === resultStatus && result?.phase === "provisional" && result.status === "queued" && <Text as="p" variant="bodySmall" tone="secondary">{t("stravaSummary.phaseProvisional")}</Text>}
            {feedback === resultStatus && remoteId && <Text as="p" variant="bodySmall" tone="secondary">{t("stravaSummary.resultTarget", { id: remoteId })}</Text>}
            {feedback === resultStatus && remoteId && <a href={`https://www.strava.com/activities/${remoteId}`} target="_blank" rel="noreferrer">{t("stravaSummary.view")}</a>}
          </div>)}
          <div className="activity-strava-publishing-actions">
            {preview && <Button variant="secondary" loading={busy} aria-busy={busy} disabled={localPreviewOnly || checkingStatus || uncertain || loadingPreview || result?.status === "queued"} onClick={() => { void publish(); }}>{t(busy ? "stravaSummary.working" : "stravaSummary.publish")}</Button>}
            {message === "summaryNotReady" && <Button variant="secondary" disabled={localPreviewOnly || checkingStatus || uncertain || busy || loadingPreview || result?.status === "queued"} onClick={() => { void loadPreview(requestedTarget, true); }}>{t("stravaSummary.prepare")}</Button>}
            {!preview && !loadingPreview && <Button variant="outline" disabled={busy} onClick={() => { void loadPreview(requestedTarget); }}>{t("stravaSummary.retryPreview")}</Button>}
            {result?.status === "reauthorization-required" && <Button variant="outline" disabled={busy} onClick={() => connectStrava(window.location.pathname, { writeActivities: true })}>{t("stravaSummary.reconnect")}</Button>}
            {remoteId && <Button variant="ghost" loading={checkingStatus} disabled={busy || loadingPreview} onClick={() => { void refreshStatus(); }}>{t("stravaSummary.refreshStatus")}</Button>}
          </div>
          </div>
          <div className="activity-strava-publishing-footer">{localPreviewOnly && <Text as="p" variant="bodySmall" tone="secondary" role="note">{t("stravaSummary.localPreviewOnly")}</Text>}</div>
        </div>
      </div>
      <details open={manualOpen} onToggle={event => setManualOpen(event.currentTarget.open)}>
            <summary>{t("stravaSummary.targetHelp")}</summary>
            <form className="activity-strava-publishing-manual" onSubmit={event => {
              event.preventDefault();
              if (busy || checkingStatus || uncertain || result?.status === "queued") return;
              const id = parseStravaSummaryTarget(target);
              if (!id) { setMessage("invalidTarget"); return; }
              setRequestedTarget(id); void loadPreview(id);
            }}>
              <label><span>{t("stravaSummary.targetLabel")}</span>
                <input type="text" inputMode="url" value={target} onChange={event => {
                  if (busy || checkingStatus || uncertain || result?.status === "queued") return;
                  previewRequest.current += 1; setLoadingPreview(false); setTarget(event.target.value); setPreview(null); setMessage(null);
                }} disabled={busy || preparing || checkingStatus || uncertain || result?.status === "queued"} placeholder="https://www.strava.com/activities/…" /></label>
              <Button type="submit" variant="outline" disabled={busy || checkingStatus || uncertain || loadingPreview || result?.status === "queued"}>{t("stravaSummary.loadTargetPreview")}</Button>
            </form>
      </details>
    </section>
  </Card>;
}
