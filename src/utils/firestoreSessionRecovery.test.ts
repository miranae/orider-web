import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetFirestoreSessionRecoveryForTests,
  classifyFirestoreFatalError,
  executeFirestoreSessionRecovery,
  findFirestoreFatalError,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
  prepareFirestoreSessionRecovery,
  noteFirestoreServerSuccess,
  shouldAbortForFirestoreRecovery,
} from "./firestoreSessionRecovery";

function preparationEnvironment(initialValue: string | null = null) {
  let storedValue = initialValue;
  return {
    sessionStorage: {
      getItem: vi.fn(() => storedValue),
      setItem: vi.fn((_key: string, value: string) => { storedValue = value; }),
      removeItem: vi.fn(() => { storedValue = null; }),
    },
  };
}

describe("Firestore session recovery", () => {
  beforeEach(() => {
    __resetFirestoreSessionRecoveryForTests();
  });
  afterEach(() => vi.useRealTimers());

  const server = { fromCache: false, hasPendingWrites: false };
  const fatal = new Error("AsyncQueue is already failed");

  it("rearms only after two server confirmations spanning a healthy minute", () => {
    vi.useFakeTimers();
    const environment = preparationEnvironment("1");
    noteFirestoreServerSuccess(server, environment);
    vi.advanceTimersByTime(59_999);
    noteFirestoreServerSuccess(server, environment);
    expect(environment.sessionStorage.removeItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    noteFirestoreServerSuccess(server, environment);
    expect(prepareFirestoreSessionRecovery(fatal, environment).action).toBe("reload-ready");
    __resetFirestoreSessionRecoveryForTests(); // next document, before any server proof
    expect(prepareFirestoreSessionRecovery(fatal, environment).action).toBe("already-attempted");
  });

  it("does not rearm from time, cache, local writes, or missing metadata", () => {
    vi.useFakeTimers();
    const environment = preparationEnvironment("1");
    noteFirestoreServerSuccess(server, environment);
    vi.advanceTimersByTime(120_000);
    expect(environment.sessionStorage.removeItem).not.toHaveBeenCalled();
    noteFirestoreServerSuccess({ fromCache: true, hasPendingWrites: false }, environment);
    noteFirestoreServerSuccess({ fromCache: false, hasPendingWrites: true }, environment);
    noteFirestoreServerSuccess(undefined, environment);
    expect(environment.sessionStorage.removeItem).not.toHaveBeenCalled();
    expect(prepareFirestoreSessionRecovery(fatal, environment).action).toBe("already-attempted");
  });

  it("restarts the healthy window for every suppressed fatal error", () => {
    vi.useFakeTimers();
    const environment = preparationEnvironment("1");
    noteFirestoreServerSuccess(server, environment);
    vi.advanceTimersByTime(60_000);
    prepareFirestoreSessionRecovery(fatal, environment);
    noteFirestoreServerSuccess(server, environment);
    expect(environment.sessionStorage.removeItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    noteFirestoreServerSuccess(server, environment);
    expect(environment.sessionStorage.removeItem).toHaveBeenCalledOnce();
  });

  it("never rearms while navigation is pending", () => {
    vi.useFakeTimers();
    const environment = preparationEnvironment();
    prepareFirestoreSessionRecovery(fatal, environment);
    noteFirestoreServerSuccess(server, environment);
    vi.advanceTimersByTime(60_000);
    noteFirestoreServerSuccess(server, environment);
    expect(environment.sessionStorage.removeItem).not.toHaveBeenCalled();
    expect(prepareFirestoreSessionRecovery(fatal, environment).action).toBe("reload-pending");
  });

  it("keeps the marker and resets proof when storage removal fails", () => {
    vi.useFakeTimers();
    const environment = preparationEnvironment("1");
    environment.sessionStorage.removeItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    noteFirestoreServerSuccess(server, environment);
    vi.advanceTimersByTime(60_000);
    expect(() => noteFirestoreServerSuccess(server, environment)).not.toThrow();
    noteFirestoreServerSuccess(server, environment);
    expect(environment.sessionStorage.getItem()).toBe("1");
    expect(environment.sessionStorage.removeItem).toHaveBeenCalledOnce();
  });

  it("classifies the initial internal TypeError, b815, and the poisoned AsyncQueue follow-up", () => {
    expect(classifyFirestoreFatalError(
      new TypeError("n.tc.get is not a function or its return value is not iterable"),
    )).toBe("internal-get-type-error");
    expect(classifyFirestoreFatalError(
      new Error("FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"),
    )).toBe("b815");
    expect(classifyFirestoreFatalError(
      new Error("INTERNAL ASSERTION FAILED: AsyncQueue is already failed"),
    )).toBe("async-queue-failed");
    expect(classifyFirestoreFatalError(new Error("FirebaseError: unavailable"))).toBeNull();
    expect(classifyFirestoreFatalError(new TypeError("cache.get is not a function"))).toBeNull();
    expect(classifyFirestoreFatalError(
      new TypeError("cache.get is not a function or its return value is not iterable"),
    )).toBeNull();
    expect(classifyFirestoreFatalError(
      new TypeError("foo.tc.get is not a function or its return value is not iterable"),
    )).toBeNull();
    expect(classifyFirestoreFatalError(
      new TypeError("foo.n.tc.get is not a function or its return value is not iterable"),
    )).toBeNull();
    expect(classifyFirestoreFatalError(
      new TypeError("$n.tc.get is not a function or its return value is not iterable"),
    )).toBeNull();
    expect(classifyFirestoreFatalError(
      new TypeError("N.TC.GET is not a function or its return value is not iterable"),
    )).toBeNull();
    expect(classifyFirestoreFatalError(
      new Error("n.tc.get is not a function or its return value is not iterable"),
    )).toBeNull();
  });

  it("finds a fatal ErrorEvent message even when its error object is unrelated", () => {
    const unrelated = new TypeError("render failed");
    const fatalMessage = "Uncaught TypeError: n.tc.get is not a function or its return value is not iterable";
    const selected = findFirestoreFatalError(unrelated, fatalMessage);

    expect(selected).toBe(fatalMessage);
    expect(selected).not.toBe(unrelated);
    expect(findFirestoreFatalError(unrelated, "Uncaught TypeError: cache.get is not a function")).toBeNull();
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

  it("reloads once when the initial TypeError is followed by the b815 assertion", () => {
    const environment = preparationEnvironment();
    const initial = prepareFirestoreSessionRecovery(
      new TypeError("n.tc.get is not a function or its return value is not iterable"),
      environment,
    );
    const assertion = prepareFirestoreSessionRecovery(
      new Error("FIRESTORE (12.16.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)"),
      environment,
    );
    const reload = vi.fn();
    const schedule = vi.fn((callback: () => void) => callback());

    executeFirestoreSessionRecovery(initial, { reload, schedule });
    executeFirestoreSessionRecovery(assertion, { reload, schedule });

    expect(initial).toEqual({ kind: "internal-get-type-error", action: "reload-ready" });
    expect(assertion).toEqual({ kind: "b815", action: "reload-pending" });
    expect(environment.sessionStorage.setItem).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
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
