import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { mockCallableInvocations, mockSignInWithPopup, setCallableResult } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupInvitePage from "./GroupInvitePage";
import koGroup from "../../i18n/resources/ko/group.json";

function renderInvite(route = "/ko/group/join/abcd1234", authenticated = true) {
  return renderWithProviders(
    <Routes>
      <Route path="/ko/group/join/:code" element={<GroupInvitePage />} />
      <Route path="/ko/club/:groupId" element={<div>group destination</div>} />
      <Route path="/ko/clubs" element={<div>groups fallback</div>} />
    </Routes>,
    { route, authenticated },
  );
}

describe("GroupInvitePage", () => {
  it.each([true, false])("shows a usable fallback for a blank normalized code (signed in: %s)", async authenticated => {
    renderInvite("/ko/group/join/%20%20", authenticated);
    expect(await screen.findByText(koGroup["error.invalidInviteCode"])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: koGroup["subNav.groupList"] })).toHaveAttribute("href", "/ko/clubs");
    expect(mockCallableInvocations.filter(call => call.name === "joinGroupByCode")).toEqual([]);
    expect(screen.queryByText(koGroup["inviteLink.joining"])).not.toBeInTheDocument();
  });

  it("joins signed-in users with the invite code from the link", async () => {
    setCallableResult("joinGroupByCode", { data: { groupId: "group-1", status: "active" } });

    renderInvite();

    await waitFor(() => {
      expect(mockCallableInvocations).toContainEqual({
        name: "joinGroupByCode",
        data: { inviteCode: "ABCD1234" },
      });
    });
    expect(await screen.findByText("group destination")).toBeInTheDocument();
  });

  it("keeps signed-out users on a login prompt and continues after auth", async () => {
    renderInvite("/ko/group/join/abcd1234", false);

    expect(await screen.findByText(koGroup["inviteLink.title"])).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(await screen.findByTestId("A1-1-1"));

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockCallableInvocations).toEqual([]);
  });

  it("does not enter the group dashboard when the invite requires manual approval", async () => {
    setCallableResult("joinGroupByCode", { data: { groupId: "group-1", status: "pending" } });

    renderInvite();

    await waitFor(() => {
      expect(mockCallableInvocations).toContainEqual({
        name: "joinGroupByCode",
        data: { inviteCode: "ABCD1234" },
      });
    });
    expect(await screen.findByText("groups fallback")).toBeInTheDocument();
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
  });
});
