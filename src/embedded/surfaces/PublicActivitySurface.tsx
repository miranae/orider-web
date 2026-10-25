import { startJourneyMeasurement, type JourneyOutcome } from "../../services/journeyMeasurement";
import "./PublicActivitySurface.css";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PublicActivityMapImage from "./PublicActivityMapImage";
import PublicActivitySafety from "./PublicActivitySafety";
import PublicActivityPhotos from "./PublicActivityPhotos";
import PublicActivityComments from "./PublicActivityComments";
import { LocalizedLink } from "../../components/LocalizedLink";
import Avatar from "../../components/Avatar";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createPublicActivityClient, isPublicActivityAccessError, type PublicActivityDetail } from "../../services/publicActivityDetail";
import { Button, Section, Stack, Stat, Text, Textarea } from "../../theme/components";
import EmbeddedSurfaceState from "./EmbeddedSurfaceState";

const RouteMap = lazy(() => import("../../components/RouteMap"));

interface Props {
  activityId: string;
  retryKey: number;
  embedded?: boolean;
  initialDetail?: PublicActivityDetail;
  onReady: () => void;
  onError: (code: "activity_load_failed") => void;
}

export default function PublicActivitySurface({ activityId, retryKey, embedded = false, initialDetail, onReady, onError }: Props) {
  const services = useFirebaseServices();
  const { user } = useAuth();
  const { t, i18n } = useTranslation("activity");
  const client = useMemo(() => createPublicActivityClient(services), [services, user?.uid]);
  const [detail, setDetail] = useState<PublicActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [removed, setRemoved] = useState<{ scope: string; action: "hide" | "block" } | null>(null);
  const safetyScope = `${user?.uid ?? "anonymous"}:${activityId}`;
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [posted, setPosted] = useState(false);
  const generation = useRef(0);
  const settledGeneration = useRef(0);
  const detailMeasurement = useRef<ReturnType<typeof startJourneyMeasurement> | null>(null);
  const socialMeasurement = useRef<ReturnType<typeof startJourneyMeasurement> | null>(null);
  const inFlight = useRef(false);
  const commentRequest = useRef<{ text: string; id: string } | null>(null);
  const revokeAccess = useCallback(() => {
    socialMeasurement.current?.("access_denied");
    generation.current += 1; inFlight.current = false; commentRequest.current = null;
    setDetail(null); setFailed(true); setAccessDenied(true); setText(""); setBusy(false);
  }, []);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    const request = ++generation.current;
    const finish = startJourneyMeasurement("activity_detail_ready", embedded ? "embedded_public_activity" : "web_public_activity", "detail");
    detailMeasurement.current = finish;
    setDetail(null); setLoading(true); setFailed(false); setAccessDenied(false); setText(""); setPosted(false); setMutationError(false); setBusy(false); inFlight.current = false; commentRequest.current = null;
    const load = attempt === 0 && retryKey === 0 && initialDetail?.activity.id === activityId ? Promise.resolve(initialDetail) : client.load(activityId);
    void load.then(data => {
      if (generation.current !== request) return;
      settledGeneration.current = request;
      setDetail(data); setLoading(false); callbacks.current.onReady();
    }).catch(error => {
      if (generation.current !== request) return;
      settledGeneration.current = request;
      setLoading(false); setFailed(true); setAccessDenied(isPublicActivityAccessError(error)); callbacks.current.onError("activity_load_failed");
    });
    return () => { generation.current += 1; finish("cancelled"); socialMeasurement.current?.("cancelled"); };
  }, [activityId, client, retryKey, attempt, initialDetail, embedded]);
  useEffect(() => {
    if (loading || settledGeneration.current !== generation.current) return;
    if (failed) detailMeasurement.current?.(accessDenied ? "access_denied" : "error");
    else if (detail?.activity.id === activityId) detailMeasurement.current?.("success");
  }, [loading, failed, accessDenied, detail, activityId]);

  const mutate = useCallback(async (action: "kudos" | "comment") => {
    if (!user || user.isAnonymous || !detail || inFlight.current || (action === "comment" && !text.trim())) return;
    inFlight.current = true; setBusy(true); setMutationError(false); setPosted(false);
    const request = generation.current;
    const finish = startJourneyMeasurement("social_action_result", embedded ? "embedded_public_activity" : "web_public_activity", action);
    socialMeasurement.current = finish;
    let outcome: JourneyOutcome = "success";
    try {
      const countKey = action === "kudos" ? "kudosCount" : "commentCount";
      const previousCount = detail.activity[countKey];
      let confirmed = detail;
      if (action === "kudos") {
        const result = await client.setKudos(activityId, !detail.viewerHasKudos);
        if (request !== generation.current) return;
        confirmed = { ...detail, viewerHasKudos: result.enabled, activity: { ...detail.activity,
          kudosCount: Math.max(0, detail.activity.kudosCount + (result.enabled === detail.viewerHasKudos ? 0 : result.enabled ? 1 : -1)) } };
      } else {
        const body = text.trim();
        if (commentRequest.current?.text !== body) commentRequest.current = { text: body, id: crypto.randomUUID() };
        await client.postComment(activityId, body, commentRequest.current.id);
        if (request !== generation.current) return;
        setText(""); setPosted(true); commentRequest.current = null;
        confirmed = { ...detail, activity: { ...detail.activity, commentCount: previousCount + 1 } };
      }
      setDetail(confirmed);
      // Aggregate triggers can lag the confirmed write. Preserve only the unchanged
      // pre-write count while retrying; changed server counts remain authoritative.
      try {
        for (let read = 0; read < 3; read += 1) {
          if (read > 0) await new Promise(resolve => setTimeout(resolve, read * 250));
          if (request !== generation.current) return;
          const refreshed = await client.load(activityId);
          if (request !== generation.current) return;
          const aggregatePending = confirmed.activity[countKey] !== previousCount && refreshed.activity[countKey] === previousCount;
          setDetail(aggregatePending ? { ...refreshed, activity: { ...refreshed.activity, [countKey]: confirmed.activity[countKey] } } : refreshed);
          if (!aggregatePending) break;
        }
      } catch (error) {
        outcome = isPublicActivityAccessError(error) ? "access_denied" : "readback_error";
        if (request === generation.current) {
          if (isPublicActivityAccessError(error)) { setDetail(null); setFailed(true); setAccessDenied(true); }
          else setMutationError(true);
        }
      }
    } catch (error) {
      outcome = isPublicActivityAccessError(error) ? "access_denied" : "error";
      if (request === generation.current) {
        if (isPublicActivityAccessError(error)) {
          setDetail(null); setFailed(true); setAccessDenied(true); setText(""); commentRequest.current = null;
        } else setMutationError(true);
      }
    } finally {
      finish(request === generation.current ? outcome : "cancelled");
      if (request === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }, [activityId, client, detail, text, user, embedded]);

  if (removed?.scope === safetyScope) return <main className="public-activity-surface"><Text role="status" tabIndex={-1} ref={node => node?.focus()}>{t(`publicSafety.${removed.action}Done`)}</Text><LocalizedLink to="/">{t("publicSafety.home")}</LocalizedLink></main>;

  if (loading || failed || !detail || detail.activity.id !== activityId) return <EmbeddedSurfaceState title={t("publicDetail.title")} loading={loading} message={accessDenied ? t("publicDetail.accessDenied") : undefined} onRetry={() => setAttempt(value => value + 1)} />;
  const activity = detail.activity;
  const metrics = activity.effectiveFacts?.status === "canonical" ? activity.effectiveFacts.metrics : null;
  const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  // A canonical null is missing, not permission to resurrect a recorded sensor value.
  const value = (key: string, raw: unknown) => metrics && key in metrics ? numeric(metrics[key]) : numeric(raw);
  const distance = value("distanceKm", numeric(activity.summary.distance) == null ? null : Number(activity.summary.distance) / 1000);
  const seconds = value("durationSec", numeric(activity.summary.ridingTimeMillis) == null ? null : Number(activity.summary.ridingTimeMillis) / 1000);
  const elevation = value("elevationGainM", activity.summary.elevationGain);
  const format = (n: number | null, digits = 0) => n === null ? "—" : n.toLocaleString(i18n.language, { maximumFractionDigits: digits });
  const power = numeric(metrics?.avgPower);
  const normalizedPower = numeric(metrics?.np);
  const powerSource = activity.effectiveFacts?.powerSource;
  const powerLabel = powerSource === "measured" || powerSource === "estimated" ? powerSource : "unknown";
  const mapImage = detail.mapPreview?.imageUrl && /^https:\/\//i.test(detail.mapPreview.imageUrl) ? detail.mapPreview.imageUrl : null;
  const route = detail.mapPreview?.encodedPolyline || undefined;

  return <main className={embedded ? "orider-embedded-surface public-activity-surface" : "public-activity-surface"} data-testid="embedded-public-activity">
    <Stack gap="var(--space-5)">
      <header className="orider-embedded-author">
        <Avatar name={activity.nickname} imageUrl={activity.profileImage} size="md" />
        <div><LocalizedLink to={`/athlete/${encodeURIComponent(activity.userId)}`}><Text weight={600}>{activity.nickname}</Text></LocalizedLink><h1>{activity.description || t("publicDetail.title")}</h1>
          <Text variant="caption">{activity.startTime > 0 ? new Date(activity.startTime).toLocaleString(i18n.language) : "—"}</Text></div>
      </header>
      {user && !user.isAnonymous && user.uid !== activity.userId && <PublicActivitySafety key={`${user.uid}:${activityId}`}
        activityId={activityId} authorId={activity.userId} client={client} onAccessRevoked={revokeAccess}
        onRemoved={action => { generation.current += 1; inFlight.current = false; commentRequest.current = null;
          socialMeasurement.current?.("cancelled"); setDetail(null); setText(""); setBusy(false); setRemoved({ scope: safetyScope, action }); }} />}
      <Section title={t("publicDetail.summary")}>
        <Stack direction="row" wrap gap="var(--space-5)">
          <Stat label={t("publicDetail.distance")} value={format(distance, 2)} unit="km" />
          <Stat label={t("publicDetail.duration")} value={seconds === null ? "—" : format(Math.floor(seconds / 60))} unit={t("publicDetail.minutes")} />
          <Stat label={t("publicDetail.elevation")} value={format(elevation)} unit="m" />
        </Stack>
        <Text variant="caption" tone="secondary">{t(metrics ? "publicDetail.calculated" : "publicDetail.recorded")}</Text>
      </Section>
      {(power !== null || normalizedPower !== null) && <Section title={t("publicDetail.power")}>
        <Stack direction="row" wrap gap="var(--space-5)">
          <Stat label={t("publicDetail.averagePower")} value={format(power)} unit="W" />
          <Stat label={t("publicDetail.normalizedPower")} value={format(normalizedPower)} unit="W" />
        </Stack>
        <Text variant="caption" tone="secondary">{t(`publicDetail.powerSource.${powerLabel}`)}</Text>
      </Section>}
      {(route || mapImage) && <Section title={t("publicDetail.route")}>
        {route ? <Suspense fallback={<Text role="status">{t("publicDetail.mapLoading")}</Text>}>
          <RouteMap polyline={route} interactive={false} height="18rem" fallbackImageUrl={mapImage} fallbackImageAlt={t("publicDetail.route")} />
        </Suspense> : <PublicActivityMapImage key={activityId} src={mapImage!} />}
        <Text variant="caption" tone="secondary">{t("publicDetail.routePreview")}</Text>
      </Section>}
      {detail.content.status === "pending" ? <Text role="status">{t("publicDetail.pending")}</Text> : <>
        {detail.content.memo && <Text as="p">{detail.content.memo}</Text>}
        <PublicActivityPhotos activityId={activityId} initialPhotos={detail.content.photos ?? []} truncated={detail.uploadedPhotosTruncated === true} client={client}
          onAccessRevoked={revokeAccess} />
      </>}
      <Section title={t("kudosCard.comments", { count: activity.commentCount })}>
        <Stack gap="var(--space-3)">
          <Button variant="outline" disabled={busy || !user || user.isAnonymous} aria-pressed={detail.viewerHasKudos} onClick={() => void mutate("kudos")}>{t(detail.viewerHasKudos ? "kudosCard.kudosCancel" : "kudosCard.kudos")} · {activity.kudosCount}</Button>
          <PublicActivityComments activityId={activityId} userId={user && !user.isAnonymous ? user.uid : null}
            initialComments={detail.content.comments} count={activity.commentCount} client={client}
            onDeleted={() => setDetail(current => current ? { ...current, activity: { ...current.activity, commentCount: Math.max(0, current.activity.commentCount - 1) } } : current)}
            onAccessRevoked={revokeAccess} />
          {(!user || user.isAnonymous) && <Text>{t("kudosCard.loginDesc")}</Text>}
          <label><Text>{t("kudosCard.ariaInput")}</Text><Textarea aria-label={t("kudosCard.ariaInput")} value={text} maxLength={500} disabled={busy || !user || user.isAnonymous} onChange={event => setText(event.target.value)} /></label>
          <Button loading={busy} disabled={busy || !text.trim() || !user || user.isAnonymous} onClick={() => void mutate("comment")}>{t(busy ? "kudosCard.submitting" : "kudosCard.submit")}</Button>
          {mutationError && <Text role="alert">{t("publicDetail.mutationFailed")}</Text>}
          {posted && <Text role="status">{t("publicDetail.posted")}</Text>}
        </Stack>
      </Section>
    </Stack>
  </main>;
}
