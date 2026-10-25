import { embeddedCommentId } from "../commentTarget";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicActivityBrowser from "./PublicActivityBrowser";
const mocks = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "viewer" } } }, listeners: [] as (() => void)[], detailProps: vi.fn(), load: vi.fn() }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: () => void) => { mocks.listeners.push(callback); return () => { mocks.listeners = mocks.listeners.filter(fn => fn !== callback); }; } }));
vi.mock("../../services/activityDiscovery", () => ({ loadActivityDiscovery: mocks.load }));
vi.mock("./PublicActivitySurface", () => ({ default: (props: { activityId: string; initialDetail?: unknown }) => { mocks.detailProps(props); const { activityId } = props; return <div><span>detail:{activityId}</span><a href="/ko/athlete/author">author</a><a href="/ko/athlete/commenter">comment author</a><a href="/ko/settings">settings</a></div>; } }));
vi.mock("../../components/notifications/NotificationCommentTarget", () => ({ NotificationCommentTarget: ({ activityId, commentId }: { activityId: string; commentId: string }) => <div>target:{activityId}:{commentId}</div> }));
const row = { id: "public-ride", userId: "author", nickname: "Public Rider", profileImage: null, description: "Public Ride" };
const props = { activityId: "original", retryKey: 0, embedded: true, onReady: vi.fn(), onError: vi.fn() };
beforeEach(() => { mocks.services = { auth: { currentUser: { uid: "viewer" } } }; mocks.listeners = []; mocks.load.mockReset().mockResolvedValue({ items: [row], nextCursor: null }); });
afterEach(cleanup);
describe("embedded public profile navigation", () => {
  it("binds the notification target only to the initial activity and re-mounts it on return", async () => {
    render(<PublicActivityBrowser {...props} commentId="outside-preview" />);
    expect(screen.getByText("target:original:outside-preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "author" }));
    await screen.findByText("Public Rider");
    expect(screen.queryByText(/target:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Public Ride" }));
    expect(screen.queryByText(/target:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    await screen.findByText("Public Rider");
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(screen.getByText("target:original:outside-preview")).toBeInTheDocument();
  });
  it("strictly parses the explicit embed commentId contract", () => {
    expect(embeddedCommentId(new URLSearchParams("commentId=c_25-ABC"))).toBe("c_25-ABC");
    expect(embeddedCommentId(new URLSearchParams("comment=legacy"))).toBeNull();
    for (const query of ["commentId=", "commentId=a&commentId=b", "commentId=%2Fother", "commentId=%252Fother", "commentId=..", `commentId=${"a".repeat(201)}`]) {
      expect(embeddedCommentId(new URLSearchParams(query))).toBe("");
    }
  });
  it.each(["author", "comment author"])("opens %s through injected discovery and returns to original detail", async label => {
    render(<PublicActivityBrowser {...props} />);
    fireEvent.click(screen.getByRole("link", { name: label }));
    await screen.findByText("Public Rider");
    expect(mocks.load).toHaveBeenCalledWith(mocks.services, { scope: "athlete", targetUid: label === "author" ? "author" : "commenter", limit: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Public Ride" }));
    expect(screen.getByText("detail:public-ride")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    await screen.findByText("Public Rider");
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(screen.getByText("detail:original")).toBeInTheDocument();
  });
  it("does not expose blocked profile data or fall back to raw profiles", async () => {
    mocks.load.mockResolvedValue({ items: [], nextCursor: null });
    render(<PublicActivityBrowser {...props} />);
    fireEvent.click(screen.getByRole("link", { name: "author" }));
    await screen.findByText("표시할 공개 활동이 없습니다.");
    expect(screen.queryByText("Public Rider")).not.toBeInTheDocument();
  });
  it("discards a delayed response after same-UID SDK replacement", async () => {
    let finish!: (value: unknown) => void;
    mocks.load.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<PublicActivityBrowser {...props} />);
    fireEvent.click(screen.getByRole("link", { name: "author" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalled());
    act(() => { mocks.services.auth.currentUser = { uid: "viewer" }; mocks.listeners.slice().forEach(fn => fn()); });
    await act(async () => finish({ items: [row], nextCursor: null }));
    expect(screen.queryByText("Public Rider")).not.toBeInTheDocument();
    expect(screen.getByText("detail:original")).toBeInTheDocument();
  });
  it("never reuses preflight detail when returning from a profile", async () => {
    const initialDetail = { activity: { id: "original" } } as never;
    render(<PublicActivityBrowser {...props} initialDetail={initialDetail} />);
    expect(mocks.detailProps.mock.lastCall?.[0].initialDetail).toBe(initialDetail);
    fireEvent.click(screen.getByRole("link", { name: "author" }));
    await screen.findByText("Public Rider");
    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(mocks.detailProps.mock.lastCall?.[0].initialDetail).toBeUndefined();
    props.onError.mockClear(); props.onReady.mockClear();
    mocks.detailProps.mock.lastCall?.[0].onError("activity_load_failed");
    mocks.detailProps.mock.lastCall?.[0].onReady();
    expect(props.onError).not.toHaveBeenCalled();
    expect(props.onReady).not.toHaveBeenCalled();
  });
  it("clears the profile when the injected Firebase app is replaced", async () => {
    const view = render(<PublicActivityBrowser {...props} />);
    fireEvent.click(screen.getByRole("link", { name: "author" }));
    await screen.findByText("Public Rider");
    mocks.services = { auth: { currentUser: { uid: "viewer" } } };
    view.rerender(<PublicActivityBrowser {...props} />);
    expect(screen.queryByText("Public Rider")).not.toBeInTheDocument();
    expect(screen.getByText("detail:original")).toBeInTheDocument();
  });
  it("clears previous rows when a continuation loses access", async () => {
    mocks.load.mockResolvedValueOnce({ items: [row], nextCursor: "next" }).mockRejectedValueOnce(new Error("permission-denied"));
    render(<PublicActivityBrowser {...props} />);
    fireEvent.click(screen.getByRole("link", { name: "author" }));
    await screen.findByText("Public Rider");
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Public Rider")).not.toBeInTheDocument();
  });
  it("reports unsupported destinations without silent native acceptance", () => {
    render(<PublicActivityBrowser {...props} />);
    fireEvent.click(screen.getByRole("link", { name: "settings" }));
    expect(screen.getByRole("status")).toHaveTextContent("이 화면에서 지원하지 않는 이동입니다.");
  });
});
