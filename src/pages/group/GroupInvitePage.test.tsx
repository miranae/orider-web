import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { mockCallableInvocations, mockSignInWithPopup, setCallableResult } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupInvitePage from "./GroupInvitePage";

function renderInvite(route = "/ko/group/join/abcd1234", authenticated = true) {
  return renderWithProviders(
    <Routes>
      <Route path="/ko/group/join/:code" element={<GroupInvitePage />} />
      <Route path="/ko/group/:groupId" element={<div>group destination</div>} />
      <Route path="/ko/groups" element={<div>groups fallback</div>} />
    </Routes>,
    { route, authenticated },
  );
}

describe("GroupInvitePage", () => {
  it("joins signed-in users with the invite code from the link", async () => {
    setCallableResult("joinGroupByCode", { data: { groupId: "group-1" } });

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

    expect(await screen.findByText("그룹 초대를 받았습니다")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
    expect(mockCallableInvocations).toEqual([]);
  });
});
