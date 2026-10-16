import { useEffect, useCallback, useId } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useTrainingDialog } from "./training/useTrainingDialog";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, Card } from "../theme/components";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** Club dialogs opt into the existing keyboard/focus primitive. */
  accessible?: boolean;
}

export default function Modal({ open, onClose, title, children, maxWidth = "max-w-md", accessible = false }: ModalProps) {
  useBodyScrollLock(open && !accessible);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open && !accessible) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, accessible, handleEscape]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {accessible ? <AccessibleModalPanel onClose={onClose} title={title} maxWidth={maxWidth}>{children}</AccessibleModalPanel> : <Card
        padding="none"
        className={`relative w-full ${maxWidth} mx-4 p-6!`}
        style={{ background: "var(--bg-1)", maxHeight: "min(90vh, 720px)", overflowY: "auto", overscrollBehavior: "contain", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="text-[length:var(--fs-lg)] font-bold mb-4" style={{ color: "var(--ink-0)" }}>{title}</h2>
        {children}
      </Card>}
    </div>
  );
}

function AccessibleModalPanel({ onClose, title, maxWidth, children }: Pick<ModalProps, "onClose" | "title" | "maxWidth" | "children">) {
  const ref = useTrainingDialog(onClose, false);
  const titleId = useId();
  const { t } = useTranslation("common");
  return <Card ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
    padding="none" className={`club-surface club-dialog relative w-full ${maxWidth} mx-4 p-6!`}
    style={{ background: "var(--bg-1)", maxHeight: "min(90vh, 720px)", overflowY: "auto", overscrollBehavior: "contain", boxShadow: "var(--shadow-lg)" }}>
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 id={titleId} className="club-card-title" style={{color:"var(--ink-0)",margin:0}}>{title}</h2>
      <Button data-dialog-initial-focus type="button" variant="ghost" size="sm" aria-label={t("button.close")} onClick={onClose}><X size={18} aria-hidden="true" /></Button>
    </div>
    {children}
  </Card>;
}
