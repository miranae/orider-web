import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupSubNav from "./GroupSubNav";
import type { Group } from "@shared/types";

const group = {
  id: "group-1",
  name: "테스트 그룹",
  description: "함께 달리는 그룹",
  creatorId: "leader-1",
  memberCount: 3,
} as Group;

describe("GroupSubNav", () => {
  it("provides localized routes back to the group and event lists", () => {
    renderWithProviders(
      <Routes>
        <Route path="/:lang/club/:groupId" element={<GroupSubNav group={group} isCreator={false} />} />
      </Routes>,
      { route: "/ko/club/group-1" },
    );

    expect(screen.getByRole("navigation", { name: "클럽 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 클럽 목록" })).toHaveAttribute("href", "/ko/clubs");
    expect(screen.getByRole("link", { name: "전체 이벤트" })).toHaveAttribute("href", "/ko/explore/events");
  });
  it("does not carry a members-only section to other tabs and preserves other query filters", () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/members" element={<GroupSubNav group={group} isCreator />} /></Routes>,{route:"/ko/club/group-1/members?section=leadership&sport=bike"});
    expect(screen.getByRole("link",{name:"운영"})).toHaveAttribute("href","/ko/club/group-1/settings?sport=bike");
    expect(screen.getByRole("link",{name:"소식"})).toHaveAttribute("href","/ko/club/group-1?sport=bike");
  });
  it("keeps a single club heading and can defer its description to the dashboard", () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId" element={<GroupSubNav group={group} isCreator={false} showDescription={false} />} /></Routes>, { route: "/ko/club/group-1" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(group.description!)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공유" })).toBeInTheDocument();
  });
});
