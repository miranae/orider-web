import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PaneAccount } from "./PaneAccount";

const mocks = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  profile: { nickname: "Old Name" } as Record<string, unknown> | null,
  updateDoc: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => undefined),
  promptValue: "New Name",
  logClientError: vi.fn(),
  showToast: vi.fn(),
  currentUser: { uid: "u1" } as { uid: string } | null,
  callable: vi.fn(),
  navigate: vi.fn(),
  confirm: vi.fn(async () => true),
}));

// 연결 카드는 자체 테스트(SocialLinksCard.test.tsx) — 여기선 계정 화면의 읽기·쓰기 계약만 본다.
vi.mock("./SocialLinksCard", () => ({ SocialLinksCard: () => null }));
vi.mock("./PaneAiCoach", () => ({ PaneAiCoach: () => <section data-testid="coach-consent">Consent</section> }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (input: unknown) => mocks.callable(name, input),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args: unknown[]) => ({ kind: "doc", args })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: (...args: unknown[]) => mocks.updateDoc(...args),
  collection: vi.fn((...args: unknown[]) => ({ kind: "collection", args })),
  query: vi.fn((...args: unknown[]) => ({ kind: "query", args })),
  where: vi.fn((...args: unknown[]) => ({ kind: "where", args })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(async () => undefined) })),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(async () => undefined),
  getDownloadURL: vi.fn(async () => "https://example.test/photo.webp"),
}));

vi.mock("firebase/auth", () => ({
  updateProfile: (...args: unknown[]) => mocks.updateProfile(...args),
}));

vi.mock("../../services/firebase", () => ({
  firestore: {},
  functions: {},
  storage: {},
  get auth() {
    return { currentUser: mocks.currentUser };
  },
}));

vi.mock("../../services/errorLogger", () => ({
  logClientError: (...args: unknown[]) => mocks.logClientError(...args),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, profile: mocks.profile, logout: vi.fn() }),
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({
    prompt: vi.fn(async () => mocks.promptValue),
    confirm: mocks.confirm,
    alert: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("../../hooks/useStrava", () => ({
  useStrava: () => ({ deleteUserData: vi.fn(), loading: false }),
}));

vi.mock("../../hooks/useLocalizedNavigate", () => ({
  useLocalizedNavigate: () => mocks.navigate,
  useLocalizedPath: (path: string) => `/ko${path}`,
}));

describe("PaneAccount nickname save", () => {
  beforeEach(() => {
    mocks.user = { uid: "u1" };
    mocks.profile = { nickname: "Old Name" };
    mocks.currentUser = { uid: "u1" };
    mocks.promptValue = "New Name";
    mocks.updateDoc.mockClear();
    mocks.updateProfile.mockClear().mockResolvedValue(undefined);
    mocks.logClientError.mockClear();
    mocks.showToast.mockClear();
    mocks.navigate.mockClear();
    mocks.confirm.mockClear().mockResolvedValue(true);
    mocks.callable.mockReset().mockImplementation(async (name, input) => ({ data: name === "applyVisibilityToExistingActivities" ? input.dryRun ? { count: 2 } : { updated: 2 } : { updated: 0, scope: "default" } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps optional medical details discoverable and places consent before account actions", () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const summary = screen.getByText("pane.account.medicalSummary");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("coach-consent").compareDocumentPosition(screen.getByText("pane.account.cardManagement")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "pane.account.manageData" })).toHaveAttribute("href", "/ko/settings/data");
    expect(screen.getByRole("button", { name: "pane.account.deleteBtnLabel" })).toBeInTheDocument();
  });

  it("opens deletion guidance without executing a destructive operation", () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "pane.account.deleteBtnLabel" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/account-deletion");
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("syncs Firebase Auth displayName after saving the Firestore nickname", async () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);

    fireEvent.click(screen.getByLabelText("profile.editNickname"));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({ uid: "u1" }, { displayName: "New Name" }),
    );
    expect(mocks.showToast).toHaveBeenCalledWith("profile.nicknameUpdated");
  });

  it("shows a toast but does not throw when Auth displayName sync fails", async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error("network"));

    render(<MemoryRouter><PaneAccount /></MemoryRouter>);

    fireEvent.click(screen.getByLabelText("profile.editNickname"));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    await waitFor(() => expect(mocks.logClientError).toHaveBeenCalledWith(
      "PaneAccount.syncAuthDisplayName",
      expect.any(Error),
      { uid: "u1" },
    ));
    expect(mocks.showToast).toHaveBeenCalledWith("profile.nicknameAuthSyncFailed");
    expect(mocks.showToast).toHaveBeenCalledWith("profile.nicknameUpdated");
  });
  it("does not read existing activity counts on mount or when changing defaults", async () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    expect(mocks.callable).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /privacy.visOptEveryone/ }));
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledWith("updateDefaultVisibility", { visibility: "everyone" }));
    expect(mocks.callable).not.toHaveBeenCalledWith("applyVisibilityToExistingActivities", expect.anything());
  });
  it("a failed lazy bulk count does not lock new activity defaults", async () => {
    mocks.callable.mockImplementation(async name => { if (name === "applyVisibilityToExistingActivities") throw new Error("unavailable"); return { data: { updated: 0, scope: "default" } }; });
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("S1-2-1b"));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("privacy.existingFailed"));
    expect(screen.getByRole("button", { name: /privacy.visOptEveryone/ })).not.toBeDisabled();
  });
  it("changes only new-activity defaults and never calls bulk execution", async () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const everyone = screen.getByRole("button", { name: /privacy.visOptEveryone/ });
    await waitFor(() => expect(everyone).not.toBeDisabled());
    fireEvent.click(everyone);
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledWith("updateDefaultVisibility", { visibility: "everyone" }));
    expect(mocks.callable).not.toHaveBeenCalledWith("applyVisibilityToExistingActivities", { visibility: "everyone" });
    expect(mocks.showToast).toHaveBeenCalledWith("privacy.visibilityChanged");
  });
  it("refreshes the count and requires confirmation before a separate existing-activity write", async () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const apply = screen.getByTestId("S1-2-1b");
    await waitFor(() => expect(apply).not.toBeDisabled());
    fireEvent.click(apply);
    await waitFor(() => expect(mocks.callable).toHaveBeenCalledWith("applyVisibilityToExistingActivities", { visibility: "private" }));
    expect(mocks.confirm).toHaveBeenCalledWith("privacy.existingConfirm", { destructive: true });
    expect(mocks.callable).not.toHaveBeenCalledWith("updateDefaultVisibility", expect.anything());
  });
  it("cancelling confirmation leaves all existing activity visibility unchanged", async () => {
    mocks.confirm.mockResolvedValue(false);
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const apply = screen.getByTestId("S1-2-1b");
    await waitFor(() => expect(apply).not.toBeDisabled()); fireEvent.click(apply);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.callable).not.toHaveBeenCalledWith("applyVisibilityToExistingActivities", { visibility: "private" });
  });

  it("rejects an unsupported default-scope response and locks further default changes", async () => {
    mocks.callable.mockImplementation(async name => ({ data: name === "applyVisibilityToExistingActivities" ? { count: 2 } : { updated: 2 } }));
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const everyone = screen.getByRole("button", { name: /privacy.visOptEveryone/ });
    await waitFor(() => expect(everyone).not.toBeDisabled()); fireEvent.click(everyone);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("privacy.changeFailed"));
    expect(everyone).toBeDisabled(); expect(mocks.showToast).not.toHaveBeenCalledWith("privacy.visibilityChanged");
  });

});
