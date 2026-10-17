import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ChallengeFeed from "./ChallengeFeed";
const state = vi.hoisted(() => ({joined: false, join: vi.fn(async () => {})}));
vi.mock("../../hooks/useMonthlyChallenge", () => ({
  MONTHLY_CHALLENGE_TIERS: [300, 500, 1000],
  useMonthlyChallenge: () => ({monthKey: "2026-10", loading: false, error: true, progress: null,
    participation: state.joined ? {tierKm: 300, joinedAt: 1} : null, joining: false, join: state.join}),
}));
beforeEach(() => {state.joined = false; vi.clearAllMocks();});
it("아직 월 합계가 없는 첫 달에도 참여할 수 있다", async () => {
  renderWithProviders(<ChallengeFeed part="monthly" />, {authenticated: true});
  const button = await screen.findByRole("button", {name: /300/});
  fireEvent.click(button);
  await waitFor(() => expect(state.join).toHaveBeenCalledWith(300));
});
it("참여한 사용자의 미확인 합계를 0 또는 재참여 선택으로 바꾸지 않는다", async () => {
  state.joined = true;
  renderWithProviders(<ChallengeFeed part="monthly" />, {authenticated: true});
  await waitFor(() => expect(screen.queryByRole("button", {name: /300/})).toBeNull());
  expect(screen.queryByRole("progressbar")).toBeNull();
});


it("uses standard DS sizing for all personal tier actions without joining on render", () => {
  renderWithProviders(<ChallengeFeed part="monthly" />, { authenticated: true });
  for (const tier of [300, 500, 1000]) {
    expect(screen.getByRole("button", { name: new RegExp(String(tier)) })).toHaveClass("ds-btn", "ds-btn--md");
  }
  expect(state.join).not.toHaveBeenCalled();
});
