import "./PublicActivitySurface.css";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Avatar from "../../components/Avatar";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createPublicActivityClient, isPublicActivityAccessError, type PublicActivityDetail } from "../../services/publicActivityDetail";
import { Button, Section, Stack, Stat, Text } from "../../theme/components";
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
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [posted, setPosted] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const commentRequest = useRef<{ text: string; id: string } | null>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    const request = ++generation.current;
    setDetail(null); setLoading(true); setFailed(false); setAccessDenied(false); setText(""); setPosted(false); setMutationError(false); setBusy(false); inFlight.current = false; commentRequest.current = null;
    const load = attempt === 0 && retryKey === 0 && initialDetail?.activity.id === activityId ? Promise.resolve(initialDetail) : client.load(activityId);
    void load.then(data => {
      if (generation.current !== request) return;
      setDetail(data); setLoading(false); callbacks.current.onReady();
    }).catch(error => {
      if (generation.current !== request) return;
      setLoading(false); setFailed(true); setAccessDenied(isPublicActivityAccessError(error)); callbacks.current.onError("activity_load_failed");
    });
    return () => { generation.current += 1; };
  }, [activityId, client, retryKey, attempt, initialDetail]);

  const mutate = useCallback(async (action: "kudos" | "comment") => {
    if (!user || user.isAnonymous || !detail || inFlight.current || (action === "comment" && !text.trim())) return;
    inFlight.current = true; setBusy(true); setMutationError(false); setPosted(false);
    const request = generation.current;
    try {
      if (action === "kudos") {
        const result = await client.setKudos(activityId, !detail.viewerHasKudos);
        if (request !== generation.current) return;
        setDetail({ ...detail, viewerHasKudos: result.enabled, activity: { ...detail.activity,
          kudosCount: Math.max(0, detail.activity.kudosCount + (result.enabled === detail.viewerHasKudos ? 0 : result.enabled ? 1 : -1)) } });
      } else {
        const body = text.trim();
        if (commentRequest.current?.text !== body) commentRequest.current = { text: body, id: crypto.randomUUID() };
        await client.postComment(activityId, body, commentRequest.current.id);
        if (request !== generation.current) return;
        setText(""); setPosted(true); commentRequest.current = null;
      }
      // Read back through the same permission-checked projection after every mutation.
      try {
        const refreshed = await client.load(activityId);
        if (request === generation.current) setDetail(refreshed);
      } catch (error) {
        if (request === generation.current) { setDetail(null); setFailed(true); setAccessDenied(isPublicActivityAccessError(error)); }
      }
    } catch {
      if (request === generation.current) setMutationError(true);
    } finally {
      if (request === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }, [activityId, client, detail, text, user]);

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
  const mapImage = detail.mapPreview?.imageUrl && /^https:\/\//i.test(detail.mapPreview.imageUrl) ? detail.mapPreview.imageUrl : null;
  const route = detail.mapPreview?.encodedPolyline || undefined;
  const photos = (detail.content.photos ?? []).filter(photo => /^https:\/\//i.test(photo.url)).slice(0, 5);
  return <main className={embedded ? "orider-embedded-surface public-activity-surface" : "public-activity-surface"} data-testid="embedded-public-activity">
    <Stack gap="var(--space-5)">
      <header className="orider-embedded-author">
        <Avatar name={activity.nickname} imageUrl={activity.profileImage} size="md" />
        <div><Text weight={600}>{activity.nickname}</Text><h1>{activity.description || t("publicDetail.title")}</h1>
          <Text variant="caption">{activity.startTime > 0 ? new Date(activity.startTime).toLocaleString(i18n.language) : "—"}</Text></div>
      </header>
      <Section title={t("publicDetail.summary")}>
        <Stack direction="row" gap="var(--space-5)">
          <Stat label={t("publicDetail.distance")} value={format(distance, 2)} unit="km" />
          <Stat label={t("publicDetail.duration")} value={seconds === null ? "—" : format(Math.floor(seconds / 60))} unit={t("publicDetail.minutes")} />
          <Stat label={t("publicDetail.elevation")} value={format(elevation)} unit="m" />
        </Stack>
        <Text variant="caption" tone="secondary">{t(metrics ? "publicDetail.calculated" : "publicDetail.recorded")}</Text>
      </Section>
      {(route || mapImage) && <Section title={t("publicDetail.route")}>
        {route ? <Suspense fallback={<Text role="status">{t("publicDetail.mapLoading")}</Text>}>
          <RouteMap polyline={route} interactive={false} height="18rem" fallbackImageUrl={mapImage} fallbackImageAlt={t("publicDetail.route")} />
        </Suspense> : <img className="public-activity-photo" src={mapImage!} alt={t("publicDetail.route")} />}
        <Text variant="caption" tone="secondary">{t("publicDetail.routePreview")}</Text>
      </Section>}
      {detail.content.status === "pending" ? <Text role="status">{t("publicDetail.pending")}</Text> : <>
        {detail.content.memo && <Text as="p">{detail.content.memo}</Text>}
        {photos.map(photo => <img key={photo.id} src={photo.url} alt={photo.caption || t("page.photoPreview")} loading="lazy" className="public-activity-photo" />)}
        {detail.uploadedPhotosTruncated && <Text variant="caption">{t("publicDetail.photoPreview")}</Text>}
      </>}
      <Section title={t("kudosCard.comments", { count: activity.commentCount })}>
        <Stack gap="var(--space-3)">
          <Button variant="outline" disabled={busy || !user || user.isAnonymous} aria-pressed={detail.viewerHasKudos} onClick={() => void mutate("kudos")}>{t(detail.viewerHasKudos ? "kudosCard.kudosCancel" : "kudosCard.kudos")} · {activity.kudosCount}</Button>
          {(detail.content.comments ?? []).map(comment => <div key={comment.id}><Text weight={600}>{comment.nickname}</Text><Text as="p">{comment.text}</Text></div>)}
          {activity.commentCount > (detail.content.comments?.length ?? 0) && <Text variant="caption">{t("publicDetail.commentPreview")}</Text>}
          {(!user || user.isAnonymous) && <Text>{t("kudosCard.loginDesc")}</Text>}
          <label><Text>{t("kudosCard.ariaInput")}</Text><textarea className="public-activity-comment" aria-label={t("kudosCard.ariaInput")} value={text} maxLength={500} disabled={busy || !user || user.isAnonymous} onChange={event => setText(event.target.value)} /></label>
          <Button disabled={busy || !text.trim() || !user || user.isAnonymous} onClick={() => void mutate("comment")}>{t(busy ? "kudosCard.submitting" : "kudosCard.submit")}</Button>
          {mutationError && <Text role="alert">{t("publicDetail.mutationFailed")}</Text>}
          {posted && <Text role="status">{t("publicDetail.posted")}</Text>}
        </Stack>
      </Section>
    </Stack>
  </main>;
}
