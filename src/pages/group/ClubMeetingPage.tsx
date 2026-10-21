import { useEffect, useRef, useState } from "react";
import { CalendarDays, MapPin, Users } from "lucide-react";
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
import { Button, Card, Chip, buttonClass } from "../../theme/components";
import { Field, Input, Select, Textarea } from "../../theme/components/Input";
import GroupSubNav from "../../components/group/GroupSubNav";
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
  copyClubMeeting,
  meetingRequestId,
  newClubMeeting,
} from "../../features/club-preparation/meetingCopy";
import { meetingErrorMessage } from "../../features/club-preparation/meetingMessages";
import type { State } from "../../features/club-preparation/domain";
import {
  cancelClubMeeting,
  clubMeetingAttendance,
  confirmClubMeetingNotice,
  createClubMeeting,
  publishClubMeetingNotice,
  setClubMeetingRecruitment,
  saveClubMeetingTeams,
  updateClubMeeting,
  type ClubMeetingSnapshot,
} from "../../services/clubMeetings";
import "../../features/club-preparation/clubPreparation.css";
import { ICON_SIZE } from "../../theme/tokens/icon";

export default function ClubMeetingPage({
  mode = "detail",
}: {
  mode?: "new" | "detail" | "edit";
}) {
  const { groupId, meetingId } = useParams();
  const [search] = useSearchParams();
  const { user, loading: authLoading, signIn } = useAuth();
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith("en");
  const text = (ko: string, english: string) => (en ? english : ko);
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
  const sourceId =
    mode === "new" ? (search.get("copyFrom") ?? undefined) : meetingId;
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
        title={text(
          "로그인하고 클럽 모임을 이용해주세요.",
          "Sign in to use club meetings.",
        )}
        actions={[
          { label: text("로그인", "Sign in"), onClick: () => void signIn() },
        ]}
      />
    );
  if (groupError || roleError)
    return (
      <ErrorState
        title={text(
          "클럽 회원 자격을 확인하지 못했어요.",
          "Could not verify club membership.",
        )}
        onRetry={roleError ? retryRole : retryGroup}
      />
    );
  if (!group || !role)
    return (
      <EmptyState
        title={text(
          "현재 활동 중인 클럽 회원만 이용할 수 있어요.",
          "An active club membership is required.",
        )}
        actions={[
          { label: text("클럽으로", "Back to club"), href: `/club/${groupId}` },
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
        title={text(
          "이 모임의 주최자만 수정할 수 있어요.",
          "Only this meeting’s host can edit it.",
        )}
      />
    );
  const kinds = [
    { id: "flash", name: text("번개", "Spontaneous ride"), active: true },
    { id: "tour", name: text("투어", "Tour"), active: true },
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
      { id: user.uid, name: user.displayName ?? text("나", "Me") },
    ],
    meetings: mode === "edit" && data ? [data.meeting] : [],
  };
  return (
    <div className="cp-app cp-product">
      <GroupSubNav
        group={group}
        isCreator={canManageGroup(group, user.uid, role)}
      />
      <div className="cp-product-header">
        <Link to={`/club/${group.id}/events`}>
          ← {text("클럽 모임", "Club meetings")}
        </Link>
        {mode === "detail" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void snapshot.reload().catch(() => {})}
          >
            {text("새로고침", "Refresh")}
          </Button>
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
          onEdit={() =>
            navigate(`/club/${group.id}/meetings/${data.eventId}/edit`)
          }
          onCopy={() =>
            navigate(
              `/club/${group.id}/meetings/new?copyFrom=${encodeURIComponent(data.eventId)}`,
            )
          }
        />
      ) : (
        <MeetingForm
          key={`${user.uid}/${group.id}/${mode}/${sourceId ?? "new"}`}
          state={state}
          initial={
            mode === "edit" && data
              ? data.meeting
              : mode === "new" && data
                ? copyClubMeeting(data.meeting)
                : newClubMeeting()
          }
          draftNamespace={`${encodeURIComponent(user.uid)}.${encodeURIComponent(group.id)}.${mode === "new" ? (sourceId ? `copy-${encodeURIComponent(sourceId)}` : "new") : "edit"}`}
          initialRevision={mode === "edit" ? data?.revision : undefined}
          english={en}
          onClose={() => navigate(`/club/${group.id}/events`)}
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
  onEdit,
  onCopy,
}: {
  data: ClubMeetingSnapshot;
  uid: string;
  en: boolean;
  error: unknown;
  reload: () => Promise<void>;
  onEdit: () => void;
  onCopy: () => void;
}) {
  const text = (ko: string, english: string) => (en ? english : ko);
  const meeting = data.meeting;
  const current = meeting.registrations.find((item) => item.memberId === uid);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [travel, setTravel] = useState({
    joinId: current?.joinId ?? "",
    outbound: current?.outbound ?? "",
    inbound: current?.inbound ?? "",
  });
  const run = async (action: () => Promise<unknown>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailure("");
    try {
      await action();
      await reload();
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
            ? text("투어", "Tour")
            : meeting.kindId === "flash"
              ? text("번개", "Spontaneous ride")
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
  const live = meeting.status !== "cancelled";
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
            {text("최신 상태 다시 확인", "Reload latest information")}
          </Button>
        </div>
      )}
      <section className="cp-hero cp-meeting-hero">
        <div className="cp-actions">
          <Chip>{state.kinds[0]!.name}</Chip>
          <Chip>
            {!live
              ? text("모임 취소", "Cancelled")
              : meeting.recruitment === "closed"
                ? text("신규 접수 마감", "Registration closed")
                : meeting.recruitment === "waitlist"
                  ? text("대기 접수", "Waitlist open")
                  : text("모집 중", "Registration open")}
          </Chip>
        </div>
        <h1>{meeting.title}</h1>
        {longIntroduction ? (
          <div className="cp-hero-introduction">
            <p>
              {introductionLead}
              {introduction.length > introductionLead.length ? "…" : ""}
            </p>
            <details>
              <summary>
                {text("모집 소개 전체보기", "Read full introduction")}
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
            {text(
              `참석 ${joined.length} / ${meeting.capacity}명 · 대기 ${waiting.length}명`,
              `${joined.length} / ${meeting.capacity} attending · ${waiting.length} waiting`,
            )}
          </span>
        </div>
        <CourseSummary meeting={meeting} />
        {data.isHost && (
          <nav
            className="cp-hero-tools"
            aria-label={text("모임 운영", "Manage meeting")}
          >
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !live}
              onClick={onEdit}
            >
              {text("모임 수정", "Edit meeting")}
            </Button>
            <a href="#meeting-people">
              {text("명단 바로가기", "Jump to roster")}
            </a>
            <a href="#meeting-notices">
              {text("공지 바로가기", "Jump to notices")}
            </a>
            <a href="#meeting-host-tools">
              {text("모집 상태", "Registration")}
            </a>
            <a href="#meeting-teams">{text("조편성", "Groups")}</a>
          </nav>
        )}
      </section>
      <div className="cp-meeting-columns">
        <aside className="cp-meeting-sidebar">
          <Card className="cp-attendance-panel">
            <h2>{text("내 참석", "My attendance")}</h2>
            <p>
              {!live
                ? text("취소된 모임입니다.", "This meeting was cancelled.")
                : current?.status === "joined"
                  ? text("참석 신청 완료", "Attending")
                  : current?.status === "waiting"
                    ? text(
                        `대기 ${waiting.findIndex((item) => item.memberId === uid) + 1}번째`,
                        `Waitlist position ${waiting.findIndex((item) => item.memberId === uid) + 1}`,
                      )
                    : current?.status === "offered"
                      ? text(
                          "빈자리 제안이 도착했어요.",
                          "A place has been offered to you.",
                        )
                      : text(
                          "함께 달릴 준비가 되셨나요?",
                          "Ready to ride together?",
                        )}
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
                        ? text("대기 신청", "Join waitlist")
                        : text("참석 신청", "Join meeting")}
                    </Button>
                  )}
                {current?.status === "offered" && (
                  <>
                    <span>
                      {text("수락 기한", "Accept by")}{" "}
                      {current.offerUntil
                        ? new Date(current.offerUntil).toLocaleTimeString(
                            en ? "en-US" : "ko-KR",
                          )
                        : text("확인 중", "Checking")}
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
                      {text("자리 수락", "Accept place")}
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
                      ? text("참석 취소", "Cancel attendance")
                      : text("대기 취소", "Leave waitlist")}
                  </Button>
                )}
              </div>
            )}
            {current?.status === "joined" && live && (
              <details>
                <summary>
                  {text("합류·이동 계획", "Meeting point and travel")}
                </summary>
                <div className="cp-stack">
                  <Field
                    label={text("합류 지점", "Meeting point")}
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
                        {text("아직 미정", "Not decided")}
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
                          ? text("가는 편", "Outbound")
                          : text("오는 편", "Return")
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
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        clubMeetingAttendance(data.eventId, "travel", travel),
                      )
                    }
                  >
                    {text("이동 계획 저장", "Save travel plan")}
                  </Button>
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
          />
        </div>
      </div>
      {data.isHost && (
        <Card
          id="meeting-host-tools"
          className="cp-host-bar cp-product-host-bar"
        >
          <h2>{text("모임 운영", "Manage meeting")}</h2>
          <div className="cp-actions">
            <Button disabled={busy} onClick={onCopy}>
              {text("복사해 새 모임", "Copy to a new meeting")}
            </Button>
          </div>
          {live && (
            <Field
              label={text("모집 상태", "Registration")}
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
                  {text("참석·대기 접수", "Attendance and waitlist")}
                </option>
                <option value="waitlist">
                  {text("대기만 접수", "Waitlist only")}
                </option>
                <option value="closed">
                  {text("신규 접수 마감", "Close new registrations")}
                </option>
              </Select>
            </Field>
          )}
          <p className="cp-muted">
            {text(
              "빈자리는 서버에서 대기 순서대로 제안합니다. 제안 수락 후 참석이 확정됩니다.",
              "Available places are offered in waitlist order. Attendance is confirmed after acceptance.",
            )}
          </p>
        </Card>
      )}
      {data.isHost && live && (
        <HostPreparationChecklist
          meeting={meeting}
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
        isHost={data.isHost}
        revision={data.revision}
        disabled={busy}
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
              {text("합류·이동 현황", "Meeting points and travel plans")}
            </summary>
            {[
              ...meeting.joins,
              {
                id: "",
                place: text("합류 미정", "Meeting point not selected"),
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
                        )?.name ?? text("클럽 회원", "Club member")}
                      </strong>{" "}
                      · {text("가는 편", "Outbound")}:{" "}
                      {person.outbound || text("미정", "Not set")} ·{" "}
                      {text("오는 편", "Return")}:{" "}
                      {person.inbound || text("미정", "Not set")}
                    </p>
                  ))}
              </section>
            ))}
          </details>
        </Card>
      )}
      <Card className="cp-preparation-panel">
        <h2>{text("집결과 준비", "Meeting and preparation")}</h2>
        {meeting.joins.map((join) => (
          <p key={join.id}>
            {join.time} · {join.place}
          </p>
        ))}
        {meeting.parking && <p>{meeting.parking}</p>}
        {meeting.weather && <p className="cp-notice">☁ {meeting.weather}</p>}
        {meeting.fee > 0 && (
          <details>
            <summary>{text("예상 비용 안내", "Estimated cost")}</summary>
            <p>
              {meeting.fee.toLocaleString(en ? "en-US" : "ko-KR")}{" "}
              {text(
                "원 · 참고용 안내이며 입금·결제 상태는 처리하지 않습니다.",
                "KRW · Information only; payment status is not managed here.",
              )}
            </p>
          </details>
        )}
      </Card>
      <Card id="meeting-notices">
        <h2>{text("공지와 변경", "Notices and changes")}</h2>
        {meeting.notices.length === 0 && (
          <p>{text("아직 새 공지가 없어요.", "No notices yet.")}</p>
        )}
        {meeting.notices.map((item) => (
          <article className="cp-announcement" key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            {data.isHost ? (
              <>
                <p>
                  {text(
                    `${item.confirmed.length}/${item.targets.length}명 확인`,
                    `${item.confirmed.length}/${item.targets.length} confirmed`,
                  )}
                </p>
                <details>
                  <summary>
                    {text("미확인 회원", "Members who have not confirmed")}
                  </summary>
                  <p>
                    {item.targets
                      .filter((id) => !item.confirmed.includes(id))
                      .map(
                        (id) =>
                          data.members.find((member) => member.id === id)
                            ?.name ?? text("클럽 회원", "Club member"),
                      )
                      .join(", ") ||
                      text("모두 확인했어요.", "Everyone confirmed.")}
                  </p>
                </details>
              </>
            ) : item.targets.includes(uid) && !item.confirmed.includes(uid) ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    confirmClubMeetingNotice(data.eventId, item.id),
                  )
                }
              >
                {text("내용 확인했어요", "I have read this")}
              </Button>
            ) : (
              <span>
                {item.confirmed.includes(uid)
                  ? text("확인한 공지", "Confirmed notice")
                  : text("모임 공지", "Meeting notice")}
              </span>
            )}
          </article>
        ))}
      </Card>
      {data.isHost && live && (
        <Card>
          <details>
            <summary>{text("새 공지 등록", "Publish a notice")}</summary>
            <Field
              label={text("공지 제목", "Notice title")}
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
              label={text("공지 내용", "Notice body")}
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
                    noticeTitle || text("모임 안내", "Meeting notice"),
                    notice,
                  );
                  setNotice("");
                  setNoticeTitle("");
                })
              }
            >
              {text("공지 등록", "Publish notice")}
            </Button>
          </details>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => setCancelling(true)}
          >
            {text("모임 전체 취소", "Cancel the meeting")}
          </Button>
          {cancelling && (
            <div className="cp-notice">
              <p>
                {text(
                  "참석자와 대기자 모두에게 취소 안내가 남습니다.",
                  "A cancellation notice will be recorded for participants and the waitlist.",
                )}
              </p>
              <Field
                label={text("취소 사유", "Cancellation reason")}
                htmlFor="cancel-reason"
              >
                <Textarea
                  id="cancel-reason"
                  maxLength={3000}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </Field>
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
                {text("전체 취소 확정", "Confirm cancellation")}
              </Button>
              <Button disabled={pending} onClick={() => setCancelling(false)}>
                {text("돌아가기", "Go back")}
              </Button>
            </div>
          )}
        </Card>
      )}
      {!data.isHost && (
        <Link
          className={buttonClass({ variant: "outline" })}
          to={`/club/${data.groupId}/meetings/new?copyFrom=${encodeURIComponent(data.eventId)}`}
        >
          {text("복사해 새 모임", "Copy to a new meeting")}
        </Link>
      )}
    </div>
  );
}
