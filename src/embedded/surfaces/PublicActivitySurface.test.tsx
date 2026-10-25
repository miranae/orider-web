import { track } from "../../services/analytics";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicActivitySurface from "./PublicActivitySurface";
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
describe("public embedded activity", () => {
  it("keeps activity and reactions available when a static map fails", async () => {
    const data = fixture();
    data.mapPreview = { imageUrl: "https://maps.example.test/failed", encodedPolyline: null };
    mocks.load.mockResolvedValue(data);
    render(<PublicActivitySurface {...props} />);
    fireEvent.error(await screen.findByRole("img", { name: "라이딩 경로" }));
    expect(screen.getByText("경로 지도를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByText("한강 라이딩")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 · 2" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByRole("img", { name: "라이딩 경로" })).toHaveAttribute("src", data.mapPreview.imageUrl);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["estimated", "추정 파워입니다."], ["measured", "측정으로 표기된 파워입니다."], ["unknown", "측정 출처는 확인되지 않았습니다."],
  ] as const)("labels canonical power provenance: %s", async (powerSource, label) => {
    const data = fixture();
    data.activity.effectiveFacts = { status: "canonical", powerSource, metrics: { avgPower: 0, np: 123 } };
    mocks.load.mockResolvedValue(data);
    render(<PublicActivitySurface {...props} />);
    expect(await screen.findByText(label, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
  });
  it.each(["stale", "processing", "failed"])("does not relabel recorded or unready power as canonical: %s", async status => {
    const data = fixture();
    data.activity.summary.averagePower = 999;
    data.activity.effectiveFacts = { status, powerSource: "estimated", metrics: { avgPower: 777 } };
    mocks.load.mockResolvedValue(data);
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.queryByText("777")).not.toBeInTheDocument();
    expect(screen.queryByText("평균 파워")).not.toBeInTheDocument();
  });

  it("converts native recorded metres to kilometres when canonical facts are unavailable", async () => {
    const data = fixture();
    data.activity.summary.distance = 25000;
    data.activity.effectiveFacts = { status: "unavailable", metrics: null };
    mocks.load.mockResolvedValue(data);
    render(<PublicActivitySurface {...props} />);
    expect(await screen.findByText("25")).toBeInTheDocument();
    expect(screen.queryByText("0.03")).not.toBeInTheDocument();
  });
  it("shows native public facts and canonical missing values without owner analysis", async () => {
    render(<PublicActivitySurface {...props} />);
    expect(await screen.findByText("한강 라이딩")).toBeInTheDocument();
    expect(screen.getByText("44.8")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(screen.getByText("바람이 좋았어요")).toBeInTheDocument();
    expect(props.onReady).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("activity_detail_ready", expect.objectContaining({ outcome: "success", surface: "web_public_activity" }));
  });
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

it("removes old geometry on focus and keeps it hidden after a temporary network failure", async () => {
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
