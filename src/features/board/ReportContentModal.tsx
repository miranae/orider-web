import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { Button, Card } from "../../theme/components";
import type { BoardReportPreview, BoardReportReason, BoardReportTargetType } from "./reportPayload";

const reasons: BoardReportReason[] = ["spam", "abuse", "privacy", "illegal", "other"];

interface ReportContentModalProps {
  targetType: BoardReportTargetType;
  preview: BoardReportPreview;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: BoardReportReason, note: string) => Promise<void>;
}

export function ReportContentModal({
  targetType,
  preview,
  submitting,
  onClose,
  onSubmit,
}: ReportContentModalProps) {
  const { t, i18n } = useTranslation("board");
  const [reason, setReason] = useState<BoardReportReason>("spam");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const pendingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const noteId = useId();
  const countId = useId();
  const busy = submitting || sending;
  useBodyScrollLock(true);

  useEffect(() => {
    const previousFocus = document.activeElement;
    (closeRef.current?.disabled ? dialogRef.current : closeRef.current)?.focus();
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) {
        (closeRef.current?.disabled ? dialogRef.current : closeRef.current)?.focus();
      }
    };
    document.addEventListener("focusin", keepFocusInside);
    return () => {
      document.removeEventListener("focusin", keepFocusInside);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  const requestClose = () => {
    if (!busy && !pendingRef.current) onClose();
  };

  const submit = async () => {
    if (busy || pendingRef.current) return;
    pendingRef.current = true;
    setSending(true);
    setFailed(false);
    dialogRef.current?.focus();
    try {
      await onSubmit(reason, note);
    } catch {
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
          ':is(button, textarea, input):not(:disabled)',
        ) ?? []).filter((element) => !(element instanceof HTMLInputElement) || element.checked);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          dialogRef.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        disabled={busy}
        className="absolute inset-0 bg-black/50"
        onClick={requestClose}
      />
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
        padding="none"
        className="relative w-full max-w-lg overflow-y-auto overscroll-contain p-5! md:p-6! rounded-[var(--r-xl)] text-[length:var(--ft-body-size)] leading-[var(--ft-body-line-height)]"
        style={{ maxHeight: "calc(100dvh - var(--space-8))", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[length:var(--fs-lg)] font-semibold text-[var(--ink-0)]">
              {t("report.title", { target: t(`report.target.${targetType}`) })}
            </h2>
            <p id={descriptionId} className="text-[var(--ink-2)] mt-2">
              {t("report.description")}
            </p>
          </div>
          <Button ref={closeRef} iconOnly variant="ghost" onClick={requestClose} disabled={busy} aria-label={t("report.close")} className="shrink-0">
            <X aria-hidden="true" size={20} />
          </Button>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3 mb-5 bg-[var(--bg-2)]">
          <div className="text-[length:var(--fs-sm)] text-[var(--ink-2)] mb-1">{t("report.preview")}</div>
          <div className="font-medium text-[var(--ink-0)] break-words line-clamp-2">{preview.title}</div>
          <div className="text-[length:var(--fs-sm)] text-[var(--ink-2)] mt-2 flex flex-wrap gap-x-2">
            <span className="break-words min-w-0">{preview.authorNickname}</span>
            <time dateTime={new Date(preview.createdAt).toISOString()}>{new Date(preview.createdAt).toLocaleString(i18n.language)}</time>
          </div>
        </div>

        <fieldset disabled={busy} className="mb-5">
          <legend className="font-medium text-[var(--ink-0)] mb-2">{t("report.reason")}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {reasons.map((item) => (
              <label
                key={item}
                className={`flex items-center gap-2 px-3 py-3 rounded-[var(--r-lg)] border cursor-pointer focus-within:ring-2 focus-within:ring-[var(--lime)] ${
                  reason === item
                    ? "border-[var(--lime)] bg-[var(--bg-2)] text-[var(--ink-0)]"
                    : "border-[var(--line-soft)] text-[var(--ink-2)] hover:bg-[var(--bg-2)]"
                } ${busy ? "opacity-50 cursor-wait" : ""}`}
              >
                <input type="radio" name={titleId} value={item} checked={reason === item} onChange={() => setReason(item)} className="accent-[var(--lime)] shrink-0" />
                {t(`report.reason.${item}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor={noteId} className="block font-medium text-[var(--ink-0)] mb-2">{t("report.note")}</label>
        <textarea
          id={noteId}
          aria-describedby={countId}
          disabled={busy}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder={t("report.notePlaceholder")}
          className="w-full p-3 rounded-[var(--r-lg)] text-[length:var(--ft-body-size)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] disabled:opacity-50"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
        />
        <div id={countId} className="text-right text-[length:var(--fs-sm)] text-[var(--ink-2)] mt-1">{note.length}/500</div>
        {failed && <p role="alert" className="mt-2 text-[var(--color-error)]">{t("report.failed")}</p>}

        <div className="grid grid-cols-2 gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>{t("button.cancel")}</Button>
          <Button type="button" variant="secondary" onClick={submit} loading={busy}>
            {busy ? t("report.submitting") : t("report.submit")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
