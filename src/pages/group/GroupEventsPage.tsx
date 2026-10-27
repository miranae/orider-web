import ClubCafeSchedulePanel from "../../features/group/ClubCafeSchedulePanel";
import {
  listClubMeetings,
  type ClubMeetingListItem,
} from "../../services/clubMeetings";
import { isActiveEventRegistration } from "../../features/event/activeRegistration";
import { useEffect, useState, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { getVisibleEventPage } from "../../services/eventDiscovery";
import { groupCalendarUrl } from "../../features/group/groupCalendar";
import { firestore } from "../../services/firebase";
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
import { Button, Card, buttonClass } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";

interface ClubEvent {
  id: string;
  name: string;
  status: string;
  startTime: number;
  registered: number | null;
  myRsvp: boolean | null;
}
export default function GroupEventsPage() {
  const { t, i18n } = useTranslation(["group", "event"]);
  const { groupId } = useParams();
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
  const meetingScope = `${user?.uid ?? ""}:${groupId ?? ""}`;
  const currentMeetingScope = useRef(meetingScope);
  currentMeetingScope.current = meetingScope;
  const [loadedMeetingScope, setLoadedMeetingScope] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [meetings, setMeetings] = useState<ClubMeetingListItem[]>([]);
  const [meetingError, setMeetingError] = useState(false);
  const [meetingLoading, setMeetingLoading] = useState(true);
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
      const page = await getVisibleEventPage({ groupId, publicOnly: !role, statuses: status === "all" ? ["OPEN", "LIVE"] : [status], descending: status === "FINISHED", limit: 20, ...(eventCursor ? { cursor: eventCursor } : {}) });
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
            };
          }),
        );
        if (!cancelled)
          setEvents(rows.filter((row): row is ClubEvent => row !== null));
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
  }, [groupId, accessKey, role, retry, status, eventCursor]);
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
  }, [groupId, user, role, retry, meetingScope]);
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
  if (!role) return <Navigate to=".." relative="path" replace />;
  const calendarUrl = groupCalendarUrl(group);
  const visibleEvents = events.filter((event) =>
    status === "all"
      ? ["OPEN", "LIVE"].includes(event.status)
      : event.status === status,
  );
  return (
    <div data-testid="C3" className="space-y-4">
      <header data-testid="C3-0">
        <GroupSubNav group={group} isCreator={manager} />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={buttonClass({ variant: "primary", size: "sm" })}
            to={`/club/${group.id}/meetings/new`}
          >
            {i18n.language.startsWith("en")
              ? "Create a meeting"
              : "모임 만들기"}
          </Link>
          {calendarUrl && (
            <a
              data-testid="C3-0-1"
              className={buttonClass({ variant: "secondary", size: "sm" })}
              href={calendarUrl}
            >
              {t("events.subscribe")}
            </a>
          )}
          {user?.uid === group.creatorId && (
            <Link
              data-testid="C3-0-2"
              className={buttonClass({ variant: "primary", size: "sm" })}
              to={`/event/create?groupId=${encodeURIComponent(group.id)}`}
            >
              {i18n.language.startsWith("en") ? "Create a race" : "대회 만들기"}
            </Link>
          )}
        </div>
      </header>
      <ClubCafeSchedulePanel groupId={group.id} language={i18n.language} />
      <section
        aria-label={
          i18n.language.startsWith("en") ? "Club meetings" : "클럽 모임"
        }
        className="space-y-3"
      >
        {meetingLoading ? (
          <LoadingSkeleton kind="list" count={2} />
        ) : meetingError ? (
          <ErrorState
            title={
              i18n.language.startsWith("en")
                ? "Could not load club meetings"
                : "클럽 모임을 불러오지 못했어요."
            }
            onRetry={() => setRetry((value) => value + 1)}
          />
        ) : visibleMeetings.length === 0 ? (
          <p>
            {i18n.language.startsWith("en")
              ? "No club meetings yet. Any active member can create one."
              : "아직 모임이 없어요. 활동 중인 클럽 회원 누구나 만들 수 있어요."}
          </p>
        ) : (
          visibleMeetings.map((item) => (
            <Card key={item.eventId}>
              <Link to={`/club/${group.id}/meetings/${item.eventId}`}>
                <strong>{item.meeting.title}</strong>
              </Link>
              <p>
                {item.meeting.date} {item.meeting.time} · {item.meeting.place}
              </p>
              <p>
                {item.meeting.status === "cancelled"
                  ? i18n.language.startsWith("en")
                    ? "Cancelled"
                    : "모임 취소"
                  : `${item.participantCount}/${item.meeting.capacity} ${i18n.language.startsWith("en") ? "attending" : "참석"} · ${item.waitingCount} ${i18n.language.startsWith("en") ? "waiting" : "대기"}`}
              </p>
            </Card>
          ))
        )}
        {loadedMeetingScope === meetingScope && nextCursor && !meetingError && (
          <Button
            loading={loadingMore}
            disabled={loadingMore}
            onClick={() => void loadMoreMeetings()}
          >
            {i18n.language.startsWith("en")
              ? "Load more meetings"
              : "모임 더 보기"}
          </Button>
        )}
      </section>
      <div className="flex flex-wrap gap-2">
        {["all", "OPEN", "LIVE", "FINISHED"].map((value) => (
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
      <section data-testid={status === "FINISHED" ? "C3-2" : "C3-1"}>
        {loading ? (
          <LoadingSkeleton kind="list" count={3} />
        ) : error ? (
          <ErrorState
            title={t("error.loadFailed")}
            onRetry={() => { setEventPage({ scope: eventScope }); setRetry((value) => value + 1); }}
          />
        ) : visibleEvents.length === 0 ? (
          <div data-testid="C3-1-3">
            <EmptyState
              title={eventNextCursor || eventCursor ? t("event:discovery.emptyPage") : t(`events.empty.${status}`)}
              actions={[
                { label: t("dashboard.moreEvents"), href: "/explore/events" },
              ]}
            />
          </div>
        ) : (
          visibleEvents.map((event) => (
            <Card
              data-testid={event.status === "FINISHED" ? "C3-2-1" : "C3-1-1"}
              key={event.id}
            >
              <Link to={`/event/${event.id}`}>{event.name}</Link>
              <p>
                {event.startTime
                  ? new Date(event.startTime).toLocaleString(i18n.language)
                  : "–"}{" "}
                · {t(`event:status.${event.status.toLowerCase()}`)}
                {event.registered !== null
                  ? ` · ${t("dashboard.eventParticipants", { count: event.registered })}`
                  : ""}
              </p>
              {event.status === "OPEN" && (
                <Link
                  data-testid="C3-1-2"
                  to={
                    event.myRsvp === null || event.myRsvp
                      ? `/event/${event.id}`
                      : `/event/${event.id}/register`
                  }
                >
                  {t(
                    event.myRsvp === null
                      ? "events.viewDetails"
                      : event.myRsvp
                        ? "dashboard.eventAction.manageRsvp"
                        : "dashboard.eventAction.rsvp",
                  )}
                </Link>
              )}
              {event.status === "FINISHED" && (
                <Link to={`/event/${event.id}/results`}>
                  {t("events.results")}
                </Link>
              )}
            </Card>
          ))
        )}
      </section>
      {!loading && !error && (eventNextCursor || eventCursor) && <div>
        <p role="status">{t("event:discovery.partial")}</p>
        {eventCursor && <Button variant="secondary" onClick={() => setEventPage({ scope: eventScope })}>{t("event:discovery.first")}</Button>}
        {eventNextCursor && <Button variant="secondary" onClick={() => setEventPage({ scope: eventScope, cursor: eventNextCursor })}>{t("event:message.next")}</Button>}
      </div>}
    </div>
  );
}
