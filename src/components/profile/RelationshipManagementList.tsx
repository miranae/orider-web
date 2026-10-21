import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readOwnSubscriptionPage, readOwnBlockedPage, setActivitySubscription, unblockActivitySubscriptionTarget,
  isSubscriptionsNotDeployed, type ActivitySubscriptionRelation, type SubscriptionKind } from "../../services/activitySubscriptions";
import { logClientError } from "../../services/errorLogger";
import { LocalizedLink as Link } from "../LocalizedLink";
import Avatar from "../Avatar";
import { Button, Card, Text } from "../../theme/components";

export type RelationshipView = SubscriptionKind | "blocked";
export default function RelationshipManagementList({ uid, view }: { uid: string; view: RelationshipView }) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState<{ items: ActivitySubscriptionRelation[]; cursor: string | null; hasMore: boolean }>({ items: [], cursor: null, hasMore: false });
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"notDeployed" | "unavailable" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [actionFailed, setActionFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailure(null);
    const request = view === "blocked" ? readOwnBlockedPage(uid, cursor) : readOwnSubscriptionPage(uid, view, cursor);
    void request.then(next => {
      if (active) setPage(previous => ({ ...next, items: cursor ? [...previous.items, ...next.items] : next.items }));
    }).catch(error => {
      if (!active) return;
      if (!isSubscriptionsNotDeployed(error)) logClientError("friends.relationshipList", error, {});
      setFailure(isSubscriptionsNotDeployed(error) ? "notDeployed" : "unavailable");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid, view, cursor, attempt]);
  const remove = async (targetUid: string) => {
    if (pending.has(targetUid)) return;
    setPending(previous => new Set(previous).add(targetUid)); setActionFailed(false);
    try {
      if (view === "blocked") await unblockActivitySubscriptionTarget(uid, targetUid);
      else await setActivitySubscription(uid, targetUid, false);
      if (mounted.current) setPage(previous => ({ ...previous, items: previous.items.filter(item => item.userId !== targetUid) }));
    } catch (error) {
      if (mounted.current) { logClientError("friends.relationshipChange", error, {}); setActionFailed(true); }
    } finally {
      if (mounted.current) setPending(previous => { const next = new Set(previous); next.delete(targetUid); return next; });
    }
  };
  return <Card className="friends-relationship-list">
    <Text as="h2" variant="subtitle">{t(`activitySubscriptions.${view}`)}</Text>
    {view === "blocked" && <Text as="p" variant="bodySmall" tone="secondary">{t("activitySubscriptions.blockedDescription")}</Text>}
    {page.items.map(item => <div key={item.userId} className="friends-relationship-row">
      <Link to={`/athlete/${item.userId}`} className="profile-social-person">
        <span aria-hidden="true"><Avatar name={item.nickname} imageUrl={item.profileImage} size="md" /></span>
        <Text as="span" variant="body">{item.nickname ?? t("label.rider")}</Text>
      </Link>
      {view !== "subscribers" && <Button variant="secondary" size="sm" disabled={pending.has(item.userId)} onClick={() => { void remove(item.userId); }}>
        {t(pending.has(item.userId) ? "activitySubscriptions.updating" : view === "blocked" ? "activitySubscriptions.unblock" : "activitySubscriptions.unsubscribe")}
      </Button>}
    </div>)}
    {loading && <Text as="p" variant="bodySmall" role="status">{t("label.loadingHint")}</Text>}
    {failure ? <div className="profile-social-error"><Text as="p" variant="bodySmall">{t(failure === "notDeployed" ? "activitySubscriptions.managementNotReady" : "activitySubscriptions.unavailable")}</Text>
      {failure !== "notDeployed" && <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>{t("profileSocial.retry")}</Button>}</div>
      : !loading && !page.items.length && <Text as="p" variant="bodySmall" tone="secondary">{t("profileSocial.empty")}</Text>}
    {actionFailed && <Text as="p" variant="bodySmall" role="alert">{t("activitySubscriptions.actionFailed")}</Text>}
    {!failure && page.hasMore && <Button variant="secondary" disabled={loading} onClick={() => setCursor(page.cursor)}>{t("profileSocial.more")}</Button>}
  </Card>;
}
