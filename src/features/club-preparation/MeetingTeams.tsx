import { useTranslation } from "react-i18next";
import InfoTip from "../../components/InfoTip";
import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  ArrowDown,
  Copy,
  GripVertical,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { Button, Card, Chip, IconButton } from "../../theme/components";
import { Field, Input, Select, Textarea } from "../../theme/components/Input";
import type { Meeting, MeetingTeam, Member } from "./domain";
import {
  attendanceGenerations,
  changedAttendanceMembers,
  createInitialTeamDraft,
  distributeUnassigned,
  joinedInOrder,
  meetingTeamsText,
  moveTeamMembers,
  placeTeamMember,
  swapTeamMembers,
  reconcileMeetingTeams,
  unassignedMembers,
  validateMeetingTeams,
  type TeamIssue,
} from "./teamAssignment";
import { meetingErrorMessage } from "./meetingMessages";
import "./meetingTeams.css";
import { revealFocusTarget } from "../../services/focusTarget";
import { Resolvable } from "../../components/redesign";
import { useTeamPointerDrag } from "./useTeamPointerDrag";
import { ICON_SIZE } from "../../theme/tokens/icon";

type TeamFixTarget = { teamId: string; field: "name" | "capacity" };

/**
 * 조 검증 오류를 고칠 조와 칸. validateMeetingTeams 는 조 순서대로 검사해 처음 걸린 조의 오류를
 * 돌려주므로, 같은 종류의 오류가 처음 나는 조가 곧 그 조다. 이동 실패는 목적 조를 그대로 쓴다.
 */
function issueTeam(
  issue: TeamIssue,
  teams: MeetingTeam[],
  targetTeamId?: string,
): TeamFixTarget | null {
  const teamId =
    issue === "name"
      ? teams.find((team) => !team.name.trim() || team.name.trim().length > 100)?.id
      : issue === "capacity"
        ? teams.find(
            (team) =>
              team.capacity !== undefined &&
              (!Number.isInteger(team.capacity) || team.capacity < 1 || team.capacity > 200),
          )?.id
        : issue === "overflow"
          ? (targetTeamId ??
            teams.find((team) => team.memberIds.length > (team.capacity ?? 200))?.id)
          : undefined;
  return teamId ? { teamId, field: issue === "name" ? "name" : "capacity" } : null;
}

export default function MeetingTeams({
  meeting,
  members,
  uid,
  isHost,
  revision,
  disabled = false,
  english = false,

  onSave,
  onReload,
}: {
  meeting: Meeting;
  members: Member[];
  uid: string;
  isHost: boolean;
  revision: number;
  disabled?: boolean;
  english?: boolean;
  onSave: (teams: MeetingTeam[], expectedRevision: number) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const { t: clubText } = useTranslation("clubMeeting");
  const name = (id: string) =>
    members.find((member) => member.id === id)?.name ??
    clubText("meetingTeamsCopy.club_member");
  const [editing, setEditing] = useState(false);
  const [initialSize, setInitialSize] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [undo, setUndo] = useState<MeetingTeam[] | null>(null);
  const [draft, setDraft] = useState<MeetingTeam[]>([]);
  const [baseRevision, setBaseRevision] = useState(revision);
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState("");
  // 조 이름·정원 오류 → 그 조의 접힌 「조 설정」 칸. 문구가 바뀌면 연결도 끊는다.
  const [errorFix, setErrorFix] = useState<{
    teamId: string;
    field: "name" | "capacity";
    message: string;
  } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [copyFallback, setCopyFallback] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const guard = useRef(false);
  const board = useRef<HTMLDivElement>(null);
  const [generations, setGenerations] = useState<Record<string, string | null>>(
    {},
  );
  const teams = editing
    ? baseRevision !== revision
      ? reconcileMeetingTeams(draft, meeting.registrations, generations)
      : draft
    : (meeting.teams ?? []);
  const dirty = editing && JSON.stringify(draft) !== baseline;
  const stale = editing && (baseRevision !== revision || reviewRequired);
  const attending = joinedInOrder(meeting.registrations);
  const changedMembers =
    editing && baseRevision !== revision
      ? changedAttendanceMembers(generations, meeting.registrations)
      : [];
  const unassigned = unassignedMembers(teams, meeting.registrations);
  const selectedMembers = selected.filter(
    (id) =>
      attending.some((person) => person.memberId === id) &&
      !changedMembers.includes(id),
  );
  const currentTeam = teams.find((team) => team.memberIds.includes(uid));
  const sharedText = [
    editing ? clubText("meetingTeamsCopy.unsaved_group_draft") : "",
    meeting.title,
    meetingTeamsText(
      teams,
      meeting.registrations,
      name,
      english,
      editing && baseRevision !== revision ? generations : undefined,
    ),
  ]
    .filter(Boolean)
    .join("\n");
  const canEdit =
    isHost &&
    meeting.status !== "cancelled" &&
    Date.parse(`${meeting.date}T${meeting.time}:00+09:00`) > Date.now();
  const editGroupsLabel = meeting.teams?.length
    ? clubText("meetingTeamsCopy.edit_groups")
    : clubText("meetingTeamsCopy.arrange_groups");
  const issueText = (issue: TeamIssue) =>
    ({
      "team-limit": clubText("meetingTeamsCopy.you_can_create_up_to_40"),
      id: clubText("meetingTeamsCopy.please_check_the_group_information"),
      name: clubText("meetingTeamsCopy.give_each_group_a_name_of"),
      capacity: clubText("meetingTeamsCopy.leave_capacity_empty_or_enter_a"),
      overflow: clubText("meetingTeamsCopy.this_group_has_a_capacity_limit"),
      duplicate: clubText("meetingTeamsCopy.each_member_can_belong_to_only"),
      "not-attending": clubText("meetingTeamsCopy.attendance_changed_review_your_draft_against"),
      exchange: clubText("meetingTeamsCopy.select_two_members_assigned_to_different"),
      leader: clubText("meetingTeamsCopy.choose_a_leader_from_members_assigned"),
    })[issue];
  /** 검증 오류를 보여주고, 고칠 조를 알 수 있으면 문구를 그 조 설정 칸에 잇는다. */
  const failTeams = (issue: TeamIssue, teams: MeetingTeam[], targetTeamId?: string) => {
    const message = issueText(issue);
    setError(message);
    const target = issueTeam(issue, teams, targetTeamId);
    setErrorFix(target ? { ...target, message } : null);
  };
  const fixTeam =
    errorFix && errorFix.message === error && draft.some((team) => team.id === errorFix.teamId)
      ? errorFix
      : null;
  // 조 오류 문구 자체를 누르면 그 조의 접힌 조 설정을 펼치고 칸에 초점을 둔다.
  const openTeamSettings = (target: TeamFixTarget | null) =>
    target
      ? {
          onClick: () => {
            const input = document.getElementById(`team-${target.field}-${target.teamId}`);
            if (input) revealFocusTarget(input);
          },
        }
      : undefined;
  const liveIssue = editing ? validateMeetingTeams(draft, meeting.registrations) : null;
  const liveIssueTeam = liveIssue ? issueTeam(liveIssue, draft) : null;
  const change = (next: MeetingTeam[]) => {
    setDraft(next);
    setUndo(null);
    setError("");
    setFeedback("");
  };
  const moveSelected = (teamId: string) => {
    try {
      const previous = structuredClone(draft);
      change(
        moveTeamMembers(draft, selectedMembers, teamId, meeting.registrations),
      );
      setUndo(previous);
      setSelected([]);
      setFeedback(
        clubText("meetingTeamsCopy.moved_members", { count: selectedMembers.length, team: draft.find((team) => team.id === teamId)?.name ?? clubText("meetingTeamsCopy.unassigned") }),
      );
    } catch (failure) {
      failTeams((failure as Error).message as TeamIssue, draft, teamId);
    }
  };
  const drag = useTeamPointerDrag({
    container: board,
    revision,
    enabled: editing && canEdit && !saving && !disabled && !stale,
    memberIds: attending.map((person) => person.memberId),
    onInterrupted: () =>
      setFeedback(
        clubText("meetingTeamsCopy.attendance_changed_dragging_stopped_review_the"),
      ),
    onDrop: (memberId, target) => {
      const teamId = target.teamId;
      const currentId =
        draft.find((team) => team.memberIds.includes(memberId))?.id ?? "";
      try {
        const previous = structuredClone(draft);
        const next = placeTeamMember(
          draft,
          memberId,
          target,
          meeting.registrations,
        );
        if (next === draft) return;
        change(next);
        setUndo(previous);
        setSelected([]);
        setFeedback(
          currentId === teamId
            ? clubText("meetingTeamsCopy.reordered_member", { name: name(memberId) })
            : clubText("meetingTeamsCopy.moved_member", { name: name(memberId), team: draft.find((team) => team.id === teamId)?.name ?? clubText("meetingTeamsCopy.unassigned") }),
        );
      } catch (failure) {
        failTeams((failure as Error).message as TeamIssue, draft, teamId);
      }
    },
  });
  const draggedTeam = teams.find((team) =>
    team.memberIds.includes(drag.draggedId ?? ""),
  );
  const targetTeam = teams.find((team) => team.id === drag.dropTarget);
  const dropBlocked =
    !!targetTeam &&
    !targetTeam.memberIds.includes(drag.draggedId ?? "") &&
    targetTeam.memberIds.length >= (targetTeam.capacity ?? 200);
  const dropLabel = dropBlocked
    ? clubText("meetingTeamsCopy.capacity_limit_choose_another_group")
    : drag.dropTarget === null
      ? clubText("meetingTeamsCopy.release_over_a_group")
      : drag.dropPlacement?.anchorId === drag.draggedId
        ? clubText("meetingTeamsCopy.current_position")
        : drag.dropTarget === draggedTeam?.id ||
            (drag.dropTarget === "" && !draggedTeam)
          ? clubText("meetingTeamsCopy.release_to_reorder_within_the_group")
          : clubText("meetingTeamsCopy.move_to_team", { team: targetTeam?.name ?? clubText("meetingTeamsCopy.unassigned") });
  const reviewLatest = async () => {
    if (guard.current) return;
    guard.current = true;
    setSaving(true);
    setError("");
    try {
      await onReload();
      setReviewRequired(false);
      setFeedback(
        clubText("meetingTeamsCopy.latest_information_loaded_compare_the_roster"),
      );
    } catch (failure) {
      setError(meetingErrorMessage(failure, english));
    } finally {
      guard.current = false;
      setSaving(false);
    }
  };
  const save = async () => {
    if (guard.current || stale) return;
    const issue = validateMeetingTeams(draft, meeting.registrations);
    if (issue) {
      failTeams(issue, draft);
      return;
    }
    guard.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(
        draft.map((team) => ({ ...team, name: team.name.trim() })),
        baseRevision,
      );
      setEditing(false);
      setSelected([]);
      setUndo(null);
      setFeedback(
        clubText("meetingTeamsCopy.groups_saved_members_can_now_see"),
      );
    } catch (failure) {
      setError(meetingErrorMessage(failure, english));
      setReviewRequired(true);
    } finally {
      guard.current = false;
      setSaving(false);
    }
  };
  const memberRow = (memberId: string) => {
    const assignedTeam = teams.find((team) =>
      team.memberIds.includes(memberId),
    );
    const isLeader = assignedTeam?.leaderId === memberId;
    return (
      <div
        className={`cp-team-person${editing && selectedMembers.includes(memberId) ? " cp-team-person--selected" : ""}`}
        key={memberId}
        data-team-member={memberId}
        data-insert-side={
          drag.dropPlacement?.anchorId === memberId &&
          drag.draggedId !== memberId &&
          !dropBlocked
            ? drag.dropPlacement.side
            : undefined
        }
        data-dragging={drag.draggedId === memberId || undefined}
      >
        {editing && (
          <button
            type="button"
            className="cp-team-drag-handle"
            aria-label={clubText("meetingTeamsCopy.drag_to_move", { value1: name(memberId) })}
            aria-describedby="team-drag-help"
            disabled={
              saving ||
              disabled ||
              !canEdit ||
              stale ||
              !attending.some((person) => person.memberId === memberId)
            }
            onPointerDown={(event) => drag.start(event, memberId)}
          >
            <GripVertical size={ICON_SIZE.md} aria-hidden="true" />
          </button>
        )}
        {editing ? (
          <label className="cp-team-check">
            <input
              type="checkbox"
              aria-label={clubText("meetingTeamsCopy.select", { value1: name(memberId) })}
              checked={selectedMembers.includes(memberId)}
              disabled={
                saving ||
                disabled ||
                !canEdit ||
                stale ||
                !attending.some((person) => person.memberId === memberId)
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selectedMembers, memberId]
                    : selectedMembers.filter((id) => id !== memberId),
                )
              }
            />
            <strong>
              {name(memberId)}
              {memberId === uid ? clubText("meetingTeamsCopy.you") : ""}
            </strong>
          </label>
        ) : (
          <strong>
            {name(memberId)}
            {memberId === uid ? clubText("meetingTeamsCopy.you") : ""}
          </strong>
        )}
        {editing && assignedTeam && selectedMembers.includes(memberId) && (
          <div className="cp-team-order-actions">
            {(["before", "after"] as const).map((side) => {
              const index = assignedTeam.memberIds.indexOf(memberId);
              const adjacent =
                assignedTeam.memberIds[index + (side === "before" ? -1 : 1)];
              return (
                <Button
                  key={side}
                  size="sm"
                  variant="ghost"
                  disabled={
                    !adjacent || saving || disabled || !canEdit || stale
                  }
                  aria-label={clubText(side === "before" ? "meetingTeamsCopy.move_member_up" : "meetingTeamsCopy.move_member_down", { name: name(memberId) })}
                  onClick={() => {
                    const previous = structuredClone(draft);
                    change(
                      placeTeamMember(
                        draft,
                        memberId,
                        { teamId: assignedTeam.id, anchorId: adjacent, side },
                        meeting.registrations,
                      ),
                    );
                    setUndo(previous);
                    setFeedback(
                      clubText("meetingTeamsCopy.group_order_changed_unsaved"),
                    );
                  }}
                >
                  {side === "before" ? (
                    <ArrowUp size={ICON_SIZE.md} aria-hidden="true" />
                  ) : (
                    <ArrowDown size={ICON_SIZE.md} aria-hidden="true" />
                  )}
                </Button>
              );
            })}
          </div>
        )}
        {editing && assignedTeam ? (
          <Button
            size="sm"
            variant={isLeader ? "outline" : "ghost"}
            disabled={saving || disabled || !canEdit || stale}
            aria-label={clubText(isLeader ? "meetingTeamsCopy.clear_leader_label" : "meetingTeamsCopy.set_leader_label", { name: name(memberId) })}
            onClick={() =>
              change(
                draft.map((team) =>
                  team.id === assignedTeam.id
                    ? { ...team, leaderId: isLeader ? undefined : memberId }
                    : team,
                ),
              )
            }
          >
            {clubText(isLeader ? "meetingTeamsCopy.clear_leader" : "meetingTeamsCopy.set_leader")}
          </Button>
        ) : isLeader ? (
          <Chip>{clubText("meetingTeamsCopy.leader")}</Chip>
        ) : null}
      </div>
    );
  };
  const saveDisabled =
    disabled ||
    !canEdit ||
    stale ||
    !dirty ||
    !!validateMeetingTeams(draft, meeting.registrations);
  return (
    <Card id="meeting-teams" className="cp-teams">
      {drag.ghost &&
        drag.draggedId &&
        createPortal(
          <div
            ref={drag.attachGhost}
            className="cp-team-drag-ghost"
            aria-hidden="true"
            data-blocked={dropBlocked || undefined}
            style={
              {
                "--team-drag-width": `${drag.ghost.width}px`,
                "--team-drag-height": `${drag.ghost.height}px`,
              } as CSSProperties
            }
          >
            <GripVertical size={ICON_SIZE.md} aria-hidden="true" />
            <div className="cp-team-drag-identity">
              <strong>{name(drag.draggedId)}</strong>
              <span>
                {draggedTeam?.name ?? clubText("meetingTeamsCopy.unassigned")}
                {draggedTeam?.leaderId === drag.draggedId
                  ? clubText("meetingTeamsCopy.leader_2")
                  : ""}
              </span>
            </div>
            <small>{dropLabel}</small>
          </div>,
          document.body,
        )}
      <div ref={board} className="cp-team-board">
        <div className="cp-section-heading">
          <div>
            <h2>
              <Users size={ICON_SIZE.md} aria-hidden="true" />{" "}
              <InfoTip label={clubText("meetingTeamsCopy.riding_groups")} title={clubText("meetingTeamsCopy.riding_groups")} content={clubText("meetingTeamsCopy.groups_can_be_assigned_after_attendance")}>{clubText("meetingTeamsCopy.riding_groups")}</InfoTip>
            </h2>
            <p className="cp-muted">
              {clubText("meetingTeamsCopy.attending_assigned_unassigned", { value1: attending.length, value2: attending.length - unassigned.length, value3: unassigned.length })}
            </p>
          </div>
          {/* 명단 복사·조편성 편집은 제목 옆 작은 아이콘으로 둔다. 편집 중 저장·취소는 편집기 안에 그대로 있다. */}
          <div className="cp-actions">
            {isHost && (
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={clubText("meetingTeamsCopy.copy_roster")}
                title={clubText("meetingTeamsCopy.copy_roster")}
                icon={<Copy size={ICON_SIZE.sm} />}
                disabled={saving}
                onClick={async () => {
                  setError("");
                  try {
                    await navigator.clipboard.writeText(sharedText);
                    setCopyFallback(false);
                    setFeedback(
                      editing
                        ? clubText("meetingTeamsCopy.copied_the_unsaved_group_draft")
                        : clubText("meetingTeamsCopy.group_roster_copied"),
                    );
                  } catch {
                    setCopyFallback(true);
                    setFeedback(
                      clubText("meetingTeamsCopy.automatic_copying_was_not_allowed_select"),
                    );
                  }
                }}
              />
            )}
            {canEdit && !editing && (
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={editGroupsLabel}
                title={editGroupsLabel}
                icon={<Pencil size={ICON_SIZE.sm} />}
                disabled={disabled}
                onClick={() => {
                  const current = structuredClone(meeting.teams ?? []);
                  setDraft(current);
                  setBaseline(JSON.stringify(current));
                  setBaseRevision(revision);
                  setGenerations(attendanceGenerations(meeting.registrations));
                  setEditing(true);
                  setSelected([]);
                  setDestination("");
                  setUndo(null);
                  setError("");
                  setFeedback("");
                  setReviewRequired(false);
                }}
              />
            )}
          </div>
        </div>
        {editing ? (
          <p className="cp-team-draft" role="status">
            {dirty
              ? clubText("meetingTeamsCopy.unsaved_groups_members_still_see_the")
              : clubText("meetingTeamsCopy.editing_groups_changes_become_visible_to")}
          </p>
        ) : (
          <p className="cp-muted">
            {currentTeam
              ? clubText(currentTeam.leaderId === uid ? "meetingTeamsCopy.your_team_leader" : "meetingTeamsCopy.your_team", { team: currentTeam.name })
              : clubText("meetingTeamsCopy.you_are_not_assigned_yet")}
          </p>
        )}
        {copyFallback && (
          <Field
            label={clubText("meetingTeamsCopy.group_roster_to_copy_manually")}
            htmlFor="team-copy-fallback"
          >
            <Textarea
              id="team-copy-fallback"
              readOnly
              value={sharedText}
              rows={8}
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
        )}
        {editing && !canEdit && (
          <p className="cp-team-review" role="alert">
            {clubText("meetingTeamsCopy.groups_cannot_be_saved_after_cancellation")}
          </p>
        )}
        {stale && (
          <div className="cp-team-review" role="alert">
            <strong>
              {clubText("meetingTeamsCopy.the_meeting_changed_your_group_draft")}
            </strong>
            <p>
              {clubText("meetingTeamsCopy.review_attendance_and_saved_groups_cancelled")}
            </p>
            <details>
              <summary>
                {clubText("meetingTeamsCopy.currently_saved_groups")}
              </summary>
              {(meeting.teams ?? []).map((team) => (
                <p key={team.id}>
                  {team.name} ·{" "}
                  {team.memberIds.map(name).join(", ") ||
                    clubText("meetingTeamsCopy.empty")}
                </p>
              ))}
            </details>
            <div className="cp-actions">
              <Button
                size="sm"
                disabled={saving}
                onClick={() => void reviewLatest()}
              >
                {clubText("meetingTeamsCopy.reload_latest")}
              </Button>
              <Button
                size="sm"
                disabled={saving || reviewRequired}
                onClick={() => {
                  change(
                    reconcileMeetingTeams(
                      draft,
                      meeting.registrations,
                      generations,
                    ),
                  );
                  setGenerations(attendanceGenerations(meeting.registrations));
                  setSelected([]);
                  setBaseRevision(revision);
                  setFeedback(
                    clubText("meetingTeamsCopy.latest_attendance_applied_to_your_draft"),
                  );
                }}
              >
                {clubText("meetingTeamsCopy.apply_latest_roster_to_draft")}
              </Button>
            </div>
          </div>
        )}
        {error && !editing && (
          <p className="cp-error" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <p className="cp-feedback" role="status">
            {feedback}
          </p>
        )}
        {editing && !draft.length && !meeting.teams?.length && (
          <div className="cp-team-initial">
            <Field
              label={clubText("meetingTeamsCopy.initial_group_size")}
              htmlFor="initial-team-size"
            >
              <Input
                id="initial-team-size"
                type="number"
                min="1"
                max="200"
                disabled={saving || disabled || !canEdit}
                value={initialSize}
                onChange={(event) => setInitialSize(Number(event.target.value))}
              />
            </Field>
            <Button size="sm"
              variant="outline"
              disabled={
                saving || disabled || !canEdit || stale || !attending.length
              }
              onClick={() => {
                try {
                  change(
                    createInitialTeamDraft(
                      meeting.registrations,
                      initialSize,
                      english,
                    ),
                  );
                  setFeedback(
                    clubText("meetingTeamsCopy.created_a_group_draft_in_attendance"),
                  );
                } catch (failure) {
                  failTeams((failure as Error).message as TeamIssue, draft);
                }
              }}
            >
              {clubText("meetingTeamsCopy.create_groups_of_this_size")}
            </Button>
          </div>
        )}
        {editing && (
          <div className="cp-actions">
            <Button
              size="sm"
              leadingIcon={<Plus size={ICON_SIZE.md} />}
              disabled={saving || disabled || !canEdit || draft.length >= 40}
              onClick={() =>
                change([
                  ...draft,
                  {
                    id: crypto.randomUUID(),
                    name: clubText("meetingTeamsCopy.group", { value1: draft.length + 1 }),
                    memberIds: [],
                  },
                ])
              }
            >
              {clubText("meetingTeamsCopy.add_group")}
            </Button>
            <Button
              size="sm"
              disabled={
                saving ||
                disabled ||
                !canEdit ||
                stale ||
                !draft.length ||
                !unassigned.length
              }
              onClick={() => {
                try {
                  change(distributeUnassigned(draft, meeting.registrations));
                  setFeedback(
                    clubText("meetingTeamsCopy.kept_existing_assignments_and_distributed_unassigned"),
                  );
                } catch (failure) {
                  failTeams((failure as Error).message as TeamIssue, draft);
                }
              }}
            >
              {clubText("meetingTeamsCopy.distribute_unassigned")}
            </Button>
          </div>
        )}
        {editing && (
          <p id="team-drag-help" className="cp-muted">
            {clubText("meetingTeamsCopy.drag_to_reorder_within_a_group")}
          </p>
        )}
        {drag.draggedId && (
          <p className="cp-team-drag-status" role="status">
            {clubText("meetingTeamsCopy.moving_release_over_a_group", { value1: name(drag.draggedId) })}
          </p>
        )}
        {editing && (
          <section
            className="cp-team-selection"
            aria-label={clubText("meetingTeamsCopy.adjust_selected_members")}
          >
            <div className="cp-section-heading">
              <strong>
                {clubText("meetingTeamsCopy.selected", { value1: selectedMembers.length })}
              </strong>
              <div className="cp-actions">
                <Button
                  size="sm"
                  variant="primary"
                  loading={saving}
                  disabled={saveDisabled}
                  onClick={() => void save()}
                >
                  {clubText("meetingTeamsCopy.save_changes")}
                </Button>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setSelected([]);
                    setUndo(null);
                    setError("");
                  }}
                >
                  {clubText("meetingTeamsCopy.cancel_changes")}
                </Button>
              </div>
            </div>
            <div className="cp-actions">
              <Button
                size="sm"
                variant="ghost"
                disabled={saving || disabled || !canEdit || stale}
                onClick={() =>
                  setSelected(attending.map((person) => person.memberId))
                }
              >
                {clubText("meetingTeamsCopy.select_all")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  saving || disabled || !canEdit || stale || !unassigned.length
                }
                onClick={() =>
                  setSelected(unassigned.map((person) => person.memberId))
                }
              >
                {clubText("meetingTeamsCopy.select_all_unassigned")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!selectedMembers.length}
                onClick={() => setSelected([])}
              >
                {clubText("meetingTeamsCopy.clear_selection")}
              </Button>
            </div>
            {undo && (
              <Button
                size="sm"
                variant="ghost"
                disabled={saving || disabled || !canEdit || stale}
                onClick={() => {
                  change(undo);
                  setSelected([]);
                  setFeedback(
                    clubText("meetingTeamsCopy.undid_the_last_adjustment"),
                  );
                }}
              >
                {clubText("meetingTeamsCopy.undo_last_adjustment")}
              </Button>
            )}
            {selectedMembers.length > 0 ? (
              <>
                <details>
                  <summary>
                    {clubText("meetingTeamsCopy.selected_members_current_groups")}
                  </summary>
                  <p className="cp-muted">
                    {selectedMembers
                      .map(
                        (id) =>
                          `${name(id)} (${draft.find((team) => team.memberIds.includes(id))?.name ?? clubText("meetingTeamsCopy.unassigned")})`,
                      )
                      .join(", ")}
                  </p>
                </details>
                <div className="cp-team-targets">
                  {draft.length > 4 ? (
                    <div className="cp-team-destination">
                      <Select
                        aria-label={clubText("meetingTeamsCopy.choose_destination_group")}
                        disabled={saving || disabled || !canEdit || stale}
                        value={
                          draft.some((team) => team.id === destination)
                            ? destination
                            : ""
                        }
                        onChange={(event) => setDestination(event.target.value)}
                      >
                        <option value="">
                          {clubText("meetingTeamsCopy.choose_a_group")}
                        </option>
                        {draft.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name || clubText("meetingTeamsCopy.unnamed_group")}
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          saving ||
                          disabled ||
                          !canEdit ||
                          stale ||
                          !draft.some((team) => team.id === destination)
                        }
                        onClick={() => moveSelected(destination)}
                      >
                        {clubText("meetingTeamsCopy.move_to_selected_group")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {draft.map((team) => (
                        <Button
                          key={team.id}
                          size="sm"
                          variant="outline"
                          disabled={saving || disabled || !canEdit || stale}
                          onClick={() => moveSelected(team.id)}
                        >
                          {clubText("meetingTeamsCopy.move_to_named_group", { team: team.name || clubText("meetingTeamsCopy.unnamed_group") })}
                        </Button>
                      ))}
                    </>
                  )}
                  <Button
                    size="sm"
                    disabled={saving || disabled || !canEdit || stale}
                    onClick={() => moveSelected("")}
                  >
                    {clubText("meetingTeamsCopy.move_to_unassigned")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      saving ||
                      disabled ||
                      !canEdit ||
                      stale ||
                      selectedMembers.length !== 2
                    }
                    onClick={() => {
                      try {
                        const previous = structuredClone(draft);
                        change(
                          swapTeamMembers(
                            draft,
                            selectedMembers,
                            meeting.registrations,
                          ),
                        );
                        setUndo(previous);
                        setSelected([]);
                        setFeedback(
                          clubText("meetingTeamsCopy.swapped_both_members_moved_leaders_were"),
                        );
                      } catch (failure) {
                        failTeams((failure as Error).message as TeamIssue, draft);
                      }
                    }}
                  >
                    {clubText("meetingTeamsCopy.swap_two_members")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="cp-muted">
                {clubText("meetingTeamsCopy.check_members_then_choose_a_destination")}
              </p>
            )}
            {error && (
              <p className="cp-error" role="alert">
                <Resolvable resolve={openTeamSettings(fixTeam)}>{error}</Resolvable>
              </p>
            )}
          </section>
        )}
        <div className="cp-team-grid">
          {teams.map((team) => (
            <section
              className="cp-team-card"
              data-team-drop={team.id}
              data-drop-active={drag.dropTarget === team.id || undefined}
              data-insert-end={
                (drag.dropTarget === team.id &&
                  !drag.dropPlacement?.anchorId &&
                  !dropBlocked) ||
                undefined
              }
              data-drop-blocked={
                (drag.dropTarget === team.id && dropBlocked) || undefined
              }
              key={team.id}
              aria-label={team.name || clubText("meetingTeamsCopy.unnamed_group")}
            >
              <div className="cp-section-heading">
                <h3>{team.name || clubText("meetingTeamsCopy.unnamed_group")}</h3>
                <Chip
                  variant={team.memberIds.includes(uid) ? "accent" : "default"}
                >
                  {team.memberIds.length}
                  {team.capacity === undefined
                    ? clubText("meetingTeamsCopy.members")
                    : ` / ${team.capacity}`}
                </Chip>
              </div>
              <p className="cp-muted">
                {clubText("meetingTeamsCopy.leader")} ·{" "}
                {team.leaderId
                  ? name(team.leaderId)
                  : clubText("meetingTeamsCopy.not_chosen")}
              </p>
              {editing && (
                <details className="cp-team-settings">
                  <summary>{clubText("meetingTeamsCopy.group_settings")}</summary>
                  <div className="cp-stack">
                    <Field
                      label={clubText("meetingTeamsCopy.group_name")}
                      htmlFor={`team-name-${team.id}`}
                    >
                      <Input
                        id={`team-name-${team.id}`}
                        maxLength={100}
                        disabled={saving || disabled || !canEdit}
                        value={team.name}
                        onChange={(event) =>
                          change(
                            draft.map((item) =>
                              item.id === team.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field
                      label={clubText("meetingTeamsCopy.capacity_optional")}
                      htmlFor={`team-capacity-${team.id}`}
                    >
                      <Input
                        id={`team-capacity-${team.id}`}
                        type="number"
                        min="1"
                        max="200"
                        placeholder={clubText("meetingTeamsCopy.no_capacity_set")}
                        disabled={saving || disabled || !canEdit}
                        value={team.capacity ?? ""}
                        onChange={(event) =>
                          change(
                            draft.map((item) =>
                              item.id === team.id
                                ? {
                                    ...item,
                                    capacity:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving || disabled || !canEdit}
                      onClick={() =>
                        change(draft.filter((item) => item.id !== team.id))
                      }
                    >
                      {clubText("meetingTeamsCopy.delete_group_unassign_members")}
                    </Button>
                  </div>
                </details>
              )}
              {team.memberIds.map(memberRow)}
              {!team.memberIds.length && (
                <p className="cp-muted">
                  {clubText("meetingTeamsCopy.no_members_assigned_yet")}
                </p>
              )}
            </section>
          ))}
        </div>
        {!teams.length && (
          <p className="cp-muted">
            {clubText("meetingTeamsCopy.no_groups_yet")}
          </p>
        )}
        <section
          className="cp-team-unassigned"
          data-team-drop=""
          data-drop-active={drag.dropTarget === "" || undefined}
        >
          <h3>
            {clubText("meetingTeamsCopy.unassigned")} <Chip>{unassigned.length}</Chip>
          </h3>
          {unassigned.map((person) => memberRow(person.memberId))}
          {!unassigned.length && (
            <p className="cp-muted">
              {clubText("meetingTeamsCopy.no_unassigned_attendees")}
            </p>
          )}
        </section>
        {editing && (
          <div className="cp-team-save">
            <Button
              variant="primary"
              loading={saving}
              disabled={
                disabled ||
                !canEdit ||
                stale ||
                !dirty ||
                !!validateMeetingTeams(draft, meeting.registrations)
              }
              onClick={() => void save()}
            >
              {clubText("meetingTeamsCopy.save_groups")}
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setSelected([]);
                setUndo(null);
                setError("");
                setFeedback(
                  clubText("meetingTeamsCopy.edits_cancelled_saved_groups_are_unchanged"),
                );
              }}
            >
              {clubText("meetingTeamsCopy.cancel_edits")}
            </Button>
            {liveIssue && (
              <p className="cp-muted">
                <Resolvable resolve={openTeamSettings(liveIssueTeam)}>{issueText(liveIssue)}</Resolvable>
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
