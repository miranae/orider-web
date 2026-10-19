import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MeetingTeams from "./MeetingTeams";
import { newClubMeeting } from "./meetingCopy";
import type { Meeting, Registration } from "./domain";
import { createInitialTeamDraft } from "./teamAssignment";
import { Profiler } from "react";
const person = (memberId: string, order: number): Registration => ({
  memberId,
  attendanceGeneration: `${memberId}:1`,
  order,
  status: "joined",
  payment: "unpaid",
  refundDue: 0,
  refunded: 0,
  outbound: "",
  inbound: "",
});
const members = [
  { id: "a", name: "가람" },
  { id: "b", name: "보리" },
  { id: "c", name: "초록" },
];
const initial: Meeting = {
  ...newClubMeeting(),
  id: "meeting",
  date: "2099-01-01",
  title: "함께 라이딩",
  registrations: [person("a", 1), person("b", 2)],
};
const wrap = (
  meeting: Meeting,
  revision: number,
  onSave: (
    teams: NonNullable<Meeting["teams"]>,
    revision: number,
  ) => Promise<void>,
  onReload = vi.fn().mockResolvedValue(undefined),
  isHost = true,
) => (
  <MeetingTeams
    meeting={meeting}
    members={members}
    uid="a"
    isHost={isHost}
    revision={revision}
    onSave={onSave}
    onReload={onReload}
  />
);
describe("실제 조편성 편집", () => {
  it("최신 참석 변경 시 편집 내용를 보존하고 명단 재검토 후에만 새 revision으로 저장한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const view = renderWithProviders(wrap(initial, 1, save));
    fireEvent.click(screen.getByRole("button", { name: "조 나누기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "이 인원씩 초안 만들기" }),
    );
    fireEvent.click(screen.getByText("조 설정"));
    expect(screen.getByLabelText("조 이름")).toBeVisible();
    fireEvent.change(screen.getByLabelText("조 이름"), {
      target: { value: "함께조" },
    });
    view.rerender(
      wrap(
        {
          ...initial,
          registrations: [...initial.registrations, person("c", 3)],
        },
        2,
        save,
      ),
    );
    expect(screen.getByLabelText("조 이름")).toHaveValue("함께조");
    expect(screen.getByRole("button", { name: "조편성 저장" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "최신 명단을 편집 내용에 반영" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "조편성 저장" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        [expect.objectContaining({ name: "함께조", memberIds: ["a", "b"] })],
        2,
      ),
    );
  });
  it("서버 충돌 시 작성 중 배정과 이름을 보존하고 저장을 잠근다", async () => {
    const save = vi.fn().mockRejectedValue({ code: "functions/aborted" });
    renderWithProviders(wrap(initial, 4, save));
    fireEvent.click(screen.getByRole("button", { name: "조 나누기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "이 인원씩 초안 만들기" }),
    );
    fireEvent.click(screen.getByText("조 설정"));
    expect(screen.getByLabelText("조 이름")).toBeVisible();
    fireEvent.change(screen.getByLabelText("조 이름"), {
      target: { value: "보존할조" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조편성 저장" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "조편성 저장" }),
      ).toBeDisabled(),
    );
    expect(screen.getByLabelText("조 이름")).toHaveValue("보존할조");
    expect(
      screen.getByText(
        "모임 상태가 바뀌었어요. 작성 중인 조편성은 보관했습니다.",
      ),
    ).toBeInTheDocument();
  });
  it("일반 회원은 전체 조와 자신의 조장을 보지만 편집하지 못한다", () => {
    renderWithProviders(
      wrap(
        {
          ...initial,
          teams: [
            { id: "one", name: "바람조", leaderId: "a", memberIds: ["a", "b"] },
          ],
        },
        1,
        vi.fn(),
        undefined,
        false,
      ),
    );
    expect(screen.getByText("내 조 · 바람조 (조장)")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "조 나누기" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("보리")).toBeInTheDocument();
  });
  it("복사 권한이 거절되면 저장 전 초안 표시가 포함된 직접 복사 명단을 제공한다", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    renderWithProviders(wrap(initial, 1, vi.fn()));
    fireEvent.click(screen.getByRole("button", { name: "조 나누기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "이 인원씩 초안 만들기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "명단 복사" }));
    const fallback = await screen.findByLabelText("직접 복사할 조별 명단");
    expect((fallback as HTMLTextAreaElement).value).toContain(
      "[저장 전 조편성 초안]",
    );
    expect(fallback).toHaveAttribute("readonly");
  });
});

describe("17명 조편성 조정", () => {
  it("6/6/5에서 만석 조 맞교환·되돌리기·여유조 이동·초과 거절·조장 지정을 저장 전 끝낸다", async () => {
    // 같은 실제 버튼을 찾되 모든 조의 접근성 이름을 매번 계산하지 않는다.
    const button = (name: string) => {
      const target = screen.getByText(name, { exact: true }).closest<HTMLButtonElement>("button")!;
      expect(target).toHaveRole("button");
      expect(target).toHaveAccessibleName(name);
      expect(target).toBeVisible();
      expect(target).toBeEnabled();
      return target;
    };
    const people = Array.from({ length: 17 }, (_, i) => ({
      id: `r${i + 1}`,
      name: `라이더${String(i + 1).padStart(2, "0")}`,
    }));
    const registrations = people.map((member, i) => person(member.id, i + 1));
    const teams = createInitialTeamDraft(registrations, 6).map((team) => ({
      ...team,
      capacity: 6,
      leaderId: team.memberIds[0],
    }));
    const save = vi.fn().mockResolvedValue(undefined);
    const meeting = { ...initial, registrations, teams };
    renderWithProviders(
      <MeetingTeams
        meeting={meeting}
        members={people}
        uid="r1"
        isHost
        revision={7}
        onSave={save}
        onReload={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(button("조편성 편집"));
    expect(
      screen
        .getAllByText("조 설정")
        .every((summary) => !summary.parentElement?.hasAttribute("open")),
    ).toBe(true);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    const choose = (n: number) =>
      fireEvent.click(
        screen.getByLabelText(`라이더${String(n).padStart(2, "0")} 선택`),
      );
    choose(1);
    choose(7);
    fireEvent.click(button("두 명 맞교환"));
    expect(
      within(screen.getByRole("region", { name: "1조" })).getByText("라이더07"),
    ).toBeInTheDocument();
    fireEvent.click(button("방금 조정 되돌리기"));
    expect(
      within(screen.getByRole("region", { name: "1조" })).getByText(
        "라이더01 · 나",
      ),
    ).toBeInTheDocument();
    choose(1);
    choose(7);
    fireEvent.click(button("두 명 맞교환"));
    fireEvent.click(within(screen.getByRole("region", { name: "1조", exact: true })).getByRole("button", { name: "라이더07 조장 지정" }));
    choose(2);
    fireEvent.click(button("3조로 이동"));
    expect(screen.getByLabelText("라이더02 선택")).not.toBeChecked();
    choose(8);
    choose(9);
    fireEvent.click(button("1조로 이동"));
    expect(
      screen.getByText(
        "이 조에 설정한 정원을 넘어요. 조 설정에서 정원을 바꾸거나 다른 조로 옮겨주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("라이더08 선택")).toBeChecked();
    expect(
      within(screen.getByRole("region", { name: "2조" })).getByText("라이더08"),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(button("변경 저장"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = save.mock.calls[0]![0] as NonNullable<Meeting["teams"]>;
    expect(saved.map((team) => team.memberIds.length)).toEqual([5, 6, 6]);
    expect(saved[0]!.leaderId).toBe("r7");
    expect(saved[1]!.leaderId).toBeUndefined();
    expect(new Set(saved.flatMap((team) => team.memberIds)).size).toBe(17);
  });
});

describe("조가 많거나 명단이 바뀌는 편집", () => {
  it("40조의 목적지는 공통 선택 하나로 제공하고 선택한 회원만 이동한다", async () => {
    // The boundary is 40 destinations; only selected, unselected and destination members
    // are needed here. Dense member reordering is covered by the 17-member case.
    const people = [
      { id: "many-0", name: "회원1" },
      { id: "stay", name: "출발조 미선택 회원" },
      { id: "many-39", name: "회원40" },
    ];
    const registrations = people.map((member, i) => person(member.id, i + 1));
    const teams = Array.from({ length: 40 }, (_, i) => ({
      id: `team-${i + 1}`,
      name: `${i + 1}조`,
      memberIds: i === 0 ? ["many-0", "stay"] : i === 39 ? ["many-39"] : [],
      capacity: 2,
    }));
    const save = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <MeetingTeams
        meeting={{ ...initial, registrations, teams }}
        members={people}
        uid="many-0"
        isHost
        revision={1}
        onSave={save}
        onReload={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const edit = screen.getByText("조편성 편집").closest<HTMLButtonElement>("button")!;
    expect(edit).toHaveRole("button");
    expect(edit).toHaveAccessibleName("조편성 편집");
    expect(edit).toBeVisible();
    fireEvent.click(edit);
    const firstTeamRegion = screen.getByLabelText("1조", { selector: "section" });
    expect(firstTeamRegion).toHaveRole("region");
    const firstTeam = within(firstTeamRegion);
    fireEvent.click(firstTeam.getByLabelText("회원1 선택"));
    const actions = within(
      screen.getByLabelText("선택한 회원 조정", { selector: "section" }),
    );
    expect(actions.getAllByRole("combobox")).toHaveLength(1);
    expect(
      actions.queryByRole("button", { name: "40조로 이동" }),
    ).not.toBeInTheDocument();
    const destination = actions.getByLabelText("목적 조 선택");
    expect(within(destination).getAllByRole("option")
      .filter(option => (option as HTMLOptionElement).value !== "")).toHaveLength(40);
    fireEvent.change(destination, {
      target: { value: "team-40" },
    });
    // 40조 전체 버튼의 접근성 이름을 반복 계산하지 않고 실제 조작 영역에서 찾는다.
    const moveButton = actions.getByText("선택한 조로 이동", { exact: true }).closest<HTMLButtonElement>("button")!;
    expect(moveButton).toHaveRole("button");
    expect(moveButton).toHaveAccessibleName("선택한 조로 이동");
    expect(moveButton).toBeVisible();
    expect(moveButton).toBeEnabled();
    fireEvent.click(moveButton);
    const saveButton = actions.getByText("변경 저장", { exact: true }).closest<HTMLButtonElement>("button")!;
    expect(saveButton).toHaveRole("button");
    expect(saveButton).toHaveAccessibleName("변경 저장");
    expect(saveButton).toBeVisible();
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    await waitFor(() => expect(save).toHaveBeenCalled());
    const saved = save.mock.calls[0]![0];
    expect(saved).toHaveLength(40);
    expect(saved[0].memberIds).toEqual(["stay"]);
    expect(saved[39].memberIds).toEqual(["many-39", "many-0"]);
    expect(saved.slice(1, 39)).toEqual(teams.slice(1, 39));
  });
  it("맞교환 후 취소자가 생기면 되돌리기를 잠그고 최신명단 반영 시 취소자와 이력을 제거한다", () => {
    const teams = createInitialTeamDraft(initial.registrations, 1);
    const view = renderWithProviders(wrap({ ...initial, teams }, 1, vi.fn()));
    fireEvent.click(screen.getByRole("button", { name: "조편성 편집" }));
    fireEvent.click(screen.getByLabelText("가람 선택"));
    fireEvent.click(screen.getByLabelText("보리 선택"));
    fireEvent.click(screen.getByRole("button", { name: "두 명 맞교환" }));
    const registrations = initial.registrations.map((member) =>
      member.memberId === "a"
        ? { ...member, status: "cancelled" as const }
        : member,
    );
    view.rerender(
      wrap(
        {
          ...initial,
          registrations,
          teams: [{ ...teams[0]!, memberIds: [] }, teams[1]!],
        },
        2,
        vi.fn(),
      ),
    );
    expect(
      screen.getByRole("button", { name: "방금 조정 되돌리기" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "최신 명단을 편집 내용에 반영" }),
    );
    expect(
      screen.queryByRole("button", { name: "방금 조정 되돌리기" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("가람 선택")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "1조" })).getByText("보리"),
    ).toBeInTheDocument();
  });
});

class TeamPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary = true;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
describe("자유 인원 드래그 조정과 취소 번복", () => {
  it("17명 6/6/5를 드래그로 7/5/5, 4/6/7로 조정하고 저장 전 되돌린다", async () => {
    vi.stubGlobal("PointerEvent", TeamPointerEvent);
    const people = Array.from({ length: 17 }, (_, i) => ({
      id: `free${i + 1}`,
      name: `자유${i + 1}`,
    }));
    const registrations = people.map((p, i) => person(p.id, i));
    const teams = createInitialTeamDraft(registrations, 6);
    const save = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <MeetingTeams
        meeting={{ ...initial, registrations, teams }}
        members={people}
        uid="free1"
        isHost
        revision={1}
        onSave={save}
        onReload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "조편성 편집" }));
    const drag = (id: number, target: string) => {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: vi.fn(() => screen.getByRole("region", { name: target })),
      });
      fireEvent.pointerDown(
        screen.getByRole("button", { name: `자유${id} 드래그로 이동` }),
        {
          button: 0,
          pointerId: 1,
          clientX: 10,
          clientY: 100,
          pointerType: "touch",
        },
      );
      fireEvent.pointerMove(window, {
        pointerId: 1,
        clientX: 100,
        clientY: 200,
      });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 200 });
    };
    const counts = () =>
      ["1조", "2조", "3조"].map(
        (group) =>
          within(screen.getByRole("region", { name: group })).getAllByRole(
            "checkbox",
          ).length,
      );
    drag(7, "1조");
    expect(counts()).toEqual([7, 5, 5]);
    expect(save).not.toHaveBeenCalled();
    drag(1, "2조");
    drag(2, "3조");
    drag(3, "3조");
    expect(counts()).toEqual([4, 6, 7]);
    fireEvent.click(screen.getByRole("button", { name: "방금 조정 되돌리기" }));
    expect(counts()).toEqual([5, 6, 6]);
    drag(3, "3조");
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(
      save.mock.calls[0]![0].map(
        (t: { capacity?: number; memberIds: string[] }) => [
          t.capacity,
          t.memberIds.length,
        ],
      ),
    ).toEqual([
      [undefined, 4],
      [undefined, 6],
      [undefined, 7],
    ]);
    vi.unstubAllGlobals();
  });
  it("같은 uid 취소·재신청의 새 참가 이력은 이전 조/조장/선택/되돌리기에 복원되지 않는다", () => {
    const teams = [
      { id: "one", name: "1조", leaderId: "a", memberIds: ["a", "b"] },
    ];
    const view = renderWithProviders(wrap({ ...initial, teams }, 1, vi.fn()));
    fireEvent.click(screen.getByRole("button", { name: "조편성 편집" }));
    fireEvent.click(screen.getByLabelText("가람 선택"));
    const registrations = initial.registrations.map((p) =>
      p.memberId === "a" ? { ...p, attendanceGeneration: "a:2" } : p,
    );
    view.rerender(
      wrap(
        {
          ...initial,
          registrations,
          teams: [{ ...teams[0]!, leaderId: undefined, memberIds: ["b"] }],
        },
        3,
        vi.fn(),
      ),
    );
    expect(
      within(screen.getByRole("region", { name: "1조" })).queryByLabelText(
        "가람 선택",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("가람 선택")).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "최신 명단을 편집 내용에 반영" }),
    );
    expect(
      within(screen.getByRole("region", { name: "1조" })).queryByText("가람"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "방금 조정 되돌리기" }),
    ).not.toBeInTheDocument();
  });
});

it("설정한 정원을 넘는 드래그는 거절하고 기존 배정과 조장을 유지한다", () => {
  vi.stubGlobal("PointerEvent", TeamPointerEvent);
  const teams = [
    { id: "one", name: "1조", memberIds: ["a"], leaderId: "a", capacity: 1 },
    { id: "two", name: "2조", memberIds: ["b"], capacity: 1 },
  ];
  renderWithProviders(wrap({ ...initial, teams }, 1, vi.fn()));
  fireEvent.click(screen.getByRole("button", { name: "조편성 편집" }));
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => screen.getByRole("region", { name: "2조" })),
  });
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "가람 드래그로 이동" }),
    { pointerId: 1, button: 0, clientX: 10, clientY: 100 },
  );
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 200 });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 200 });
  expect(
    within(screen.getByRole("region", { name: "1조" })).getByLabelText(
      "가람 선택",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "가람 조장 해제" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "이 조에 설정한 정원을 넘어요",
  );
  expect(
    screen.queryByRole("button", { name: "방금 조정 되돌리기" }),
  ).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});

it("drag ghost follows the held row through a body portal and never intercepts drop hit-testing", () => {
  vi.stubGlobal("PointerEvent", TeamPointerEvent);
  const teams = [
    { id: "one", name: "1조", memberIds: ["a"], leaderId: "a" },
    { id: "two", name: "2조", memberIds: ["b"] },
  ];
  const boardRender = vi.fn();
  const view = renderWithProviders(
    <Profiler id="teams" onRender={boardRender}>
      {wrap({ ...initial, teams }, 1, vi.fn())}
    </Profiler>,
  );
  fireEvent.click(screen.getByRole("button", { name: "조편성 편집" }));
  const handle = screen.getByRole("button", { name: "가람 드래그로 이동" });
  const row = handle.closest<HTMLElement>("[data-team-member]")!;
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 200,
    width: 300,
    height: 48,
  } as DOMRect);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => screen.getByRole("region", { name: "2조" })),
  });
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: 120,
    clientY: 215,
  });
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 220, clientY: 315 });
  const ghost = document.querySelector<HTMLElement>(".cp-team-drag-ghost")!;
  expect(ghost.parentElement).toBe(document.body);
  expect(view.container).not.toContainElement(ghost);
  expect(ghost).toHaveAttribute("aria-hidden", "true");
  expect(ghost).toHaveTextContent("가람");
  expect(ghost).toHaveTextContent("1조 · 조장");
  expect(ghost).toHaveTextContent("놓으면 이동 · 2조");
  expect(ghost.style.getPropertyValue("--team-drag-x")).toBe("200px");
  expect(ghost.style.getPropertyValue("--team-drag-y")).toBe("300px");
  expect(ghost.style.getPropertyValue("--team-drag-width")).toBe("300px");
  expect(row).toHaveAttribute("data-dragging", "true");
  expect(row).toBeInTheDocument();
  const renderCount = boardRender.mock.calls.length;
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 230, clientY: 350 });
  expect(boardRender).toHaveBeenCalledTimes(renderCount);
  expect(ghost.style.getPropertyValue("--team-drag-x")).toBe("210px");
  expect(ghost.style.getPropertyValue("--team-drag-y")).toBe("335px");
  fireEvent(window, new Event("blur"));
  expect(document.querySelector(".cp-team-drag-ghost")).toBeNull();
  expect(row).not.toHaveAttribute("data-dragging");
  vi.unstubAllGlobals();
});

it("17명 조 내 드래그 재정렬과 키보드 연속 위아래 이동은 조장·선택을 유지하고 순서대로 저장한다", async () => {
  vi.stubGlobal("PointerEvent", TeamPointerEvent);
  const control = (name: string) => {
    const target = screen.queryByLabelText(name, { selector: "button" })
      ?? screen.getByText(name, { exact: true }).closest<HTMLButtonElement>("button")!;
    expect(target).toHaveRole("button");
    expect(target).toHaveAccessibleName(name);
    expect(target).toBeVisible();
    return target;
  };
  const people = Array.from({ length: 17 }, (_, i) => ({
    id: `sort${i + 1}`,
    name: `정렬${i + 1}`,
  }));
  const registrations = people.map((p, i) => person(p.id, i));
  const teams = createInitialTeamDraft(registrations, 6).map((t) => ({
    ...t,
    leaderId: t.memberIds[0],
  }));
  const save = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <MeetingTeams
      meeting={{ ...initial, registrations, teams }}
      members={people}
      uid="sort1"
      isHost
      revision={1}
      onSave={save}
      onReload={vi.fn()}
    />,
  );
  fireEvent.click(control("조편성 편집"));
  const order = (group = "1조") => {
    const region = screen.getByLabelText(group, { selector: "section" });
    expect(region).toHaveRole("region");
    expect(region).toBeVisible();
    return [...region.querySelectorAll("[data-team-member]")]
      .map((row) => row.getAttribute("data-team-member"));
  };
  const target = screen
    .getByLabelText("정렬4 선택")
    .closest<HTMLElement>("[data-team-member]")!;
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    top: 200,
    height: 60,
  } as DOMRect);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => target),
  });
  const start = (id: string) =>
    fireEvent.pointerDown(
      control(`${id} 드래그로 이동`),
      { pointerId: 1, button: 0, clientX: 10, clientY: 100 },
    );
  start("정렬1");
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 250 });
  expect(target).toHaveAttribute("data-insert-side", "after");
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 250 });
  expect(order()).toEqual([
    "sort2",
    "sort3",
    "sort4",
    "sort1",
    "sort5",
    "sort6",
  ]);
  expect(
    control("정렬1 조장 해제"),
  ).toBeInTheDocument();
  fireEvent.click(control("방금 조정 되돌리기"));
  expect(order()).toEqual(teams[0]!.memberIds);
  fireEvent.click(screen.getByLabelText("정렬1 선택"));
  expect(control("정렬1 위로")).toBeDisabled();
  fireEvent.click(control("정렬1 아래로"));
  fireEvent.click(control("정렬1 아래로"));
  expect(order()).toEqual([
    "sort2",
    "sort3",
    "sort1",
    "sort4",
    "sort5",
    "sort6",
  ]);
  expect(screen.getByLabelText("정렬1 선택")).toBeChecked();
  fireEvent.click(control("정렬1 위로"));
  expect(order()[1]).toBe("sort1");
  fireEvent.click(control("변경 저장"));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]![0][0]).toEqual({
    ...teams[0],
    memberIds: ["sort2", "sort1", "sort3", "sort4", "sort5", "sort6"],
  });
  expect(
    save.mock.calls[0]![0].flatMap((t: { memberIds: string[] }) => t.memberIds),
  ).toHaveLength(17);
  vi.unstubAllGlobals();
});
