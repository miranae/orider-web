import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupsPage from "./GroupsPage";

const state = vi.hoisted(() => ({
  mobile: true,
  myGroups: [] as Array<Record<string, unknown>>,
  publicGroups: [] as Array<Record<string, unknown>>,
  pending: new Set<string>(),
  events: new Map<string, Record<string, unknown>>(),
}));

vi.mock("../../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../../hooks/useGroup", () => ({
  useGroupMemberRole: () => ({ role: "member", loading: false }),
  useMyGroups: () => ({ groups: state.myGroups, loading: false, error: null, incomplete: false, retry: vi.fn() }),
  usePendingGroupRequestIds: () => state.pending,
  usePublicGroups: () => ({ groups: state.publicGroups, loading: false, error: null, retry: vi.fn() }),
}));
vi.mock("../../hooks/useGroupNextEvents", () => ({
  useGroupNextEvents: () => ({ byGroup: new Map(), eventByGroup: state.events, incompleteGroups: new Set(), loading: false }),
}));
vi.mock("../../components/group/GroupRequestHistory", () => ({
  // 실제 컴포넌트는 기록이 없으면 행을 숨긴다 — 여기서는 받은 행 문구만 그대로 보인다.
  default: ({ row }: { row?: { label: string; count?: string } }) => <div data-testid="request-history">{row ? `${row.label}|${row.count ?? ""}` : "card"}</div>,
}));

function renderPage(route = "/ko/clubs") {
  return renderWithProviders(<Routes><Route path="/ko/clubs" element={<GroupsPage />} /></Routes>, { route, authenticated: true });
}

const DAY = 24 * 60 * 60 * 1000;

describe("GroupsPage phone layout (meetings first)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    state.mobile = true;
    state.myGroups = [
      { id: "ride", name: "미라내 라이딩", discipline: "bike", memberCount: 42 },
      { id: "run", name: "성북 러닝크루", discipline: "run", sports: ["run"], memberCount: 18 },
      { id: "quiet", name: "조용한 클럽", discipline: "bike", memberCount: 5 },
    ];
    state.publicGroups = [{ id: "other", name: "공개 클럽", discipline: "bike", memberCount: 9, visibility: "public" }];
    state.pending = new Set();
    const now = Date.now();
    state.events = new Map([
      ["run", { id: "e-run", groupId: "run", name: "한강 리커버리", startTime: now + 2 * DAY, meeting: false, registered: 8 }],
      ["ride", { id: "m-ride", groupId: "ride", name: "북악 업힐 정모", startTime: now + DAY, meeting: true, registered: 14 }],
    ]);
  });

  it("orders upcoming meetings by date with club name, participants and a join link to the detail", () => {
    renderPage();
    const upcoming = screen.getByRole("region", { name: "다가오는 모임" });
    const rows = within(upcoming).getAllByTestId("C0-5-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("북악 업힐 정모");
    expect(rows[0]).toHaveTextContent("미라내 라이딩 · 14명 참여");
    expect(within(rows[0]!).getByRole("link", { name: "참여" })).toHaveAttribute("href", "/ko/club/ride/meetings/m-ride");
    expect(within(rows[1]!).getByRole("link", { name: "참여" })).toHaveAttribute("href", "/ko/event/e-run");
  });

  it("lists my clubs as compact rows, collapses club search and drops the league card", () => {
    renderPage();
    const mine = screen.getByTestId("C0-1");
    expect(within(mine).getByRole("heading", { name: "내 클럽" })).toBeInTheDocument();
    expect(within(mine).getAllByTestId("C0-1-2").map((link) => link.getAttribute("href"))).toEqual(["/ko/club/ride", "/ko/club/run", "/ko/club/quiet"]);
    expect(within(mine).getByText("멤버 42명")).toBeInTheDocument();
    // 클럽 5개 미만이면 내 클럽 필터·검색을 두지 않는다.
    expect(screen.queryByTestId("C0-1-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("C0-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("C0-4")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "만들기" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "찾기" }));
    expect(screen.getByTestId("C0-2")).toHaveTextContent("클럽 찾기");
    expect(screen.getByText("공개 클럽")).toBeInTheDocument();
  });

  it("shows my club filters only from five clubs", () => {
    state.myGroups = Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, name: `클럽 ${index}`, discipline: "bike", memberCount: 3 }));
    renderPage();
    expect(screen.getByTestId("C0-1-1")).toBeInTheDocument();
  });

  it("keeps invite code as a row and hands the join-request row to the history, with a count only while pending", () => {
    const view = renderPage();
    expect(screen.queryByTestId("C0-3-1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /초대 코드 입력/ }));
    expect(screen.getByTestId("C0-3-1")).toBeInTheDocument();
    // 대기 0건이어도 기록 컴포넌트는 늘 붙어 있어 지난 신청(승인·거절·취소)을 열 수 있다.
    expect(screen.getByTestId("request-history")).toHaveTextContent("가입 신청|");
    view.unmount();

    state.pending = new Set(["a", "b"]);
    renderPage();
    expect(screen.getByTestId("request-history")).toHaveTextContent("가입 신청|2건");
  });

  it("opens club search directly when the address carries a search", () => {
    renderPage("/ko/clubs?q=%EA%B3%B5%EA%B0%9C");
    expect(screen.getByTestId("C0-2")).toBeInTheDocument();
  });

  it("puts club search first for a member without clubs and keeps the invite card", () => {
    state.myGroups = [];
    state.events = new Map();
    renderPage();
    expect(screen.queryByRole("region", { name: "다가오는 모임" })).not.toBeInTheDocument();
    expect(screen.getByTestId("C0-2")).toBeInTheDocument();
    expect(screen.getByTestId("C0-3-1")).toBeInTheDocument();
    expect(screen.queryByTestId("C0-4")).not.toBeInTheDocument();
  });

  it("leaves the desktop list unchanged", () => {
    state.mobile = false;
    renderPage();
    expect(screen.queryByRole("region", { name: "다가오는 모임" })).not.toBeInTheDocument();
    expect(screen.getByTestId("C0-2")).toBeInTheDocument();
    expect(screen.getByTestId("C0-4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "클럽 찾기" })).toBeInTheDocument();
  });
});
