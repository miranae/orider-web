import { useId } from "react";
import { createPortal } from "react-dom";
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
  /** Retained for callers; every modal now provides the same keyboard access. */
  accessible?: boolean;
  /** Preserve scoped presentation when moving an existing wrapper into the body portal. */
  portalClassName?: string;
  busy?: boolean;
  layer?: number;
}

export default function Modal({ open, onClose, title, children, maxWidth = "max-w-md", portalClassName, busy = false, layer }: ModalProps) {
  if (!open) return null;
  const overlay = <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: layer ?? "var(--layer-modal)" }}>
    <div className="absolute inset-0 bg-black/50" onClick={() => { if (!busy) onClose(); }} />
    <AccessibleModalPanel onClose={onClose} title={title} maxWidth={maxWidth} busy={busy}>{children}</AccessibleModalPanel>
  </div>;
  return createPortal(portalClassName ? <div className={portalClassName}>{overlay}</div> : overlay, document.body);
}

function AccessibleModalPanel({ onClose, title, maxWidth, children, busy }: Pick<ModalProps, "onClose" | "title" | "maxWidth" | "children" | "busy">) {
  const ref = useTrainingDialog(onClose, busy ?? false);
  const titleId = useId();
  const { t } = useTranslation("common");
  return <Card ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy || undefined} tabIndex={-1}
    padding="none" className={`club-surface club-dialog relative w-full ${maxWidth} mx-4 p-6!`}
    style={{ background: "var(--bg-1)", maxHeight: "min(90vh, 720px)", overflowY: "auto", overscrollBehavior: "contain", boxShadow: "var(--shadow-lg)" }}>
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 id={titleId} className="club-card-title" style={{color:"var(--ink-0)",margin:0}}>{title}</h2>
      <Button data-dialog-initial-focus type="button" variant="ghost" size="sm" aria-label={t("button.close")} disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></Button>
    </div>
    {children}
  </Card>;
}
