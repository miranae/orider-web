import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { classifyFirestoreFatalError } from "../utils/firestoreSessionRecovery";

export function AppErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const previouslyOnline = useRef(online);

  useEffect(() => {
    const reconnected = !previouslyOnline.current && online;
    previouslyOnline.current = online;
    // A poisoned Firestore instance cannot recover by remounting its listeners.
    if (reconnected && !classifyFirestoreFatalError(error)) reset();
  }, [online, reset, error]);

  return (
    <div role="alert" aria-live="assertive" className="max-w-md mx-auto px-4 py-16 text-center">
      <h2 className="text-[length:var(--fs-xl)] font-bold mb-2" style={{ color: 'var(--ink-0)' }}>
        {online ? t("error.boundaryTitle") : t("error.offlineTitle")}
      </h2>
      <p className="text-[length:var(--fs-sm)] mb-4" style={{ color: 'var(--ink-3)' }}>
        {online ? (error?.toString() || t("error.unknownError")) : t("error.offlineDescription")}
      </p>
      {online ? (
        <button
          onClick={() => window.location.reload()}
          aria-label={t("error.reloadAriaLabel")}
          className="px-4 py-2 bg-[var(--lime)] text-[var(--bg-0)] rounded-[var(--r-lg)] hover:opacity-90"
        >
          {t("error.reload")}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="px-4 py-2 rounded-[var(--r-lg)] opacity-70"
          style={{ background: "var(--bg-3)", color: "var(--ink-2)" }}
        >
          {t("error.waitingOnline")}
        </button>
      )}
    </div>
  );
}
