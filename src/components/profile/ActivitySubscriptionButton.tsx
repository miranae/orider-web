import { onAuthStateChanged } from "firebase/auth";
import type { FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED } from "../../config/activitySubscriptions";
import { getActivitySubscriptionSummary, setActivitySubscription, isSubscriptionsNotDeployed } from "../../services/activitySubscriptions";
import { logClientError } from "../../services/errorLogger";
import InfoTip from "../InfoTip";
import { Button } from "../../theme/components";

type Failure = "notDeployed" | "forbidden" | "unavailable";
function failureOf(error: unknown): Failure {
  if (isSubscriptionsNotDeployed(error)) return "notDeployed";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return code.includes("permission-denied") || code.includes("not-found") ? "forbidden" : "unavailable";
}

export default function ActivitySubscriptionButton({ targetUid, services }: { targetUid: string | undefined; services?: FirebaseServices }) {
  const { user: contextUser } = useAuth();
  const user = services ? services.auth.currentUser : contextUser;
  const { t } = useTranslation("common");
  const uid = user && !user.isAnonymous ? user.uid : null;
  const key = useMemo(() => ({ user, targetUid, services }), [user, targetUid, services]);
  const latestKey = useRef<typeof key | null>(key);
  latestKey.current = key;
  const [state, setState] = useState<{ key: typeof key; subscribed?: boolean; failure?: Failure; pending?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    if (document.hidden || !ACTIVITY_SUBSCRIPTIONS_ENABLED || !uid || !targetUid || uid === targetUid) return;
    latestKey.current = key;
    let active = true;
    const request = ++epoch.current;
    void (services ? getActivitySubscriptionSummary(uid, targetUid, services) : getActivitySubscriptionSummary(uid, targetUid)).then(summary => {
      if (active && request === epoch.current && !document.hidden && (!services || services.auth.currentUser === user)) setState({ key, subscribed: summary.subscribed });
    }).catch(error => {
      if (!active || request !== epoch.current || document.hidden || services && services.auth.currentUser !== user) return;
      if (!isSubscriptionsNotDeployed(error)) logClientError("profile.subscriptionState", error, {});
      setState({ key, failure: failureOf(error) });
    });
    return () => { active = false; latestKey.current = null; };
  }, [uid, targetUid, key, attempt, services, user]);
  useEffect(() => {
    if (!services) return;
    const reset = () => { epoch.current++; latestKey.current = null; setState(null); if (!document.hidden) setAttempt(n => n + 1); };
    const off = onAuthStateChanged(services.auth, () => { if (services.auth.currentUser !== user) reset(); });
    document.addEventListener("visibilitychange", reset);
    return () => { off(); document.removeEventListener("visibilitychange", reset); };
  }, [services, user]);
  if (ACTIVITY_SUBSCRIPTIONS_ENABLED && services && !uid) return <p>{t("activitySubscriptions.signInRequired")}</p>;
  if (!ACTIVITY_SUBSCRIPTIONS_ENABLED || !uid || !targetUid || uid === targetUid) return null;
  const current = state?.key === key ? state : null;
  const change = async () => {
    if (document.hidden || services && services.auth.currentUser !== user || !current || current.failure || current.pending || current.subscribed == null) return;
    const desired = !current.subscribed;
    const request = epoch.current;
    setState({ ...current, pending: true });
    try {
      const response = await (services ? setActivitySubscription(uid, targetUid, desired, services) : setActivitySubscription(uid, targetUid, desired));
      if (request === epoch.current && !document.hidden && latestKey.current === key && (!services || services.auth.currentUser === user)) setState({ key, subscribed: response.subscribed });
    } catch (error) {
      if (request !== epoch.current || document.hidden || latestKey.current !== key || services && services.auth.currentUser !== user) return;
      if (!isSubscriptionsNotDeployed(error)) logClientError("profile.subscriptionChange", error, {});
      setState({ key, subscribed: current.subscribed, failure: failureOf(error) });
    }
  };
  return <div className="profile-subscription-action">
    <Button variant={current?.subscribed ? "secondary" : "primary"} disabled={!current || Boolean(current.failure) || current.pending}
      aria-pressed={current?.subscribed ?? false} onClick={() => { void change(); }}>
      {current?.failure ? t(`activitySubscriptions.${current.failure}`) : current?.pending ? t("activitySubscriptions.updating")
        : !current ? t("activitySubscriptions.checking") : t(current.subscribed ? "activitySubscriptions.unsubscribe" : "activitySubscriptions.subscribe")}
    </Button>
    <InfoTip title={t("activitySubscriptions.subscribe")} content={t("activitySubscriptions.publicOnly")}>{t("activitySubscriptions.publicLabel")}</InfoTip>
    {current?.failure === "unavailable" && <Button variant="ghost" size="sm" onClick={() => { setState(null); setAttempt(value => value + 1); }}>{t("profileSocial.retry")}</Button>}
  </div>;
}
