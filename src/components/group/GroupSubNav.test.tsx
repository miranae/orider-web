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
  it("provides one localized route back to the club list", () => {
    renderWithProviders(
      <Routes>
        <Route path="/:lang/club/:groupId" element={<GroupSubNav group={group} isCreator={false} />} />
      </Routes>,
      { route: "/ko/club/group-1" },
    );

    expect(screen.getByRole("navigation", { name: "클럽 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← 클럽 목록" })).toHaveAttribute("href", "/ko/clubs");
    expect(screen.queryByRole("link", { name: "전체 이벤트" })).not.toBeInTheDocument();
  });
  it("does not carry a members-only section to other tabs and preserves other query filters", () => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/members" element={<GroupSubNav group={group} isCreator />} /></Routes>,{route:"/ko/club/group-1/members?section=leadership&sport=bike"});
    expect(screen.getByRole("link",{name:"운영"})).toHaveAttribute("href","/ko/club/group-1/settings?sport=bike");
    expect(screen.getByRole("link",{name:"소식"})).toHaveAttribute("href","/ko/club/group-1/news?sport=bike");
  });
  it.each(["new", "meeting-1", "meeting-1/edit"])("keeps the meetings tab selected on %s without changing its list destination", (page) => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/*" element={<GroupSubNav group={group} isCreator />} /></Routes>, {route:`/ko/club/group-1/meetings/${page}?copyFrom=source-1&section=leadership&sport=bike&bike=road`});
    expect(screen.getByRole("link", {name:"모임"})).toHaveAttribute("aria-current","page");
    expect(screen.getByRole("link", {name:"모임"})).toHaveAttribute("href","/ko/club/group-1?sport=bike&bike=road");
    expect(screen.getByRole("link", {name:"소식"})).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", {name:"운영"})).toHaveAttribute("href","/ko/club/group-1/settings?sport=bike&bike=road");
  });
  it("preserves normal event and member tab matching", () => {
    const view=renderWithProviders(<Routes><Route path="/:lang/club/:groupId/*" element={<GroupSubNav group={group} isCreator={false}/>} /></Routes>,{route:"/ko/club/group-1/events"});
    expect(screen.getByRole("link",{name:"모임"})).toHaveAttribute("aria-current","page");view.unmount();
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/*" element={<GroupSubNav group={group} isCreator={false}/>} /></Routes>,{route:"/ko/club/group-1/members"});
    expect(screen.getByRole("link",{name:"모임"})).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link",{name:"멤버"})).toHaveAttribute("aria-current","page");
  });
  it.each(["", "/news", "/events", "/members", "/rides", "/week", "/settings", "/meetings/meeting-1"])("keeps club identity identical on %s", (page) => {
    renderWithProviders(<Routes><Route path="/:lang/club/:groupId/*" element={<GroupSubNav group={group} isCreator />} /></Routes>, {route:`/ko/club/group-1${page}`});
    expect(screen.getAllByRole("heading", {level:1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level:1})).toHaveTextContent(group.name);
    expect(screen.getByText(group.description!)).toBeInTheDocument();
    expect(screen.getByText("멤버 3명")).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"공유"})).toBeInTheDocument();
  });
  it("keeps the embedded news and meetings navigation inside the same club session", () => {
    renderWithProviders(<Routes><Route path="/:lang/embed/clubs/:groupId/*" element={<GroupSubNav group={group} isCreator={false} compact />} /></Routes>, { route: "/ko/embed/clubs/group-1/news" });
    expect(screen.getByRole("link", { name: "소식", exact: true })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "소식", exact: true })).toHaveAttribute("href", "/ko/embed/clubs/group-1/news");
    expect(screen.getByRole("link", { name: "모임", exact: true })).toHaveAttribute("href", "/ko/embed/clubs/group-1");
    expect(screen.queryByText(group.description!)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "모임 만들기" })).not.toBeInTheDocument();
  });

});
