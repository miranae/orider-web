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
        <Route path="/:lang/group/:groupId" element={<GroupSubNav group={group} isCreator={false} />} />
      </Routes>,
      { route: "/ko/group/group-1" },
    );

    expect(screen.getByRole("navigation", { name: "그룹 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 그룹 목록" })).toHaveAttribute("href", "/ko/groups");
    expect(screen.getByRole("link", { name: "전체 이벤트" })).toHaveAttribute("href", "/ko/events");
  });
});
