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

export default function ActivitySubscriptionButton({ targetUid }: { targetUid: string | undefined }) {
  const { user } = useAuth();
  const { t } = useTranslation("common");
  const uid = user && !user.isAnonymous ? user.uid : null;
  const key = useMemo(() => ({ user, targetUid }), [user, targetUid]);
  const latestKey = useRef<typeof key | null>(key);
  latestKey.current = key;
  const [state, setState] = useState<{ key: typeof key; subscribed?: boolean; failure?: Failure; pending?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ACTIVITY_SUBSCRIPTIONS_ENABLED || !uid || !targetUid || uid === targetUid) return;
    latestKey.current = key;
    let active = true;
    void getActivitySubscriptionSummary(uid, targetUid).then(summary => {
      if (active) setState({ key, subscribed: summary.subscribed });
    }).catch(error => {
      if (!active) return;
      if (!isSubscriptionsNotDeployed(error)) logClientError("profile.subscriptionState", error, {});
      setState({ key, failure: failureOf(error) });
    });
    return () => { active = false; latestKey.current = null; };
  }, [uid, targetUid, key, attempt]);
  if (!ACTIVITY_SUBSCRIPTIONS_ENABLED || !uid || !targetUid || uid === targetUid) return null;
  const current = state?.key === key ? state : null;
  const change = async () => {
    if (!current || current.failure || current.pending || current.subscribed == null) return;
    const desired = !current.subscribed;
    setState({ ...current, pending: true });
    try {
      const response = await setActivitySubscription(uid, targetUid, desired);
      if (latestKey.current === key) setState({ key, subscribed: response.subscribed });
    } catch (error) {
      if (latestKey.current !== key) return;
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
