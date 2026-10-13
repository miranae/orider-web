import { screen } from "@testing-library/react";
import HubSubNav from "./HubSubNav";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("HubSubNav", () => {
  it("renders the four coach tabs in specification order", () => {
    renderWithProviders(<HubSubNav hubKey="coach" />, { route: "/coach/condition" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["컨디션", "계획", "목표", "대화"]);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/ko/coach/condition", "/ko/coach/plan", "/ko/coach/goals", "/ko/coach/chat"]);
  });

  it("renders explore destinations without the removed leaderboard tab", () => {
    renderWithProviders(<HubSubNav hubKey="explore" />, { route: "/explore/courses" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["코스", "세그먼트", "이벤트", "챌린지", "레시피"]);
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
