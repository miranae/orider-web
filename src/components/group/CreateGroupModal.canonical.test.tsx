import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, mockWriteBatch, simulateLogin } from "../../__tests__/mocks/firebase";
import { getGroupInviteCode } from "../../features/group/groupInviteAdmin";
import groupStrings from "../../i18n/resources/ko/group.json";
import CreateGroupModal from "./CreateGroupModal";

const { alert } = vi.hoisted(() => ({ alert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: getCurrentUser() }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ alert }) }));
vi.mock("../../features/group/groupInviteAdmin", () => ({ getGroupInviteCode: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); simulateLogin({ uid: "creator" }); });
describe("canonical invite creation stages", () => {
  it("releases creation busy state without navigating an old account after issuance settles", async () => {
    const set = vi.fn();
    const commit = vi.fn().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({ set, commit, update: vi.fn() } as ReturnType<typeof mockWriteBatch>);
    let finish!: (value: { inviteCode: string; expiresAt: number; useLimit: number; useCount: number }) => void;
    vi.mocked(getGroupInviteCode).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const onCreated = vi.fn();
    const props = { open: true, onClose: vi.fn(), onCreated };
    const { rerender } = render(<CreateGroupModal {...props} />);
    fireEvent.change(screen.getByPlaceholderText(groupStrings["create.namePlaceholder"]), { target: { value: "QA Group" } });
    fireEvent.click(screen.getByRole("button", { name: groupStrings["create.next"] }));
    fireEvent.click(screen.getByRole("button", { name: groupStrings["create.next"] }));
    fireEvent.click(screen.getByRole("button", { name: groupStrings["create.submit"] }));
    await waitFor(() => expect(getGroupInviteCode).toHaveBeenCalledTimes(1));
    simulateLogin({ uid: "next-account" });
    rerender(<CreateGroupModal {...props} />);
    await act(async () => finish({ inviteCode: "ABCD-2345", expiresAt: Date.now() + 60_000, useLimit: 100, useCount: 0 }));
    expect(onCreated).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: groupStrings["create.submit"] })).toBeEnabled();
  });

  it("preserves atomic group creation and navigates even when lazy invite issuance fails", async () => {
    const set = vi.fn();
    const commit = vi.fn().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({ set, commit, update: vi.fn() } as ReturnType<typeof mockWriteBatch>);
    vi.mocked(getGroupInviteCode).mockRejectedValue(new Error("일시적인 통신 오류"));
    const onCreated = vi.fn();
    render(<CreateGroupModal open onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(groupStrings["create.namePlaceholder"]), { target: { value: "QA Group" } });
    fireEvent.click(screen.getByRole("button", { name: groupStrings["create.next"] }));
    fireEvent.click(screen.getByRole("button", { name: groupStrings["create.next"] }));
    fireEvent.click(screen.getByRole("button", { name: groupStrings["create.submit"] }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(3);
    expect(set.mock.calls[0][1]).not.toHaveProperty("inviteCode");
    expect(set.mock.calls[1][1]).toMatchObject({ userId: "creator", role: "leader" });
    expect(getGroupInviteCode).toHaveBeenCalledWith(onCreated.mock.calls[0][0]);
    expect(alert).toHaveBeenCalledWith(groupStrings["invite.createdNotReady"]);
  });
});
