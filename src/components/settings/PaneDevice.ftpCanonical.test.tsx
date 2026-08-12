import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@shared/types/deviceSettings";
import { PaneDevice } from "./PaneDevice";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner-a" } as { uid: string } | null,
  staleProfile: { ftp: 333 },
  getDoc: vi.fn(),
  updateCanonicalFtp: vi.fn(),
  logClientError: vi.fn(),
  records: [] as unknown[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, _users: string, ownerUid: string) => ({ ownerUid })),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
}));

vi.mock("../../services/firebase", () => ({ firestore: {} }));
vi.mock("../../services/errorLogger", () => ({
  logClientError: (...args: unknown[]) => mocks.logClientError(...args),
}));
vi.mock("../../services/deviceSettingsClient", () => ({
  deleteDevice: vi.fn(),
  renameDevice: vi.fn(),
}));
vi.mock("../../services/ftpProfileClient", () => ({
  updateCanonicalFtp: (...args: unknown[]) => mocks.updateCanonicalFtp(...args),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, profile: mocks.staleProfile }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../contexts/DialogContext", () => ({
  useDialog: () => ({
    prompt: vi.fn(async () => null),
    confirm: vi.fn(async () => true),
  }),
}));
vi.mock("../../hooks/useDeviceSettings", () => ({
  useAllDeviceSettings: () => ({
    records: mocks.records,
    loading: false,
    error: null,
    reload: vi.fn(),
    update: vi.fn(async () => undefined),
    broadcastUserScoped: vi.fn(async () => ({ updated: 0, failures: [] })),
  }),
}));
vi.mock("./LayoutEditorCard", () => ({ LayoutEditorCard: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("PaneDevice canonical FTP owner fencing", () => {
  beforeEach(() => {
    mocks.user = { uid: "owner-a" };
    mocks.records = [{
      deviceId: "device-1",
      deviceName: "Phone",
      updatedAt: 1,
      version: 1,
      settings: { ...DEFAULT_APP_SETTINGS },
    }];
    vi.clearAllMocks();
  });

  it("does not seed B's rider draft from stale A profile or A's deferred response", async () => {
    const a = deferred<{ data: () => { ftp: number } }>();
    const b = deferred<{ data: () => Record<string, never> }>();
    mocks.getDoc.mockImplementation(({ ownerUid }: { ownerUid: string }) =>
      ownerUid === "owner-a" ? a.promise : b.promise,
    );

    const view = render(<PaneDevice />);
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledWith({ ownerUid: "owner-a" }));
    await act(async () => { a.resolve({ data: () => ({ ftp: 333 }) }); });
    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    expect(screen.getByDisplayValue("333")).toBeInTheDocument();

    mocks.user = { uid: "owner-b" };
    view.rerender(<PaneDevice />);
    expect(screen.queryByDisplayValue("333")).not.toBeInTheDocument();

    await act(async () => { b.resolve({ data: () => ({}) }); });
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledWith({ ownerUid: "owner-b" }));

    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    const ftpInput = screen.getByText("device.fieldFtpHint")
      .closest("label")?.querySelector("input") as HTMLInputElement;
    expect(ftpInput.value).toBe("");
  });
});
