import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export default function OfflineBanner() {
  const { t } = useTranslation("common");
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        padding: "var(--space-2) var(--space-4)",
        textAlign: "center",
        background: "var(--amber)",
        color: "var(--bg-0)",
        fontSize: "var(--fs-sm)",
        fontWeight: 600,
      }}
    >
      {t("error.offlineBanner")}
    </div>
  );
}
