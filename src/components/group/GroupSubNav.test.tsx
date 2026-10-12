import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupSubNav from "./GroupSubNav";
import type { Group } from "@shared/types";
import { useGroupMemberRole, useMyGroups } from "../../hooks/useGroup";

vi.mock("../../hooks/useGroup", () => ({
  useGroupMemberRole: vi.fn(),
  useMyGroups: vi.fn(),
}));

const group = {
  id: "group-1",
  name: "테스트 그룹",
  description: "함께 달리는 그룹",
  creatorId: "leader-1",
  memberCount: 3,
} as Group;

describe("GroupSubNav", () => {
  beforeEach(() => {
    vi.mocked(useGroupMemberRole).mockReturnValue({ role: "co-leader", loading: false });
    vi.mocked(useMyGroups).mockReturnValue({ groups: [group], loading: false, error: null, retry: vi.fn() });
  });

  it("provides localized routes back to the group and event lists", () => {
    renderWithProviders(
      <Routes>
        <Route path="/:lang/group/:groupId" element={<GroupSubNav group={group} isCreator={false} />} />
      </Routes>,
      { route: "/ko/group/group-1" },
    );

    expect(screen.getByRole("navigation", { name: "그룹 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 그룹 목록" })).toHaveAttribute("href", "/ko/groups");
    expect(screen.getByRole("link", { name: "모임·참가" })).toHaveAttribute("href", "/ko/events");
    expect(screen.getByRole("link", { name: "그룹 소식" })).toHaveAttribute("href", "/ko/group/group-1");
    expect(screen.getByRole("link", { name: "함께한 기록" })).toHaveAttribute("href", "/ko/group/group-1/rides");
    expect(screen.getByRole("link", { name: "회원·운영" })).toHaveAttribute("href", "/ko/group/group-1/members");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("부리더")).not.toBeInTheDocument();
  });

  it.each(["rides", "leaderboard", "members", "settings", ""])("switches clubs from the %s tab without carrying settings permissions", async (tab) => {
    const otherGroup = { ...group, id: "group-2", name: "다른 그룹", creatorId: "someone-else" };
    vi.mocked(useMyGroups).mockReturnValue({ groups: [group, otherGroup], loading: false, error: null, retry: vi.fn() });
    function GroupRoute() {
      const { pathname } = useLocation();
      return <><GroupSubNav group={group} isCreator /><output aria-label="current path">{pathname}</output></>;
    }
    renderWithProviders(
      <Routes><Route path="/:lang/group/:groupId/*" element={<GroupRoute />} /></Routes>,
      { route: `/ko/group/group-1${tab ? `/${tab}` : ""}`, authenticated: true },
    );
    expect(await screen.findByText("부리더")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "다른 동호회" }), { target: { value: "group-2" } });
    const targetTab = tab && tab !== "settings" ? `/${tab}` : "";
    expect(screen.getByLabelText("current path")).toHaveTextContent(`/ko/group/group-2${targetTab}`);
  });

  it("shows the creator role when the membership document has no active role", async () => {
    vi.mocked(useGroupMemberRole).mockReturnValue({ role: null, loading: false });
    renderWithProviders(
      <Routes><Route path="/:lang/group/:groupId" element={<GroupSubNav group={group} isCreator />} /></Routes>,
      { route: "/ko/group/group-1", authenticated: true },
    );
    expect(await screen.findByText("리더")).toBeInTheDocument();
  });

  it("hides the switcher for a signed-in user with only one group", async () => {
    renderWithProviders(
      <Routes><Route path="/:lang/group/:groupId" element={<GroupSubNav group={group} isCreator={false} />} /></Routes>,
      { route: "/ko/group/group-1", authenticated: true },
    );
    expect(await screen.findByText("부리더")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
