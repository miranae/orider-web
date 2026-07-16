import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDoc } from "firebase/firestore";

import * as errorLogger from "../services/errorLogger";
import {
  __resetFirestoreSessionRecoveryForTests,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
} from "../utils/firestoreSessionRecovery";
import { useFreshTraining } from "./useFreshTraining";

const mocks = vi.hoisted(() => ({
  authLoading: false,
  user: { uid: "training-user" } as { uid: string } | null,
}));

const firestoreRecoveryMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }),
}));

vi.mock("../utils/firestoreSessionRecovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/firestoreSessionRecovery")>();
  return {
    ...actual,
    executeFirestoreSessionRecovery: firestoreRecoveryMocks.execute,
  };
});

describe("useFreshTraining", () => {
  beforeEach(() => {
    mocks.authLoading = false;
    mocks.user = { uid: "training-user" };
    vi.mocked(getDoc).mockClear();
    __resetFirestoreSessionRecoveryForTests();
    window.sessionStorage.removeItem(FIRESTORE_B815_RECOVERY_SESSION_KEY);
    firestoreRecoveryMocks.execute.mockClear();
  });

  it("recovers the poisoned Firestore session when the freshness read reports b815", async () => {
    const assertion = new Error(
      "FIRESTORE (12.16.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)",
    );
    vi.mocked(getDoc).mockRejectedValue(assertion);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useFreshTraining());

    await waitFor(() => expect(result.current.lastStatus).toBe("error"));
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      assertion,
      expect.objectContaining({
        discipline: undefined,
        firestoreRecoveryKind: "b815",
        firestoreRecoveryAction: "reload-ready",
        firebaseSdkVersion: expect.any(String),
        pageVisibility: expect.any(String),
      }),
    );
    expect(window.sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBe("1");
    expect(firestoreRecoveryMocks.execute).toHaveBeenCalledWith({
      kind: "b815",
      action: "reload-ready",
    });
    expect(logSpy.mock.invocationCallOrder[0]).toBeLessThan(
      firestoreRecoveryMocks.execute.mock.invocationCallOrder[0]!,
    );
    logSpy.mockRestore();
  });

  it("keeps ordinary errors on the existing non-reload path", async () => {
    const unavailable = new Error("FirebaseError: unavailable");
    vi.mocked(getDoc).mockRejectedValue(unavailable);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { result } = renderHook(() => useFreshTraining("bike"));

    await waitFor(() => expect(result.current.lastStatus).toBe("error"));
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      unavailable,
      { discipline: "bike" },
    );
    expect(window.sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBeNull();
    expect(firestoreRecoveryMocks.execute).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("still recovers a global poisoned queue when the effect unmounts before rejection", async () => {
    let rejectRead!: (reason: unknown) => void;
    const pendingRead = new Promise<never>((_resolve, reject) => { rejectRead = reject; });
    vi.mocked(getDoc).mockReturnValue(pendingRead);
    const logSpy = vi.spyOn(errorLogger, "logClientError").mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useFreshTraining("run"));
    unmount();
    rejectRead(new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"));

    await waitFor(() => expect(firestoreRecoveryMocks.execute).toHaveBeenCalledTimes(1));
    expect(logSpy).toHaveBeenCalledWith(
      "useFreshTraining.revalidate",
      expect.any(Error),
      expect.objectContaining({
        discipline: "run",
        firestoreRecoveryKind: "b815",
        firestoreRecoveryAction: "reload-ready",
      }),
    );
    logSpy.mockRestore();
  });
});
