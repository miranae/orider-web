import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => vi.fn(async () => ({ data: { updated: 0 } }))),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args: unknown[]) => ({ kind: "doc", args })),
  getDoc: vi.fn(async () => ({ data: () => ({}) })),
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
    confirm: vi.fn(async () => true),
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
  useLocalizedNavigate: () => vi.fn(),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("syncs Firebase Auth displayName after saving the Firestore nickname", async () => {
    render(<PaneAccount />);

    fireEvent.click(screen.getByLabelText("profile.editNickname"));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({ uid: "u1" }, { displayName: "New Name" }),
    );
    expect(mocks.showToast).toHaveBeenCalledWith("profile.nicknameUpdated");
  });

  it("shows a toast but does not throw when Auth displayName sync fails", async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error("network"));

    render(<PaneAccount />);

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
});
