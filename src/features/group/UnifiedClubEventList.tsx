import { useTranslation } from "react-i18next";
import type { ClubMeetingListItem } from "../../services/clubMeetings";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import { Card, Stack, buttonClass } from "../../theme/components";
import { clubEventWindow, compareClubEvents, type ClubEventWindow } from "./clubEventWindow";
export interface ClubEvent {
  id: string; name: string; status: string; startTime: number;
  /** 종료 시각(있으면) — 시작 후 3시간이 지나도 종료 전 OPEN 은 예정이다(서버 timeWindow 와 같은 규칙). */
  endTime: number | null;
  registered: number | null; myRsvp: boolean | null;
  /** 주최자면 목록에서 바로 수정으로 간다. 수정 가능 여부는 서버가 다시 판정한다. */
  isHost: boolean;
}
export function meetingEventStatus(item: ClubMeetingListItem) {
  return item.meeting.status === "cancelled" ? "CANCELLED" : item.rideStatus ?? "OPEN";
}
/** 모임 시작 시각(KST 날짜·시각). 모르면 0 — 구간 판정은 숨기지 않는 쪽으로 본다. */
export function meetingStartMs(item: ClubMeetingListItem): number {
  return Date.parse(`${item.meeting.date}T${item.meeting.time}:00+09:00`) || 0;
}
/** @param timeWindow 다가오는(진행 중 먼저·가까운 순) / 지난(최근 순) 이벤트. 판정은 서버와 같은 `clubEventWindow`. */
export function UnifiedClubEventList({groupId, meetings, events, timeWindow, loading, error, hasMore, onRetry, nowMs = Date.now()}: {
  groupId: string; meetings: ClubMeetingListItem[]; events: ClubEvent[]; timeWindow: ClubEventWindow;
  loading: boolean; error: boolean; hasMore: boolean; onRetry: () => void; nowMs?: number;
}) {
  const {t, i18n} = useTranslation(["group", "event"]);
  const rows = [
    ...meetings.map(item => ({kind:"meeting" as const, id:item.eventId, status:meetingEventStatus(item), at:meetingStartMs(item), end:null, item})),
    ...events.map(event => ({kind:"event" as const, id:event.id, status:event.status, at:event.startTime, end:event.endTime, event})),
  ].filter(row => clubEventWindow(row.status, row.at, nowMs, row.end) === timeWindow)
    .sort((a,b) => compareClubEvents(timeWindow, a, b));
  return <section aria-label={t("events.listLabel")} data-testid={timeWindow === "past" ? "C3-2" : "C3-1"} >
    <Stack gap="var(--dim-section-gap)">
    {loading ? <LoadingSkeleton kind="list" count={3} /> : <>
      {error && <ErrorState title={t("error.loadFailed")} onRetry={onRetry} />}
      {!rows.length && !error && <div data-testid="C3-1-3"><EmptyState
        title={hasMore ? t("event:discovery.emptyPage") : t(`events.empty.${timeWindow}`)}
        /></div>}
      {rows.map(row => {
        if (row.kind === "meeting") {
          const item = row.item;
          return (
            <Card key={`meeting:${item.eventId}`}>
              <Link to={`/club/${groupId}/meetings/${item.eventId}`}>
                <strong>{item.meeting.title}</strong>
              </Link>
              <p>{t("events.kind.meeting")} · {t(`event:status.${meetingEventStatus(item).toLowerCase()}`)}</p>
              {meetingEventStatus(item) === "LIVE" && <strong role="status">{i18n.language.startsWith("en") ? "Riding now" : "지금 주행 중"}</strong>}
              {/* 동작은 버튼 모양으로 한 줄에 띄워 둔다 — 글자 링크를 붙여 두면 "모임 수정가상주행 관전" 처럼 읽혀 버튼을 못 찾는다. */}
              {!["CANCELLED", "FINISHED"].includes(meetingEventStatus(item)) && <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
                {item.isHost && <Link data-testid="club-meeting-edit" className={buttonClass({ variant: "primary", size: "sm" })} to={`/club/${groupId}/meetings/${item.eventId}/edit`}>{i18n.language.startsWith("en") ? "Edit meeting" : "모임 수정"}</Link>}
                <Link className={buttonClass({ variant: "secondary", size: "sm" })} to={`/club/${groupId}/meetings/${item.eventId}/live`}>{i18n.language.startsWith("en") ? "Watch virtual ride" : "가상주행 관전"}</Link>
              </div>}
              <p>
                {item.meeting.date} {item.meeting.time} · {item.meeting.place}
              </p>
              {meetingEventStatus(item) !== "CANCELLED" && <p>
                {`${item.participantCount}/${item.meeting.capacity} ${i18n.language.startsWith("en") ? "attending" : "참석"} · ${item.waitingCount} ${i18n.language.startsWith("en") ? "waiting" : "대기"}`}
              </p>}
            </Card>
          );
        }
        const event = row.event;
        return (
            <Card
              data-testid={event.status === "FINISHED" ? "C3-2-1" : "C3-1-1"}
              key={`event:${event.id}`}
            >
              <p>{t("events.kind.race")}</p>
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
              <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
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
                {event.isHost && event.status === "OPEN" && (
                  <Link data-testid="club-event-edit" className={buttonClass({ variant: "primary", size: "sm" })} to={`/event/${event.id}/host/edit`}>
                    {t("event:action.editEvent")}
                  </Link>
                )}
              </div>
              {event.status === "FINISHED" && (
                <Link to={`/event/${event.id}/results`}>
                  {t("events.results")}
                </Link>
              )}
            </Card>
        );
      })}
    </>}
    </Stack>
  </section>;
}
