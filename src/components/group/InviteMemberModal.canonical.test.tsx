import { getCurrentUser, simulateLogin } from "../../__tests__/mocks/firebase";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InviteMemberModal from "./InviteMemberModal";
vi.mock("../../contexts/AuthContext", () => ({useAuth:()=>({user:getCurrentUser()})}));

describe("InviteMemberModal canonical invite", () => {
  beforeEach(() => {simulateLogin({uid:"owner"});vi.mocked(navigator.clipboard.writeText).mockClear();});

  it("keeps the member invite dialog usable while a legacy group has no invite code", async () => {
    const props = {
      open: true,
      onClose: vi.fn(),
      groupId: "canonical-only-group",
      inviteCode: undefined as unknown as string,
      inviteStatus: "loading",
      onRetry: vi.fn(),
    };
    const view = render(<InviteMemberModal {...props} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "복사" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox",{name:/닉네임/})).toBeInTheDocument();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

    view.rerender(<InviteMemberModal {...props} inviteCode="ABCD-2345" inviteStatus="ready" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "복사" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/ko/group/join/ABCD-2345`,
    ));
  });
});
