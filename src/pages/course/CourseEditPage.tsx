import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, PermissionGate } from "../../components/redesign";
import { Button, Card, Text } from "../../theme/components";

type Surface = "paved" | "gravel" | "mixed" | "";

interface CourseEditData {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  distance: number;
  elevationGain: number;
  surface: Surface;
  difficulty: number | null;
}

export default function CourseEditPage() {
  const { t } = useTranslation("course");
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const SURFACE_OPTIONS: { v: Surface; label: string }[] = [
    { v: "", label: t("edit.surface.unspecified") },
    { v: "paved", label: t("edit.surface.paved") },
    { v: "gravel", label: t("edit.surface.gravel") },
    { v: "mixed", label: t("edit.surface.mixed") },
  ];

  const [data, setData] = useState<CourseEditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [surface, setSurface] = useState<Surface>("");
  const [difficulty, setDifficulty] = useState<number | null>(null);

  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await getDoc(doc(firestore, "courses", courseId));
      if (!snap.exists()) {
        setData(null);
        return;
      }
      const d = snap.data();
      const parsed: CourseEditData = {
        id: snap.id,
        name: d.name ?? "",
        description: d.description ?? "",
        creatorId: d.creatorId ?? "",
        distance: d.distance ?? 0,
        elevationGain: d.elevationGain ?? 0,
        surface: (d.surface as Surface) ?? "",
        difficulty: typeof d.difficulty === "number" ? d.difficulty : null,
      };
      setData(parsed);
      setName(parsed.name);
      setDescription(parsed.description);
      setSurface(parsed.surface);
      setDifficulty(parsed.difficulty);
    } catch (err) {
      logClientError("CourseEditPage.loadCourse", err, { courseId });
      setLoadError(err instanceof Error ? err.message : t("error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  const isOwner = !!data && !!user && user.uid === data.creatorId;

  const handleSave = async () => {
    if (!courseId || !isOwner || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      showToast(t("edit.nameMinLength"));
      return;
    }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "updateMyCourse");
      const payload: Record<string, unknown> = {
        courseId,
        name: trimmedName,
        description: description.trim(),
        // 빈 값/null 명시 전송 — CF가 null 처리해 기존 값을 지움
        surface: surface || null,
        difficulty: difficulty ?? null,
      };
      await fn(payload);
      showToast(t("edit.saveSuccess"));
      navigate(`/course/${courseId}`);
    } catch (err) {
      logClientError("CourseEditPage.handleSave", err, { courseId, surface, difficulty });
      const fbErr = err as { message?: string };
      showToast(fbErr?.message ?? t("error.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!courseId || !isOwner || deleting) return;
    if (!window.confirm(t("edit.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const fn = httpsCallable(functions, "deleteMyCourse");
      await fn({ courseId });
      showToast(t("edit.deleteSuccess"));
      navigate("/courses");
    } catch (err) {
      logClientError("CourseEditPage.handleDelete", err, { courseId });
      showToast(err instanceof Error ? err.message : t("error.deleteFailed"));
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <LoadingSkeleton kind="card" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("error.loginRequired")} description={t("edit.ownerOnly")} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("error.loadFailed")} description={loadError} onRetry={loadCourse} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🗺️"
          title={t("error.notFound")}
          actions={[{ label: t("button.courseList"), variant: "primary", href: "/courses" }]}
        />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🔒"
          title={t("edit.noPermission")}
          description={t("edit.noPermissionDesc")}
          actions={[{ label: t("button.detailView"), variant: "primary", onClick: () => navigate(`/course/${courseId}`) }]}
        />
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "var(--bg-2)",
    border: "1px solid var(--line-soft)",
    borderRadius: "var(--r-md)",
    color: "var(--ink-0)",
    fontSize: 14,
  };

  return (
    <div className="max-w-2xl mx-auto pb-16" style={{ paddingInline: 'var(--space-4)' }}>
      <PageHeader
        eyebrow={t("editTitle")}
        title={name || data.name || t("edit.unnamed")}
        subtitle={`${(data.distance / 1000).toFixed(1)}km · ↑${Math.round(data.elevationGain)}m`}
      />

      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionBasic")}</h2>

        <label className="flex flex-col" style={{ gap: 6, marginBottom: 'var(--space-4)' }}>
          <Text variant="eyebrow">{t("form.courseName")} <span style={{ color: "var(--rose)" }}>*</span></Text>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            style={fieldStyle}
          />
          <span className="text-[length:var(--fs-xs)] text-right" style={{ color: "var(--ink-4)" }}>{name.length}/50</span>
        </label>

        <label className="flex flex-col" style={{ gap: 6 }}>
          <Text variant="eyebrow">{t("edit.descriptionLabel")}</Text>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={200}
            placeholder={t("edit.descriptionPlaceholder")}
            style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit" }}
          />
          <span className="text-[length:var(--fs-xs)] text-right" style={{ color: "var(--ink-4)" }}>{description.length}/200</span>
        </label>
      </Card>

      {/* 노면 + 난이도 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionCharacteristics")}</h2>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("edit.surface")}</Text>
          <div role="radiogroup" aria-label={t("edit.surface")} className="flex items-center flex-wrap" style={{ gap: 6 }}>
            {SURFACE_OPTIONS.map((o) => {
              const active = surface === o.v;
              return (
                <Button
                  key={o.v || "none"}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSurface(o.v)} variant="secondary" size="sm"
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
        </div>

        <div>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("edit.difficultyLabel")}</Text>
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-1)' }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = difficulty === n;
              return (
                <Button
                  key={n}
                  type="button"
                  onClick={() => setDifficulty(active ? null : n)}
                  aria-pressed={active} variant="secondary" size="sm"
                  style={{
                    minWidth: 36,
                    background: active ? "var(--bg-3)" : "transparent",
                    color: active ? "var(--ink-0)" : "var(--ink-3)",
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {n}
                </Button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
        <Button
          type="button"
          onClick={handleDelete}
          disabled={deleting || saving} variant="secondary" size="sm"
          style={{ color: "var(--rose)", borderColor: "color-mix(in oklch, var(--rose) 40%, transparent)" }}
        >
          {deleting ? t("error.deleteDeleting") : t("edit.deleteCourse")}
        </Button>
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          <Button
            type="button"
            onClick={() => navigate(`/course/${courseId}`)}
            disabled={saving || deleting} variant="secondary"
          >
            {t("button.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting || !name.trim()} variant="primary"
          >
            {saving ? t("button.saving") : t("edit.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
