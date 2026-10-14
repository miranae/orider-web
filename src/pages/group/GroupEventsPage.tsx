import { isActiveEventRegistration } from "../../features/event/activeRegistration";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { groupCalendarUrl } from "../../features/group/groupCalendar";
import { firestore } from "../../services/firebase";
import { normalizeStartTime } from "../../utils/event-time";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMemberRole } from "../../hooks/useGroup";
import { canManageGroup } from "../../features/group/groupPermissions";
import GroupSubNav from "../../components/group/GroupSubNav";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Button, Card } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";

interface ClubEvent { id: string; name: string; status: string; startTime: number; registered: number | null; myRsvp: boolean }
export default function GroupEventsPage() {
  const { t, i18n } = useTranslation("group");
  const { groupId } = useParams();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useGroupMemberRole(groupId, user?.uid);
  const accessKey = `${user?.uid ?? ""}:${role ?? ""}`;
  const { group, loading: groupLoading, error: groupError } = useGroup(groupId, accessKey);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("all");
  useEffect(() => {
    let cancelled = false;
    setEvents([]); setLoading(true); setError(false);
    if (!groupId) { setLoading(false); return; }
    const constraints = [where("info.groupId", "==", groupId), orderBy("info.startTime", status === "FINISHED" ? "desc" : "asc"), limit(20), ...(status === "all" ? [where("info.status", "in", ["OPEN", "LIVE"])] : [where("info.status", "==", status)])];
    if (!role) constraints.unshift(where("info.visibility", "==", "PUBLIC"));
    getDocs(query(collection(firestore, "events"), ...constraints)).then(async snapshot => {
      const rows = await Promise.all(snapshot.docs.map(async eventDoc => {
        const data = eventDoc.data();
        const info = data.info ?? {};
        if (info.deletedAt != null || info.status === "DRAFT") return null;
        const participant = user ? await getDoc(doc(firestore, "events", eventDoc.id, "participants", user.uid)) : null;
        // Backend list-my-registered-events.ts ACTIVE_PARTICIPANT_STATUSES. History is not an active registration.
        const myRsvp = !!participant?.exists() && isActiveEventRegistration(participant.data()?.status);
        return { id: eventDoc.id, name: String(info.name ?? ""), status: String(info.status ?? ""), startTime: normalizeStartTime(info.startTime), registered: typeof data.counters?.totalRegistered === "number" ? data.counters.totalRegistered : null, myRsvp };
      }));
      if (!cancelled) setEvents(rows.filter((row): row is ClubEvent => row !== null));
    }).catch(err => { logClientError("GroupEventsPage.load", err, { groupId }); if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, accessKey, role, retry, status]);
  if (groupLoading || roleLoading) return <LoadingSkeleton kind="list" count={3} />;
  if (groupError) return <ErrorState title={t("error.loadFailed")} onRetry={() => window.location.reload()} />;
  if (!group) return <EmptyState title={t("empty.groupNotFound")} />;
  const manager = canManageGroup(group, user?.uid, role);
  if (!role) return <Navigate to=".." relative="path" replace />;
  const calendarUrl = groupCalendarUrl(group);
  return <div data-testid="C3" className="space-y-4"><header data-testid="C3-0"><GroupSubNav group={group} isCreator={manager} />
    {calendarUrl && <a data-testid="C3-0-1" href={calendarUrl}>{t("events.subscribe")}</a>}
    {user?.uid === group.creatorId && <Link data-testid="C3-0-2" to={`/event/create?groupId=${encodeURIComponent(group.id)}`}>{t("dashboard.createEvent")}</Link>}</header>
    <div className="flex gap-2">{["all", "OPEN", "LIVE", "FINISHED"].map(value => <Button key={value} size="sm" variant={value === status ? "primary" : "secondary"} onClick={() => setStatus(value)}>{value === "all" ? t("filter.all") : t(`event:status.${value.toLowerCase()}`)}</Button>)}</div>
    <section data-testid={status === "FINISHED" ? "C3-2" : "C3-1"}>{loading ? <LoadingSkeleton kind="list" count={3} /> : error ? <ErrorState title={t("error.loadFailed")} onRetry={() => setRetry(value => value + 1)} /> : events.length === 0 ? <div data-testid="C3-1-3"><EmptyState title={t("dashboard.noEvents")} actions={[{ label: t("dashboard.moreEvents"), href: "/explore/events" }]} /></div> : events.filter(event => status === "all" ? ["OPEN", "LIVE"].includes(event.status) : event.status === status).map(event => <Card data-testid={event.status === "FINISHED" ? "C3-2-1" : "C3-1-1"} key={event.id}><Link to={`/event/${event.id}`}>{event.name}</Link><p>{event.startTime ? new Date(event.startTime).toLocaleString(i18n.language) : "–"} · {t(`event:status.${event.status.toLowerCase()}`)}{event.registered !== null ? ` · ${t("dashboard.eventParticipants", { count: event.registered })}` : ""}</p>{event.status === "OPEN" && <Link data-testid="C3-1-2" to={event.myRsvp ? `/event/${event.id}` : `/event/${event.id}/register`}>{t(event.myRsvp ? "dashboard.eventAction.manageRsvp" : "dashboard.eventAction.rsvp")}</Link>}{event.status === "FINISHED" && <Link to={`/event/${event.id}/results`}>{t("events.results")}</Link>}</Card>)}
    </section>
  </div>;
}
