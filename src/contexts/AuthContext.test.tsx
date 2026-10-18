import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { onSnapshot } from "firebase/firestore";
import * as runtimeConfig from "../services/runtimeConfig";
import { AuthProvider, useAuth } from "./AuthContext";
import { isSignInCancelled } from "../utils/signInCancelled";
import {
  simulateLogin,
  simulateLogout,
  setDocData,
  setCallableResult,
  mockSignInWithPopup,
  mockSignOut,
  mockCallableInvocations,
} from "../__tests__/mocks/firebase";
import { createMockProfile } from "../__tests__/fixtures/mockData";

function TestConsumer() {
  const { user, profile, profileLoading, loading, signIn, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.uid : "null"}</div>
      <div data-testid="profile">{profile ? profile.nickname : "null"}</div>
      <div data-testid="profile-loading">{String(profileLoading)}</div>
      <button onClick={signIn}>로그인</button>
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

  it("stage keeps the shared profile without calling profile provisioning", async () => {
    const runtime = vi.spyOn(runtimeConfig, "getRuntimeConfig").mockReturnValue({ ...runtimeConfig.getRuntimeConfig(), appEnvironment: "stage" });
    try {
      setDocData("users/stage-owner", createMockProfile({ nickname: "Stage Owner" }) as unknown as Record<string, unknown>);
      renderAuth();
      act(() => { simulateLogin({ uid: "stage-owner" }); });
      await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("Stage Owner"));
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("profile-loading")).toHaveTextContent("false");
      expect(mockCallableInvocations.filter(({ name }) => name === "ensureUserProfile")).toHaveLength(0);
    } finally { runtime.mockRestore(); }
  });

  it("stage leaves a missing profile absent without provisioning it", async () => {
    const runtime = vi.spyOn(runtimeConfig, "getRuntimeConfig").mockReturnValue({ ...runtimeConfig.getRuntimeConfig(), appEnvironment: "stage" });
    try {
      renderAuth();
      act(() => { simulateLogin({ uid: "stage-new-user" }); });
      await waitFor(() => expect(screen.getByTestId("profile-loading")).toHaveTextContent("false"));
      expect(screen.getByTestId("user")).toHaveTextContent("stage-new-user");
      expect(screen.getByTestId("profile")).toHaveTextContent("null");
      expect(mockCallableInvocations.filter(({ name }) => name === "ensureUserProfile")).toHaveLength(0);
    } finally { runtime.mockRestore(); }
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
    expect(mockCallableInvocations.some(({ name }) => name === "ensureUserProfile")).toBe(true);
  });

  it("로그인 전환 후 프로필 첫 스냅샷까지 profileLoading을 유지한다", async () => {
    let emitProfile: ((snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void) | null = null;
    vi.mocked(onSnapshot).mockImplementationOnce(((_ref: unknown, next: typeof emitProfile) => {
      emitProfile = next;
      return () => {};
    }) as typeof onSnapshot);
    renderAuth();

    act(() => { simulateLogin({ uid: "uid-slow" }); });
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("uid-slow"));
    expect(screen.getByTestId("profile-loading")).toHaveTextContent("true");

    act(() => {
      emitProfile?.({
        exists: () => true,
        data: () => createMockProfile({ nickname: "Slow Rider" }) as unknown as Record<string, unknown>,
      });
    });
    await waitFor(() => expect(screen.getByTestId("profile-loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("profile")).toHaveTextContent("Slow Rider");
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

  it("signIn opens the provider chooser and Google calls signInWithPopup", async () => {
    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByText("로그인"));
    expect(mockSignInWithPopup).not.toHaveBeenCalled();
    expect(screen.getByTestId("A1-1-2")).toBeInTheDocument();
    expect(screen.getByTestId("A1-1-3")).toBeInTheDocument();
    await user.click(screen.getByTestId("A1-1-1"));
    expect(mockSignInWithPopup).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("A1-1")).not.toBeInTheDocument());
  });

  it("closing the chooser rejects signIn with the cancelled code", async () => {
    let captured: unknown = null;
    function Opener() {
      const { signIn } = useAuth();
      return <button onClick={() => { signIn().catch((err: unknown) => { captured = err; }); }}>열기</button>;
    }
    const user = userEvent.setup();
    render(<MemoryRouter><AuthProvider><Opener /></AuthProvider></MemoryRouter>);
    await user.click(screen.getByText("열기"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(isSignInCancelled(captured)).toBe(true));
    expect(screen.queryByTestId("A1-1")).not.toBeInTheDocument();
  });

  it("allows a fire-and-forget chooser to close without an unhandled rejection", async () => {
    function Opener() {
      const { signIn } = useAuth();
      return <button onClick={() => { void signIn(); }}>열기</button>;
    }
    const user = userEvent.setup();
    render(<MemoryRouter><AuthProvider><Opener /></AuthProvider></MemoryRouter>);
    await user.click(screen.getByText("열기"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("A1-1")).not.toBeInTheDocument());
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
