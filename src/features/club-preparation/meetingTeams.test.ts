import { describe, expect, it } from "vitest";
import type { MeetingTeam, Registration } from "./domain";
import { copyClubMeeting, newClubMeeting } from "./meetingCopy";
import {
  attendanceGenerations,
  createInitialTeamDraft,
  distributeUnassigned,
  meetingTeamsText,
  moveTeamMember,
  moveTeamMembers,
  placeTeamMember,
  swapTeamMembers,
  reconcileMeetingTeams,
  unassignedMembers,
  validateMeetingTeams,
} from "./teamAssignment";
const person = (
  memberId: string,
  order: number,
  status: Registration["status"] = "joined",
): Registration => ({
  memberId,
  order,
  status,
  payment: "unpaid",
  refundDue: 0,
  refunded: 0,
  outbound: "",
  inbound: "",
});
const roster = [
  person("a", 1),
  person("b", 2),
  person("c", 3),
  person("d", 4),
  person("waiting", 5, "waiting"),
  person("gone", 6, "cancelled"),
];
describe("모임 조편성", () => {
  it("모임 복사에는 기존 회원의 조 배정을 이어받지 않는다", () => {
    const copied = copyClubMeeting({
      ...newClubMeeting(),
      teams: [
        { id: "original", name: "기존조", leaderId: "a", memberIds: ["a"] },
      ],
    });
    expect(copied.teams).toEqual([]);
    expect(copied.registrations).toEqual([]);
  });

  it("15명은 한 번에 5/5/5 초안으로 만들고 조장을 추정하지 않는다", () => {
    const many = Array.from({ length: 15 }, (_, i) => person(`member-${i}`, i));
    const teams = createInitialTeamDraft(many, 5);
    expect(teams.map((team) => team.memberIds.length)).toEqual([5, 5, 5]);
    expect(teams[0]!.memberIds).toEqual(
      many.slice(0, 5).map((item) => item.memberId),
    );
    expect(teams.every((team) => team.leaderId === undefined)).toBe(true);
    expect(() => createInitialTeamDraft(many, 0)).toThrow("capacity");
  });
  it("40조까지 생성·검증하고 41번째 조는 거절한다", () => {
    const registrations = Array.from({ length: 41 }, (_, i) => person(`limit-${i}`, i));
    const teams = createInitialTeamDraft(registrations.slice(0, 40), 1);
    expect(teams).toHaveLength(40);
    expect(validateMeetingTeams(teams, registrations)).toBeNull();
    expect(() => createInitialTeamDraft(registrations, 1)).toThrow("team-limit");
    expect(validateMeetingTeams([...teams, { id: "extra", name: "초과 조", memberIds: [] }], registrations))
      .toBe("team-limit");
  });
  it("기존 배정과 조장을 보존하고 미배정자를 신청 순으로 빈자리에 순환 배분한다", () => {
    const teams: MeetingTeam[] = [
      { id: "one", name: "1조", capacity: 2, leaderId: "a", memberIds: ["a"] },
      { id: "two", name: "2조", capacity: 2, memberIds: [] },
    ];
    expect(distributeUnassigned(teams, roster)).toEqual([
      { ...teams[0], memberIds: ["a", "b"] },
      { ...teams[1], memberIds: ["c", "d"] },
    ]);
    expect(teams[0]!.memberIds).toEqual(["a"]);
  });
  it("정원 미설정 조에만 남은 인원을 넣으며 대기와 취소자는 배정하지 않는다", () => {
    const teams: MeetingTeam[] = [
      { id: "one", name: "1조", capacity: 1, memberIds: ["a"] },
      { id: "two", name: "2조", memberIds: [] },
    ];
    expect(distributeUnassigned(teams, roster)[1]!.memberIds).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(
      unassignedMembers([{ ...teams[0], capacity: 2 }], roster).map(
        (p) => p.memberId,
      ),
    ).toEqual(["b", "c", "d"]);
  });
  it("수용할 자리가 없으면 남은 사람을 미배정으로 보존한다", () => {
    const result = distributeUnassigned(
      [{ id: "one", name: "1조", capacity: 2, memberIds: [] }],
      roster,
    );
    expect(unassignedMembers(result, roster).map((p) => p.memberId)).toEqual([
      "c",
      "d",
    ]);
  });
  it("중복 배정, 정원 초과, 비참석자, 조장 소속 오류를 검증한다", () => {
    expect(
      validateMeetingTeams(
        [
          { id: "one", name: "1", memberIds: ["a"] },
          { id: "two", name: "2", memberIds: ["a"] },
        ],
        roster,
      ),
    ).toBe("duplicate");
    expect(
      validateMeetingTeams(
        [{ id: "one", name: "1", capacity: 1, memberIds: ["a", "b"] }],
        roster,
      ),
    ).toBe("overflow");
    expect(
      validateMeetingTeams(
        [{ id: "one", name: "1", memberIds: ["waiting"] }],
        roster,
      ),
    ).toBe("not-attending");
    expect(
      validateMeetingTeams(
        [{ id: "one", name: "1", leaderId: "b", memberIds: ["a"] }],
        roster,
      ),
    ).toBe("leader");
  });
  it("조장 이동은 이전 조장직을 해제하고 만석으로 이동하면 원고를 보존한다", () => {
    const teams: MeetingTeam[] = [
      { id: "one", name: "1", leaderId: "a", memberIds: ["a"] },
      { id: "two", name: "2", capacity: 1, memberIds: [] },
    ];
    const moved = moveTeamMember(teams, "a", "two");
    expect(moved[0]!.leaderId).toBeUndefined();
    expect(moved[1]!.memberIds).toEqual(["a"]);
    expect(() => moveTeamMember(moved, "b", "two")).toThrow("overflow");
    expect(moved[1]!.memberIds).toEqual(["a"]);
  });
  it("최신 명단 반영은 취소자만 제거하고 새 참석자를 임의 배정하지 않는다", () => {
    const teams: MeetingTeam[] = [
      { id: "one", name: "1", leaderId: "gone", memberIds: ["a", "gone"] },
    ];
    expect(reconcileMeetingTeams(teams, roster)).toEqual([
      { id: "one", name: "1", leaderId: undefined, memberIds: ["a"] },
    ]);
  });
  it("오래된 원고를 공유해도 취소자·대기자는 제외하고 현 참석자만 복사한다", () => {
    const text = meetingTeamsText(
      [
        {
          id: "one",
          name: "1조",
          leaderId: "gone",
          memberIds: ["a", "gone", "waiting"],
        },
      ],
      roster,
      (id) => `이름-${id}`,
    );
    expect(text).toContain("이름-a");
    expect(text).toContain("이름-d");
    expect(text).not.toContain("이름-gone");
    expect(text).not.toContain("이름-waiting");
    expect(text).not.toContain("[조장]");
  });
});

describe("복수 회원 조정 원자성", () => {
  it("여러 명 이동 정원이 부족하면 기존 조편성과 조장을 전혀 바꾸지 않는다", () => {
    const registrations = Array.from({ length: 17 }, (_, i) =>
      person(`r${i}`, i),
    );
    const teams = createInitialTeamDraft(registrations, 6).map((team) => ({
      ...team,
      capacity: 6,
    }));
    teams[0]!.leaderId = "r0";
    const before = structuredClone(teams);
    expect(() =>
      moveTeamMembers(teams, ["r0", "r1"], "team-3", registrations),
    ).toThrow("overflow");
    expect(teams).toEqual(before);
    const moved = moveTeamMembers(teams, ["r0"], "team-3", registrations);
    expect(moved.map((team) => team.memberIds.length)).toEqual([5, 6, 6]);
    expect(moved[0]!.leaderId).toBeUndefined();
  });
  it("만석 두 조의 회원을 교환해도 인원은 유지되고 이동한 조장만 해제한다", () => {
    const registrations = Array.from({ length: 17 }, (_, i) =>
      person(`r${i}`, i),
    );
    const teams = createInitialTeamDraft(registrations, 6).map((team) => ({
      ...team,
      capacity: 6,
    }));
    teams[0]!.leaderId = "r0";
    teams[1]!.leaderId = "r6";
    const swapped = swapTeamMembers(teams, ["r0", "r6"], registrations);
    expect(swapped.map((team) => team.memberIds.length)).toEqual([6, 6, 5]);
    expect(swapped[0]!.memberIds[0]).toBe("r6");
    expect(swapped[1]!.memberIds[0]).toBe("r0");
    expect(swapped[0]!.leaderId).toBeUndefined();
    expect(swapped[1]!.leaderId).toBeUndefined();
    expect(teams[0]!.memberIds[0]).toBe("r0");
    expect(() => swapTeamMembers(teams, ["r0", "r1"], registrations)).toThrow(
      "exchange",
    );
  });
});

describe("참가 세대 변경", () => {
  it("uid가 같아도 취소 후 재참가한 배정과 조장은 복원하지 않고 명단복사도 현재 참가 기준이다", () => {
    const before = [
      { ...person("a", 1), attendanceGeneration: "100:1" },
      { ...person("b", 2), attendanceGeneration: "100:2" },
    ];
    const current = [
      { ...before[0]!, attendanceGeneration: "200:1" },
      before[1]!,
      { ...person("c", 3), attendanceGeneration: "200:2" },
    ];
    const teams = [
      { id: "one", name: "1조", memberIds: ["a", "b"], leaderId: "a" },
    ];
    const generations = attendanceGenerations(before);
    const rebased = reconcileMeetingTeams(teams, current, generations);
    expect(rebased[0]!.memberIds).toEqual(["b"]);
    expect(rebased[0]!.leaderId).toBeUndefined();
    expect(unassignedMembers(rebased, current).map((p) => p.memberId)).toEqual([
      "a",
      "c",
    ]);
    expect(
      meetingTeamsText(teams, current, (id) => id, false, generations),
    ).not.toContain("a [조장]");
  });
  it("이력이 없는 legacy 회원은 revision 재검토시 안전하게 미배정한다", () => {
    const before = [person("a", 1)];
    expect(
      reconcileMeetingTeams(
        [{ id: "one", name: "1조", memberIds: ["a"], leaderId: "a" }],
        before,
        attendanceGenerations(before),
      ),
    ).toEqual([{ id: "one", name: "1조", memberIds: [], leaderId: undefined }]);
  });
});

describe("조 내 순서와 다른 조 삽입", () => {
  const registrations = Array.from({ length: 17 }, (_, i) =>
    person(`order${i + 1}`, i),
  );
  const original = createInitialTeamDraft(registrations, 6).map((team) => ({
    ...team,
    leaderId: team.memberIds[0],
    capacity: 6,
  }));
  it("앞뒤 anchor를 제거 후 기준으로 계산하며 조장과 전체17명을 보존한다", () => {
    const before = structuredClone(original);
    const moved = placeTeamMember(
      original,
      "order1",
      { teamId: "team-1", anchorId: "order4", side: "after" },
      registrations,
    );
    expect(moved[0]!.memberIds).toEqual([
      "order2",
      "order3",
      "order4",
      "order1",
      "order5",
      "order6",
    ]);
    expect(moved[0]!.leaderId).toBe("order1");
    expect(moved[0]!.capacity).toBe(6);
    const up = placeTeamMember(
      moved,
      "order6",
      { teamId: "team-1", anchorId: "order2", side: "before" },
      registrations,
    );
    expect(up[0]!.memberIds[0]).toBe("order6");
    const end = placeTeamMember(
      up,
      "order6",
      { teamId: "team-1" },
      registrations,
    );
    expect(end[0]!.memberIds.at(-1)).toBe("order6");
    expect(new Set(end.flatMap((t) => t.memberIds)).size).toBe(17);
    expect(original).toEqual(before);
  });
  it("자기행·원래자리·이미마지막이면 동일참조 no-op이며 없는anchor는 원자적으로거절한다", () => {
    expect(
      placeTeamMember(
        original,
        "order1",
        { teamId: "team-1", anchorId: "order1", side: "after" },
        registrations,
      ),
    ).toBe(original);
    expect(
      placeTeamMember(
        original,
        "order1",
        { teamId: "team-1", anchorId: "order2", side: "before" },
        registrations,
      ),
    ).toBe(original);
    expect(
      placeTeamMember(original, "order6", { teamId: "team-1" }, registrations),
    ).toBe(original);
    expect(() =>
      placeTeamMember(
        original,
        "order1",
        { teamId: "team-2", anchorId: "missing", side: "after" },
        registrations,
      ),
    ).toThrow("id");
  });
  it("다른조 지정위치에 넣고 이동조장만해제하며 만석초과는거절한다", () => {
    const next = placeTeamMember(
      original,
      "order1",
      { teamId: "team-3", anchorId: "order14", side: "before" },
      registrations,
    );
    expect(next[2]!.memberIds).toEqual([
      "order13",
      "order1",
      "order14",
      "order15",
      "order16",
      "order17",
    ]);
    expect(next[0]!.leaderId).toBeUndefined();
    expect(next[2]!.leaderId).toBe("order13");
    expect(() =>
      placeTeamMember(
        original,
        "order1",
        { teamId: "team-2", anchorId: "order8", side: "after" },
        registrations,
      ),
    ).toThrow("overflow");
  });
});
