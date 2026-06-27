import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import {
  simulateLogin,
  simulateLogout,
  setDocData,
  setCallableResult,
  mockSignInWithPopup,
  mockSignOut,
} from "../__tests__/mocks/firebase";
import { createMockProfile } from "../__tests__/fixtures/mockData";

function TestConsumer() {
  const { user, profile, loading, signInWithGoogle, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.uid : "null"}</div>
      <div data-testid="profile">{profile ? profile.nickname : "null"}</div>
      <button onClick={signInWithGoogle}>로그인</button>
      <button onClick={logout}>로그아웃</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    setCallableResult("ensureUserProfile", { data: {} });
  });

  it("starts with no user and loading becomes false", async () => {
    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });
    expect(screen.getByTestId("user")).toHaveTextContent("null");
    expect(screen.getByTestId("profile")).toHaveTextContent("null");
  });

  it("reflects logged-in user after simulateLogin", async () => {
    renderAuth();

    act(() => {
      simulateLogin({ uid: "uid-1", displayName: "Rider" });
    });

    // Set profile data for Firestore subscription
    setDocData("users/uid-1", createMockProfile({ nickname: "Rider" }) as unknown as Record<string, unknown>);

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("uid-1");
    });
    await waitFor(() => {
      expect(screen.getByTestId("profile")).toHaveTextContent("Rider");
    });
  });

  it("clears profile on logout", async () => {
    renderAuth();

    act(() => {
      simulateLogin({ uid: "uid-1" });
    });
    setDocData("users/uid-1", createMockProfile({ nickname: "Test" }) as unknown as Record<string, unknown>);

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("uid-1");
    });

    // Logout
    act(() => {
      simulateLogout();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("null");
      expect(screen.getByTestId("profile")).toHaveTextContent("null");
    });
  });

  it("calls signInWithPopup when signInWithGoogle is invoked", async () => {
    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByText("로그인"));
    expect(mockSignInWithPopup).toHaveBeenCalled();
  });

  it("calls signOut on logout", async () => {
    const user = userEvent.setup();
    renderAuth();

    act(() => {
      simulateLogin({ uid: "uid-1" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("uid-1");
    });

    await user.click(screen.getByText("로그아웃"));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
