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
  const text = (ko: string, en: string) => (english ? en : ko);
  const name = (id: string) =>
    members.find((member) => member.id === id)?.name ??
    text("클럽 회원", "Club member");
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
    editing ? text("[저장 전 조편성 초안]", "[UNSAVED GROUP DRAFT]") : "",
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
    ? text("조편성 편집", "Edit groups")
    : text("조 나누기", "Arrange groups");
  const issueText = (issue: TeamIssue) =>
    ({
      "team-limit": text(
        "조는 40개까지 만들 수 있어요.",
        "You can create up to 40 groups.",
      ),
      id: text(
        "조 정보를 다시 확인해주세요.",
        "Please check the group information.",
      ),
      name: text(
        "각 조의 이름을 1~100자로 입력해주세요.",
        "Give each group a name of 1–100 characters.",
      ),
      capacity: text(
        "조 정원은 비워두거나 1~200명으로 입력해주세요.",
        "Leave capacity empty or enter a whole number from 1 to 200.",
      ),
      overflow: text(
        "이 조에 설정한 정원을 넘어요. 조 설정에서 정원을 바꾸거나 다른 조로 옮겨주세요.",
        "This group has a capacity limit. Change it in group settings or choose another group.",
      ),
      duplicate: text(
        "한 회원은 하나의 조에만 배정할 수 있어요.",
        "Each member can belong to only one group.",
      ),
      "not-attending": text(
        "참석 명단이 바뀌었어요. 최신 명단에 맞춰 편집 내용을 검토해주세요.",
        "Attendance changed. Review your draft against the latest roster.",
      ),
      exchange: text(
        "서로 다른 조에 배정된 두 명을 선택해주세요.",
        "Select two members assigned to different groups.",
      ),
      leader: text(
        "조장은 해당 조에 배정된 회원 중에서 선택해주세요.",
        "Choose a leader from members assigned to that group.",
      ),
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
        text(
          `${selectedMembers.length}명을 ${draft.find((team) => team.id === teamId)?.name ?? "미배정"}으로 옮겼어요. 이동한 조장은 해제됩니다.`,
          `Moved ${selectedMembers.length} members to ${draft.find((team) => team.id === teamId)?.name ?? "Unassigned"}. Moved leaders are cleared.`,
        ),
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
        text(
          "명단이 바뀌어 이동을 멈췄어요. 최신 명단을 확인해주세요.",
          "Attendance changed. Dragging stopped; review the latest roster.",
        ),
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
          text(
            currentId === teamId
              ? `${name(memberId)}님의 조 안 순서를 바꿨어요. 변경 저장 전입니다.`
              : `${name(memberId)}님을 ${draft.find((team) => team.id === teamId)?.name ?? "미배정"}으로 옮겼어요. 변경 저장 전입니다. 이동한 조장은 해제됩니다.`,
            currentId === teamId
              ? `Reordered ${name(memberId)} within the group. Unsaved.`
              : `Moved ${name(memberId)} to ${draft.find((team) => team.id === teamId)?.name ?? "Unassigned"}. Unsaved; moved leaders are cleared.`,
          ),
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
    ? text(
        "정원 초과 · 다른 조에 놓으세요",
        "Capacity limit · choose another group",
      )
    : drag.dropTarget === null
      ? text("원하는 조 위로 옮겨 놓으세요", "Release over a group")
      : drag.dropPlacement?.anchorId === drag.draggedId
        ? text("현재 자리", "Current position")
        : drag.dropTarget === draggedTeam?.id ||
            (drag.dropTarget === "" && !draggedTeam)
          ? text(
              "놓으면 조 안 순서 변경",
              "Release to reorder within the group",
            )
          : text(
              `놓으면 이동 · ${targetTeam?.name ?? "미배정"}`,
              `Move to ${targetTeam?.name ?? "Unassigned"}`,
            );
  const reviewLatest = async () => {
    if (guard.current) return;
    guard.current = true;
    setSaving(true);
    setError("");
    try {
      await onReload();
      setReviewRequired(false);
      setFeedback(
        text(
          "최신 상태를 불러왔어요. 아래 명단과 편집 내용을 확인한 후 반영해주세요.",
          "Latest information loaded. Compare the roster and your draft before applying it.",
        ),
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
        text(
          "조편성을 저장했어요. 회원들이 최신 조를 확인할 수 있어요.",
          "Groups saved. Members can now see their latest assignment.",
        ),
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
            aria-label={text(
              `${name(memberId)} 드래그로 이동`,
              `Drag ${name(memberId)} to move`,
            )}
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
              aria-label={text(
                `${name(memberId)} 선택`,
                `Select ${name(memberId)}`,
              )}
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
              {memberId === uid ? text(" · 나", " · You") : ""}
            </strong>
          </label>
        ) : (
          <strong>
            {name(memberId)}
            {memberId === uid ? text(" · 나", " · You") : ""}
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
                  aria-label={text(
                    `${name(memberId)} ${side === "before" ? "위로" : "아래로"}`,
                    `Move ${name(memberId)} ${side === "before" ? "up" : "down"}`,
                  )}
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
                      text(
                        "조 안 순서를 바꿨어요. 변경 저장 전입니다.",
                        "Group order changed. Unsaved.",
                      ),
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
            aria-label={text(
              `${name(memberId)} 조장 ${isLeader ? "해제" : "지정"}`,
              `${isLeader ? "Clear" : "Set"} ${name(memberId)} as leader`,
            )}
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
            {text(
              isLeader ? "조장 해제" : "조장 지정",
              isLeader ? "Clear leader" : "Set leader",
            )}
          </Button>
        ) : isLeader ? (
          <Chip>{text("조장", "Leader")}</Chip>
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
                {draggedTeam?.name ?? text("미배정", "Unassigned")}
                {draggedTeam?.leaderId === drag.draggedId
                  ? text(" · 조장", " · Leader")
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
              <InfoTip label={text("함께 달릴 조", "Riding groups")} title={text("함께 달릴 조", "Riding groups")} content={text("참석 확정 후 조를 배정할 수 있어요. 초안은 참석 순서대로 나누며 능력·속도를 자동 판단하지 않습니다. 처음 나눌 인원은 조 정원을 고정하지 않으며 저장 후 회원에게 반영됩니다.", "Groups can be assigned after attendance is confirmed. Initial drafts use attendance order without inferring ability or speed. The initial split does not fix group capacities. Members see changes after saving.")}>{text("함께 달릴 조", "Riding groups")}</InfoTip>
            </h2>
            <p className="cp-muted">
              {text(
                `참석 ${attending.length}명 · 배정 ${attending.length - unassigned.length}명 · 미배정 ${unassigned.length}명`,
                `${attending.length} attending · ${attending.length - unassigned.length} assigned · ${unassigned.length} unassigned`,
              )}
            </p>
          </div>
          {/* 명단 복사·조편성 편집은 제목 옆 작은 아이콘으로 둔다. 편집 중 저장·취소는 편집기 안에 그대로 있다. */}
          <div className="cp-actions">
            {isHost && (
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={text("명단 복사", "Copy roster")}
                title={text("명단 복사", "Copy roster")}
                icon={<Copy size={ICON_SIZE.sm} />}
                disabled={saving}
                onClick={async () => {
                  setError("");
                  try {
                    await navigator.clipboard.writeText(sharedText);
                    setCopyFallback(false);
                    setFeedback(
                      editing
                        ? text(
                            "저장 전 조편성 편집 내용을 복사했어요.",
                            "Copied the unsaved group draft.",
                          )
                        : text(
                            "조별 명단을 복사했어요.",
                            "Group roster copied.",
                          ),
                    );
                  } catch {
                    setCopyFallback(true);
                    setFeedback(
                      text(
                        "자동 복사가 허용되지 않았어요. 아래 명단을 선택해 직접 복사해주세요.",
                        "Automatic copying was not allowed. Select the roster below to copy it manually.",
                      ),
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
              ? text(
                  "저장하지 않은 조편성입니다. 회원 화면에는 아직 반영되지 않았어요.",
                  "Unsaved groups. Members still see the saved version.",
                )
              : text(
                  "조편성 편집 중 · 저장하면 회원들에게 반영됩니다.",
                  "Editing groups. Changes become visible to members when saved.",
                )}
          </p>
        ) : (
          <p className="cp-muted">
            {currentTeam
              ? text(
                  `내 조 · ${currentTeam.name}${currentTeam.leaderId === uid ? " (조장)" : ""}`,
                  `Your group · ${currentTeam.name}${currentTeam.leaderId === uid ? " (Leader)" : ""}`,
                )
              : text(
                  "현재 배정된 조가 없어요.",
                  "You are not assigned yet.",
                )}
          </p>
        )}
        {copyFallback && (
          <Field
            label={text(
              "직접 복사할 조별 명단",
              "Group roster to copy manually",
            )}
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
            {text(
              "모임이 취소되었거나 출발 시각이 지나 조편성을 저장할 수 없어요. 작성한 명단은 복사하거나 편집을 취소할 수 있습니다.",
              "Groups cannot be saved after cancellation or departure. You can copy your draft or cancel editing.",
            )}
          </p>
        )}
        {stale && (
          <div className="cp-team-review" role="alert">
            <strong>
              {text(
                "모임 상태가 바뀌었어요. 작성 중인 조편성은 보관했습니다.",
                "The meeting changed. Your group draft has been preserved.",
              )}
            </strong>
            <p>
              {text(
                "최신 참석·취소와 서버의 조편성을 확인해주세요. 취소·재신청한 회원은 미배정으로 돌아갑니다. 참가 이력을 확인할 수 없는 기존 회원도 안전하게 미배정으로 돌려 다시 확인합니다.",
                "Review attendance and saved groups. Cancelled and rejoined members return to unassigned. Legacy attendance without a verifiable history is also unassigned for review.",
              )}
            </p>
            <details>
              <summary>
                {text("현재 서버에 저장된 조편성", "Currently saved groups")}
              </summary>
              {(meeting.teams ?? []).map((team) => (
                <p key={team.id}>
                  {team.name} ·{" "}
                  {team.memberIds.map(name).join(", ") ||
                    text("배정 없음", "Empty")}
                </p>
              ))}
            </details>
            <div className="cp-actions">
              <Button
                size="sm"
                disabled={saving}
                onClick={() => void reviewLatest()}
              >
                {text("최신 상태 불러오기", "Reload latest")}
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
                    text(
                      "최신 참석 명단을 편집 내용에 반영했어요. 조별 배정을 확인하고 저장해주세요.",
                      "Latest attendance applied to your draft. Check assignments before saving.",
                    ),
                  );
                }}
              >
                {text(
                  "최신 명단을 편집 내용에 반영",
                  "Apply latest roster to draft",
                )}
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
              label={text("처음 나눌 인원", "Initial group size")}
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
                    text(
                      "참석 순서대로 조편성 초안을 만들었어요. 조장과 배정을 검토한 후 저장해주세요.",
                      "Created a group draft in attendance order. Review leaders and assignments before saving.",
                    ),
                  );
                } catch (failure) {
                  failTeams((failure as Error).message as TeamIssue, draft);
                }
              }}
            >
              {text("이 인원씩 초안 만들기", "Create groups of this size")}
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
                    name: text(
                      `${draft.length + 1}조`,
                      `Group ${draft.length + 1}`,
                    ),
                    memberIds: [],
                  },
                ])
              }
            >
              {text("조 추가", "Add group")}
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
                    text(
                      "기존 배정은 유지하고 미배정자를 참석 신청 순서대로 각 조의 빈자리에 나눴어요. 남은 미배정자를 확인해주세요.",
                      "Kept existing assignments and distributed unassigned members in attendance order across available places. Check any remaining unassigned members.",
                    ),
                  );
                } catch (failure) {
                  failTeams((failure as Error).message as TeamIssue, draft);
                }
              }}
            >
              {text("미배정자 나눠 넣기", "Distribute unassigned")}
            </Button>
          </div>
        )}
        {editing && (
          <p id="team-drag-help" className="cp-muted">
            {text(
              "손잡이를 끌어 조 안 순서를 바꾸거나 다른 조로 옮기세요. 선이 보이는 자리에 들어갑니다. 체크 선택 후 위·아래 또는 이동 버튼도 사용할 수 있어요.",
              "Drag to reorder within a group or move to another group. The line marks the insertion point. Select a member for up/down buttons, or use move buttons.",
            )}
          </p>
        )}
        {drag.draggedId && (
          <p className="cp-team-drag-status" role="status">
            {text(
              `${name(drag.draggedId)}님 이동 중 · 원하는 조 위에서 놓으세요`,
              `Moving ${name(drag.draggedId)} · release over a group`,
            )}
          </p>
        )}
        {editing && (
          <section
            className="cp-team-selection"
            aria-label={text("선택한 회원 조정", "Adjust selected members")}
          >
            <div className="cp-section-heading">
              <strong>
                {text(
                  `선택 ${selectedMembers.length}명`,
                  `${selectedMembers.length} selected`,
                )}
              </strong>
              <div className="cp-actions">
                <Button
                  size="sm"
                  variant="primary"
                  loading={saving}
                  disabled={saveDisabled}
                  onClick={() => void save()}
                >
                  {text("변경 저장", "Save changes")}
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
                  {text("수정 취소", "Cancel changes")}
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
                {text("전체 선택", "Select all")}
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
                {text("미배정 모두 선택", "Select all unassigned")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!selectedMembers.length}
                onClick={() => setSelected([])}
              >
                {text("선택 해제", "Clear selection")}
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
                    text(
                      "방금 조정을 되돌렸어요.",
                      "Undid the last adjustment.",
                    ),
                  );
                }}
              >
                {text("방금 조정 되돌리기", "Undo last adjustment")}
              </Button>
            )}
            {selectedMembers.length > 0 ? (
              <>
                <details>
                  <summary>
                    {text(
                      "선택 회원 · 현재 조 확인",
                      "Selected members · current groups",
                    )}
                  </summary>
                  <p className="cp-muted">
                    {selectedMembers
                      .map(
                        (id) =>
                          `${name(id)} (${draft.find((team) => team.memberIds.includes(id))?.name ?? text("미배정", "Unassigned")})`,
                      )
                      .join(", ")}
                  </p>
                </details>
                <div className="cp-team-targets">
                  {draft.length > 4 ? (
                    <div className="cp-team-destination">
                      <Select
                        aria-label={text(
                          "목적 조 선택",
                          "Choose destination group",
                        )}
                        disabled={saving || disabled || !canEdit || stale}
                        value={
                          draft.some((team) => team.id === destination)
                            ? destination
                            : ""
                        }
                        onChange={(event) => setDestination(event.target.value)}
                      >
                        <option value="">
                          {text("어느 조로 옮길까요?", "Choose a group")}
                        </option>
                        {draft.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name || text("이름 없는 조", "Unnamed group")}
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
                        {text("선택한 조로 이동", "Move to selected group")}
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
                          {text(
                            `${team.name || "이름 없는 조"}로 이동`,
                            `Move to ${team.name || "Unnamed group"}`,
                          )}
                        </Button>
                      ))}
                    </>
                  )}
                  <Button
                    size="sm"
                    disabled={saving || disabled || !canEdit || stale}
                    onClick={() => moveSelected("")}
                  >
                    {text("미배정으로 이동", "Move to unassigned")}
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
                          text(
                            "두 명을 맞교환했어요. 이동한 조장은 해제했으니 필요한 조장을 다시 지정해주세요.",
                            "Swapped both members. Moved leaders were cleared; assign leaders as needed.",
                          ),
                        );
                      } catch (failure) {
                        failTeams((failure as Error).message as TeamIssue, draft);
                      }
                    }}
                  >
                    {text("두 명 맞교환", "Swap two members")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="cp-muted">
                {text(
                  "이동할 회원을 체크한 다음 목적 조를 누르세요. 두 조가 만석이면 한 명씩 선택해 맞교환할 수 있어요.",
                  "Check members, then choose a destination group. Select one member from each full group to swap them.",
                )}
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
              aria-label={team.name || text("이름 없는 조", "Unnamed group")}
            >
              <div className="cp-section-heading">
                <h3>{team.name || text("이름 없는 조", "Unnamed group")}</h3>
                <Chip
                  variant={team.memberIds.includes(uid) ? "accent" : "default"}
                >
                  {team.memberIds.length}
                  {team.capacity === undefined
                    ? text("명", " members")
                    : ` / ${team.capacity}`}
                </Chip>
              </div>
              <p className="cp-muted">
                {text("조장", "Leader")} ·{" "}
                {team.leaderId
                  ? name(team.leaderId)
                  : text("미정", "Not chosen")}
              </p>
              {editing && (
                <details className="cp-team-settings">
                  <summary>{text("조 설정", "Group settings")}</summary>
                  <div className="cp-stack">
                    <Field
                      label={text("조 이름", "Group name")}
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
                      label={text("정원 · 선택", "Capacity · optional")}
                      htmlFor={`team-capacity-${team.id}`}
                    >
                      <Input
                        id={`team-capacity-${team.id}`}
                        type="number"
                        min="1"
                        max="200"
                        placeholder={text("정원 미설정", "No capacity set")}
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
                      {text(
                        "조 삭제 · 배정 해제",
                        "Delete group · unassign members",
                      )}
                    </Button>
                  </div>
                </details>
              )}
              {team.memberIds.map(memberRow)}
              {!team.memberIds.length && (
                <p className="cp-muted">
                  {text(
                    "아직 배정한 회원이 없어요.",
                    "No members assigned yet.",
                  )}
                </p>
              )}
            </section>
          ))}
        </div>
        {!teams.length && (
          <p className="cp-muted">
            {text(
              "아직 조편성이 없어요.",
              "No groups yet.",
            )}
          </p>
        )}
        <section
          className="cp-team-unassigned"
          data-team-drop=""
          data-drop-active={drag.dropTarget === "" || undefined}
        >
          <h3>
            {text("미배정", "Unassigned")} <Chip>{unassigned.length}</Chip>
          </h3>
          {unassigned.map((person) => memberRow(person.memberId))}
          {!unassigned.length && (
            <p className="cp-muted">
              {text("미배정 참석자가 없어요.", "No unassigned attendees.")}
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
              {text("조편성 저장", "Save groups")}
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setSelected([]);
                setUndo(null);
                setError("");
                setFeedback(
                  text(
                    "수정을 취소했어요. 저장된 조편성은 바뀌지 않았습니다.",
                    "Edits cancelled. Saved groups are unchanged.",
                  ),
                );
              }}
            >
              {text("편집 취소", "Cancel edits")}
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
