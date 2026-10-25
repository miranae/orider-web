import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ActivityFeedComment } from "@shared/types/activity-feed-content";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createWebNotificationClient } from "../../services/webNotifications";
import { Button, Section, Stack, Text } from "../../theme/components";

/** Exact authorized destination, independent of the first page of activity comments. */
export function NotificationCommentTarget() {
  const { activityId } = useParams<{ activityId: string }>(); const [params] = useSearchParams();
  const commentId = params.get("comment");
  const { user, signIn, loading: authLoading } = useAuth(); const services = useFirebaseServices();
  const { t } = useTranslation("common"); const uid = user && !user.isAnonymous ? user.uid : null;
  const client = useMemo(() => createWebNotificationClient(services), [services, user]);
  const key = JSON.stringify([activityId, commentId, uid]);
  const [state, setState] = useState<{ client: typeof client; key: string; comment?: ActivityFeedComment | null; failed?: boolean; denied?: boolean } | null>(null);
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  const [attempt, setAttempt] = useState(0); const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activityId || !commentId || !uid || authLoading || !visible) return;
    let active = true; setState(null);
    void client.comment(activityId, commentId).then(result => { if (active) setState({ client, key, comment: result.comment }); })
      .catch(error => { if (active) setState({ client, key, failed: true, denied: ["functions/permission-denied", "functions/not-found"].includes(error?.code) }); });
    return () => { active = false; };
  }, [activityId, commentId, uid, authLoading, client, key, attempt, visible]);
  useEffect(() => {
    if (!commentId) return;
    const refresh = () => { if (document.visibilityState === "visible") { setState(null); setAttempt(value => value + 1); } };
    const visibility = () => { setState(null); setVisible(document.visibilityState === "visible"); if (document.visibilityState === "visible") refresh(); };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ activityId?: string }>).detail;
      if (!detail?.activityId || detail.activityId === activityId) refresh();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visibility);
    window.addEventListener("orider:activity-safety-changed", changed); window.addEventListener("orider:activity-content-changed", changed);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("orider:activity-safety-changed", changed); window.removeEventListener("orider:activity-content-changed", changed); };
  }, [activityId, commentId]);
  const current = state?.key === key && state.client === client ? state : null;
  useEffect(() => { if (current) heading.current?.focus(); }, [current]);
  if (!commentId || !visible) return null;
  return <div ref={heading} tabIndex={-1}><Section title={t("notif.commentDestination")}><Stack gap="var(--space-3)">
    {!uid && !authLoading ? <><Text>{t("notif.loginDestination")}</Text><Button onClick={() => void signIn()}>{t("notif.signIn")}</Button></>
      : !current ? <Text role="status">{t("notif.loading")}</Text>
      : current.failed && !current.denied ? <><Text role="alert">{t("notif.failed")}</Text><Button onClick={() => setAttempt(value => value + 1)}>{t("notif.retry")}</Button></>
      : current.comment ? <><Text weight={600}>{current.comment.nickname}</Text><Text as="p">{current.comment.text}</Text></>
      : <Text role="status">{t("notif.targetUnavailable")}</Text>}
  </Stack></Section></div>;
}
