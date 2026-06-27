import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    renderWithProviders(<FriendsPage />, { authenticated: false });
    expect(screen.getByText("친구 목록을 보려면 로그인이 필요합니다.")).toBeInTheDocument();
  });

  it("renders friend page heading", async () => {
    renderWithProviders(<FriendsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText("친구")).toBeInTheDocument();
    });
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
      expect(screen.getByText(/요청 \(/)).toBeInTheDocument();
    });
  });

  it("switches to requests tab and shows requests", async () => {
    const user = userEvent.setup();

    setCollectionDocs("friend_requests/test-uid/items", [
      { id: "r1", ...createMockFriendRequest({ requesterId: "r1", nickname: "요청자" }) },
    ]);

    renderWithProviders(<FriendsPage />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByText(/요청 \(/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/요청 \(/));

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
      const addBtn = screen.getByText("추가");
      expect(addBtn).toBeDisabled();
    });
  });
});
