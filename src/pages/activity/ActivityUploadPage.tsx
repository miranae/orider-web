import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { EmptyState, PageHeader, PermissionGate } from "../../components/redesign";
import { Button, Card, Chip, Text } from "../../theme/components";

type Visibility = "everyone" | "followers" | "private";

type UploadStatus = "pending" | "uploading" | "done" | "error" | "skipped";

interface FileItem {
  id: string;
  file: File;
  name: string; // 사용자 편집 가능 (기본: 파일명)
  status: UploadStatus;
  error?: string;
  activityId?: string;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file
const VALID_EXT = ["fit", "gpx", "tcx"];

function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

export default function ActivityUploadPage() {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation("activity");

  const [files, setFiles] = useState<FileItem[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("everyone");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (fs: FileList | File[]) => {
    const next: FileItem[] = [];
    for (const f of Array.from(fs)) {
      const ext = f.name.toLowerCase().split(".").pop() ?? "";
      if (!VALID_EXT.includes(ext)) continue;
      if (f.size > MAX_SIZE) continue;
      next.push({
        id: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        name: stripExt(f.name),
        status: "pending",
      });
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...next.filter((n) => !seen.has(n.id))];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const renameFile = (id: string, name: string) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));

  const handleUpload = async () => {
    if (!user || uploading || files.length === 0) return;
    setUploading(true);
    try {
      const token = await user.getIdToken();
      const results = await Promise.all(
        files.map(async (item) => {
          if (item.status === "done" || item.status === "skipped") return item;
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f)));
          try {
            const formData = new FormData();
            formData.append("file", item.file);
            if (item.name.trim()) formData.append("name", item.name.trim());
            formData.append("visibility", visibility);
            const res = await fetch("/api/v1/import/activity", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });
            if (!res.ok) {
              const err = await res.json().catch(() => null);
              throw new Error(err?.message || t("upload.importFailed", { status: res.status }));
            }
            const { data } = await res.json();
            return {
              ...item,
              status: (data.skipped ? "skipped" : "done") as UploadStatus,
              activityId: data.activityId,
            };
          } catch (e) {
            return { ...item, status: "error" as UploadStatus, error: e instanceof Error ? e.message : t("upload.failed") };
          }
        })
      );
      setFiles(results);
      const done = results.filter((r) => r.status === "done").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const failed = results.filter((r) => r.status === "error").length;
      const parts: string[] = [];
      if (done) parts.push(t("upload.doneCount", { count: done }));
      if (skipped) parts.push(t("upload.skippedCount", { count: skipped }));
      if (failed) parts.push(t("upload.failedCount", { count: failed }));
      showToast(parts.join(" · ") || t("upload.doneSummary"));
      if (done > 0 && failed === 0 && results.length === 1) {
        const first = results.find((r) => r.status === "done" && r.activityId);
        if (first?.activityId) navigate(`/activity/${first.activityId}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const visibilityOptions: { v: Visibility; label: string }[] = [
    { v: "everyone", label: t("upload.visEveryone") },
    { v: "followers", label: t("upload.visFollowers") },
    { v: "private", label: t("upload.visPrivate") },
  ];

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 text-center" style={{ color: "var(--ink-3)" }}>{t("upload.loading")}</div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("upload.loginRequired")} description={t("upload.loginRequiredDesc")} />
      </div>
    );
  }

  const pendingCount = files.filter((f) => f.status !== "done" && f.status !== "skipped").length;
  const hasFiles = files.length > 0;

  return (
    <div className="max-w-3xl mx-auto" style={{ paddingInline: 'var(--space-4)', paddingBottom: 64 }}>
      <PageHeader
        eyebrow={t("upload.eyebrow")}
        title={t("upload.title")}
        subtitle={t("upload.subtitle")}
      />

      {/* Drop zone */}
      <Card
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={t("upload.dropZoneAria")} padding="none"
        style={{
          padding: 'var(--space-7)',
          textAlign: "center",
          cursor: "pointer",
          borderStyle: "dashed",
          borderColor: dragging ? "var(--lime)" : "var(--line-soft)",
          background: dragging ? "color-mix(in oklch, var(--lime) 6%, var(--bg-2))" : "var(--bg-2)",
          transition: "border-color 0.15s",
        }}
      >
        <div style={{ fontSize: "var(--fs-4xl)", marginBottom: 'var(--space-2)' }} aria-hidden="true">⬆️</div>
        <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>
          {t("upload.dropZoneLabel")}
        </div>
        <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
          {t("upload.dropZoneHint")}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".fit,.gpx,.tcx"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </Card>

      {/* Visibility + 업로드 버튼 */}
      <div className="flex items-center justify-between flex-wrap mt-4" style={{ gap: 'var(--space-3)' }}>
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          <Text variant="eyebrow">{t("upload.visibilityLabel")}</Text>
          {visibilityOptions.map((o) => {
            const active = visibility === o.v;
            return (
              <Button
                key={o.v}
                type="button"
                onClick={() => setVisibility(o.v)}
                aria-pressed={active} variant="secondary" size="sm"
                style={{
                  background: active ? "var(--bg-3)" : "transparent",
                  color: active ? "var(--ink-0)" : "var(--ink-3)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {o.label}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          onClick={handleUpload}
          disabled={!hasFiles || uploading} variant="primary"
        >
          {uploading ? t("upload.uploadingBtn") : t("upload.uploadCountBtn", { count: pendingCount })}
        </Button>
      </div>

      {/* 파일 목록 */}
      {hasFiles ? (
        <Card padding="none" className="mt-4" style={{ padding: 0 }}>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center"
                style={{ gap: 'var(--space-3)', padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}
              >
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => renameFile(f.id, e.target.value)}
                    aria-label={t("upload.fileNameAria")}
                    className="w-full px-2 py-1 text-[length:var(--fs-sm)] rounded-[var(--r-sm)] focus:outline-none focus:ring-1 focus:ring-[var(--lime)]"
                    style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)", color: "var(--ink-0)" }}
                    disabled={f.status === "uploading"}
                  />
                  <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
                    {f.file.name} · {formatSize(f.file.size)}
                    {f.status === "error" && f.error && (
                      <span style={{ color: "var(--rose)", marginLeft: "var(--space-1-5)" }}>· {f.error}</span>
                    )}
                  </div>
                </div>
                <StatusBadge status={f.status} />
                {f.status === "done" && f.activityId && (
                  <Link
                    to={`/activity/${f.activityId}`}
                    className="ds-btn ds-btn--md ds-btn--ghost ds-btn--sm"
                    style={{ color: "var(--lime)" }}
                  >
                    {t("upload.viewBtn")}
                  </Link>
                )}
                <Button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  disabled={f.status === "uploading"}
                  aria-label={t("upload.removeAria")} variant="ghost" size="sm"
                  style={{ color: "var(--ink-3)" }}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon="📂"
            title={t("upload.noFilesTitle")}
            description={t("upload.noFilesDesc")}
            compact
          />
        </div>
      )}

      <p className="text-[length:var(--fs-xs)] mt-4" style={{ color: "var(--ink-3)" }}>
        {t("upload.stravaNote")} <Link to="/settings" className="hover:underline" style={{ color: "var(--strava)" }}>{t("upload.stravaSettingsLink")}</Link>{t("upload.stravaNoteSuffix")}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: UploadStatus }) {
  const { t } = useTranslation("activity");
  const map: Record<UploadStatus, { label: string; color: string; icon: string }> = {
    pending: { label: t("upload.statusPending"), color: "var(--ink-3)", icon: "⏱" },
    uploading: { label: t("upload.statusUploading"), color: "var(--aqua)", icon: "…" },
    done: { label: t("upload.statusDone"), color: "var(--lime)", icon: "✓" },
    skipped: { label: t("upload.statusSkipped"), color: "var(--amber)", icon: "!" },
    error: { label: t("upload.statusError"), color: "var(--rose)", icon: "✕" },
  };
  const m = map[status];
  return (
    <Chip className="flex-shrink-0" style={{ color: m.color, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ marginRight: 'var(--space-1)' }}>{m.icon}</span>
      {m.label}
    </Chip>
  );
}
