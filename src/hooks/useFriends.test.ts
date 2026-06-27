import { renderHook, act, waitFor } from "@testing-library/react";
import { useFriends } from "./useFriends";
import {
  simulateLogin,
  simulateLogout,
  setCollectionDocs,
  setDocData,
  setCallableResult,
  mockDeleteDoc,
  mockSetDoc,
} from "../__tests__/mocks/firebase";
import { createMockFriend, createMockFriendRequest } from "../__tests__/fixtures/mockData";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import React from "react";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      AuthProvider,
      null,
      React.createElement(ToastProvider, null, children),
    ),
  );
}

describe("useFriends", () => {
  beforeEach(() => {
    setCallableResult("ensureUserProfile", { data: {} });
  });

  it("returns empty friends for unauthenticated user", async () => {
    const { result } = renderHook(() => useFriends(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.friends).toEqual([]);
    expect(result.current.requests).toEqual([]);
  });

  it("loads friends for authenticated user", async () => {
    simulateLogin({ uid: "uid-1" });
    setDocData("users/uid-1", { nickname: "Test", friendCode: "ABC" });

    setCollectionDocs("friends/uid-1/users", [
      { id: "f1", ...createMockFriend({ userId: "f1", nickname: "Friend 1" }) },
      { id: "f2", ...createMockFriend({ userId: "f2", nickname: "Friend 2" }) },
    ]);

    const { result } = renderHook(() => useFriends(), { wrapper });

    await waitFor(() => {
      expect(result.current.friends.length).toBe(2);
    });
    expect(result.current.friends[0]?.nickname).toBe("Friend 1");
  });

  it("loads friend requests", async () => {
    simulateLogin({ uid: "uid-1" });
    setDocData("users/uid-1", { nickname: "Test" });

    setCollectionDocs("friend_requests/uid-1/items", [
      { id: "r1", ...createMockFriendRequest({ requesterId: "r1", nickname: "Requester" }) },
    ]);

    const { result } = renderHook(() => useFriends(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests.length).toBe(1);
    });
    expect(result.current.requests[0]?.nickname).toBe("Requester");
  });

  it("addByCode calls Cloud Function", async () => {
    simulateLogin({ uid: "uid-1" });
    setDocData("users/uid-1", { nickname: "Test" });

    setCallableResult("addFriendByCode", {
      data: { success: true, friendId: "f1", friendNickname: "New Friend" },
    });

    const { result } = renderHook(() => useFriends(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let response: unknown;
    await act(async () => {
      response = await result.current.addByCode("ABC123");
    });

    expect(response).toEqual({
      success: true,
      friendId: "f1",
      friendNickname: "New Friend",
    });
  });

  it("acceptRequest calls Cloud Function", async () => {
    simulateLogin({ uid: "uid-1" });
    setDocData("users/uid-1", { nickname: "Test" });
    setCallableResult("acceptFriendRequest", { data: {} });

    const { result } = renderHook(() => useFriends(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.acceptRequest("requester-1");
    });
    // No error means success
    expect(result.current.actionLoading).toBe(false);
  });

  it("declineRequest calls deleteDoc", async () => {
    simulateLogin({ uid: "uid-1" });
    setDocData("users/uid-1", { nickname: "Test" });

    const { result } = renderHook(() => useFriends(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.declineRequest("requester-1");
    });

    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it("removeFriend calls deleteDoc", async () => {
    simulateLogin({ uid: "uid-1" });
    setDocData("users/uid-1", { nickname: "Test" });

    const { result } = renderHook(() => useFriends(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.removeFriend("friend-1");
    });

    expect(mockDeleteDoc).toHaveBeenCalled();
  });
});
