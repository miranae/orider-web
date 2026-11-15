import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import i18n from "i18next";
import enGroup from "../../i18n/resources/en/group.json";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupChallengesPanel from "./GroupChallengesPanel";
import type { Group } from "@shared/types";

const mocks = vi.hoisted(() => ({ join: vi.fn(), groups: [{ id: "club", name: "A long English cycling club name kept intact" }], empty: false }));
vi.mock("../../hooks/useGroupChallenges", async original => ({
  ...await original<typeof import("../../hooks/useGroupChallenges")>(),
  useManagedGroups: () => mocks.groups,
  useGroupChallenges: () => ({ challenges: mocks.empty ? [] : [{ id: "league", name: "Monthly league", monthKey: "2026-10", participantGroupIds: [], standings: [] }], loading: false, error: null }),
  joinGroupChallenge: mocks.join,
}));

it("keeps Join and Joining in the same standard DS size and preserves the selected club", async () => {
  let complete!: () => void;
  mocks.join.mockReturnValue(new Promise<void>(resolve => { complete = resolve; }));
  i18n.addResourceBundle("en", "group", enGroup, true, true);
  await i18n.changeLanguage("en");
  try {
    renderWithProviders(<GroupChallengesPanel userId="test-uid" groups={mocks.groups as Group[]} />, { authenticated: true });
    const select = screen.getByRole("combobox", { name: "Club you manage" });
    expect(select).toHaveTextContent(mocks.groups[0].name);
    const join = screen.getByRole("button", { name: "Join", exact: true });
    expect(join).toHaveClass("ds-btn", "ds-btn--md");
    fireEvent.click(join);
    const busy = screen.getByRole("button", { name: "Joining…" });
    expect(busy).toHaveClass("ds-btn", "ds-btn--md");
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(mocks.join).toHaveBeenCalledExactlyOnceWith({ challengeId: "league", groupId: "club" }, expect.anything());
    await act(async () => complete());
    await waitFor(() => expect(screen.getByRole("button", { name: "Join", exact: true })).toBeEnabled());
    expect(select).toHaveTextContent(mocks.groups[0].name);
  } finally { await i18n.changeLanguage("ko"); }
});

it("opens the collapsed create form and focuses the name when a manager taps the empty-league message", () => {
  mocks.empty = true;
  try {
    renderWithProviders(<GroupChallengesPanel userId="test-uid" groups={mocks.groups as Group[]} />, { authenticated: true });
    const details = document.querySelector("details.challenge-create-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    // 접힌 <details> 안 버튼도 세도록 hidden 까지 포함해 전체 버튼 수를 비교한다(새 버튼이 생기지 않았는지).
    const buttonsBefore = screen.getAllByRole("button", { hidden: true }).length;
    fireEvent.click(screen.getByText("이번 달에 열린 클럽 리그가 없습니다."));
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(details.querySelector("input"));
    expect(screen.getAllByRole("button", { hidden: true }).length).toBe(buttonsBefore);
  } finally { mocks.empty = false; }
});
