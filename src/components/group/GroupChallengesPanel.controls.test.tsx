import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import i18n from "i18next";
import enGroup from "../../i18n/resources/en/group.json";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupChallengesPanel from "./GroupChallengesPanel";
import type { Group } from "@shared/types";

const mocks = vi.hoisted(() => ({ join: vi.fn(), groups: [{ id: "club", name: "A long English cycling club name kept intact" }] }));
vi.mock("../../hooks/useGroupChallenges", async original => ({
  ...await original<typeof import("../../hooks/useGroupChallenges")>(),
  useManagedGroups: () => mocks.groups,
  useGroupChallenges: () => ({ challenges: [{ id: "league", name: "Monthly league", monthKey: "2026-10", participantGroupIds: [], standings: [] }], loading: false, error: null }),
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
    expect(mocks.join).toHaveBeenCalledExactlyOnceWith({ challengeId: "league", groupId: "club" });
    await act(async () => complete());
    await waitFor(() => expect(screen.getByRole("button", { name: "Join", exact: true })).toBeEnabled());
    expect(select).toHaveTextContent(mocks.groups[0].name);
  } finally { await i18n.changeLanguage("ko"); }
});
