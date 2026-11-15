import { FirebaseServicesProvider, type FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { auth, ensureAppCheckReady } from "../../services/firebase";
import { getCurrentUser, simulateLogin, mockCallableInvocations } from "../../__tests__/mocks/firebase";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableImplementation } from "../../__tests__/mocks/firebase";
import InviteMemberModal from "./InviteMemberModal";
vi.mock("../../contexts/AuthContext", () => ({useAuth:()=>({user:getCurrentUser()})}));

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../../services/publicProfiles", () => ({ searchPublicUserProfilesPage: (...args: unknown[]) => search(...args).then((value: unknown[] | { items: unknown[]; cursor: unknown; hasMore: boolean }) => Array.isArray(value) ? { items: value, cursor: null, hasMore: false } : value) }));

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

  it.each(["auth-only","context","app"])("does not dispatch an invite after %s account changes during App Check",async change=>{
    let ready!:()=>void;vi.mocked(ensureAppCheckReady).mockReturnValueOnce(new Promise<void>(resolve=>{ready=resolve;}));
    search.mockResolvedValue([person]);
    const services = { auth, firestore: {}, functions: {}, ensureAppCheckReady, getAppCheckToken: vi.fn() } as unknown as FirebaseServices;
    const tree = (value: FirebaseServices) => <FirebaseServicesProvider services={value}><InviteMemberModal {...props}/></FirebaseServicesProvider>;
    const view=render(tree(services));submit();
    fireEvent.click(await screen.findByRole("button",{name:"초대"}));
    if (change === "app") view.rerender(tree({ ...services, firestore: {} } as FirebaseServices));
    else {
      Object.assign(auth,{currentUser:{uid:"new-account"}});
      if(change==="context"){simulateLogin({uid:"new-account"});view.rerender(tree(services));}
    }
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


it("clears same-uid app search state and rejects a late old-app response", async () => {
  simulateLogin({ uid: "owner" });
  search.mockReset();
  const scoped = () => ({ auth: { currentUser: { uid: "owner" } }, firestore: {}, functions: {}, ensureAppCheckReady: vi.fn(), getAppCheckToken: vi.fn() }) as unknown as FirebaseServices;
  const first = scoped(), next = scoped();
  let finishOld!: (rows: unknown[]) => void;
  const oldCursor = { id: "old-app-cursor" };
  search.mockResolvedValueOnce({ items: [person], cursor: oldCursor, hasMore: true }).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce([{ ...person, nickname: "New app rider" }]);
  const view = render(<FirebaseServicesProvider services={first}><InviteMemberModal {...props} /></FirebaseServicesProvider>);
  submit(); await screen.findByText("Test Rider");
  fireEvent.click(screen.getByRole("button", { name: /더 보기|더보기/ }));
  expect(search.mock.calls[1]?.[1]).toBe(oldCursor);
  view.rerender(<FirebaseServicesProvider services={next}><InviteMemberModal {...props} /></FirebaseServicesProvider>);
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.queryByText("Test Rider")).not.toBeInTheDocument();
  await act(async () => finishOld([{ ...person, nickname: "Late old app rider" }]));
  expect(screen.queryByText("Late old app rider")).not.toBeInTheDocument();
  submit(); await screen.findByText("New app rider");
  expect(search.mock.calls.at(-1)).toEqual(["Test", null, undefined, undefined, next.firestore]);
});
