import { screen } from "@testing-library/react";
import HubSubNav from "./HubSubNav";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("HubSubNav", () => {
  it("renders the four coach tabs in specification order", () => {
    renderWithProviders(<HubSubNav hubKey="coach" />, { route: "/fitness" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["컨디션", "계획", "목표", "대화"]);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/ko/fitness", "/ko/plan", "/ko/goal-setup", "/ko/coach"]);
  });

  it("renders explore destinations without the removed leaderboard tab", () => {
    renderWithProviders(<HubSubNav hubKey="explore" />, { route: "/courses" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["코스", "세그먼트", "이벤트", "챌린지"]);
  });

  it("renders only board and recipes under community", () => {
    renderWithProviders(<HubSubNav hubKey="community" />, { route: "/board" });
    expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["게시판", "레시피"]);
  });

  it.each(["home", "club"] as const)("does not show subtabs for %s", hubKey => {
    renderWithProviders(<HubSubNav hubKey={hubKey} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
