import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaneTraining } from "./PaneTraining";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner-a" } as { uid: string } | null,
  staleProfile: { ftp: 333, weightKg: 88 },
  getDoc: vi.fn(),
  logClientError: vi.fn(),
  updateCanonicalFtp: vi.fn(async () => ({ ok: true })),
  persistRiderMetrics: vi.fn(async () => ({ failures: [] })),
  updateDoc: vi.fn(async () => undefined),
  setDoc: vi.fn(async () => undefined),
  showToast: vi.fn(),
  thresholdAccept: null as Promise<void> | null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { errors?: string }) =>
      vars?.errors ? `${key}:${vars.errors}` : key,
  }),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  setDoc: (...args: unknown[]) => mocks.setDoc(...args),
  updateDoc: (...args: unknown[]) => mocks.updateDoc(...args),
}));
vi.mock("../../services/firebase", () => ({ firestore: {} }));
vi.mock("../../services/errorLogger", () => ({
  logClientError: (...args: unknown[]) => mocks.logClientError(...args),
}));
vi.mock("../../services/syncRiderMetrics", () => ({
  persistRiderMetrics: (...args: unknown[]) => mocks.persistRiderMetrics(...args),
  syncRiderWeightToBikeProfiles: vi.fn(async () => undefined),
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
  useDialog: () => ({ confirm: vi.fn(async () => true) }),
}));
vi.mock("../../contexts/LocaleContext", () => ({
  useLocale: () => ({ units: "metric" }),
}));
vi.mock("../../hooks/useBikeProfiles", () => ({
  useBikeProfiles: () => ({ profiles: [] }),
}));
vi.mock("./ThresholdSuggestionBanner", () => ({
  ThresholdSuggestionBanner: ({ onAccepted }: {
    onAccepted: (applied: { lthr?: number; maxHr?: number }) => void;
  }) => (
    <>
      <button type="button" onClick={async () => {
        if (mocks.thresholdAccept) await mocks.thresholdAccept;
        onAccepted({ lthr: 172 });
      }}>apply-threshold</button>
      <button type="button" onClick={() => onAccepted({ maxHr: 192 })}>apply-max-hr</button>
    </>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("PaneTraining profile owner fencing", () => {
  beforeEach(() => {
    mocks.user = { uid: "owner-a" };
    vi.clearAllMocks();
    mocks.updateCanonicalFtp.mockResolvedValue({ ok: true });
    mocks.persistRiderMetrics.mockResolvedValue({ failures: [] });
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.setDoc.mockResolvedValue(undefined);
    mocks.thresholdAccept = null;
  });

  it("keeps B fields reset when B has no FTP and A's profile resolves later", async () => {
    const a = deferred<{ data: () => { ftp: number; weightKg: number } }>();
    const b = deferred<{ data: () => Record<string, never> }>();
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) => {
      if (path.includes("private")) {
        return Promise.resolve({ exists: () => false, data: () => ({}) });
      }
      return path[1] === "owner-a" ? a.promise : b.promise;
    });

    const view = render(<PaneTraining />);
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledWith({ path: ["users", "owner-a"] }));
    await act(async () => { a.resolve({ data: () => ({ ftp: 333, weightKg: 88 }) }); });
    expect(screen.getByDisplayValue("333")).toBeInTheDocument();
    expect(screen.getByDisplayValue("88")).toBeInTheDocument();

    mocks.user = { uid: "owner-b" };
    view.rerender(<PaneTraining />);
    expect(screen.queryByDisplayValue("333")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("88")).not.toBeInTheDocument();

    await act(async () => { b.resolve({ data: () => ({}) }); });
    const ftpInput = screen.getByText("training.fieldFtpHint")
      .closest("label")?.querySelector("input") as HTMLInputElement;
    const weightInput = screen.getByPlaceholderText("68") as HTMLInputElement;
    expect(ftpInput.value).toBe("");
    expect(weightInput.value).toBe("");
  });

  it("shows an owner-bound load error and retries the current owner", async () => {
    mocks.getDoc.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ ftp: 240 }) }),
    );
    render(<PaneTraining />);

    const retry = await screen.findByRole("button", { name: "common.retry" });
    fireEvent.click(retry);
    expect(await screen.findByDisplayValue("240")).toBeInTheDocument();
  });

  it("does not carry A's load error into B", async () => {
    const b = deferred<{ data: () => { ftp: number } }>();
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) => {
      if (path.includes("private")) return Promise.resolve({ exists: () => false, data: () => ({}) });
      return path[1] === "owner-a" ? Promise.reject(new Error("offline")) : b.promise;
    });
    const view = render(<PaneTraining />);
    expect(await screen.findByRole("button", { name: "common.retry" })).toBeInTheDocument();

    mocks.user = { uid: "owner-b" };
    view.rerender(<PaneTraining />);
    expect(screen.queryByRole("button", { name: "common.retry" })).not.toBeInTheDocument();
    await act(async () => { b.resolve({ data: () => ({ ftp: 255 }) }); });
    expect(await screen.findByDisplayValue("255")).toBeInTheDocument();
  });

  it("resets to the latest successfully saved profile values", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({
            ftp: 220,
            maxHr: 180,
            lthr: 165,
            thresholdPace: 275,
            css: 105,
            weightKg: 70,
            heightCm: 175,
          }) }),
    );
    render(<PaneTraining />);
    const ftpInput = await screen.findByDisplayValue("220") as HTMLInputElement;
    const maxHrInput = screen.getByDisplayValue("180") as HTMLInputElement;
    const lthrInput = screen.getByDisplayValue("165") as HTMLInputElement;
    const paceInput = screen.getByDisplayValue("4:35") as HTMLInputElement;
    const cssInput = screen.getByDisplayValue("1:45") as HTMLInputElement;
    const weightInput = screen.getByDisplayValue("70") as HTMLInputElement;
    const heightInput = screen.getByDisplayValue("175") as HTMLInputElement;

    fireEvent.change(ftpInput, { target: { value: "260" } });
    fireEvent.change(maxHrInput, { target: { value: "190" } });
    fireEvent.change(lthrInput, { target: { value: "175" } });
    fireEvent.change(paceInput, { target: { value: "4:20" } });
    fireEvent.change(cssInput, { target: { value: "1:35" } });
    fireEvent.change(weightInput, { target: { value: "72" } });
    fireEvent.change(heightInput, { target: { value: "178" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "training.btnSave" })).not.toBeDisabled());

    fireEvent.change(ftpInput, { target: { value: "200" } });
    fireEvent.change(maxHrInput, { target: { value: "170" } });
    fireEvent.change(lthrInput, { target: { value: "160" } });
    fireEvent.change(paceInput, { target: { value: "5:00" } });
    fireEvent.change(cssInput, { target: { value: "2:00" } });
    fireEvent.change(weightInput, { target: { value: "65" } });
    fireEvent.change(heightInput, { target: { value: "170" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnReset" }));

    expect(ftpInput.value).toBe("260");
    expect(maxHrInput.value).toBe("190");
    expect(lthrInput.value).toBe("175");
    expect(paceInput.value).toBe("4:20");
    expect(cssInput.value).toBe("1:35");
    expect(weightInput.value).toBe("72");
    expect(heightInput.value).toBe("178");
  });

  it("keeps cleared values cleared in the successful-save Reset baseline", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ ftp: 220, lthr: 165, thresholdPace: 275, css: 105 }) }),
    );
    render(<PaneTraining />);
    const ftpInput = await screen.findByDisplayValue("220") as HTMLInputElement;
    const lthrInput = screen.getByDisplayValue("165") as HTMLInputElement;
    const paceInput = screen.getByDisplayValue("4:35") as HTMLInputElement;
    const cssInput = screen.getByDisplayValue("1:45") as HTMLInputElement;

    for (const input of [ftpInput, lthrInput, paceInput, cssInput]) {
      fireEvent.change(input, { target: { value: "" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "training.btnSave" })).not.toBeDisabled());

    fireEvent.change(ftpInput, { target: { value: "250" } });
    fireEvent.change(lthrInput, { target: { value: "170" } });
    fireEvent.change(paceInput, { target: { value: "4:10" } });
    fireEvent.change(cssInput, { target: { value: "1:30" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnReset" }));

    expect(ftpInput.value).toBe("");
    expect(lthrInput.value).toBe("");
    expect(paceInput.value).toBe("");
    expect(cssInput.value).toBe("");
  });

  it("stops before FTP when rider metrics fail without claiming a rollback", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ ftp: 220, maxHr: 180 }) }),
    );
    mocks.persistRiderMetrics.mockRejectedValueOnce(new Error("metrics offline"));
    render(<PaneTraining />);
    fireEvent.change(await screen.findByDisplayValue("180"), { target: { value: "190" } });
    fireEvent.change(screen.getByDisplayValue("220"), { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "training.saveFailed: metrics offline",
    ));
    expect(mocks.updateCanonicalFtp).not.toHaveBeenCalled();
  });

  it("reports the medical stage as partial after profile fields were saved", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ ftp: 220, lthr: 160 }) }),
    );
    mocks.setDoc.mockRejectedValueOnce(new Error("medical offline"));
    render(<PaneTraining />);
    fireEvent.change(await screen.findByDisplayValue("160"), { target: { value: "165" } });
    fireEvent.change(screen.getByDisplayValue("220"), { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "training.syncPartialFail:medical: medical offline",
    ));
    expect(mocks.updateCanonicalFtp).not.toHaveBeenCalled();
  });

  it("reports non-FTP settings as saved when the final FTP command fails", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ ftp: 220 }) }),
    );
    mocks.updateCanonicalFtp.mockRejectedValueOnce(new Error("FTP offline"));
    render(<PaneTraining />);
    fireEvent.change(await screen.findByDisplayValue("220"), { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "training.syncPartialFail:FTP: FTP offline",
    ));
    expect(mocks.setDoc).toHaveBeenCalled();
  });

  it("resets and retries from saved private medical data after FTP failure", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => true, data: () => ({ medications: "old medicine" }) }
        : { data: () => ({ ftp: 220 }) }),
    );
    mocks.updateCanonicalFtp.mockRejectedValueOnce(new Error("FTP offline"));
    render(<PaneTraining />);
    const ftpInput = await screen.findByDisplayValue("220") as HTMLInputElement;
    const medicationInput = await screen.findByDisplayValue("old medicine") as HTMLInputElement;
    fireEvent.change(ftpInput, { target: { value: "240" } });
    fireEvent.change(medicationInput, { target: { value: "saved medicine" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "training.syncPartialFail:FTP: FTP offline",
    ));

    fireEvent.change(medicationInput, { target: { value: "stale retry" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnReset" }));
    expect(medicationInput.value).toBe("saved medicine");

    fireEvent.change(ftpInput, { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.updateCanonicalFtp).toHaveBeenCalledTimes(2));
    expect(mocks.setDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ medications: "saved medicine" }),
      { merge: true },
    );
  });

  it("stops A's save chain after an account switch during an awaited stage", async () => {
    const metrics = deferred<{ failures: never[] }>();
    mocks.persistRiderMetrics.mockReturnValueOnce(metrics.promise);
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ ftp: 220, maxHr: 180 }) }),
    );
    const view = render(<PaneTraining />);
    fireEvent.change(await screen.findByDisplayValue("180"), { target: { value: "190" } });
    fireEvent.change(screen.getByDisplayValue("220"), { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.persistRiderMetrics).toHaveBeenCalled());

    mocks.user = { uid: "owner-b" };
    view.rerender(<PaneTraining />);
    await act(async () => { metrics.resolve({ failures: [] }); });

    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.updateCanonicalFtp).not.toHaveBeenCalled();
  });

  it("keeps Save unavailable until private medical data is loaded", async () => {
    const medical = deferred<{
      exists: () => boolean;
      data: () => { medications: string };
    }>();
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      path.includes("private")
        ? medical.promise
        : Promise.resolve({ data: () => ({ ftp: 220 }) }),
    );
    render(<PaneTraining />);

    await screen.findByText("common.loading");
    expect(screen.queryByRole("button", { name: "training.btnSave" })).not.toBeInTheDocument();
    expect(mocks.setDoc).not.toHaveBeenCalled();

    await act(async () => {
      medical.resolve({ exists: () => true, data: () => ({ medications: "known medicine" }) });
    });
    expect(await screen.findByDisplayValue("known medicine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "training.btnSave" })).toBeInTheDocument();
  });

  it("requires a successful medical retry before Save can overwrite private data", async () => {
    mocks.getDoc.mockImplementationOnce(() => Promise.resolve({ data: () => ({ ftp: 220 }) }));
    mocks.getDoc.mockImplementationOnce(() => Promise.reject(new Error("medical offline")));
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => true, data: () => ({ medications: "known medicine" }) }
        : { data: () => ({ ftp: 220 }) }),
    );
    render(<PaneTraining />);

    const retry = await screen.findByRole("button", { name: "common.retry" });
    expect(screen.queryByRole("button", { name: "training.btnSave" })).not.toBeInTheDocument();
    expect(mocks.setDoc).not.toHaveBeenCalled();
    fireEvent.click(retry);

    expect(await screen.findByDisplayValue("known medicine")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ medications: "known medicine" }),
      { merge: true },
    ));
  });

  it("updates the Reset baseline when a threshold suggestion applies LTHR", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ lthr: 160 }) }),
    );
    render(<PaneTraining />);
    const lthrInput = await screen.findByDisplayValue("160") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "apply-threshold" }));
    expect(lthrInput.value).toBe("172");
    fireEvent.change(lthrInput, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnReset" }));
    expect(lthrInput.value).toBe("172");
  });

  it("updates the Reset baseline when a threshold suggestion applies max HR", async () => {
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ maxHr: 180 }) }),
    );
    render(<PaneTraining />);
    const maxHrInput = await screen.findByDisplayValue("180") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "apply-max-hr" }));
    expect(maxHrInput.value).toBe("192");
    fireEvent.change(maxHrInput, { target: { value: "170" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnReset" }));
    expect(maxHrInput.value).toBe("192");
  });

  it("ignores a deferred threshold acceptance after switching owners", async () => {
    const accept = deferred<void>();
    mocks.thresholdAccept = accept.promise;
    mocks.getDoc.mockImplementation(({ path }: { path: string[] }) =>
      Promise.resolve(path.includes("private")
        ? { exists: () => false, data: () => ({}) }
        : { data: () => ({ lthr: path[1] === "owner-a" ? 160 : 150 }) }),
    );
    const view = render(<PaneTraining />);
    await screen.findByDisplayValue("160");
    fireEvent.click(screen.getByRole("button", { name: "apply-threshold" }));

    mocks.user = { uid: "owner-b" };
    view.rerender(<PaneTraining />);
    const bLthr = await screen.findByDisplayValue("150") as HTMLInputElement;
    await act(async () => { accept.resolve(); });
    expect(bLthr.value).toBe("150");
  });
});
