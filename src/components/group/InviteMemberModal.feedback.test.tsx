import { auth, ensureAppCheckReady } from "../../services/firebase";
import { getCurrentUser, simulateLogin, mockCallableInvocations } from "../../__tests__/mocks/firebase";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableImplementation } from "../../__tests__/mocks/firebase";
import InviteMemberModal from "./InviteMemberModal";
vi.mock("../../contexts/AuthContext", () => ({useAuth:()=>({user:getCurrentUser()})}));

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../../services/publicProfiles", () => ({ searchPublicUserProfilesPage: (...args: unknown[]) => search(...args).then((items: unknown[]) => ({ items, cursor: null, hasMore: false })) }));

const props = { open: true, onClose: vi.fn(), groupId: "club-a", inviteCode: "CODE", inviteStatus: "ready", onRetry: vi.fn() };
const person = { id: "rider", nickname: "Test Rider", photoURL: null };
function submit() {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Test" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
}

describe("InviteMemberModal feedback and context", () => {
  beforeEach(() => {simulateLogin({uid:"owner"});search.mockReset();vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);mockCallableInvocations.length=0;});

  it("distinguishes a failed search from an empty successful search", async () => {
    search.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    render(<InviteMemberModal {...props} />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("멤버를 검색하지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByRole("status")).toHaveTextContent("일치하는 멤버가 없어요");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a previous group's in-flight search and clears state on reopen", async () => {
    let resolve!: (value: unknown[]) => void;
    search.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce([person]);
    const view = render(<InviteMemberModal {...props} />);
    submit();
    view.rerender(<InviteMemberModal {...props} groupId="club-b" />);
    await act(async () => resolve([person]));
    expect(screen.queryByText("Test Rider")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
    submit();
    expect(await screen.findByText("Test Rider")).toBeInTheDocument();
    view.rerender(<InviteMemberModal {...props} groupId="club-b" open={false} />);
    view.rerender(<InviteMemberModal {...props} groupId="club-b" />);
    expect(screen.queryByText("Test Rider")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it.each(["auth-only","context"])("does not dispatch an invite after %s account changes during App Check",async change=>{
    let ready!:()=>void;vi.mocked(ensureAppCheckReady).mockReturnValueOnce(new Promise<void>(resolve=>{ready=resolve;}));
    search.mockResolvedValue([person]);const view=render(<InviteMemberModal {...props}/>);submit();
    fireEvent.click(await screen.findByRole("button",{name:"초대"}));
    Object.assign(auth,{currentUser:{uid:"new-account"}});
    if(change==="context"){simulateLogin({uid:"new-account"});view.rerender(<InviteMemberModal {...props}/>);}
    await act(async()=>ready());
    expect(mockCallableInvocations.filter(call=>call.name==="inviteToGroup")).toHaveLength(0);
  });
  it("shows invitation failures so the user can retry", async () => {
    search.mockResolvedValue([person]);
    setCallableImplementation("inviteToGroup", () => { throw new Error("unavailable"); });
    render(<InviteMemberModal {...props} />);
    submit();
    fireEvent.click(await screen.findByRole("button", { name: "초대" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("초대하지 못했어요");
    expect(screen.getByRole("button", { name: "초대" })).toBeEnabled();
  });
});
