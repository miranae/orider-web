import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("board");
  const [reason, setReason] = useState<BoardReportReason>("spam");
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label={t("report.close")}
        className="absolute inset-0 bg-black/50"
        onClick={submitting ? undefined : onClose}
      />
      <Card padding="none" className="relative z-[91] w-full max-w-lg p-5! md:p-6! rounded-[var(--r-xl)]" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
              {t("report.title", { target: t(`report.target.${targetType}`) })}
            </h2>
            <p className="text-[length:var(--fs-sm)] text-[var(--ink-3)] mt-1">
              {t("report.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-[var(--ink-3)] hover:text-[var(--ink-1)] disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3 mb-4 bg-[var(--bg-2)]">
          <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mb-1">{t("report.preview")}</div>
          <div className="font-semibold text-[var(--ink-0)] line-clamp-1">{preview.title}</div>
          <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mt-1">
            {preview.authorNickname} · {new Date(preview.createdAt).toLocaleString()}
          </div>
        </div>

        <label className="block text-[length:var(--fs-sm)] font-bold text-[var(--ink-0)] mb-2">
          {t("report.reason")}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {reasons.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setReason(item)}
              className={`px-3 py-2 rounded-[var(--r-lg)] border text-[length:var(--fs-sm)] font-medium transition-colors ${
                reason === item
                  ? "border-[var(--lime)] bg-[var(--lime)]/10 text-[var(--lime)]"
                  : "border-[var(--line-soft)] text-[var(--ink-2)] hover:bg-[var(--bg-2)]"
              }`}
            >
              {t(`report.reason.${item}`)}
            </button>
          ))}
        </div>

        <label className="block text-[length:var(--fs-sm)] font-bold text-[var(--ink-0)] mb-2">
          {t("report.note")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder={t("report.notePlaceholder")}
          className="w-full p-3 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
          style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-1)" }}
        />
        <div className="text-right text-[10px] text-[var(--ink-3)] mt-1">{note.length}/500</div>

        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t("button.cancel")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSubmit(reason, note)}
            disabled={submitting}
          >
            {submitting ? t("report.submitting") : t("report.submit")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
