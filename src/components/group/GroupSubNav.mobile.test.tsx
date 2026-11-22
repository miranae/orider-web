import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupSubNav from "./GroupSubNav";
import type { Group } from "@shared/types";

vi.mock("../../hooks/useMobile", () => ({ useMobile: () => true }));

const bikeClub = { id: "group-1", name: "미라내 라이딩", description: "주말 라이딩", creatorId: "leader-1", memberCount: 42 } as Group;
const runClub = { ...bikeClub, sports: ["run"], discipline: "run" } as Group;

function show(group: Group, path: string, isCreator = false, pattern = "/:lang/club/:groupId/*") {
  return renderWithProviders(<Routes><Route path={pattern} element={<GroupSubNav group={group} isCreator={isCreator} compact />} /></Routes>, { route: path });
}

describe("GroupSubNav phone tabs", () => {
  it("shows three tabs and moves members, settings and share into the header menu", () => {
    show(bikeClub, "/ko/club/group-1", true);
    const tabs = screen.getAllByRole("link").filter((link) => ["모임", "소식", "활동"].includes(link.textContent ?? ""));
    expect(tabs.map((link) => link.textContent)).toEqual(["모임", "소식", "활동"]);
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute("href", "/ko/club/group-1/rides");
    expect(screen.queryByRole("link", { name: "공동 기록" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "함께한 이번 주" })).not.toBeInTheDocument();

    const menu = screen.getByRole("button", { name: "클럽 메뉴" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "멤버" })).toHaveAttribute("href", "/ko/club/group-1/members");
    expect(screen.getByRole("link", { name: "운영" })).toHaveAttribute("href", "/ko/club/group-1/settings");
    expect(screen.getByRole("button", { name: "공유" })).toBeInTheDocument();
  });

  it("gives running clubs the activity tab on the week address", () => {
    show(runClub, "/ko/club/group-1");
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute("href", "/ko/club/group-1/week");
    fireEvent.click(screen.getByRole("button", { name: "클럽 메뉴" }));
    expect(screen.queryByRole("link", { name: "운영" })).not.toBeInTheDocument();
  });

  it.each(["/rides", "/week", "/rides/ride-1"])("keeps the activity tab selected on %s", (page) => {
    show(bikeClub, `/ko/club/group-1${page}`);
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the embedded tabs and menu inside the club session", () => {
    show(bikeClub, "/ko/embed/clubs/group-1/news", false, "/:lang/embed/clubs/:groupId/*");
    expect(screen.getByRole("link", { name: "소식" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "활동" })).toHaveAttribute("href", "/ko/embed/clubs/group-1/rides");
    fireEvent.click(screen.getByRole("button", { name: "클럽 메뉴" }));
    expect(screen.getByRole("link", { name: "멤버" })).toHaveAttribute("href", "/ko/embed/clubs/group-1/members");
  });
});
