import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { Notification } from "@shared/types";
import { timeAgo } from "../../utils/timeAgo";

interface NotifSheetProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
}

export default function NotifSheet({ open, onClose, notifications, onMarkAllRead }: NotifSheetProps) {
  const { t } = useTranslation("common");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[200] flex flex-col" role="dialog" aria-modal="true" aria-label={t("label.notifications")}>
      {/* Backdrop */}
      <div className="flex-1" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      {/* Sheet */}
      <div
        className="overflow-y-auto"
        style={{
          background: "var(--bg-1)",
          borderTop: "1px solid var(--line-soft)",
          maxHeight: "70%",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-0)" }}>{t("label.notifications")}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onMarkAllRead}
              style={{ fontSize: 12, color: "var(--lime)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: "10px 8px" }}
            >
              {t("button.markAllRead")}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 10, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={20} style={{ color: "var(--ink-3)" }} />
            </button>
          </div>
        </div>
        {notifications.length === 0 && (
          <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)", fontSize: 14 }}>
            {t("label.noNotifications")}
          </div>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-2.5"
            style={{
              padding: "13px 16px",
              borderBottom: "1px solid var(--line-soft)",
              background: n.read ? "transparent" : "color-mix(in oklch, var(--lime) 4%, var(--bg-0))",
            }}
          >
            <div
              style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                background: n.read ? "transparent" : "var(--lime)",
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.4 }}>
                {n.message || t("notif.fromUser", { fromNickname: n.fromNickname })}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>
                {n.createdAt ? timeAgo(n.createdAt, t) : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
