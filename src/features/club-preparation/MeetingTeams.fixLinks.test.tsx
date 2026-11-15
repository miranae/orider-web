import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MeetingTeams from "./MeetingTeams";
import { newClubMeeting } from "./meetingCopy";
import type { Meeting, Registration } from "./domain";
import { createInitialTeamDraft } from "./teamAssignment";

const person = (memberId: string, order: number): Registration => ({
  memberId, attendanceGeneration: `${memberId}:1`, order, status: "joined", payment: "unpaid",
  refundDue: 0, refunded: 0, outbound: "", inbound: "",
});
const people = [{ id: "r1", name: "라이더01" }, { id: "r2", name: "라이더02" }];
const registrations = people.map((member, i) => person(member.id, i + 1));

function renderTeams() {
  const teams = createInitialTeamDraft(registrations, 1).map((team) => ({ ...team, capacity: 1 }));
  const meeting: Meeting = { ...newClubMeeting(), id: "meeting", date: "2099-01-01", title: "함께", registrations, teams };
  renderWithProviders(
    <MeetingTeams meeting={meeting} members={people} uid="r1" isHost revision={1}
      onSave={vi.fn().mockResolvedValue(undefined)} onReload={vi.fn().mockResolvedValue(undefined)} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "조편성 편집" }));
  return teams;
}

describe("조 검증 오류 문구를 누르면 그 조의 접힌 조 설정 칸으로 간다", () => {
  it("정원 초과 이동을 막으면 목적 조의 조 설정을 펼치고 정원 칸에 초점을 둔다", () => {
    const teams = renderTeams();
    fireEvent.click(screen.getByLabelText("라이더01 선택"));
    fireEvent.click(screen.getByRole("button", { name: "2조로 이동" }));
    expect(screen.getByText(/이 조에 설정한 정원을 넘어요/)).toBeInTheDocument();
    const capacity = document.getElementById(`team-capacity-${teams[1]!.id}`)!;
    expect(capacity.closest("details")?.open).toBe(false);
    expect(screen.queryByRole("button", { name: /조 설정 열기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /이 조에 설정한 정원을 넘어요/ }));
    expect(capacity.closest("details")?.open).toBe(true);
    expect(document.activeElement).toBe(capacity);
  });

  it("조 이름을 비우면 저장 아래 안내 문구를 눌러 그 조의 이름 칸으로 간다", () => {
    const teams = renderTeams();
    const name = document.getElementById(`team-name-${teams[0]!.id}`)!;
    fireEvent.change(name, { target: { value: "" } });
    expect(screen.getByText(/각 조의 이름을 1~100자로 입력해주세요/)).toBeInTheDocument();
    name.closest("details")!.open = false;
    fireEvent.click(screen.getByRole("button", { name: /각 조의 이름을 1~100자로 입력해주세요/ }));
    expect(name.closest("details")?.open).toBe(true);
    expect(document.activeElement).toBe(name);
  });
});
