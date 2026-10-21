import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { AuthContextProvider } from "../../contexts/AuthContext";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
import { activityFeedSourceRevision } from "../../services/activityFeedContent";
import { CompactActivityCard } from "./MobileFeedPage";

const mocks = vi.hoisted(() => ({ load: vi.fn(), comments: vi.fn(), enabled: true }));
vi.mock("../../services/activityFeedContent", async importOriginal => ({
  ...await importOriginal<typeof import("../../services/activityFeedContent")>(),
  activityFeedContentPreviewUrl: () => mocks.enabled ? "/api/local/activity-feed-content" : null,
  loadLocalActivityFeedContent: mocks.load,
  loadActivityFeedComments: mocks.comments,
}));
vi.mock("../activity/ActivitySocialFooter", () => ({ default: ({ commentsPreview }: { commentsPreview?: Array<{ id: string; text: string }> }) => <div>{commentsPreview?.map(comment => <p key={comment.id}>{comment.text}</p>)}</div> }));
const activity = createMockActivity({ thumbnailTrack: "", photoCount: 0 });
const content = { version: 1, sourceRevision: activityFeedSourceRevision(activity), activityId: activity.id,
  revision: "r1", status: "ready", memo: "실제 메모", memoTruncated: false, photos: [], totalPhotoCount: 0, comments: [] };
function Feed({ uid = "viewer", count = 1, guest = false }: { uid?: string; count?: number; guest?: boolean }) {
  return <AuthContextProvider value={{ user: guest ? null : { uid } as User, profile: null, loading: false, profileLoading: false, signIn: vi.fn(), logout: vi.fn() }}>
    <CompactActivityCard activity={{ ...activity, commentCount: count }} />
  </AuthContextProvider>;
}
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.comments.mockResolvedValue([]); });
it("shows a real request failure and retries to content without exposing API details", async () => {
  mocks.load.mockRejectedValueOnce(new Error("feed_content_500")).mockResolvedValueOnce(content);
  renderWithProviders(<Feed />);
  expect(await screen.findByRole("alert")).toHaveTextContent("메모와 사진을 불러오지 못했어요.");
  expect(screen.queryByText(/feed_content_500/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("실제 메모")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
it("does not treat an absent production projection as a request error", () => {
  mocks.enabled = false;
  renderWithProviders(<Feed />);
  expect(mocks.load).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("aborts the old account request and ignores its late failure", async () => {
  let rejectOld!: (error: Error) => void;
  mocks.load.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; })).mockResolvedValueOnce(content);
  const view = renderWithProviders(<Feed />);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
  const signal = mocks.load.mock.calls[0][2] as AbortSignal;
  view.rerender(<Feed uid="another-viewer" />);
  expect(signal.aborted).toBe(true);
  await act(async () => { rejectOld(new Error("old viewer failure")); });
  expect(await screen.findByText("실제 메모")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("cancels the preview request when the card is unmounted", async () => {
  mocks.load.mockImplementationOnce(() => new Promise(() => {}));
  const view = renderWithProviders(<Feed />);
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
  const signal = mocks.load.mock.calls[0][2] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});

it("reads operating comments only for signed-in nonempty cards and retries a failed read", async () => {
  mocks.enabled = false;
  mocks.comments.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce([{ id: "comment", text: "운영 댓글 미리보기" }]);
  const view = renderWithProviders(<Feed count={0} />);
  expect(mocks.comments).not.toHaveBeenCalled();
  view.rerender(<Feed guest />);
  expect(mocks.comments).not.toHaveBeenCalled();
  view.rerender(<Feed />);
  expect(await screen.findByRole("alert")).toHaveTextContent("댓글을 불러오지 못했어요.");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("운영 댓글 미리보기")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.load).not.toHaveBeenCalled();
});
it("discards operating comment responses when the viewer changes", async () => {
  mocks.enabled = false;
  let resolveOld!: (value: Array<{ id: string; text: string }>) => void;
  mocks.comments.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce([]);
  const view = renderWithProviders(<Feed />);
  await waitFor(() => expect(mocks.comments).toHaveBeenCalledTimes(1));
  const signal = mocks.comments.mock.calls[0][3] as AbortSignal;
  view.rerender(<Feed uid="next-viewer" />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolveOld([{ id: "old", text: "이전 계정 댓글" }]));
  expect(screen.queryByText("이전 계정 댓글")).not.toBeInTheDocument();
});
