import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner-a" } as { uid: string } | null,
  callable: vi.fn(),
  showToast: vi.fn(),
  onAccepted: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.callable }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn((_query, onNext) => {
    onNext({
      docs: [{
        id: "activity-1",
        data: () => ({
          accepted: false,
          dismissed: false,
          ftp: { current: 220, proposed: 240, reason: "test" },
        }),
      }],
    });
    return vi.fn();
  }),
}));

function deferred<T>() {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((_resolve, fail) => { reject = fail; });
  return { promise, reject };
}

describe("ThresholdSuggestionBanner owner fencing", () => {
  beforeEach(() => {
    mocks.user = { uid: "owner-a" };
    vi.clearAllMocks();
  });

  it("does not show A's deferred failure toast after switching to B", async () => {
    const request = deferred<{ data: { ok: boolean; applied: Record<string, number> } }>();
    mocks.callable.mockReturnValueOnce(request.promise);
    const view = render(<ThresholdSuggestionBanner onAccepted={mocks.onAccepted} />);
    fireEvent.click(await screen.findByRole("button", { name: "threshold.acceptAll" }));

    mocks.user = { uid: "owner-b" };
    view.rerender(<ThresholdSuggestionBanner onAccepted={mocks.onAccepted} />);
    await act(async () => { request.reject(new Error("offline")); });
    await waitFor(() => expect(mocks.callable).toHaveBeenCalled());

    expect(mocks.showToast).not.toHaveBeenCalledWith("threshold.acceptFailed");
    expect(mocks.onAccepted).not.toHaveBeenCalled();
  });
});
