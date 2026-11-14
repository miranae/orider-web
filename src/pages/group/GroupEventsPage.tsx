import { useLocalizedPath } from "../../hooks/useLocalizedNavigate";
import { useClubMeetingsApi } from "../../features/club-preparation/useClubMeetingsApi";
import ClubCafeSchedulePanel from "../../features/group/ClubCafeSchedulePanel";
import {
  type ClubMeetingListItem,
} from "../../services/clubMeetings";
import { isActiveEventRegistration } from "../../features/event/activeRegistration";
import { isEventHost } from "../../features/event/eventHost";
import { useEffect, useState, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { getVisibleEventPage } from "../../services/eventDiscovery";
import { groupCalendarUrl } from "../../features/group/groupCalendar";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { normalizeStartTime } from "../../utils/event-time";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMemberRole } from "../../hooks/useGroup";
import { canManageGroup } from "../../features/group/groupPermissions";
import GroupSubNav from "../../components/group/GroupSubNav";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/redesign";
import { UnifiedClubEventList, type ClubEvent } from "../../features/group/UnifiedClubEventList";
import { Button, buttonClass } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";

export default function GroupEventsPage() {
  const services = useFirebaseServices();
  const { firestore } = services;
  const { listClubMeetings } = useClubMeetingsApi();
  const { t, i18n } = useTranslation(["group", "event"]);
  const { groupId } = useParams();
  const clubHomePath = useLocalizedPath(`/club/${groupId ?? ""}`);
  const { user } = useAuth();
  const {
    role,
    loading: roleLoading,
    error: roleError,
    retry: retryRole,
  } = useGroupMemberRole(groupId, user?.uid);
  const accessKey = `${user?.uid ?? ""}:${role ?? ""}`;
  const {
    group,
    loading: groupLoading,
    error: groupError,
    retry: retryGroup,
  } = useGroup(groupId, accessKey);
  const meetingScope = `${user?.uid ?? ""}:${groupId ?? ""}:${role ?? ""}`;
  const currentMeetingScope = useRef(meetingScope);
  currentMeetingScope.current = meetingScope;
  const [loadedMeetingScope, setLoadedMeetingScope] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [meetings, setMeetings] = useState<ClubMeetingListItem[]>([]);
  const [meetingError, setMeetingError] = useState(false);
  const [meetingLoading, setMeetingLoading] = useState(true);
  const [loadedEventScope, setLoadedEventScope] = useState("");
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("all");
  const eventScope = JSON.stringify([groupId, accessKey, status]);
  const [eventPage, setEventPage] = useState<{ scope: string; cursor?: string }>({ scope: "" });
  const eventCursor = eventPage.scope === eventScope ? eventPage.cursor : undefined;
  const [eventNextCursor, setEventNextCursor] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setEventNextCursor(null);
    setLoading(true);
    setError(false);
    if (!groupId) {
      setLoading(false);
      return;
    }
    (async () => {
      const page = await getVisibleEventPage({ groupId, publicOnly: !role, statuses: status === "all" ? ["OPEN", "LIVE", "FINISHED", "CANCELLED"] : [status], descending: status === "FINISHED" || status === "CANCELLED", limit: 20, ...(eventCursor ? { cursor: eventCursor } : {}) }, services);
      if (!cancelled) setEventNextCursor(page.nextCursor);
      return page.docs.filter(item => {
        const info = item.data().info ?? {};
        return info.kind !== "CLUB_MEETING" && info.deletedAt == null && info.status !== "DRAFT";
      });
    })()
      .then(async (eventDocs) => {
        if (cancelled) return;
        const rows = await Promise.all(
          eventDocs.map(async (eventDoc) => {
            const data = eventDoc.data();
            const info = data.info ?? {};
            if (
              info.kind === "CLUB_MEETING" ||
              info.deletedAt != null ||
              info.status === "DRAFT"
            )
              return null;
            let myRsvp: boolean | null = null;
            if (user) {
              try {
                const participant = await getDoc(
                  doc(
                    firestore,
                    "events",
                    eventDoc.id,
                    "participants",
                    user.uid,
                  ),
                );
                myRsvp =
                  participant.exists() &&
                  isActiveEventRegistration(participant.data()?.status);
              } catch (reason) {
                logClientError("GroupEventsPage.registration", reason, {
                  groupId,
                  eventId: eventDoc.id,
                });
              }
            }
            return {
              id: eventDoc.id,
              name: String(info.name ?? ""),
              status: String(info.status ?? ""),
              startTime: normalizeStartTime(info.startTime),
              registered:
                typeof data.counters?.totalRegistered === "number"
                  ? data.counters.totalRegistered
                  : null,
              myRsvp,
              // 주최자(만든 사람·공동 주최자)에게만 목록에서 바로 수정 진입을 보여준다.
              isHost: isEventHost(user?.uid, {
                creatorId: typeof info.creatorId === "string" ? info.creatorId : null,
                hostIds: Array.isArray(info.hostIds) ? info.hostIds : null,
              }),
            };
          }),
        );
        if (!cancelled) {
          setEvents(rows.filter((row): row is ClubEvent => row !== null));
          setLoadedEventScope(eventScope);
        }
      })
      .catch((err) => {
        logClientError("GroupEventsPage.load", err, { groupId });
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, accessKey, role, retry, status, eventCursor, services, eventScope]);
  useEffect(() => {
    let cancelled = false;
    setMeetings([]);
    setNextCursor(null);
    setLoadedMeetingScope("");
    setMeetingError(false);
    setMeetingLoading(true);
    if (!groupId || !user || !role) {
      setMeetingLoading(false);
      return;
    }
    listClubMeetings(groupId)
      .then((result) => {
        if (!cancelled) {
          setMeetings(result.meetings);
          setNextCursor(result.nextCursor);
          setLoadedMeetingScope(meetingScope);
        }
      })
      .catch(() => {
        if (!cancelled) setMeetingError(true);
      })
      .finally(() => {
        if (!cancelled) setMeetingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, user, role, retry, meetingScope, listClubMeetings]);
  const loadMoreMeetings = async () => {
    if (!groupId || !nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const scope = meetingScope;
    try {
      const result = await listClubMeetings(groupId, nextCursor);
      if (currentMeetingScope.current === scope) {
        setMeetings((old) => [
          ...old,
          ...result.meetings.filter(
            (item) =>
              !old.some((existing) => existing.eventId === item.eventId),
          ),
        ]);
        setNextCursor(result.nextCursor);
      }
    } catch {
      if (currentMeetingScope.current === scope) setMeetingError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };
  const visibleMeetings = loadedMeetingScope === meetingScope ? meetings : [];
  if (groupLoading || roleLoading)
    return <LoadingSkeleton kind="list" count={3} />;
  if (groupError || roleError)
    return (
      <ErrorState
        title={t("error.loadFailed")}
        onRetry={roleError ? retryRole : retryGroup}
      />
    );
  if (!group) return <EmptyState title={t("empty.groupNotFound")} />;
  const manager = canManageGroup(group, user?.uid, role);
  if (!role) return <Navigate to={clubHomePath} replace />;
  const calendarUrl = groupCalendarUrl(group);

  return (
    <div data-testid="C3" className="space-y-4">
      <header data-testid="C3-0">
        <GroupSubNav group={group} isCreator={manager} compact />
        <div className="club-meetings-heading">
          <div><h2>{t("meetings.title")}</h2><p>{t("meetings.description")}</p></div>
          <Link className={buttonClass({ variant: "primary", size: "sm" })} to={`/club/${group.id}/meetings/new`}>{t("meetings.create")}</Link>
        </div>
        {(calendarUrl || user?.uid === group.creatorId) && <details className="club-meeting-tools">
          <summary>{t("meetings.tools")}</summary>
          <div className="club-meeting-tool-actions">
            {calendarUrl && <a data-testid="C3-0-1" className={buttonClass({ variant: "secondary", size: "sm" })} href={calendarUrl}>{t("events.subscribe")}</a>}
            {user?.uid === group.creatorId && <Link data-testid="C3-0-2" className={buttonClass({ variant: "secondary", size: "sm" })} to={`/event/create?groupId=${encodeURIComponent(group.id)}`}>{i18n.language.startsWith("en") ? "Create a race" : "대회 만들기"}</Link>}
          </div>
        </details>}
      </header>
      <ClubCafeSchedulePanel groupId={group.id} language={i18n.language} />
      <div className="flex flex-wrap gap-2">
        {["all", "OPEN", "LIVE", "FINISHED", "CANCELLED"].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === status ? "primary" : "secondary"}
            aria-pressed={value === status}
            onClick={() => setStatus(value)}
          >
            {value === "all"
              ? t("filter.all")
              : t(`event:status.${value.toLowerCase()}`)}
          </Button>
        ))}
      </div>
      <UnifiedClubEventList groupId={group.id} meetings={visibleMeetings} events={loadedEventScope === eventScope ? events : []} status={status}
        loading={loading || meetingLoading} error={error || meetingError}
        hasMore={!!(eventNextCursor || eventCursor || nextCursor)} onRetry={() => { setEventPage({ scope: eventScope }); setRetry(value => value + 1); }} />
      {loadedMeetingScope === meetingScope && nextCursor && !meetingError && (
        <Button loading={loadingMore} disabled={loadingMore} onClick={() => void loadMoreMeetings()}>
          {i18n.language.startsWith("en") ? "Load more meetings" : "모임 더 보기"}
        </Button>
      )}
      {!loading && !error && (eventNextCursor || eventCursor) && <div>
        <p role="status">{t("event:discovery.partial")}</p>
        {eventCursor && <Button variant="secondary" onClick={() => setEventPage({ scope: eventScope })}>{t("event:discovery.first")}</Button>}
        {eventNextCursor && <Button variant="secondary" onClick={() => setEventPage({ scope: eventScope, cursor: eventNextCursor })}>{t("event:message.next")}</Button>}
      </div>}
    </div>
  );
}
