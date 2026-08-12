import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@shared/types/deviceSettings";
import { PaneDevice } from "./PaneDevice";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner-a" } as { uid: string } | null,
  staleProfile: { ftp: 333 },
  getDoc: vi.fn(),
  updateCanonicalFtp: vi.fn(),
  updateDevice: vi.fn(async () => undefined),
  broadcastUserScoped: vi.fn(async () => ({ updated: 0, failures: [] })),
  showToast: vi.fn(),
  logClientError: vi.fn(),
  records: [] as unknown[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { message?: string }) =>
      vars?.message ? `${key}:${vars.message}` : key,
  }),
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
  useToast: () => ({ showToast: mocks.showToast }),
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
    update: (...args: unknown[]) => mocks.updateDevice(...args),
    broadcastUserScoped: (...args: unknown[]) => mocks.broadcastUserScoped(...args),
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
    mocks.updateDevice.mockResolvedValue(undefined);
    mocks.updateCanonicalFtp.mockResolvedValue({ ok: true });
    mocks.broadcastUserScoped.mockResolvedValue({ updated: 0, failures: [] });
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

  it("hydrates an untouched early draft but preserves a user-edited FTP", async () => {
    const first = deferred<{ data: () => { ftp: number } }>();
    mocks.getDoc.mockReturnValueOnce(first.promise);
    const view = render(<PaneDevice />);

    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    const ftpInput = screen.getByText("device.fieldFtpHint")
      .closest("label")?.querySelector("input") as HTMLInputElement;
    expect(ftpInput.value).toBe("");
    await act(async () => { first.resolve({ data: () => ({ ftp: 310 }) }); });
    expect(ftpInput.value).toBe("310");

    view.unmount();
    const second = deferred<{ data: () => { ftp: number } }>();
    mocks.getDoc.mockReturnValueOnce(second.promise);
    render(<PaneDevice />);
    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    const editedInput = screen.getByText("device.fieldFtpHint")
      .closest("label")?.querySelector("input") as HTMLInputElement;
    fireEvent.change(editedInput, { target: { value: "275" } });
    await act(async () => { second.resolve({ data: () => ({ ftp: 320 }) }); });
    expect(editedInput.value).toBe("275");
  });

  it("does not commit FTP when the device metrics stage fails", async () => {
    mocks.getDoc.mockResolvedValue({ data: () => ({ ftp: 250 }) });
    mocks.updateDevice.mockRejectedValueOnce(new Error("device offline"));
    render(<PaneDevice />);
    await screen.findByText("250 W");
    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    fireEvent.change(screen.getByDisplayValue("250"), { target: { value: "270" } });
    fireEvent.click(screen.getByRole("button", { name: "device.save" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "device.saveFailed:device offline",
    ));
    expect(mocks.updateCanonicalFtp).not.toHaveBeenCalled();
  });

  it("reports device metrics as saved when the final FTP stage fails", async () => {
    mocks.getDoc.mockResolvedValue({ data: () => ({ ftp: 250 }) });
    mocks.updateCanonicalFtp.mockRejectedValueOnce(new Error("FTP offline"));
    render(<PaneDevice />);
    await screen.findByText("250 W");
    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    fireEvent.change(screen.getByDisplayValue("250"), { target: { value: "270" } });
    fireEvent.click(screen.getByRole("button", { name: "device.save" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("device.saved · FTP device.saveFailed"),
    ));
    expect(mocks.updateDevice).toHaveBeenCalled();
  });

  it("retains broadcast warnings when the final FTP stage also fails", async () => {
    mocks.records.push({
      deviceId: "device-2",
      deviceName: "Tablet",
      updatedAt: 1,
      version: 1,
      settings: { ...DEFAULT_APP_SETTINGS },
    });
    mocks.getDoc.mockResolvedValue({ data: () => ({ ftp: 250 }) });
    mocks.broadcastUserScoped.mockResolvedValueOnce({
      updated: 0,
      failures: [{ deviceId: "device-2", deviceName: "Tablet", kind: "network", error: "offline" }],
    });
    mocks.updateCanonicalFtp.mockRejectedValueOnce(new Error("FTP offline"));
    render(<PaneDevice />);
    await screen.findByText("250 W");
    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    fireEvent.change(screen.getByDisplayValue("250"), { target: { value: "270" } });
    fireEvent.click(screen.getByRole("button", { name: "device.save" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("device.broadcastNetworkFailed"),
    ));
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining("FTP device.saveFailed"));
  });

  it("saves max HR and weight without mutating FTP when canonical load fails", async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error("profile offline"));
    render(<PaneDevice />);
    await waitFor(() => expect(mocks.logClientError).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: "device.editAriaLabel" })[0]);
    const ftpInput = screen.getByText("device.fieldFtpHint")
      .closest("label")?.querySelector("input") as HTMLInputElement;
    expect(ftpInput.value).toBe("");
    fireEvent.change(screen.getByDisplayValue(String(DEFAULT_APP_SETTINGS.maxHeartRate)), {
      target: { value: "195" },
    });
    fireEvent.click(screen.getByRole("button", { name: "device.save" }));

    await waitFor(() => expect(mocks.updateDevice).toHaveBeenCalledWith(
      "device-1",
      expect.objectContaining({ maxHeartRate: 195 }),
    ));
    expect(mocks.updateCanonicalFtp).not.toHaveBeenCalled();
  });
});
