import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Activity } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ActivitySocialFooter from "./ActivitySocialFooter";

const mocks = vi.hoisted(() => ({
  setKudos: vi.fn(),
  postComment: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { uid: "viewer", displayName: "Viewer", photoURL: null },
    profile: { nickname: "Viewer", photoURL: null },
  }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("../../hooks/useLocalizedNavigate", () => ({
  useLocalizedNavigate: () => vi.fn(),
  useLocalizedPath: (path: string) => path,
}));
vi.mock("./useHydratedSocialProfiles", () => ({ useHydratedSocialProfiles: (value: unknown) => value }));
vi.mock("../../services/activitySocialMutations", () => ({
  activitySocialMutations: { setKudos: mocks.setKudos, postComment: mocks.postComment },
  activitySocialErrorMessageKey: () => "socialErrors.access",
}));

const activity = {
  id: "a1",
  userId: "owner",
  type: "Ride",
  kudosCount: 3,
  commentCount: 1,
  recentKudos: [],
} as unknown as Activity;

describe("ActivitySocialFooter callable mutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps feed totals and pressed state consistent when a kudos write fails", async () => {
    mocks.setKudos.mockRejectedValueOnce(new Error("blocked"));
    renderWithProviders(<ActivitySocialFooter activity={activity} presentation="feed" />);
    const button = screen.getByRole("button", { name: "좋아요" });
    expect(screen.getByText("좋아요 3")).toBeVisible();
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(screen.getByText("좋아요 4")).toBeVisible();
    expect(button).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText("좋아요 3")).toBeVisible());
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(mocks.setKudos).toHaveBeenCalledWith("a1", true);
  });

  it("rolls back optimistic kudos when the callable rejects", async () => {
    mocks.setKudos.mockRejectedValueOnce(new Error("blocked"));
    renderWithProviders(<ActivitySocialFooter activity={activity} />);
    const button = screen.getByRole("button", { name: "좋아요" });
    expect(button).toHaveTextContent("3");
    fireEvent.click(button);
    expect(button).toHaveTextContent("4");
    await waitFor(() => expect(button).toHaveTextContent("3"));
    expect(mocks.setKudos).toHaveBeenCalledWith("a1", true);
    expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("rolls back the optimistic comment count and preserves input on failure", async () => {
    mocks.postComment.mockRejectedValueOnce(new Error("private"));
    renderWithProviders(<ActivitySocialFooter activity={activity} />);
    fireEvent.click(screen.getByRole("button", { name: "댓글" }));
    const input = screen.getByPlaceholderText("댓글을 입력하세요");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(mocks.postComment).toHaveBeenCalledWith("a1", "hello"));
    expect(input).toHaveValue("hello");
    expect(screen.getByRole("button", { name: "댓글" })).toHaveTextContent("1");
  });
});

it("shows only actual visible feed comments and keeps the composer closed until requested", () => {
  vi.clearAllMocks();
  const comment = { id: "c1", userId: "reader", nickname: "라이더", profileImage: null, text: "함께 달려 즐거웠어요", createdAt: Date.now() - 60000 };
  renderWithProviders(<ActivitySocialFooter activity={activity} presentation="feed" commentsPreview={[comment, { ...comment, id: "hidden", text: "숨긴 댓글", hiddenByOwner: true }, { ...comment, id: "deleted", text: "삭제 댓글", deletedAt: Date.now() }]} />);
  expect(screen.getByText("함께 달려 즐거웠어요")).toBeVisible();
  expect(screen.queryByText("숨긴 댓글")).not.toBeInTheDocument();
  expect(screen.queryByText("삭제 댓글")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "댓글" }));
  expect(screen.getByRole("textbox")).toBeVisible();
  expect(screen.getByRole("button", { name: "등록" })).toHaveClass("ds-btn--md");
  const input = screen.getByRole("textbox");
  expect(input.tagName).toBe("TEXTAREA");
  expect(input).toHaveAttribute("rows", "1");
  fireEvent.change(input, { target: { value: "첫 줄\n두 번째 줄" } });
  expect(input).toHaveValue("첫 줄\n두 번째 줄");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(mocks.postComment).not.toHaveBeenCalled();
});
