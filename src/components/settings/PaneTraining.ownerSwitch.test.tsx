import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaneTraining } from "./PaneTraining";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner-a" } as { uid: string } | null,
  staleProfile: { ftp: 333, weightKg: 88 },
  getDoc: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));
vi.mock("../../services/firebase", () => ({ firestore: {} }));
vi.mock("../../services/errorLogger", () => ({
  logClientError: (...args: unknown[]) => mocks.logClientError(...args),
}));
vi.mock("../../services/syncRiderMetrics", () => ({
  persistRiderMetrics: vi.fn(async () => ({ failures: [] })),
  syncRiderWeightToBikeProfiles: vi.fn(async () => undefined),
}));
vi.mock("../../services/ftpProfileClient", () => ({
  updateCanonicalFtp: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, profile: mocks.staleProfile }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
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
  ThresholdSuggestionBanner: () => null,
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
});
