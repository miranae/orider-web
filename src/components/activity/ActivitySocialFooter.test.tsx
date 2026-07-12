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
