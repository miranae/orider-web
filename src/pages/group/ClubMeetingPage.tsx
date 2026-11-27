import MeetingInviteShare from "../../features/club-preparation/MeetingInviteShare";
import MeetingDiscord from "../../features/club-preparation/MeetingDiscord";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pencil, RefreshCw, Users } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useGroup, useGroupMemberRole } from "../../hooks/useGroup";
import { useLocalizedNavigate } from "../../hooks/useLocalizedNavigate";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/redesign";
import { Button, Card, Chip, IconButton, buttonClass, Stack } from "../../theme/components";
import { Field, Input, Select, Textarea } from "../../theme/components/Input";
import GroupSubNav from "../../components/group/GroupSubNav";
import InfoTip from "../../components/InfoTip";
import { canManageGroup } from "../../features/group/groupPermissions";
import MeetingForm from "../../features/club-preparation/MeetingForm";
import MeetingPeople from "../../features/club-preparation/MeetingPeople";
import MeetingTeams from "../../features/club-preparation/MeetingTeams";
import HostPreparationChecklist from "../../features/club-preparation/HostPreparationChecklist";
import { unassignedMembers } from "../../features/club-preparation/teamAssignment";
import CoursePreview, {
  CourseSummary,
} from "../../features/club-preparation/CoursePreview";
import { useClubMeeting } from "../../features/club-preparation/useClubMeeting";
import {
  clearMeetingRequestId,
  meetingRequestId,
  newClubMeeting,
} from "../../features/club-preparation/meetingCopy";
import { meetingErrorMessage } from "../../features/club-preparation/meetingMessages";
import type { State } from "../../features/club-preparation/domain";
import {
  type ClubMeetingSnapshot,
} from "../../services/clubMeetings";
import { useClubMeetingsApi } from "../../features/club-preparation/useClubMeetingsApi";
import "../../features/club-preparation/clubPreparation.css";
import { ICON_SIZE } from "../../theme/tokens/icon";

export default function ClubMeetingPage({
  mode = "detail",
}: {
  mode?: "new" | "detail" | "edit";
}) {
  const { createClubMeeting, updateClubMeeting } = useClubMeetingsApi();
  const { groupId, meetingId } = useParams();
  const [search] = useSearchParams();
  const { user, loading: authLoading, signIn } = useAuth();
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith("en");
  const { t: clubText } = useTranslation("clubMeeting");
  const navigate = useLocalizedNavigate();
  const {
    role,
    loading: roleLoading,
    error: roleError,
    retry: retryRole,
  } = useGroupMemberRole(groupId, user?.uid);
  const {
    group,
    loading: groupLoading,
    error: groupError,
    retry: retryGroup,
  } = useGroup(groupId, `${user?.uid ?? ""}:${role ?? ""}`);
  const sourceId = mode === "new" ? undefined : meetingId;
  const authoringScope = `${user?.uid ?? ""}/${groupId ?? ""}/${mode}/${sourceId ?? ""}`;
  const currentAuthoringScope = useRef(authoringScope);
  currentAuthoringScope.current = authoringScope;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const snapshot = useClubMeeting(
    sourceId,
    role ? user?.uid : undefined,
    groupId,
  );
  if (authLoading || roleLoading || groupLoading)
    return <LoadingSkeleton kind="list" count={3} />;
  if (!user)
    return (
      <EmptyState
        title={clubText("clubMeetingPageCopy.sign_in_to_use_club_meetings")}
        actions={[
          { label: clubText("clubMeetingPageCopy.sign_in"), onClick: () => void signIn() },
        ]}
      />
    );
  if (groupError || roleError)
    return (
      <ErrorState
        title={clubText("clubMeetingPageCopy.could_not_verify_club_membership")}
        onRetry={roleError ? retryRole : retryGroup}
      />
    );
  if (!group || !role)
    return (
      <EmptyState
        title={clubText("clubMeetingPageCopy.an_active_club_membership_is_required")}
        actions={[
          { label: clubText("clubMeetingPageCopy.back_to_club"), href: `/club/${groupId}` },
        ]}
      />
    );
  if (sourceId && snapshot.loading)
    return <LoadingSkeleton kind="list" count={3} />;
  if (sourceId && !snapshot.data)
    return (
      <ErrorState
        title={meetingErrorMessage(snapshot.error, en)}
        onRetry={() => void snapshot.reload().catch(() => {})}
      />
    );
  const data = snapshot.data;
  if (mode === "edit" && !data?.isHost)
    return (
      <EmptyState
        title={clubText("clubMeetingPageCopy.only_this_meeting_s_host_can")}
        resolve={{ to: `/club/${groupId}/meetings/${meetingId}` }}
      />
    );
  const kinds = [
    { id: "flash", name: clubText("clubMeetingPageCopy.spontaneous_ride"), active: true },
    { id: "tour", name: clubText("clubMeetingPageCopy.tour"), active: true },
  ];
  if (data && !kinds.some((kind) => kind.id === data.meeting.kindId))
    kinds.push({
      id: data.meeting.kindId,
      name: data.meeting.kindName ?? data.meeting.kindId,
      active: true,
    });
  const state: State = {
    version: 1,
    now: Date.now(),
    kinds,
    members: data?.members ?? [
      { id: user.uid, name: user.displayName ?? clubText("clubMeetingPageCopy.me") },
    ],
    meetings: mode === "edit" && data ? [data.meeting] : [],
  };
  return (
    <div className="cp-app cp-product">
      <GroupSubNav
        group={group}
        isCreator={canManageGroup(group, user.uid, role)}
        compact={mode !== "detail"}
      />
      <div className="cp-product-header">
        <Link to={`/club/${group.id}`}>
          ← {clubText("clubMeetingPageCopy.meetings")}
        </Link>
        {mode === "detail" && (
          // 새로고침은 화면 상단 작은 아이콘으로 두고, 다시 읽는 동안 스피너를 보여준다.
          <IconButton
            size="sm"
            variant="ghost"
            loading={refreshing}
            aria-label={clubText("clubMeetingPageCopy.refresh")}
            title={clubText("clubMeetingPageCopy.refresh")}
            icon={<RefreshCw size={ICON_SIZE.sm} />}
            onClick={() => {
              setRefreshing(true);
              void snapshot
                .reload()
                .catch(() => {})
                .finally(() => setRefreshing(false));
            }}
          />
        )}
      </div>
      {mode === "detail" && data ? (
        <ServerMeetingDetail
          key={`${user.uid}/${data.eventId}`}
          data={data}
          uid={user.uid}
          en={en}
          error={snapshot.error}
          reload={snapshot.reload}
          loadOlderNotices={snapshot.loadOlderNotices}
          onEdit={() =>
            navigate(`/club/${group.id}/meetings/${data.eventId}/edit`)
          }
          onConfirmCourse={() =>
            navigate(
              `/club/${group.id}/meetings/${data.eventId}/edit?focus=course-ready`,
            )
          }
          onPrepareCourse={() =>
            navigate(
              `/club/${group.id}/meetings/${data.eventId}/edit?focus=course`,
            )
          }
        />
      ) : (
        <MeetingForm
          key={`${user.uid}/${group.id}/${mode}/${sourceId ?? "new"}`}
          state={state}
          initial={
            mode === "edit" && data ? data.meeting : newClubMeeting()
          }
          draftNamespace={`${encodeURIComponent(user.uid)}.${encodeURIComponent(group.id)}.${mode === "new" ? "new" : "edit"}`}
          initialRevision={mode === "edit" ? data?.revision : undefined}
          english={en}
          focusCourseReady={
            mode === "edit" && search.get("focus") === "course-ready"
          }
          focusCoursePreparation={
            mode === "edit" && search.get("focus") === "course"
          }
          onClose={() => navigate(`/club/${group.id}`)}
          onSave={async (meeting, baseRevision) => {
            try {
              if (mode === "edit" && data) {
                if (baseRevision === undefined)
                  throw new Error("Missing edit revision");
                await updateClubMeeting(data.eventId, meeting, baseRevision);
                if (
                  mounted.current &&
                  currentAuthoringScope.current === authoringScope
                )
                  navigate(`/club/${group.id}/meetings/${data.eventId}`);
              } else {
                const scope = `${group.id}/${sourceId ?? "new"}`;
                const result = await createClubMeeting(
                  group.id,
                  meeting,
                  meetingRequestId(user.uid, scope),
                );
                clearMeetingRequestId(user.uid, scope);
                if (
                  mounted.current &&
                  currentAuthoringScope.current === authoringScope
                )
                  navigate(`/club/${group.id}/meetings/${result.eventId}`);
              }
            } catch (error) {
              throw new Error(meetingErrorMessage(error, en));
            }
          }}
        />
      )}
    </div>
  );
}

function ServerMeetingDetail({
  data,
  uid,
  en,
  error,
  reload,
  loadOlderNotices,
  onEdit,
  onConfirmCourse,
  onPrepareCourse,
}: {
  data: ClubMeetingSnapshot;
  uid: string;
  en: boolean;
  error: unknown;
  reload: () => Promise<void>;
  loadOlderNotices: () => Promise<void>;
  onEdit: () => void;
  onConfirmCourse: () => void;
  onPrepareCourse: () => void;
}) {
  const { setClubMeetingRecruitment, cancelClubMeeting, clubMeetingAttendance, publishClubMeetingNotice, confirmClubMeetingNotice, saveClubMeetingTeams, finishClubMeeting } = useClubMeetingsApi();
  const { t: clubText } = useTranslation("clubMeeting");
  const meeting = data.meeting;
  const current = meeting.registrations.find((item) => item.memberId === uid);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [introductionExpanded, setIntroductionExpanded] = useState(false);
  // Clear the old confirmation before the new meeting can receive a click.
  useLayoutEffect(() => setConfirmingFinish(false), [uid, data.eventId]);
  const [travel, setTravel] = useState({
    joinId: current?.joinId ?? "",
    outbound: current?.outbound ?? "",
    inbound: current?.inbound ?? "",
  });
  const run = async (action: () => Promise<unknown>, refresh = true) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailure("");
    try {
      await action();
      if (refresh) await reload();
    } catch (reason) {
      setFailure(meetingErrorMessage(reason, en));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const state: State = {
    version: 1,
    now: Date.now(),
    kinds: [
      {
        id: meeting.kindId,
        name:
          meeting.kindName ??
          (meeting.kindId === "tour"
            ? clubText("clubMeetingPageCopy.tour")
            : meeting.kindId === "flash"
              ? clubText("clubMeetingPageCopy.spontaneous_ride")
              : meeting.kindId),
        active: true,
      },
    ],
    members: data.members,
    meetings: [meeting],
  };
  const introduction = meeting.description.trim();
  const longIntroduction =
    introduction.length > 240 ||
    introduction.split(/\n\s*\n/).filter(Boolean).length >= 3 ||
    introduction.split("\n").filter((line) => line.trim()).length >= 5;
  const introductionLead = Array.from(
    (introduction.split(/\n\s*\n/)[0] ?? introduction).replace(/\s+/g, " "),
  )
    .slice(0, 180)
    .join("");
  const completed = data.rideStatus === "FINISHED";
  const live = meeting.status !== "cancelled" && !completed;
  const busy = pending || !!error;
  const joined = meeting.registrations.filter(
    (item) => item.status === "joined",
  );
  const waiting = meeting.registrations
    .filter((item) => item.status === "waiting" || item.status === "offered")
    .sort((a, b) => a.order - b.order);
  const occupied =
    joined.length +
    meeting.registrations.filter((item) => item.status === "offered").length;
  return (
    <div className="cp-meeting-detail">
      {!!(failure || error) && (
        <div className="cp-error" role="alert">
          {failure || meetingErrorMessage(error, en)}{" "}
          <Button size="sm" onClick={() => void run(reload)}>
            {clubText("clubMeetingPageCopy.reload_latest_information")}
          </Button>
        </div>
      )}
      <section className="cp-hero cp-meeting-hero">
        <div className="cp-actions">
          <Chip>{state.kinds[0]!.name}</Chip>
          {meeting.venue && (
            <Chip>
              {meeting.venue === "indoor"
                ? clubText("clubMeetingPageCopy.indoor_meeting")
                : clubText("clubMeetingPageCopy.outdoor_meeting")}
            </Chip>
          )}
          <Chip>
            {completed ? clubText("clubMeetingPageCopy.meeting_completed") : !live
              ? clubText("clubMeetingPageCopy.cancelled")
              : meeting.recruitment === "closed"
                ? clubText("clubMeetingPageCopy.registration_closed")
                : meeting.recruitment === "waitlist"
                  ? clubText("clubMeetingPageCopy.waitlist_open")
                  : clubText("clubMeetingPageCopy.registration_open")}
          </Chip>
        </div>
        <div className="cp-hero-title">
          <h1>{meeting.title}</h1>
          {/* 주최자 수정은 큰 행 버튼 대신 제목 옆 연필 아이콘으로 둔다. */}
          {data.isHost && (
            <IconButton
              size="sm"
              variant="ghost"
              disabled={busy || !live}
              aria-label={clubText("clubMeetingPageCopy.edit_meeting")}
              title={clubText("clubMeetingPageCopy.edit_meeting")}
              icon={<Pencil size={ICON_SIZE.sm} />}
              onClick={onEdit}
            />
          )}
        </div>
        {longIntroduction ? (
          <div className="cp-hero-introduction">
            {!introductionExpanded && <p>
              {introductionLead}
              {introduction.length > introductionLead.length ? "…" : ""}
            </p>}
            <details onToggle={(event) => setIntroductionExpanded(event.currentTarget.open)}>
              <summary>
                {clubText("clubMeetingPageCopy.read_full_introduction")}
              </summary>
              <p>{meeting.description}</p>
            </details>
          </div>
        ) : (
          <p>{meeting.description}</p>
        )}
        <div className="cp-meeting-facts">
          <span>
            <CalendarDays size={ICON_SIZE.md} aria-hidden="true" />
            {meeting.date} <strong>{meeting.time}</strong>
          </span>
          <span>
            <MapPin size={ICON_SIZE.md} aria-hidden="true" />
            {meeting.place}
          </span>
          <span>
            <Users size={ICON_SIZE.md} aria-hidden="true" />
            {clubText("clubMeetingPageCopy.attending_waiting", { value1: joined.length, value2: meeting.capacity, value3: waiting.length })}
          </span>
        </div>
        <MeetingInviteShare key={`${data.groupId}/${data.eventId}`} groupId={data.groupId} eventId={data.eventId} title={meeting.title} date={meeting.date} time={meeting.time} place={meeting.place} en={en} />
        <CourseSummary meeting={meeting} />
        {live && meeting.venue !== "outdoor" && current?.status === "joined" && (meeting.courseTrack?.points.length ?? 0) >= 2 && (meeting.courseTrack?.segmentStarts?.length ?? 0) <= 1 && (
          <p>
            <InfoTip
              title={clubText("clubMeetingPageCopy.ride_together_indoors")}
              label={clubText("clubMeetingPageCopy.ride_together_indoors")}
              content={clubText("clubMeetingPageCopy.select_this_meeting_on_the_app")}
            >
              {clubText("clubMeetingPageCopy.ride_together_indoors")}
            </InfoTip>
          </p>
        )}
        {meeting.status !== "cancelled" && <div className="cp-actions"><Link className={buttonClass({variant: "secondary", size: "sm"})} to={`/club/${data.groupId}/meetings/${data.eventId}/live`}>{clubText(completed ? "clubMeetingPageCopy.spectator_results" : meeting.courseTrack ? "clubMeetingPageCopy.spectator_watch" : "clubMeetingPageCopy.spectator_lobby")}</Link></div>}
        {data.isHost && (
          <nav
            className="cp-hero-tools"
            aria-label={clubText("clubMeetingPageCopy.manage_meeting")}
          >
            <a href="#meeting-people">
              {clubText("clubMeetingPageCopy.jump_to_roster")}
            </a>
            <a href="#meeting-notices">
              {clubText("clubMeetingPageCopy.jump_to_notices")}
            </a>
            <a href="#meeting-host-tools">
              {clubText("clubMeetingPageCopy.registration")}
            </a>
            <a href="#meeting-teams">{clubText("clubMeetingPageCopy.groups")}</a>
          </nav>
        )}
      </section>
      <div className="cp-meeting-columns">
        <aside className="cp-meeting-sidebar">
          <Card className="cp-attendance-panel">
            <h2>{clubText("clubMeetingPageCopy.my_attendance")}</h2>
            <p>
              {completed ? clubText("clubMeetingPageCopy.this_meeting_has_ended_check_your") : !live
                ? clubText("clubMeetingPageCopy.this_meeting_was_cancelled")
                : current?.status === "joined"
                  ? clubText("clubMeetingPageCopy.attending")
                  : current?.status === "waiting"
                    ? clubText("clubMeetingPageCopy.waitlist_position", { value1: waiting.findIndex((item) => item.memberId === uid) + 1 })
                    : current?.status === "offered"
                      ? clubText("clubMeetingPageCopy.a_place_has_been_offered_to")
                      : clubText("clubMeetingPageCopy.ready_to_ride_together")}
            </p>
            {live && (
              <div className="cp-actions">
                {(!current || current.status === "cancelled") &&
                  meeting.recruitment !== "closed" && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          clubMeetingAttendance(data.eventId, "join"),
                        )
                      }
                    >
                      {meeting.recruitment === "waitlist" ||
                      occupied >= meeting.capacity ||
                      waiting.length
                        ? clubText("clubMeetingPageCopy.join_waitlist")
                        : clubText("clubMeetingPageCopy.join_meeting")}
                    </Button>
                  )}
                {current?.status === "offered" && (
                  <>
                    <span>
                      {clubText("clubMeetingPageCopy.accept_by")}{" "}
                      {current.offerUntil
                        ? new Date(current.offerUntil).toLocaleTimeString(
                            en ? "en-US" : "ko-KR",
                          )
                        : clubText("clubMeetingPageCopy.checking")}
                    </span>
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          clubMeetingAttendance(data.eventId, "accept-offer"),
                        )
                      }
                    >
                      {clubText("clubMeetingPageCopy.accept_place")}
                    </Button>
                  </>
                )}
                {current && current.status !== "cancelled" && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        clubMeetingAttendance(
                          data.eventId,
                          current.status === "joined"
                            ? "cancel"
                            : "leave-waitlist",
                        ),
                      )
                    }
                  >
                    {current.status === "joined"
                      ? clubText("clubMeetingPageCopy.cancel_attendance")
                      : clubText("clubMeetingPageCopy.leave_waitlist")}
                  </Button>
                )}
              </div>
            )}
            {current?.status === "joined" && live && (
              <details>
                <summary>
                  {clubText("clubMeetingPageCopy.meeting_point_and_travel")}
                </summary>
                <div className="cp-stack">
                  <Field
                    label={clubText("clubMeetingPageCopy.meeting_point")}
                    htmlFor="meeting-join"
                  >
                    <Select
                      id="meeting-join"
                      disabled={busy}
                      value={travel.joinId}
                      onChange={(event) =>
                        setTravel({ ...travel, joinId: event.target.value })
                      }
                    >
                      <option value="">
                        {clubText("clubMeetingPageCopy.not_decided")}
                      </option>
                      {meeting.joins.map((join) => (
                        <option key={join.id} value={join.id}>
                          {join.time} {join.place}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {(["outbound", "inbound"] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        key === "outbound"
                          ? clubText("clubMeetingPageCopy.outbound")
                          : clubText("clubMeetingPageCopy.return")
                      }
                      htmlFor={`meeting-${key}`}
                    >
                      <Input
                        id={`meeting-${key}`}
                        maxLength={100}
                        disabled={busy}
                        value={travel[key]}
                        onChange={(event) =>
                          setTravel({ ...travel, [key]: event.target.value })
                        }
                      />
                    </Field>
                  ))}
                  <Stack direction="row" wrap><Button size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        clubMeetingAttendance(data.eventId, "travel", travel),
                      )
                    }
                  >
                    {clubText("clubMeetingPageCopy.save_travel_plan")}
                  </Button></Stack>
                </div>
              </details>
            )}
          </Card>
          <MeetingPeople state={state} meeting={meeting} actor={uid} />
        </aside>
        <div className="cp-meeting-course">
          <CoursePreview
            meeting={meeting}
            descriptionMode="course-only"
            onEdit={data.isHost && live ? onEdit : undefined}
            onConfirmCourse={data.isHost && live ? onConfirmCourse : undefined}
            onPrepareCourse={data.isHost && live ? onPrepareCourse : undefined}
          />
        </div>
      </div>
      {completed && data.completion && (
        <Card id="meeting-results">
          {/* 결과 새로고침은 카드 하단 버튼 대신 제목 옆 아이콘으로 두고, 다시 읽는 동안 스피너를 보여준다. */}
          <div className="cp-heading-with-edit">
            <h2>{clubText("clubMeetingPageCopy.meeting_results")}</h2>
            <IconButton
              size="sm"
              variant="ghost"
              loading={busy}
              aria-label={clubText("clubMeetingPageCopy.refresh_results")}
              title={clubText("clubMeetingPageCopy.refresh_results")}
              icon={<RefreshCw size={ICON_SIZE.sm} />}
              onClick={() => void run(async () => {})}
            />
          </div>
          <div aria-live="polite">
            {data.completion.summary ? <p>{clubText("clubMeetingPageCopy.finished_pending_dnf_total", { value1: data.completion.summary.finishedCount, value2: data.completion.summary.pendingCount, value3: data.completion.summary.dnfCount, value4: data.completion.summary.totalParticipants })}</p> : <p>{clubText("clubMeetingPageCopy.the_meeting_summary_is_processing_individual")}</p>}
            {data.completion.own && <p>{clubText("clubMeetingPageCopy.my_recording")} · {data.completion.own.verified
              ? clubText("clubMeetingPageCopy.result_verified")
              : ["REGISTERED", "CHECKED_IN", "PAID"].includes(data.completion.own.status) ? clubText("clubMeetingPageCopy.no_recording") : clubText("clubMeetingPageCopy.result_pending")}
              {data.completion.own.verified && data.completion.own.durationMs != null && <> · {Math.floor(data.completion.own.durationMs / 60000)}:{String(Math.floor(data.completion.own.durationMs / 1000) % 60).padStart(2, "0")}</>}
            </p>}
          </div>
          {data.completion.riders && <ul aria-label={clubText("clubMeetingPageCopy.this_meeting_s_rider_results")}>
            {data.completion.riders.map(rider => <li key={rider.uid}>
              <strong>{rider.displayName}</strong>{" · "}{clubText(rider.status === "FINISHED" ? "clubMeetingPageCopy.verified" : rider.status === "DNF" ? "clubMeetingPageCopy.did_not_finish" : rider.status === "NO_RECORDING" ? "clubMeetingPageCopy.no_recording" : "clubMeetingPageCopy.rider_result_pending")}
              {rider.status === "FINISHED" && rider.durationMs != null && <> · {Math.floor(rider.durationMs / 60000)}:{String(Math.floor(rider.durationMs / 1000) % 60).padStart(2, "0")}</>}
            </li>)}
          </ul>}
        </Card>
      )}
      {data.isHost && (
        <Card
          id="meeting-host-tools"
          className="cp-host-bar cp-product-host-bar"
        >
          <h2>{clubText("clubMeetingPageCopy.manage_meeting")}</h2>
          <div className="cp-actions">
            {live && <Button size="sm" disabled={busy} onClick={() => setConfirmingFinish(true)}>{clubText("clubMeetingPageCopy.finish_meeting")}</Button>}
            {/* 모임 전체 취소는 공지 카드에서 떼어 운영 카드 끝의 작은 위험 동작으로 둔다(파괴적 동작이라 글자 버튼 유지, 확정 단계 그대로). */}
            {live && <Button variant="danger" size="sm" disabled={busy} onClick={() => setCancelling(true)}>{clubText("clubMeetingPageCopy.cancel_the_meeting")}</Button>}
          </div>
          {live && confirmingFinish && <div role="group" aria-label={clubText("clubMeetingPageCopy.confirm_meeting_completion")}>
            <p>{clubText("clubMeetingPageCopy.finishing_closes_new_participation_and_location")}</p>
            <Button loading={busy} onClick={() => void run(() => finishClubMeeting(data.eventId, data.revision))}>{clubText("clubMeetingPageCopy.confirm_finish")}</Button>
            <Button disabled={busy} onClick={() => setConfirmingFinish(false)}>{clubText("clubMeetingPageCopy.go_back")}</Button>
          </div>}
          {live && cancelling && (
            <div className="cp-notice">
              <p>
                {clubText("clubMeetingPageCopy.a_cancellation_notice_will_be_recorded")}
              </p>
              <Field
                label={clubText("clubMeetingPageCopy.cancellation_reason")}
                htmlFor="cancel-reason"
              >
                <Textarea
                  id="cancel-reason"
                  maxLength={3000}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </Field>
              <Stack direction="row" wrap>
              <Button
                variant="danger"
                disabled={busy || !cancelReason.trim()}
                onClick={() =>
                  void run(async () => {
                    await cancelClubMeeting(data.eventId, cancelReason);
                    setCancelling(false);
                  })
                }
              >
                {clubText("clubMeetingPageCopy.confirm_cancellation")}
              </Button>
              <Button disabled={pending} onClick={() => setCancelling(false)}>
                {clubText("clubMeetingPageCopy.go_back")}
              </Button>
              </Stack>
            </div>
          )}
          {live && (
            <Field
              label={clubText("clubMeetingPageCopy.registration")}
              htmlFor="meeting-recruitment"
            >
              <Select
                id="meeting-recruitment"
                disabled={busy}
                value={meeting.recruitment ?? "open"}
                onChange={(event) =>
                  void run(() =>
                    setClubMeetingRecruitment(
                      data.eventId,
                      event.target.value as "open" | "waitlist" | "closed",
                    ),
                  )
                }
              >
                <option value="open">
                  {clubText("clubMeetingPageCopy.attendance_and_waitlist")}
                </option>
                <option value="waitlist">
                  {clubText("clubMeetingPageCopy.waitlist_only")}
                </option>
                <option value="closed">
                  {clubText("clubMeetingPageCopy.close_new_registrations")}
                </option>
              </Select>
            </Field>
          )}
        </Card>
      )}
      {data.isHost && live && (
        <HostPreparationChecklist
          meeting={meeting}
          noticePageLimited={Boolean(data.noticeNextCursor || data.noticePageCursor)}
          members={data.members}
          unassignedCount={
            meeting.teams?.length
              ? unassignedMembers(meeting.teams, meeting.registrations).length
              : undefined
          }
        />
      )}
      <MeetingTeams
        meeting={meeting}
        members={data.members}
        uid={uid}
        isHost={data.isHost && live}
        revision={data.revision}
        disabled={busy || !live}
        english={en}
        onReload={reload}
        onSave={async (teams, expectedRevision) => {
          await saveClubMeetingTeams({
            eventId: data.eventId,
            expectedRevision,
            teams,
          });
          await reload();
        }}
      />
      {data.isHost && (
        <Card id="meeting-travel">
          <details>
            <summary>
              {clubText("clubMeetingPageCopy.meeting_points_and_travel_plans")}
            </summary>
            {[
              ...meeting.joins,
              {
                id: "",
                place: clubText("clubMeetingPageCopy.meeting_point_not_selected"),
                time: "",
              },
            ].map((join) => (
              <section className="cp-announcement" key={join.id}>
                <h3>
                  {join.time} {join.place}
                </h3>
                {meeting.registrations
                  .filter(
                    (person) =>
                      person.status === "joined" &&
                      (join.id
                        ? person.joinId === join.id
                        : !meeting.joins.some(
                            (point) => point.id === person.joinId,
                          )),
                  )
                  .map((person) => (
                    <p key={person.memberId}>
                      <strong>
                        {data.members.find(
                          (member) => member.id === person.memberId,
                        )?.name ?? clubText("clubMeetingPageCopy.club_member")}
                      </strong>{" "}
                      · {clubText("clubMeetingPageCopy.outbound")}:{" "}
                      {person.outbound || clubText("clubMeetingPageCopy.not_set")} ·{" "}
                      {clubText("clubMeetingPageCopy.return")}:{" "}
                      {person.inbound || clubText("clubMeetingPageCopy.not_set")}
                    </p>
                  ))}
              </section>
            ))}
          </details>
        </Card>
      )}
      <MeetingDiscord key={`${uid}/${data.eventId}`} eventId={data.eventId} groupId={data.groupId} uid={uid} en={en} ended={!live} />
      {(meeting.joins.length > 0 || meeting.parking || meeting.weather || meeting.fee > 0) && <Card className="cp-preparation-panel">
        <h2>{clubText("clubMeetingPageCopy.meeting_and_preparation")}</h2>
        {meeting.joins.map((join) => (
          <p key={join.id}>
            {join.time} · {join.place}
          </p>
        ))}
        {meeting.parking && <p>{meeting.parking}</p>}
        {meeting.weather && <p className="cp-notice">☁ {meeting.weather}</p>}
        {meeting.fee > 0 && (
          <p>
            <InfoTip
              title={clubText("clubMeetingPageCopy.estimated_cost")}
              label={clubText("clubMeetingPageCopy.estimated_cost")}
              content={clubText("clubMeetingPageCopy.information_only_payment_status_is_not")}
            >{clubText("clubMeetingPageCopy.estimated_cost")}</InfoTip>{" · "}
            {meeting.fee.toLocaleString(en ? "en-US" : "ko-KR")} {clubText("clubMeetingPageCopy.krw")}
          </p>
        )}
      </Card>}
      <Card id="meeting-notices">
        {/* 이전·최신 공지 이동은 카드 제목 옆 작은 화살표 아이콘으로 둔다. */}
        <div className="cp-heading-with-edit">
          <h2>{clubText("clubMeetingPageCopy.notices_and_changes")}</h2>
          {data.noticeNextCursor && (
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={clubText("clubMeetingPageCopy.older_notices")}
              title={clubText("clubMeetingPageCopy.older_notices")}
              icon={<ChevronLeft size={ICON_SIZE.sm} />}
              disabled={busy}
              onClick={() => void run(loadOlderNotices, false)}
            />
          )}
          {data.noticePageCursor && (
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={clubText("clubMeetingPageCopy.latest_notices")}
              title={clubText("clubMeetingPageCopy.latest_notices")}
              icon={<ChevronRight size={ICON_SIZE.sm} />}
              disabled={busy}
              onClick={() => void run(reload, false)}
            />
          )}
        </div>
        {(data.noticeNextCursor || data.noticePageCursor) && <p className="cp-muted">
          {clubText("clubMeetingPageCopy.notices_and_follow_ups_reflect_the")}
        </p>}
        {meeting.notices.length === 0 && (
          <p>{clubText("clubMeetingPageCopy.no_notices_yet")}</p>
        )}
        {meeting.notices.map((item) => (
          <article className="cp-announcement" key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            {data.isHost ? (
              <>
                <p>
                  {clubText("clubMeetingPageCopy.confirmed", { value1: item.confirmed.length, value2: item.targets.length })}
                </p>
                <details>
                  <summary>
                    {clubText("clubMeetingPageCopy.members_who_have_not_confirmed")}
                  </summary>
                  <p>
                    {item.targets
                      .filter((id) => !item.confirmed.includes(id))
                      .map(
                        (id) =>
                          data.members.find((member) => member.id === id)
                            ?.name ?? clubText("clubMeetingPageCopy.club_member"),
                      )
                      .join(", ") ||
                      clubText("clubMeetingPageCopy.everyone_confirmed")}
                  </p>
                </details>
              </>
            ) : item.targets.includes(uid) && !item.confirmed.includes(uid) ? (
              <Stack direction="row" wrap><Button size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    confirmClubMeetingNotice(data.eventId, item.id),
                  )
                }
              >
                {clubText("clubMeetingPageCopy.i_have_read_this")}
              </Button></Stack>
            ) : (
              <span>
                {item.confirmed.includes(uid)
                  ? clubText("clubMeetingPageCopy.confirmed_notice")
                  : clubText("clubMeetingPageCopy.meeting_notice_2")}
              </span>
            )}
          </article>
        ))}
      </Card>
      {data.isHost && live && (
        <Card>
          <details>
            <summary>{clubText("clubMeetingPageCopy.publish_a_notice")}</summary>
            <Field
              label={clubText("clubMeetingPageCopy.notice_title")}
              htmlFor="notice-title"
            >
              <Input
                id="notice-title"
                maxLength={150}
                value={noticeTitle}
                onChange={(event) => setNoticeTitle(event.target.value)}
              />
            </Field>
            <Field
              label={clubText("clubMeetingPageCopy.notice_body")}
              htmlFor="notice-body"
            >
              <Textarea
                id="notice-body"
                maxLength={3000}
                value={notice}
                onChange={(event) => setNotice(event.target.value)}
              />
            </Field>
            <Button
              disabled={busy || !notice.trim()}
              onClick={() =>
                void run(async () => {
                  await publishClubMeetingNotice(
                    data.eventId,
                    noticeTitle || clubText("clubMeetingPageCopy.meeting_notice"),
                    notice,
                  );
                  setNotice("");
                  setNoticeTitle("");
                })
              }
            >
              {clubText("clubMeetingPageCopy.publish_notice")}
            </Button>
          </details>
        </Card>
      )}
    </div>
  );
}
