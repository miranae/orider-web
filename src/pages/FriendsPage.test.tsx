import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DialogProvider } from "../contexts/DialogContext";
import FriendsPage from "./FriendsPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import {
  setCollectionDocs,
  mockDeleteDoc,
  setCallableResult,
} from "../__tests__/mocks/firebase";
import { createMockFriend, createMockFriendRequest } from "../__tests__/fixtures/mockData";

describe("FriendsPage", () => {
  it("shows login required when not authenticated", () => {
    renderWithProviders(<FriendsPage />, { authenticated: false, route: "/ko/friends?source=onboarding&returnTo=%2Fplan" });
    expect(screen.getByText("친구 목록을 보려면 로그인이 필요합니다.")).toBeInTheDocument();
    expect(screen.queryByText("친구와 함께 시작해 보세요")).not.toBeInTheDocument();
  });

  it("shows the onboarding handoff panel only for signed-in onboarding traffic", async () => {
    renderWithProviders(<FriendsPage />, {
      authenticated: true,
      route: "/ko/friends?source=onboarding&returnTo=%2Fplan",
      profile: { friendCode: "ABC123" },
    });
    expect(await screen.findByText("친구와 함께 시작해 보세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계속하기" })).toBeInTheDocument();
  });

  it("renders friend page heading", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText("친구")).toBeInTheDocument();
    });
  });

  it("opens the existing invitation card from the header invitation control", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    const invite = await screen.findByRole("link", { name: "초대" });
    expect(invite).toHaveAttribute("data-testid", "P3-0-2");
    expect(invite).toHaveAttribute("href", "#friend-invite");
    expect(screen.getByTestId("P3-3")).toHaveAttribute("id", "friend-invite");
  });

  it("shows friend code input", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("친구코드를 입력하세요")).toBeInTheDocument();
    });
  });

  it("shows friend code when available", async () => {
    renderWithProviders(<FriendsPage />, {
      authenticated: true,
      profile: { friendCode: "ABC123" },
    });
    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });
  });

  it("shows empty state when no friends", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/아직 친구가 없습니다/)).toBeInTheDocument();
    });
  });

  it("renders friend list", async () => {
    setCollectionDocs("friends/test-uid/users", [
      { id: "f1", ...createMockFriend({ userId: "f1", nickname: "친구1" }) },
      { id: "f2", ...createMockFriend({ userId: "f2", nickname: "친구2" }) },
    ]);

    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText("친구1")).toBeInTheDocument();
      expect(screen.getByText("친구2")).toBeInTheDocument();
    });
  });

  it("shows tabs for friends and requests", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/친구 \(/)).toBeInTheDocument();
      expect(screen.getByText(/^요청 \(/)).toBeInTheDocument();
    });
  });

  it("switches to requests tab and shows requests", async () => {
    const user = userEvent.setup();

    setCollectionDocs("friend_requests/test-uid/items", [
      { id: "r1", ...createMockFriendRequest({ requesterId: "r1", nickname: "요청자" }) },
    ]);

    renderWithProviders(<FriendsPage />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByText(/^요청 \(/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/^요청 \(/));

    await waitFor(() => {
      expect(screen.getByText("요청자")).toBeInTheDocument();
      expect(screen.getByText("수락")).toBeInTheDocument();
      expect(screen.getByText("거절")).toBeInTheDocument();
    });
  });

  it("shows add button for friend code input", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText("추가")).toBeInTheDocument();
    });
  });

  it("disables add button when input is empty", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      const addBtn = screen.getByRole("button", { name: "추가" });
      expect(addBtn).toBeDisabled();
    });
  });
  it("cancels a sent mirror request by deleting the original recipient request", async () => {
    setCollectionDocs("users/test-uid/sent_friend_requests", [{ id: "target-user", targetNickname: "Recipient", createdAt: 1 }]);
    renderWithProviders(<DialogProvider><FriendsPage /></DialogProvider>, { authenticated: true });
    expect(await screen.findAllByRole("tab")).toHaveLength(3);
    await userEvent.click(screen.getByRole("tab", { name: "보낸 요청 (1)" }));
    expect(screen.getByText("Recipient")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: "friend_requests/target-user/items/test-uid" })));
  });

  it("keeps the request when cancellation confirmation is declined", async () => {
    mockDeleteDoc.mockClear();
    setCollectionDocs("users/test-uid/sent_friend_requests", [{ id: "target-user", targetNickname: "Recipient", targetPhotoURL: "https://example.com/avatar.jpg", createdAt: 1000 }]);
    renderWithProviders(<DialogProvider><FriendsPage /></DialogProvider>, { authenticated: true, route: "/ko/athlete/me/friends?tab=sent" });
    expect(await screen.findByText("Recipient")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "보낸 요청 (1)" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "취소" }));
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    expect(screen.getByText("Recipient")).toBeInTheDocument();
  });

  it("shows an unknown marker instead of fabricating a missing sent-request timestamp", async () => {
    setCollectionDocs("users/test-uid/sent_friend_requests", [{ id: "target-user", targetNickname: "No timestamp" }]);
    renderWithProviders(<FriendsPage />, { authenticated: true, route: "/ko/athlete/me/friends?tab=sent" });
    expect(await screen.findByText("No timestamp")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

});
