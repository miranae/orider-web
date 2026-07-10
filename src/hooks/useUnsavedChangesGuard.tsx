import { useCallback, useEffect, useState } from "react";
import { Button } from "../theme/components";

interface UnsavedChangesGuardOptions {
  dirty: boolean;
  title: string;
  message: string;
  stayLabel: string;
  leaveLabel: string;
}

export function useUnsavedChangesGuard({
  dirty,
  title,
  message,
  stayLabel,
  leaveLabel,
}: UnsavedChangesGuardOptions) {
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, message]);

  const requestLeave = useCallback((leave: () => void) => {
    if (!dirty) {
      leave();
      return;
    }
    setPendingLeave(() => leave);
  }, [dirty]);

  const cancelLeave = useCallback(() => {
    setPendingLeave(null);
  }, []);

  const confirmLeave = useCallback(() => {
    const leave = pendingLeave;
    setPendingLeave(null);
    leave?.();
  }, [pendingLeave]);

  const guardDialog = pendingLeave ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label={stayLabel}
        onClick={cancelLeave}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-message"
        className="relative w-full max-w-md rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-0)] p-5 shadow-xl"
      >
        <h2 id="unsaved-changes-title" className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {title}
        </h2>
        <p id="unsaved-changes-message" className="mt-2 text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-2)]">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancelLeave}>
            {stayLabel}
          </Button>
          <Button type="button" variant="danger" onClick={confirmLeave}>
            {leaveLabel}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    requestLeave,
    guardDialog,
    confirmLeave,
    cancelLeave,
    hasPendingLeave: pendingLeave !== null,
  };
}
