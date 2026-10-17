import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useTrainingDialog } from "../training/useTrainingDialog";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { X, Upload, CheckCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { Button, Card, Text, Input, buttonClass } from "../../theme/components";
import { LocalizedLink as Link } from "../LocalizedLink";

interface ImportActivityModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ImportActivityModal({ open, onClose }: ImportActivityModalProps) {

  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [completion, setCompletion] = useState<{ activityId?: string } | null>(null);
  const finish = () => { const target = completion?.activityId ? `/activity/${completion.activityId}` : "/athlete/me/activities"; setCompletion(null); reset(); onClose(); navigate(target); };
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"everyone" | "friends" | "private">("everyone");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;
  if (completion) return <ImportDialogShell key="completion" title={t("import.successDone")} onClose={finish}><Card className="m-4"><Text as="h2" variant="subtitle">{t("import.successDone")}</Text><div className="flex gap-3 mt-4"><Button onClick={finish}>{t("import.viewResult")}</Button><Link to="/coach/condition" className={buttonClass({variant: "secondary"})} onClick={() => { setCompletion(null); reset(); onClose(); }}>{t("import.viewCoach")}</Link></div></Card></ImportDialogShell>;

  const fileExt = file?.name.toLowerCase().split(".").pop();
  const isValidExt = fileExt === "fit" || fileExt === "gpx" || fileExt === "tcx" || fileExt === "zip";
  const isZip = fileExt === "zip";

  const handleSubmit = async () => {
    if (!file || !user || !isValidExt) return;

    // 클라이언트 측 파일 크기 검사 (S3)
    const maxSize = isZip ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast(t("import.errSizeOver", { limit: isZip ? "100MB" : "10MB" }));
      return;
    }

    setUploading(true);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append("file", file);
      if (name.trim()) formData.append("name", name.trim());
      formData.append("visibility", visibility);

      const endpoint = isZip ? "/api/v1/import/batch" : "/api/v1/import/activity";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || t("import.errImportFailed", { status: res.status }));
      }

      const { data } = await res.json();
      if (isZip) {
        const parts: string[] = [];
        if (data.created > 0) parts.push(t("import.successCreated", { count: data.created }));
        if (data.skipped > 0) parts.push(t("import.successSkipped", { count: data.skipped }));
        if (data.failed > 0) parts.push(t("import.successFailed", { count: data.failed }));
        showToast(parts.join(" · ") || t("import.successDone"));
        setCompletion({});
      } else {
        if (data.skipped) {
          showToast(t("import.alreadyExists"));
        } else {
          showToast(t("import.imported"));
        }
        setCompletion({ activityId: data.activityId });
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("import.errImportFailedSimple"));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploading) return;
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext === "fit" || ext === "gpx" || ext === "tcx" || ext === "zip") setFile(f);
  };

  const fileSizeStr = (f: File) => {
    const kb = f.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  };

  function reset() {
    setFile(null);
    setName("");
    setVisibility("everyone");
  }

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  return (
    <ImportDialogShell key="upload" title={t("import.modalTitle")} onClose={handleClose} busy={uploading}>
      <div className="flex-1" style={{ background: "color-mix(in srgb, var(--bg-0) 50%, transparent)" }} onClick={() => { if (!uploading) handleClose(); }} />
      <div
        className="overflow-y-auto"
        style={{
          background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)",
          maxHeight: "80%", paddingBottom: "env(safe-area-inset-bottom, 0px)",
          overscrollBehavior: "contain",
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--ink-0)" }}>{t("import.modalTitle")}</span>
          <Button variant="ghost" iconOnly onClick={handleClose} disabled={uploading} aria-label={t("import.close")}><X size={20} aria-hidden="true" /></Button>
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("import.fileSection")}</Text>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                padding: file ? "12px 14px" : "28px 14px",
                background: "var(--bg-2)",
                border: `1px dashed ${file && isValidExt ? "var(--lime)" : "var(--line)"}`,
                borderRadius: "var(--r-lg)", cursor: "pointer", textAlign: "center",
              }}
            >
              {file ? (
                <div className="flex items-center gap-3">
                  <CheckCircle size={18} style={{ color: "var(--lime)", flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)" }}>{file.name}</div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>
                      {fileSizeStr(file)} · {fileExt?.toUpperCase()}
                    </div>
                  </div>
                  <Button variant="ghost" iconOnly aria-label={t("import.removeFile")} disabled={uploading} onClick={() => setFile(null)}><X size={16} aria-hidden="true" /></Button>
                </div>
              ) : (
                <>
                  <Upload size={24} style={{ color: "var(--ink-4)", marginBottom: "var(--space-1-5)" }} />
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("import.fileHint")}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 'var(--space-1)' }}>{t("import.fileFormatNote")}</div>
                </>
              )}
            </div>
            <Button className="mt-2" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>{t("import.chooseFile")}</Button>
            <input aria-label={t("import.fileSection")} data-testid="P1-3-1" ref={fileRef} type="file" accept=".fit,.gpx,.tcx,.zip" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
          </div>

          {!isZip && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("import.nameSection")}</Text>
              <Input aria-label={t("import.nameSection")} type="text" value={name} disabled={uploading} onChange={(e) => setName(e.target.value)} placeholder={file?.name.replace(/\.(fit|gpx|tcx)$/i, "") || t("import.namePlaceholder")} className="w-full" />
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-6)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("import.visibilitySection")}</Text>
            <div className="flex gap-2">
              {([["everyone", t("import.visibilityEveryone")], ["friends", t("import.visibilityFriends")], ["private", t("import.visibilityPrivate")]] as const).map(([v, label]) => (
                <Button key={v} variant={visibility === v ? "secondary" : "outline"} aria-pressed={visibility === v} disabled={uploading} onClick={() => setVisibility(v)} className="flex-1">{label}</Button>
              ))}
            </div>
          </div>

          <Button variant="primary" block onClick={handleSubmit} disabled={!file || !isValidExt || !user} loading={uploading}>{uploading ? (isZip ? t("import.submitBatch") : t("import.submitSingle")) : t("import.submit")}</Button>

          <p className="text-center" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--space-3)" }}>
            {t("import.stravaNote")} {uploading ? <span>{t("import.stravaSettingsLink")}</span> : <Link to="/settings/connections" className="hover:underline" style={{ color: "var(--strava)" }} onClick={handleClose}>{t("import.stravaSettingsLink")}</Link>}{t("import.stravaNoteSuffix")}
          </p>
        </div>
      </div>
    </ImportDialogShell>
  );
}

function ImportDialogShell({ title, onClose, busy = false, children }: {title: string; onClose: () => void; busy?: boolean; children: ReactNode}) {
  const ref = useTrainingDialog(onClose, busy);
  return createPortal(<div ref={ref} tabIndex={-1} className="fixed inset-0 z-[200] flex flex-col justify-end" data-testid="P1-3" role="dialog" aria-modal="true" aria-label={title}>{children}</div>, document.body);
}
