import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetFirestoreSessionRecoveryForTests,
  classifyFirestoreFatalError,
  executeFirestoreSessionRecovery,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
  prepareFirestoreSessionRecovery,
  shouldAbortForFirestoreRecovery,
} from "./firestoreSessionRecovery";

function preparationEnvironment(initialValue: string | null = null) {
  let storedValue = initialValue;
  return {
    sessionStorage: {
      getItem: vi.fn(() => storedValue),
      setItem: vi.fn((_key: string, value: string) => { storedValue = value; }),
    },
  };
}

describe("Firestore session recovery", () => {
  beforeEach(() => {
    __resetFirestoreSessionRecoveryForTests();
  });

  it("classifies b815 and the poisoned AsyncQueue follow-up without matching ordinary errors", () => {
    expect(classifyFirestoreFatalError(
      new Error("FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"),
    )).toBe("b815");
    expect(classifyFirestoreFatalError(
      new Error("INTERNAL ASSERTION FAILED: AsyncQueue is already failed"),
    )).toBe("async-queue-failed");
    expect(classifyFirestoreFatalError(new Error("FirebaseError: unavailable"))).toBeNull();
  });

  it("marks the browser session before issuing one hard reload", () => {
    const environment = preparationEnvironment();
    const result = prepareFirestoreSessionRecovery(
      new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"),
      environment,
    );

    expect(result).toEqual({ kind: "b815", action: "reload-ready" });
    expect(environment.sessionStorage.setItem).toHaveBeenCalledWith(FIRESTORE_B815_RECOVERY_SESSION_KEY, "1");
    expect(shouldAbortForFirestoreRecovery(result)).toBe(true);
  });

  it("suppresses concurrent retry waves while the reload is pending", () => {
    const environment = preparationEnvironment();
    prepareFirestoreSessionRecovery(new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"), environment);

    const result = prepareFirestoreSessionRecovery(
      new Error("AsyncQueue is already failed"),
      environment,
    );

    expect(result).toEqual({ kind: "async-queue-failed", action: "reload-pending" });
    expect(shouldAbortForFirestoreRecovery(result)).toBe(true);
  });

  it("falls through after a reload was already attempted in this browser session", () => {
    const environment = preparationEnvironment("1");
    const result = prepareFirestoreSessionRecovery(
      new Error("INTERNAL ASSERTION FAILED: AsyncQueue is already failed"),
      environment,
    );

    expect(result).toEqual({ kind: "async-queue-failed", action: "already-attempted" });
    expect(shouldAbortForFirestoreRecovery(result)).toBe(false);
  });

  it("does not reload when session storage is unavailable", () => {
    const result = prepareFirestoreSessionRecovery(
      new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"),
      {
        sessionStorage: {
          getItem: () => { throw new Error("blocked"); },
          setItem: vi.fn(),
        },
      },
    );

    expect(result.action).toBe("storage-unavailable");
    expect(shouldAbortForFirestoreRecovery(result)).toBe(false);
  });

  it("schedules exactly one reload only after an eligible plan is executed", () => {
    const result = prepareFirestoreSessionRecovery(
      new Error("INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"),
      preparationEnvironment(),
    );
    const reload = vi.fn();
    const schedule = vi.fn((callback: () => void) => callback());

    executeFirestoreSessionRecovery(result, { reload, schedule });
    executeFirestoreSessionRecovery({ kind: "b815", action: "reload-pending" }, { reload, schedule });

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
