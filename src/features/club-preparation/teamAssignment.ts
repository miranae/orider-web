import type { MeetingTeam, Registration } from "./domain";

export type TeamIssue =
  | "team-limit"
  | "id"
  | "name"
  | "capacity"
  | "overflow"
  | "duplicate"
  | "not-attending"
  | "leader"
  | "exchange";
export function joinedInOrder(registrations: Registration[]): Registration[] {
  return registrations
    .filter((person) => person.status === "joined")
    .sort((a, b) => a.order - b.order);
}
export function unassignedMembers(
  teams: MeetingTeam[],
  registrations: Registration[],
): Registration[] {
  const assigned = new Set(teams.flatMap((team) => team.memberIds));
  return joinedInOrder(registrations).filter(
    (person) => !assigned.has(person.memberId),
  );
}
export function validateMeetingTeams(
  teams: MeetingTeam[],
  registrations: Registration[],
): TeamIssue | null {
  if (teams.length > 40) return "team-limit";
  const attending = new Set(
    joinedInOrder(registrations).map((person) => person.memberId),
  );
  const teamIds = new Set<string>();
  const members = new Set<string>();
  for (const team of teams) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(team.id) || teamIds.has(team.id))
      return "id";
    teamIds.add(team.id);
    if (!team.name.trim() || team.name.trim().length > 100) return "name";
    if (
      team.capacity !== undefined &&
      (!Number.isInteger(team.capacity) ||
        team.capacity < 1 ||
        team.capacity > 200)
    )
      return "capacity";
    if (team.memberIds.length > (team.capacity ?? 200)) return "overflow";
    for (const member of team.memberIds) {
      if (!attending.has(member)) return "not-attending";
      if (members.has(member)) return "duplicate";
      members.add(member);
    }
    if (team.leaderId && !team.memberIds.includes(team.leaderId))
      return "leader";
  }
  return null;
}
/** 기존 배정은 유지하고 참석 신청 순서대로 조를 순환하며 남은 자리만 채운다. */
export function distributeUnassigned(
  teams: MeetingTeam[],
  registrations: Registration[],
): MeetingTeam[] {
  const issue = validateMeetingTeams(teams, registrations);
  if (issue) throw new Error(issue);
  const next = structuredClone(teams);
  if (!next.length) return next;
  let cursor = 0;
  for (const person of unassignedMembers(next, registrations)) {
    let selected = -1;
    for (let offset = 0; offset < next.length; offset++) {
      const index = (cursor + offset) % next.length;
      if (next[index]!.memberIds.length < (next[index]!.capacity ?? 200)) {
        selected = index;
        break;
      }
    }
    if (selected < 0) break;
    next[selected]!.memberIds.push(person.memberId);
    cursor = (selected + 1) % next.length;
  }
  return next;
}
export function moveTeamMember(
  teams: MeetingTeam[],
  memberId: string,
  teamId: string,
): MeetingTeam[] {
  const destination = teams.find((team) => team.id === teamId);
  if (teamId && !destination) throw new Error("id");
  if (
    destination &&
    !destination.memberIds.includes(memberId) &&
    destination.memberIds.length >= (destination.capacity ?? 200)
  )
    throw new Error("overflow");
  return teams.map((team) => ({
    ...team,
    leaderId:
      team.leaderId === memberId && team.id !== teamId
        ? undefined
        : team.leaderId,
    memberIds:
      team.id === teamId
        ? [...team.memberIds.filter((id) => id !== memberId), memberId]
        : team.memberIds.filter((id) => id !== memberId),
  }));
}
/** 취소·재신청자의 이전 배정을 제외한다. 새 참석자는 미배정으로 남긴다. */
export function reconcileMeetingTeams(
  teams: MeetingTeam[],
  registrations: Registration[],
  generations?: Record<string, string | null>,
): MeetingTeam[] {
  const invalid = new Set(
    generations ? changedAttendanceMembers(generations, registrations) : [],
  );
  const joined = new Set(
    joinedInOrder(registrations).map((person) => person.memberId),
  );
  return teams.map((team) => ({
    ...team,
    memberIds: team.memberIds.filter(
      (id) => joined.has(id) && !invalid.has(id),
    ),
    leaderId:
      team.leaderId && joined.has(team.leaderId) && !invalid.has(team.leaderId)
        ? team.leaderId
        : undefined,
  }));
}
export function meetingTeamsText(
  teams: MeetingTeam[],
  registrations: Registration[],
  name: (id: string) => string,
  english = false,
  generations?: Record<string, string | null>,
): string {
  const currentTeams = reconcileMeetingTeams(teams, registrations, generations);
  const rows = currentTeams.flatMap((team) => [
    `${team.name} (${team.memberIds.length}${team.capacity === undefined ? "" : `/${team.capacity}`})`,
    ...team.memberIds.map(
      (id) =>
        `${id === team.leaderId ? (english ? "[Leader] " : "[조장] ") : ""}${name(id)}`,
    ),
    "",
  ]);
  const unassigned = unassignedMembers(currentTeams, registrations);
  return [
    ...rows,
    english
      ? `Unassigned (${unassigned.length})`
      : `미배정 (${unassigned.length}명)`,
    ...unassigned.map((person) => name(person.memberId)),
  ].join("\n");
}
/** 최초 편성만을 위한 초안. 신청 순서대로 채우며 저장은 별도 동작이다. */
export function createInitialTeamDraft(
  registrations: Registration[],
  size: number,
  english = false,
): MeetingTeam[] {
  if (!Number.isInteger(size) || size < 1 || size > 200)
    throw new Error("capacity");
  const attending = joinedInOrder(registrations);
  const count = Math.ceil(attending.length / size);
  if (count > 40) throw new Error("team-limit");
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    name: english ? `Group ${index + 1}` : `${index + 1}조`,
    memberIds: attending
      .slice(index * size, (index + 1) * size)
      .map((person) => person.memberId),
  }));
}

/** 일괄 이동은 수용 인원을 먼저 검증한다. 부족하면 아무 배정도 바꾸지 않는다. */
export function moveTeamMembers(
  teams: MeetingTeam[],
  memberIds: string[],
  teamId: string,
  registrations: Registration[],
): MeetingTeam[] {
  const issue = validateMeetingTeams(teams, registrations);
  if (issue) throw new Error(issue);
  const selected = new Set(memberIds);
  const joined = joinedInOrder(registrations);
  if (
    [...selected].some((id) => !joined.some((person) => person.memberId === id))
  )
    throw new Error("not-attending");
  const destination = teams.find((team) => team.id === teamId);
  if (teamId && !destination) throw new Error("id");
  const incoming = joined
    .filter(
      (person) =>
        selected.has(person.memberId) &&
        !destination?.memberIds.includes(person.memberId),
    )
    .map((person) => person.memberId);
  if (
    destination &&
    destination.memberIds.length + incoming.length >
      (destination.capacity ?? 200)
  )
    throw new Error("overflow");
  return teams.map((team) => ({
    ...team,
    leaderId:
      team.leaderId && selected.has(team.leaderId) && team.id !== teamId
        ? undefined
        : team.leaderId,
    memberIds:
      team.id === teamId
        ? [...team.memberIds, ...incoming]
        : team.memberIds.filter((id) => !selected.has(id)),
  }));
}

/** 서로 다른 조의 두 회원을 자리 그대로 교환하므로 만석이어도 정원을 넘지 않는다. */
export function swapTeamMembers(
  teams: MeetingTeam[],
  memberIds: string[],
  registrations: Registration[],
): MeetingTeam[] {
  const issue = validateMeetingTeams(teams, registrations);
  if (issue) throw new Error(issue);
  const selected = [...new Set(memberIds)];
  if (selected.length !== 2) throw new Error("exchange");
  const [first, second] = selected as [string, string];
  const firstTeam = teams.find((team) => team.memberIds.includes(first));
  const secondTeam = teams.find((team) => team.memberIds.includes(second));
  if (!firstTeam || !secondTeam || firstTeam.id === secondTeam.id)
    throw new Error("exchange");
  return teams.map((team) => ({
    ...team,
    leaderId:
      team.leaderId === first || team.leaderId === second
        ? undefined
        : team.leaderId,
    memberIds:
      team.id === firstTeam.id
        ? team.memberIds.map((id) => (id === first ? second : id))
        : team.id === secondTeam.id
          ? team.memberIds.map((id) => (id === second ? first : id))
          : [...team.memberIds],
  }));
}

export function attendanceGenerations(
  registrations: Registration[],
): Record<string, string | null> {
  return Object.fromEntries(
    joinedInOrder(registrations).map((person) => [
      person.memberId,
      person.attendanceGeneration ?? null,
    ]),
  );
}
/** 세대가 없으면 같은 사람의 취소·재참석을 확인할 수 없어 재검토 시 미배정으로 되돌린다. */
export function changedAttendanceMembers(
  baseline: Record<string, string | null>,
  registrations: Registration[],
): string[] {
  const current = attendanceGenerations(registrations);
  return Object.entries(baseline)
    .filter(
      ([id, generation]) => generation === null || current[id] !== generation,
    )
    .map(([id]) => id);
}

export type TeamDropTarget = {
  teamId: string;
  anchorId?: string;
  side?: "before" | "after";
};
/** ID 기준 삽입: 같은 조는 조장을 보존하고, 다른 조 이동은 기존 검증을 재사용한다. */
export function placeTeamMember(
  teams: MeetingTeam[],
  memberId: string,
  target: TeamDropTarget,
  registrations: Registration[],
): MeetingTeam[] {
  const issue = validateMeetingTeams(teams, registrations);
  if (issue) throw new Error(issue);
  if (
    !joinedInOrder(registrations).some((person) => person.memberId === memberId)
  )
    throw new Error("not-attending");
  const source = teams.find((team) => team.memberIds.includes(memberId));
  if (!target.teamId)
    return source
      ? moveTeamMembers(teams, [memberId], "", registrations)
      : teams;
  const destination = teams.find((team) => team.id === target.teamId);
  if (!destination) throw new Error("id");
  if (target.anchorId && !destination.memberIds.includes(target.anchorId))
    throw new Error("id");
  if (target.anchorId === memberId) return teams;
  const next =
    source?.id === target.teamId
      ? teams
      : moveTeamMembers(teams, [memberId], target.teamId, registrations);
  const ordered = destination.memberIds.filter((id) => id !== memberId);
  const index = target.anchorId
    ? ordered.indexOf(target.anchorId) + (target.side === "after" ? 1 : 0)
    : ordered.length;
  ordered.splice(index, 0, memberId);
  if (
    source?.id === target.teamId &&
    ordered.every((id, i) => id === destination.memberIds[i])
  )
    return teams;
  return next.map((team) =>
    team.id === target.teamId ? { ...team, memberIds: ordered } : team,
  );
}
