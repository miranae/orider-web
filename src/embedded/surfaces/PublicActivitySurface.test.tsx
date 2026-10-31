import { auth } from "../../services/firebase";
import { track } from "../../services/analytics";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePublicActivitySession, type PublicActivitySessionOptions } from "../../hooks/usePublicActivitySession";
import PublicActivitySafety from "./PublicActivitySafety";
// Controller probe: rendering is separately covered by the existing ActivityPage tests.
function PublicActivitySurface(props: PublicActivitySessionOptions) {
  const session = usePublicActivitySession(props);
  const { detail } = session;
  if (session.removed) return <p tabIndex={-1} ref={node => node?.focus()}>{session.removed.action === "hide" ? "이 활동을 숨겼습니다." : "작성자를 차단했습니다."}</p>;
  if (!detail || detail.activity.id !== props.activityId || session.loading || session.failed) return <button onClick={session.retry}>다시 시도</button>;
  return <><h1>{detail.activity.description}</h1><p>{detail.content.memo}</p>
    {session.mapFresh && session.verifiedMap?.value?.imageUrl && <img alt="라이딩 경로" src={session.verifiedMap.value.imageUrl} />}
    {!session.mapFresh && <button onClick={session.retry}>연결 다시 확인</button>}
    <textarea value={session.text} onChange={event => session.setText(event.target.value)} />
    <button disabled={session.busy} onClick={() => { void session.mutate("kudos"); }}>{detail.viewerHasKudos ? "좋아요 취소" : "좋아요"} · {detail.activity.kudosCount}</button>
    <button disabled={session.busy} onClick={() => { void session.mutate("comment"); }}>등록</button>
    {session.mutationError && <p role="alert">실패</p>}
    {session.user?.uid !== detail.activity.userId && <PublicActivitySafety activityId={props.activityId} authorId={detail.activity.userId} client={session.client} onRemoved={session.remove} onAccessRevoked={session.revokeAccess} />}
  </>;
}
import type { PublicActivityDetail } from "../../services/publicActivityDetail";

vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
const render = (element: ReactElement) => rtlRender(element, { wrapper: MemoryRouter });
const authState = vi.hoisted(() => ({ uid: "viewer" }));
const mocks = vi.hoisted(() => ({ load: vi.fn(), setKudos: vi.fn(), postComment: vi.fn(), hideActivity: vi.fn(), blockAuthor: vi.fn(), reportActivity: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: authState.uid, isAnonymous: false } }) }));
vi.mock("../../services/publicActivityDetail", () => ({ isPublicActivityAccessError: (error: { code?: string }) => ["functions/permission-denied", "functions/not-found", "functions/failed-precondition"].includes(error.code ?? ""), createPublicActivityClient: () => ({ ...mocks }) }));
const fixture = (): PublicActivityDetail => ({
  activity: { id: "native-ride", userId: "owner", nickname: "라이더", profileImage: null,
    description: "한강 라이딩", type: "Ride", startTime: 1792800000000, kudosCount: 2, commentCount: 0,
    summary: { distance: 45000, ridingTimeMillis: 7200000, elevationGain: 88 },
    effectiveFacts: { status: "canonical", metrics: { distanceKm: 44.8, durationSec: 7000, elevationGainM: null } } },
  viewerHasKudos: false, content: { status: "ready", activityId: "native-ride", comments: [], memo: "바람이 좋았어요", photos: [] },
});
const props = { activityId: "native-ride", retryKey: 0, onReady: vi.fn(), onError: vi.fn() };
afterEach(cleanup);
beforeEach(() => { authState.uid = "viewer"; vi.clearAllMocks(); mocks.load.mockResolvedValue(fixture()); mocks.setKudos.mockResolvedValue({ enabled: true }); mocks.postComment.mockResolvedValue({ commentId: "new" }); });
describe("authorized activity session controller", () => {
  it("preserves comment text on failure and reads back after confirmed success", async () => {
    mocks.postComment.mockRejectedValueOnce(new Error("offline"));
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "함께 타요" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("alert");
    expect(input).toHaveValue("함께 타요");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(mocks.postComment).toHaveBeenLastCalledWith("native-ride", "함께 타요", expect.any(String));
    expect(mocks.postComment.mock.calls[0][2]).toBe(mocks.postComment.mock.calls[1][2]);
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("keeps a draft and uncertain comment ID through transient access refresh and local retries", async () => {
    const parentRetry = vi.fn(), routeFinish = vi.fn();
    mocks.postComment.mockRejectedValueOnce(new Error("offline"));
    render(<PublicActivitySurface {...props} onDetailRetry={parentRetry} detailMeasurement={routeFinish} />);
    await screen.findByText("한강 라이딩");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "재시도 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("alert");
    const requestId = mocks.postComment.mock.calls[0][2];
    mocks.load.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("still offline"));
    fireEvent(window, new Event("focus"));
    fireEvent.click(await screen.findByRole("button", { name: "연결 다시 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await screen.findByText("한강 라이딩");
    expect(parentRetry).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith("activity_detail_ready", expect.objectContaining({ outcome: "success" }));
    expect(screen.getByRole("textbox")).toHaveValue("재시도 초안");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
    expect(mocks.postComment.mock.calls[1][2]).toBe(requestId);
  });
  it.each(["activity", "viewer"])("does not carry a draft into another %s", async boundary => {
    const view = render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "이전 초안" } });
    const activityId = boundary === "activity" ? "another-ride" : props.activityId;
    if (boundary === "viewer") authState.uid = "another-viewer";
    mocks.load.mockResolvedValue({ ...fixture(), activity: { ...fixture().activity, id: activityId } });
    view.rerender(<PublicActivitySurface {...props} activityId={activityId} />);
    await screen.findByRole("textbox");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
  it("masks a draft when the SDK user is replaced with the same UID", async () => {
    const previous = auth.currentUser;
    try {
      const view = render(<PublicActivitySurface {...props} />);
      await screen.findByText("한강 라이딩");
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "이전 세션 초안" } });
      auth.currentUser = { ...previous, uid: previous?.uid ?? "viewer" } as typeof previous;
      view.rerender(<PublicActivitySurface {...props} />);
      await screen.findByRole("textbox");
      expect(screen.getByRole("textbox")).toHaveValue("");
    } finally { auth.currentUser = previous; }
  });
  it.each(["functions/permission-denied", "functions/unauthenticated"])("discards a draft after access loss and later retry: %s", async code => {
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "폐기할 초안" } });
    mocks.load.mockRejectedValueOnce({ code });
    fireEvent(window, new Event("focus"));
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await screen.findByRole("textbox");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
  it.each(["functions/permission-denied", "functions/not-found", "functions/failed-precondition"])("removes public content when a reaction loses access: %s", async code => {
    mocks.setKudos.mockRejectedValueOnce({ code });
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument());
    expect(screen.queryByText("바람이 좋았어요")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("social_action_result", expect.objectContaining({ outcome: "access_denied", operation: "kudos" }));
  });
  it("removes a comment draft and public content when posting loses access", async () => {
    mocks.postComment.mockRejectedValueOnce({ code: "functions/permission-denied" });
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "초안" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("serializes reaction taps while a request is pending", async () => {
    let resolve!: (value: { enabled: boolean }) => void;
    mocks.setKudos.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    const button = screen.getByRole("button", { name: /좋아요/ });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.setKudos).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ enabled: true }));
  });
  it("clears public content if permissions fail on mutation readback", async () => {
    mocks.load.mockResolvedValueOnce(fixture()).mockRejectedValue({ code: "functions/permission-denied" });
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: /다시/ })).toBeInTheDocument();
  });
  it("never rolls a confirmed kudos count back while its aggregate catches up", async () => {
    const stale = { ...fixture(), viewerHasKudos: true };
    const fresh = { ...stale, activity: { ...stale.activity, kudosCount: 3 } };
    mocks.load.mockResolvedValueOnce(fixture()).mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "좋아요 취소 · 3" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: "좋아요 취소 · 3" })).toBeInTheDocument();
  });
  it("keeps confirmed content when aggregate readback has a network failure", async () => {
    mocks.load.mockResolvedValueOnce(fixture()).mockRejectedValueOnce(new Error("offline"));
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "좋아요 취소 · 3" })).toBeInTheDocument();
    expect(screen.getByText("한강 라이딩")).toBeInTheDocument();
  });
  it("accepts changed server counts instead of overriding concurrent reactions", async () => {
    const updated = fixture(); updated.viewerHasKudos = true; updated.activity.kudosCount = 7;
    mocks.load.mockResolvedValueOnce(fixture()).mockResolvedValueOnce(updated);
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    expect(await screen.findByRole("button", { name: "좋아요 취소 · 7" })).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("clears confirmed optimistic content if access is revoked during aggregate retry", async () => {
    mocks.load.mockResolvedValueOnce(fixture()).mockResolvedValueOnce({ ...fixture(), viewerHasKudos: true }).mockRejectedValueOnce({ code: "functions/permission-denied" });
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument());
  });
  it("stops aggregate retries after the viewer changes", async () => {
    mocks.load.mockResolvedValueOnce(fixture()).mockResolvedValueOnce({ ...fixture(), viewerHasKudos: true }).mockRejectedValueOnce({ code: "functions/permission-denied" });
    const { rerender } = render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    authState.uid = "next-viewer";
    rerender(<PublicActivitySurface {...props} />);
    await waitFor(() => expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    expect(mocks.load).toHaveBeenCalledTimes(3);
  });
  it("allows cancelling kudos after all bounded aggregate reads remain stale", async () => {
    mocks.load.mockResolvedValueOnce(fixture()).mockResolvedValue({ ...fixture(), viewerHasKudos: true });
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "좋아요 취소 · 3" })).toBeEnabled(), { timeout: 1500 });
    expect(mocks.load).toHaveBeenCalledTimes(4);
    mocks.setKudos.mockResolvedValueOnce({ enabled: false }); mocks.load.mockResolvedValueOnce(fixture());
    fireEvent.click(screen.getByRole("button", { name: "좋아요 취소 · 3" }));
    expect(await screen.findByRole("button", { name: "좋아요 · 2" })).toBeInTheDocument();
    expect(mocks.setKudos).toHaveBeenLastCalledWith("native-ride", false);
  });
  it("drops late results from a previous activity", async () => {
    let resolve!: (value: PublicActivityDetail) => void;
    mocks.load.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockRejectedValueOnce(new Error("missing"));
    const { rerender } = render(<PublicActivitySurface {...props} />);
    rerender(<PublicActivitySurface {...props} activityId="next-ride" />);
    await act(async () => resolve(fixture()));
    expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument();
  });
});

it("does not report a retried load ready using the previous rendered detail", async () => {
  const view = render(<PublicActivitySurface {...props} />);
  await screen.findByText("한강 라이딩");
  let reject!: (error: unknown) => void;
  mocks.load.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  view.rerender(<PublicActivitySurface {...props} retryKey={1} />);
  const detailEvents = () => vi.mocked(track).mock.calls.filter(([event]) => event === "activity_detail_ready");
  expect(detailEvents()).toHaveLength(1);
  await act(async () => reject({ code: "functions/permission-denied" }));
  await waitFor(() => expect(detailEvents()).toHaveLength(2));
  expect(detailEvents()[1]?.[1]).toEqual(expect.objectContaining({ outcome: "access_denied" }));
});

it.each([["활동 숨기기", "이 활동을 숨겼습니다."], ["작성자 차단", "작성자를 차단했습니다."]])("removes DTO, photos, drafts and reaction controls after %s", async (action, message) => {
  render(<PublicActivitySurface {...props} />);
  await screen.findByText("한강 라이딩");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "남은 초안" } });
  fireEvent.click(screen.getByRole("button", { name: action }));
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  expect(await screen.findByText(message)).toHaveFocus();
  expect(screen.queryByText("바람이 좋았어요")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /좋아요/ })).not.toBeInTheDocument();
});
it("does not expose report/hide/block controls for the activity owner", async () => {
  authState.uid = "owner";
  render(<PublicActivitySurface {...props} />); await screen.findByText("한강 라이딩");
  expect(screen.queryByRole("button", { name: "작성자 차단" })).not.toBeInTheDocument();
});

it("removes old geometry after a failed focus check and keeps it hidden until a successful read", async () => {
  const data = fixture(); data.mapPreview = { imageUrl: "https://maps.example.test/old", encodedPolyline: null };
  mocks.load.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error("offline"));
  render(<PublicActivitySurface {...props} />);
  await screen.findByRole("img", { name: "라이딩 경로" });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "보존 초안" } });
  fireEvent.focus(window);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("img", { name: "라이딩 경로" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("보존 초안");
  mocks.load.mockResolvedValueOnce({ ...data, mapPreview: { imageUrl: null, encodedPolyline: null } });
  fireEvent.focus(window);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole("img", { name: "라이딩 경로" })).not.toBeInTheDocument();
});
it("revalidates visible details every 30 seconds and revokes the whole detail on denial", async () => {
  render(<PublicActivitySurface {...props} />);
  await screen.findByText("한강 라이딩");
  vi.useFakeTimers();
  try {
    // Start a fresh interval under the fake clock.
    cleanup(); mocks.load.mockResolvedValueOnce(fixture()).mockRejectedValueOnce({ code: "functions/permission-denied" });
    render(<PublicActivitySurface {...props} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
it("hides geometry while backgrounded and ignores a late response from before backgrounding", async () => {
  const data = fixture(); data.mapPreview = { imageUrl: "https://maps.example.test/old", encodedPolyline: null };
  let resolve!: (value: PublicActivityDetail) => void;
  mocks.load.mockResolvedValueOnce(data).mockReturnValueOnce(new Promise(r => { resolve = r; }));
  render(<PublicActivitySurface {...props} />);
  await screen.findByRole("img", { name: "라이딩 경로" });
  fireEvent.focus(window);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => resolve(data));
  expect(screen.queryByRole("img", { name: "라이딩 경로" })).not.toBeInTheDocument();
  vi.restoreAllMocks();
});
it("does not restore revoked geometry from a late social aggregate response", async () => {
  const data = fixture(); data.mapPreview = { imageUrl: "https://maps.example.test/old", encodedPolyline: null };
  let resolve!: (value: { enabled: boolean }) => void;
  mocks.load.mockResolvedValueOnce(data).mockResolvedValueOnce({ ...data, mapPreview: { imageUrl: null, encodedPolyline: null } }).mockResolvedValue({ ...data, viewerHasKudos: true, activity: { ...data.activity, kudosCount: 3 } });
  mocks.setKudos.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  render(<PublicActivitySurface {...props} />);
  await screen.findByRole("img", { name: "라이딩 경로" });
  fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
  fireEvent.focus(window);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  await act(async () => resolve({ enabled: true }));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole("img", { name: "라이딩 경로" })).not.toBeInTheDocument();
});

it("leaves route-owned detail success to the actual page presentation and delegates retries", async () => {
 const finish = vi.fn(), retry = vi.fn();
 mocks.load.mockRejectedValueOnce(new Error("offline"));
 render(<PublicActivitySurface {...props} detailMeasurement={finish} onDetailRetry={retry} />);
 await waitFor(() => expect(finish).toHaveBeenCalledWith("error"));
 fireEvent.click(screen.getByText("다시 시도"));
 expect(retry).toHaveBeenCalledTimes(1);
 expect(track).not.toHaveBeenCalledWith("activity_detail_ready", expect.anything());
});
it("does not emit an additional detail success when a route supplies the measurement", async () => {
 const finish=vi.fn();
 render(<PublicActivitySurface {...props} detailMeasurement={finish} />);
 await screen.findByText("한강 라이딩");
 expect(finish).not.toHaveBeenCalledWith("success");
 expect(track).not.toHaveBeenCalledWith("activity_detail_ready", expect.anything());
});
