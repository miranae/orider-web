import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { mockCallableInvocations, mockSignInWithPopup, setCallableResult, setCallableImplementation, simulateLogin } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import GroupInvitePage from "./GroupInvitePage";
import koGroup from "../../i18n/resources/ko/group.json";

function renderInvite(route = "/ko/group/join/abcd1234", authenticated = true, isAnonymous = false) {
  return renderWithProviders(
    <Routes>
      <Route path="/ko/group/join/:code" element={<GroupInvitePage />} />
      <Route path="/ko/club/:groupId" element={<div>group destination</div>} />
      <Route path="/ko/clubs" element={<div>groups fallback</div>} />
    </Routes>,
    { route, authenticated, user: { isAnonymous } },
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

  it("keeps anonymous users on the invitation until a real login completes", async () => {
    setCallableResult("joinGroupByCode", { data: { groupId: "group-1", status: "active" } });
    renderInvite("/ko/group/join/original", true, true);
    expect(await screen.findByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "joinGroupByCode")).toEqual([]);
    act(() => simulateLogin({ uid: "real-user", isAnonymous: false }));
    expect(await screen.findByText("group destination")).toBeInTheDocument();
    expect(mockCallableInvocations).toContainEqual({ name: "joinGroupByCode", data: { inviteCode: "ORIGINAL" } });
  });

  it("keeps a failed invitation and retries the same code only on request", async () => {
    let calls = 0;
    setCallableImplementation("joinGroupByCode", () => {
      if (++calls === 1) throw Object.assign(new Error("offline"), { code: "functions/unavailable" });
      return { data: { groupId: "group-1", status: "active" } };
    });
    renderInvite();
    expect(await screen.findByRole("alert")).toHaveTextContent(koGroup["inviteLink.retryMessage"]);
    expect(screen.queryByText("groups fallback")).not.toBeInTheDocument();
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: koGroup["inviteLink.retry"] }));
    expect(await screen.findByText("group destination")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("ignores a completed join from the previous account", async () => {
    let resolve!: (value: unknown) => void;
    setCallableImplementation("joinGroupByCode", () => new Promise(done => { resolve = done; }));
    renderInvite();
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    act(() => simulateLogin({ uid: "anonymous-next", isAnonymous: true }));
    await act(async () => resolve({ data: { groupId: "old-group", status: "active" } }));
    expect(await screen.findByRole("button", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByText("group destination")).not.toBeInTheDocument();
  });

  it("leaves expired invitations visible with an explicit exit", async () => {
    setCallableImplementation("joinGroupByCode", () => { throw Object.assign(new Error("expired"), { code: "functions/not-found" }); });
    renderInvite();
    expect(await screen.findByRole("alert")).toHaveTextContent(koGroup["error.invalidInviteCode"]);
    expect(screen.queryByRole("button", { name: koGroup["inviteLink.retry"] })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: koGroup["subNav.groupList"] }));
    expect(await screen.findByText("groups fallback")).toBeInTheDocument();
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
