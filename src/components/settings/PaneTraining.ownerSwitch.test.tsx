import { act, render, screen, waitFor } from "@testing-library/react";
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
});
