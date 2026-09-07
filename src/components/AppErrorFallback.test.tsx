import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorFallback } from "./AppErrorFallback";
import { ErrorBoundary } from "./ErrorBoundary";
import { captureError } from "../services/sentry";
import {
  __resetFirestoreSessionRecoveryForTests,
  FIRESTORE_B815_RECOVERY_SESSION_KEY,
} from "../utils/firestoreSessionRecovery";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../services/sentry", () => ({ captureError: vi.fn() }));
const recoveryNavigation = vi.hoisted(() => ({ reload: vi.fn(), schedule: vi.fn() }));
vi.mock("../utils/firestoreSessionRecovery", async (importOriginal) => {
  const original = await importOriginal<typeof import("../utils/firestoreSessionRecovery")>();
  return {
    ...original,
    executeFirestoreSessionRecovery: (result: Parameters<typeof original.executeFirestoreSessionRecovery>[0]) => (
      original.executeFirestoreSessionRecovery(result, recoveryNavigation)
    ),
  };
});

const fatal = new Error("FIRESTORE (12.16.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)");

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
  act(() => { window.dispatchEvent(new Event(online ? "online" : "offline")); });
}

describe("App error recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
    sessionStorage.clear();
    __resetFirestoreSessionRecoveryForTests();
    setOnline(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not reset an online failure on mount, rerender, or remount", () => {
    const reset = vi.fn();
    const error = new Error("render failed");
    const view = render(<StrictMode><AppErrorFallback error={error} reset={reset} /></StrictMode>);
    view.rerender(<StrictMode><AppErrorFallback error={error} reset={reset} /></StrictMode>);
    view.unmount();
    render(<AppErrorFallback error={error} reset={reset} />);
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets a nonfatal error only on an offline-to-online transition", () => {
    const reset = vi.fn();
    render(<AppErrorFallback error={new Error("offline request")} reset={reset} />);
    expect(reset).not.toHaveBeenCalled();
    setOnline(false);
    expect(reset).not.toHaveBeenCalled();
    setOnline(true);
    expect(reset).toHaveBeenCalledTimes(1);
    setOnline(true);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not remount a poisoned instance when connectivity returns", () => {
    const reset = vi.fn();
    setOnline(false);
    render(<AppErrorFallback error={fatal} reset={reset} />);
    setOnline(true);
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("b815");
  });

  function Crash({ error }: { error: Error }): never { throw error; }
  function renderCrash(error: Error) {
    return render(
      <ErrorBoundary fallback={(props) => <AppErrorFallback {...props} />}>
        <Crash error={error} />
      </ErrorBoundary>,
    );
  }

  it("schedules the first caught fatal reload once and logs its recovery action", () => {
    const first = renderCrash(fatal);
    expect(sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBe("1");
    expect(recoveryNavigation.schedule).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(fatal, expect.objectContaining({
      extra: expect.objectContaining({ firestoreRecoveryAction: "reload-ready" }),
    }));
    first.unmount();
    renderCrash(fatal);
    expect(recoveryNavigation.schedule).toHaveBeenCalledTimes(1);
  });

  it("leaves fatal fallback stable after the session recovery budget is exhausted", () => {
    sessionStorage.setItem(FIRESTORE_B815_RECOVERY_SESSION_KEY, "1");
    renderCrash(fatal);
    setOnline(false);
    setOnline(true);
    expect(screen.getByRole("alert")).toHaveTextContent("b815");
    expect(recoveryNavigation.schedule).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("keeps a normal caught error in fallback without automatic navigation", () => {
    renderCrash(new Error("ordinary render error"));
    expect(screen.getByRole("alert")).toHaveTextContent("ordinary render error");
    expect(recoveryNavigation.schedule).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY)).toBeNull();
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
