import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { getDoc, getDocFromServer } from "firebase/firestore";
import { PaneAccount } from "./PaneAccount";

const mocks = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  profile: { nickname: "Old Name" } as Record<string, unknown> | null,
  updateDoc: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => undefined),
  uploadBytes: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
  getMetadata: vi.fn(async () => ({ generation: "2" })),
  promptValue: "New Name",
  logClientError: vi.fn(),
  showToast: vi.fn(),
  currentUser: { uid: "u1" } as { uid: string } | null,
  callable: vi.fn(),
  navigate: vi.fn(),
  confirm: vi.fn(async () => true),
}));

// 연결 카드는 자체 테스트(SocialLinksCard.test.tsx) — 여기선 계정 화면의 읽기·쓰기 계약만 본다.
vi.mock("./ProfileBodyEditor", () => ({ ProfileBodyEditor: () => <section id="body-info">Body measurements</section> }));
vi.mock("./SocialLinksCard", () => ({ SocialLinksCard: () => null }));
// Preferences have their own account-generation/AppCheck/save regression suite.
vi.mock("./NotificationPreferencesCard", () => ({ NotificationPreferencesCard: () => <section data-testid="notification-preferences">Notification preferences</section> }));
vi.mock("./PaneAiCoach", () => ({ PaneAiCoach: () => <section data-testid="coach-consent">Consent</section> }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (input: unknown) => mocks.callable(name, input),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args: unknown[]) => ({ kind: "doc", args })),
  getDocFromServer: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
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
  ref: (_storage: unknown, fullPath: string) => ({ bucket: "test.firebasestorage.app", fullPath }),
  uploadBytes: mocks.uploadBytes,
  deleteObject: mocks.deleteObject,
  getMetadata: mocks.getMetadata,
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
    mocks.uploadBytes.mockReset();
    mocks.deleteObject.mockClear();
    mocks.getMetadata.mockClear();
    mocks.logClientError.mockClear();
    mocks.showToast.mockClear();
    mocks.navigate.mockClear();
    mocks.confirm.mockClear().mockResolvedValue(true);
    mocks.callable.mockReset().mockImplementation(async (name, input) => ({ data: name === "applyVisibilityToExistingActivities" ? input.dryRun ? { count: 2 } : { updated: 2 } : { updated: 0, scope: "default" } }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("replaces the same object twice and only varies the settings preview URL", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 512, height: 512, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["test"], { type: "image/webp" })));
    mocks.uploadBytes.mockResolvedValueOnce({ metadata: { generation: "1" } })
      .mockResolvedValueOnce({ metadata: { generation: "2" } });
    const { container } = render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const input = container.querySelector("input[type=file]")!;
    const url = "https://firebasestorage.googleapis.com/v0/b/test.firebasestorage.app/o/profiles%2Fu1%2Favatar?alt=media";
    for (const generation of [1, 2]) {
      fireEvent.change(input, { target: { files: [new File(["fixture"], "photo.png", { type: "image/png" })] } });
      await waitFor(() => expect(screen.getByRole("img", { name: "Old Name" })).toHaveAttribute("src", `${url}&v=${generation}`));
    }
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(2);
    for (const [storageRef, , metadata] of mocks.uploadBytes.mock.calls) {
      expect(storageRef).toEqual({ bucket: "test.firebasestorage.app", fullPath: "profiles/u1/avatar" });
      expect(metadata).toEqual({ cacheControl: "public, max-age=300", contentType: "image/webp" });
    }
    expect(mocks.updateDoc).toHaveBeenNthCalledWith(1, expect.anything(), { photoURL: url });
    expect(mocks.updateDoc).toHaveBeenNthCalledWith(2, expect.anything(), { photoURL: url });
    vi.mocked(getDocFromServer).mockResolvedValueOnce({ data: () => ({ photoURL: url }) } as Awaited<ReturnType<typeof getDocFromServer>>);
    fireEvent.click(screen.getByRole("button", { name: "profile.photoDelete" }));
    await waitFor(() => expect(mocks.deleteObject).toHaveBeenCalledWith({ bucket: "test.firebasestorage.app", fullPath: "profiles/u1/avatar" }));
    expect(mocks.updateDoc).toHaveBeenLastCalledWith(expect.anything(), { photoURL: null });
  });

  it("records an avatar image failure and falls back to an initial", () => {
    const url = "https://firebasestorage.googleapis.com/v0/b/test.firebasestorage.app/o/profiles%2Fu1%2Favatar?alt=media";
    mocks.profile = { ...mocks.profile, photoURL: url };
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);

    fireEvent.error(screen.getByRole("img", { name: "Old Name" }));
    expect(mocks.logClientError).toHaveBeenCalledWith("ProfileAvatar.image", expect.any(Error), { stage: "load_image" });
    expect(screen.queryByRole("img", { name: "Old Name" })).toBeNull();
  });

  it("keeps the old photo and records the stage when the upload fails", async () => {
    const oldPhoto = "https://example.test/old-photo.png";
    mocks.profile = { ...mocks.profile, photoURL: oldPhoto };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 512, height: 512, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["test"], { type: "image/webp" })));
    const failure = new Error("upload failed");
    mocks.uploadBytes.mockRejectedValueOnce(failure);
    const { container } = render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["fixture"], "photo.png", { type: "image/png" })] } });
    await waitFor(() => expect(mocks.logClientError).toHaveBeenCalledWith("PaneAccount.changeAvatar", failure, { stage: "upload" }));
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Old Name" })).toHaveAttribute("src", oldPhoto);
  });

  it("keeps optional medical details discoverable and places consent before account actions", () => {
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const summary = screen.getByText("pane.account.medicalSummary");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("coach-consent").compareDocumentPosition(screen.getByText("pane.account.cardManagement")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const data = screen.getByRole("link", { name: "pane.account.manageData" });
    expect(data).toHaveAttribute("href", "/ko/settings/data");
    expect(data).toHaveAttribute("title", "pane.account.manageData");
    expect(data).toHaveClass("ds-btn--icon-only");
    expect(data).not.toHaveClass("ds-btn--secondary");
    expect(screen.getByRole("button", { name: "pane.account.deleteBtnLabel" })).toBeInTheDocument();
  });

  it("shows the public profile toggle on when the setting was never chosen, off only when explicitly disabled", () => {
    // 스트라바처럼 프로필 기본 공개 — 서버 투영(profilePublic !== false)과 같은 기준
    const view = render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    expect(screen.getByRole("switch", { name: "privacy.profilePublicInline" })).toBeChecked();
    view.unmount();
    mocks.profile = { nickname: "Old Name", profilePublic: false };
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    expect(screen.getByRole("switch", { name: "privacy.profilePublicInline" })).not.toBeChecked();
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

  it("사진 변경은 아바타 모서리 배지 하나, 삭제는 아바타를 가리지 않게 옆에 두고, 코드 복사는 친구 코드 옆 아이콘이며 따로 떨어진 버튼 줄은 없다", async () => {
    mocks.profile = { nickname: "Old Name", photoURL: "https://example.test/me.webp" };
    // 다른 읽기와 섞여도 친구 코드가 들어오도록 이 테스트 동안만 모든 사용자 문서 읽기가 코드를 돌려준다
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ friendCode: "ABC123" }) } as never);
    const { container } = render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    const copy = await screen.findByRole("button", { name: "profile.copyCode" });
    const avatar = container.querySelector(".settings-profile-avatar");
    for (const name of ["profile.photoChange", "profile.photoDelete"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("ds-btn--icon-only");
      expect(button).toHaveAttribute("title", name);
      expect(button.textContent).toBe("");
    }
    // 아바타 위에는 카메라 배지 하나만 걸친다 — 삭제 아이콘은 사진을 가리지 않도록 아바타 바깥 옆자리
    const change = screen.getByRole("button", { name: "profile.photoChange" });
    const remove = screen.getByRole("button", { name: "profile.photoDelete" });
    expect(avatar?.querySelector(".settings-profile-avatar__badge")).toContainElement(change);
    expect(avatar?.querySelectorAll("button")).toHaveLength(1);
    expect(avatar).not.toContainElement(remove);
    expect(container.querySelector(".settings-profile-avatar-group")).toContainElement(remove);
    expect(copy).toHaveClass("ds-btn--icon-only");
    expect(copy).toHaveAttribute("title", "profile.copyCode");
    expect(copy.textContent).toBe("");
    expect(screen.getByText("ABC123").parentElement).toContainElement(copy);
    expect(container.querySelector(".settings-profile-actions")).toBeNull();
    // 닉네임 변경도 「변경」 글자 없이 연필 아이콘만
    const nickname = screen.getByRole("button", { name: "profile.editNickname" });
    expect(nickname).toHaveClass("ds-btn--icon-only");
    expect(nickname).toHaveAttribute("title", "profile.editNickname");
    expect(nickname.textContent).toBe("");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => ({}) } as never);
  });

  it("사진이 없으면 삭제 아이콘을 숨기고, 있으면 확인 뒤에만 지운다", async () => {
    const view = render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "profile.photoDelete" })).toBeNull();
    view.unmount();
    mocks.profile = { nickname: "Old Name", photoURL: "https://example.test/me.webp" };
    mocks.confirm.mockResolvedValueOnce(false);
    render(<MemoryRouter><PaneAccount /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "profile.photoDelete" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith("profile.photoDeleteConfirm", { destructive: true }));
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "profile.photoDelete" }));
    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledWith(expect.anything(), { photoURL: null }));
  });

});
