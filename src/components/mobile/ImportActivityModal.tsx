import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { X, Upload, CheckCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { Text } from "../../theme/components";

interface ImportActivityModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ImportActivityModal({ open, onClose }: ImportActivityModalProps) {
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"everyone" | "friends" | "private">("everyone");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

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
        onClose();
        navigate("/log");
      } else {
        if (data.skipped) {
          showToast(t("import.alreadyExists"));
        } else {
          showToast(t("import.imported"));
        }
        onClose();
        navigate(`/activity/${data.activityId}`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("import.errImportFailedSimple"));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext === "fit" || ext === "gpx" || ext === "tcx" || ext === "zip") setFile(f);
  };

  const fileSizeStr = (f: File) => {
    const kb = f.size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  };

  const reset = () => {
    setFile(null);
    setName("");
    setVisibility("everyone");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" role="dialog" aria-modal="true" aria-label={t("import.modalTitle")}>
      <div className="flex-1" style={{ background: "color-mix(in srgb, var(--bg-0) 50%, transparent)" }} onClick={handleClose} />
      <div
        className="overflow-y-auto"
        style={{
          background: "var(--bg-1)", borderTop: "1px solid var(--line-soft)",
          maxHeight: "80%", paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--ink-0)" }}>{t("import.modalTitle")}</span>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "var(--space-2)", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={20} style={{ color: "var(--ink-3)" }} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("import.fileSection")}</Text>
            <div
              onClick={() => fileRef.current?.click()}
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
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer" }}>
                    <X size={16} style={{ color: "var(--ink-4)" }} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={24} style={{ color: "var(--ink-4)", marginBottom: "var(--space-1-5)" }} />
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("import.fileHint")}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 'var(--space-1)' }}>{t("import.fileFormatNote")}</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".fit,.gpx,.tcx,.zip" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
          </div>

          {!isZip && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("import.nameSection")}</Text>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={file?.name.replace(/\.(fit|gpx|tcx)$/i, "") || t("import.namePlaceholder")}
                style={{
                  width: "100%", padding: "10px 12px",
                  background: "var(--bg-2)", border: "1px solid var(--line-soft)",
                  borderRadius: "var(--r-md)", fontSize: "var(--fs-sm)", color: "var(--ink-1)",
                  outline: "none", fontFamily: "inherit",
                }} />
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-6)' }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("import.visibilitySection")}</Text>
            <div className="flex gap-2">
              {([["everyone", t("import.visibilityEveryone")], ["friends", t("import.visibilityFriends")], ["private", t("import.visibilityPrivate")]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setVisibility(v)}
                  style={{
                    flex: 1, padding: "12px 0", fontSize: "var(--fs-xs)", fontWeight: 500,
                    borderRadius: "var(--r-md)", cursor: "pointer",
                    background: visibility === v ? "var(--bg-3)" : "transparent",
                    border: `1px solid ${visibility === v ? "var(--lime)" : "var(--line-soft)"}`,
                    color: visibility === v ? "var(--ink-0)" : "var(--ink-3)",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSubmit} disabled={!file || !isValidExt || uploading}
            style={{
              width: "100%", padding: "14px 0", fontSize: "var(--fs-sm)", fontWeight: 600,
              borderRadius: "var(--r-md)",
              cursor: file && isValidExt && !uploading ? "pointer" : "default",
              background: file && isValidExt && !uploading ? "var(--lime)" : "var(--bg-3)",
              color: file && isValidExt && !uploading ? "var(--primary-fg)" : "var(--ink-4)",
              border: "none",
            }}>
            {uploading ? (isZip ? t("import.submitBatch") : t("import.submitSingle")) : t("import.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
