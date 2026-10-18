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
  setCallableImplementation,
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

  it("hydrates the canonical profile from provisioning while the live listener is delayed", async () => {
    vi.mocked(onSnapshot).mockImplementationOnce((() => () => {}) as typeof onSnapshot);
    setCallableResult("ensureUserProfile", { data: createMockProfile({ nickname: "New Naver Rider", photoURL: "https://example.com/profile.jpg" }) });
    renderAuth();
    act(() => { simulateLogin({ uid: "new-social-owner" }); });
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("New Naver Rider"));
    expect(screen.getByTestId("profile-loading")).toHaveTextContent("false");
  });

  it("clears the old owner's profile while the next owner's profile is loading", async () => {
    setDocData("users/old-owner", createMockProfile({ nickname: "Old Owner" }) as unknown as Record<string, unknown>);
    renderAuth();
    act(() => { simulateLogin({ uid: "old-owner" }); });
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("Old Owner"));
    vi.mocked(onSnapshot).mockImplementationOnce((() => () => {}) as typeof onSnapshot);
    act(() => { simulateLogin({ uid: "new-owner" }); });
    expect(screen.getByTestId("profile")).toHaveTextContent("null");
    expect(screen.getByTestId("profile-loading")).toHaveTextContent("true");
  });

  it("does not clear the next owner's profile when an older provisioning request fails", async () => {
    let rejectOld!: (reason: Error) => void;
    const oldRequest = new Promise((_resolve, reject) => { rejectOld = reject; });
    let calls = 0;
    setCallableImplementation("ensureUserProfile", () => ++calls === 1 ? oldRequest : { data: {} });
    setDocData("users/old-owner", createMockProfile({ nickname: "Old Owner" }) as unknown as Record<string, unknown>);
    setDocData("users/new-owner", createMockProfile({ nickname: "New Owner" }) as unknown as Record<string, unknown>);
    renderAuth();
    act(() => { simulateLogin({ uid: "old-owner" }); });
    await waitFor(() => expect(calls).toBe(1));
    act(() => { simulateLogin({ uid: "new-owner" }); });
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("New Owner"));
    vi.useFakeTimers();
    try {
      await act(async () => {
        rejectOld(new Error("old request failed"));
        await vi.advanceTimersByTimeAsync(3000);
      });
    } finally { vi.useRealTimers(); }
    expect(screen.getByTestId("profile")).toHaveTextContent("New Owner");
    expect(calls).toBe(2);
  });

  it("retains a readable snapshot when current provisioning exhausts its retries", async () => {
    setDocData("users/readable-owner", createMockProfile({ nickname: "Readable Owner" }) as unknown as Record<string, unknown>);
    setCallableImplementation("ensureUserProfile", () => { throw new Error("provisioning unavailable"); });
    vi.useFakeTimers();
    try {
      renderAuth();
      await act(async () => {
        simulateLogin({ uid: "readable-owner" });
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.getByTestId("profile")).toHaveTextContent("Readable Owner");
    } finally { vi.useRealTimers(); }
  });

  it("does not apply an old owner's successful bootstrap after switching owners", async () => {
    const originalSnapshot = vi.mocked(onSnapshot).getMockImplementation()!;
    vi.mocked(onSnapshot).mockImplementation((() => () => {}) as typeof onSnapshot);
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    const oldRequest = new Promise((resolve) => { finishOld = resolve; });
    const newRequest = new Promise((resolve) => { finishNew = resolve; });
    let calls = 0;
    setCallableImplementation("ensureUserProfile", () => ++calls === 1 ? oldRequest : newRequest);
    try {
      renderAuth();
      act(() => { simulateLogin({ uid: "old-owner" }); });
      await waitFor(() => expect(calls).toBe(1));
      act(() => { simulateLogin({ uid: "new-owner" }); });
      await waitFor(() => expect(calls).toBe(2));
      await act(async () => { finishOld({ data: createMockProfile({ nickname: "Old Owner" }) }); });
      expect(screen.getByTestId("profile")).toHaveTextContent("null");
      await act(async () => { finishNew({ data: createMockProfile({ nickname: "New Owner" }) }); });
      expect(screen.getByTestId("profile")).toHaveTextContent("New Owner");
    } finally { vi.mocked(onSnapshot).mockImplementation(originalSnapshot); }
  });

  it("rejects an old listener before React cleans it up on an owner switch", async () => {
    let oldSnapshot!: (snapshot: { exists: () => boolean; data: () => unknown; metadata: { fromCache: boolean } }) => void;
    vi.mocked(onSnapshot).mockImplementationOnce(((_ref: unknown, next: typeof oldSnapshot) => {
      oldSnapshot = next;
      next({ exists: () => true, data: () => createMockProfile({ nickname: "Old Owner" }), metadata: { fromCache: false } });
      return () => {};
    }) as typeof onSnapshot).mockImplementationOnce((() => () => {}) as typeof onSnapshot);
    renderAuth();
    act(() => { simulateLogin({ uid: "old-owner" }); });
    await waitFor(() => expect(screen.getByTestId("profile")).toHaveTextContent("Old Owner"));
    act(() => {
      simulateLogin({ uid: "new-owner" });
      oldSnapshot({ exists: () => true, data: () => createMockProfile({ nickname: "Late Old Owner" }), metadata: { fromCache: false } });
    });
    expect(screen.getByTestId("profile")).toHaveTextContent("null");
    expect(screen.getByTestId("user")).toHaveTextContent("new-owner");
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
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/ko/terms");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/ko/privacy");
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
