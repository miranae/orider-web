import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { getActivitySubscriptionSummary, readOwnFriendCount, isSubscriptionsNotDeployed,
  ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, type SubscriptionKind } from "../../services/activitySubscriptions";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED } from "../../config/activitySubscriptions";
import { logClientError } from "../../services/errorLogger";
import { LocalizedLink as Link } from "../LocalizedLink";
import ProfileActivitySummary from "./ProfileActivitySummary";
import { Button, Text } from "../../theme/components";
import "./ProfileSocialStats.css";

const kinds: SubscriptionKind[] = ["subscriptions", "subscribers"];

export default function ProfileSocialStats() {
  const { user, profile } = useAuth();
  const { t } = useTranslation("common");
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [counts, setCounts] = useState<{ uid: string; values: (number | null)[]; notDeployed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const subscription = ACTIVITY_SUBSCRIPTIONS_ENABLED ? getActivitySubscriptionSummary(uid, uid) : Promise.resolve(null);
    void Promise.allSettled([subscription, readOwnFriendCount(uid)]).then(results => {
      if (!active) return;
      results.forEach(result => { if (result.status === "rejected" && !isSubscriptionsNotDeployed(result.reason)) logClientError("profile.subscriptionCounts", result.reason, {}); });
      const subscriptionResult = results[0];
      const summary = subscriptionResult?.status === "fulfilled" ? subscriptionResult.value : null;
      const friendResult = results[1];
      setCounts({ uid, values: [summary?.subscriptionCount ?? null, summary?.subscriberCount ?? null,
        friendResult?.status === "fulfilled" ? friendResult.value : null],
        notDeployed: subscriptionResult?.status === "rejected" && isSubscriptionsNotDeployed(subscriptionResult.reason) });
    });
    return () => { active = false; };
  }, [uid, attempt]);
  useEffect(() => {
    const refresh = (event: Event) => { if ((event as CustomEvent<{ uid: string }>).detail?.uid === uid) setAttempt(value => value + 1); };
    window.addEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, refresh);
  }, [uid]);
  if (!uid) return null;
  const current = counts?.uid === uid ? counts.values : null;
  return <div className="profile-social">
    <div className={`profile-social-stats${ACTIVITY_SUBSCRIPTIONS_ENABLED ? " profile-social-stats--subscriptions" : ""}`}>
      {ACTIVITY_SUBSCRIPTIONS_ENABLED && kinds.map((kind, index) => {
        const label = `${t(`activitySubscriptions.${kind}`)} ${current ? current[index]?.toLocaleString() ?? "—" : "…"}`;
        const content = <><span>{t(`activitySubscriptions.${kind}`)}</span><Text as="strong" variant="num">{current ? current[index]?.toLocaleString() ?? "—" : "…"}</Text></>;
        return current && current[index] != null ? <Link key={kind} to={`/athlete/me/friends?view=${kind}`} className="profile-social-stat" aria-label={label}>{content}</Link>
          : <button key={kind} type="button" disabled className="profile-social-stat" aria-label={label}>{content}</button>;
      })}
      <Link to="/athlete/me/friends" className="profile-social-stat" aria-label={`${t("activitySubscriptions.friends")} ${current?.[2]?.toLocaleString() ?? (current ? "—" : "…")}`}>
        <span>{t("activitySubscriptions.friends")}</span>
        <Text as="strong" variant="num">{current?.[2]?.toLocaleString() ?? (current ? "—" : "…")}</Text>
      </Link>
      <Link to="/athlete/me/activities" className="profile-social-stat">
        <span>{t("profileSocial.activities")}</span>
        <Text as="strong" variant="num">{typeof profile?.stats?.activityCount === "number" && Number.isSafeInteger(profile.stats.activityCount) && profile.stats.activityCount >= 0 ? profile.stats.activityCount.toLocaleString() : "—"}</Text>
      </Link>
    </div>
    {current?.some((count, index) => count == null && (ACTIVITY_SUBSCRIPTIONS_ENABLED || index === 2)) && <div className="profile-social-error">
      <Text as="span" variant="bodySmall" tone="secondary">{t(counts?.notDeployed ? "activitySubscriptions.notDeployed" : "profileSocial.unavailable")}</Text>
      {!counts?.notDeployed && <Button variant="ghost" size="sm" onClick={() => setAttempt(value => value + 1)}>{t("profileSocial.retry")}</Button>}
    </div>}
    <ProfileActivitySummary key={uid} uid={uid} />
  </div>;
}
