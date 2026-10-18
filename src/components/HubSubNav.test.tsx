import { screen } from "@testing-library/react";
import HubSubNav from "./HubSubNav";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("HubSubNav", () => {
  it("renders the six coach tabs in specification order", () => {
    renderWithProviders(<HubSubNav hubKey="coach" />, { route: "/coach/condition" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["훈련 상태", "오늘 운동", "계획", "목표", "분석", "대화"]);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/ko/coach/condition", "/ko/coach/today", "/ko/coach/plan", "/ko/coach/goals", "/ko/coach/analysis", "/ko/coach/chat"]);
  });

  it("preserves sport alone on every coach transition", () => {
    renderWithProviders(<HubSubNav hubKey="coach" />, { route: "/coach/today?sport=run&date=2026-10-14" });
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/\?sport=run$/);
      expect(link.getAttribute("href")).not.toContain("date=");
    }
  });

  it("renders explore destinations without the removed leaderboard tab", () => {
    renderWithProviders(<HubSubNav hubKey="explore" />, { route: "/explore/courses" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["코스", "세그먼트", "이벤트", "챌린지", "기록 활용"]);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/ko/explore/courses", "/ko/explore/segments", "/ko/explore/events", "/ko/explore/challenges", "/ko/explore/recipes"]);
  });

  it("renders nothing for the board hub (single screen, no subtabs)", () => {
    renderWithProviders(<HubSubNav hubKey="community" />, { route: "/community/board" });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it.each(["home", "club"] as const)("does not show subtabs for %s", hubKey => {
    renderWithProviders(<HubSubNav hubKey={hubKey} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
