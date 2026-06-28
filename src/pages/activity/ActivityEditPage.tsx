import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { DateField, TimeField, EmptyState, ErrorState, LoadingSkeleton, PageHeader, PermissionGate } from "../../components/redesign";
import { getSportLabelKey } from "../../utils/sportType";
import { Button, Card, Text } from "../../theme/components";

type Visibility = "everyone" | "followers" | "private";
type WorkoutType = "endurance" | "tempo" | "interval" | "recovery" | "race" | "commute" | "";

interface ActivityEditData {
  name: string;
  description: string;
  visibility: Visibility;
  userId: string;
  type: string;
  startTime: number;
  gear: string;
  perceivedExertion: number | null;
  isRace: boolean;
  workoutType: WorkoutType;
  hideHr: boolean;
  hidePower: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function tsToDateStr(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function tsToTimeStr(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 사용자 수동 보정 시작 시각 → ms timestamp.
 * NOTE: 브라우저 로컬 TZ 기준으로 해석됨 (한국 사용자 가정).
 *       해외 TZ에서 편집 시 의도와 다른 timestamp가 저장될 수 있음.
 */
function combineToTs(dateStr: string, timeStr: string, fallback: number): number {
  if (!dateStr || !timeStr) return fallback;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!y || !m || !d || hh == null || mm == null) return fallback;
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export default function ActivityEditPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("activity");
  const { t: tCommon } = useTranslation("common");
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<ActivityEditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("everyone");
  const [gear, setGear] = useState("");
  const [perceivedExertion, setPerceivedExertion] = useState<number | null>(null);
  const [isRace, setIsRace] = useState(false);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("");
  const [hideHr, setHideHr] = useState(false);
  const [hidePower, setHidePower] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTimeOfDay, setStartTimeOfDay] = useState("");

  const WORKOUT_TYPES: { v: WorkoutType; label: string }[] = [
    { v: "", label: t("edit.workoutType.none") },
    { v: "endurance", label: t("edit.workoutType.endurance") },
    { v: "tempo", label: t("edit.workoutType.tempo") },
    { v: "interval", label: t("edit.workoutType.interval") },
    { v: "recovery", label: t("edit.workoutType.recovery") },
    { v: "race", label: t("edit.workoutType.race") },
    { v: "commute", label: t("edit.workoutType.commute") },
  ];

  const VISIBILITY_OPTIONS: { v: Visibility; label: string; description: string }[] = [
    { v: "everyone", label: t("edit.visEveryone"), description: t("edit.visEveryoneDesc") },
    { v: "followers", label: t("edit.visFollowers"), description: t("edit.visFollowersDesc") },
    { v: "private", label: t("edit.visPrivate"), description: t("edit.visPrivateDesc") },
  ];

  function gearLabelFor(type: string): string {
    if (type.toLowerCase().includes("run")) return t("edit.gearRun");
    if (type.toLowerCase().includes("swim")) return t("edit.gearSwim");
    return t("edit.gearBike");
  }

  function gearPlaceholderFor(type: string): string {
    if (type.toLowerCase().includes("run")) return t("edit.gearPlaceholderRun");
    return t("edit.gearPlaceholderBike");
  }

  const loadActivity = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await getDoc(doc(firestore, "activities", activityId));
      if (!snap.exists()) {
        setData(null);
        return;
      }
      const d = snap.data();
      const parsed: ActivityEditData = {
        name: d.name ?? d.description ?? "",
        description: d.description ?? "",
        visibility: (d.visibility as Visibility) ?? "everyone",
        userId: d.userId ?? "",
        type: d.type ?? "Ride",
        startTime: typeof d.startTime === "number" ? d.startTime : d.startTime?.toMillis?.() ?? 0,
        gear: d.gear ?? "",
        perceivedExertion: typeof d.perceivedExertion === "number" ? d.perceivedExertion : null,
        isRace: !!d.isRace,
        workoutType: (d.workoutType as WorkoutType) ?? "",
        hideHr: !!d.hideHr,
        hidePower: !!d.hidePower,
      };
      setData(parsed);
      setName(parsed.name);
      setDescription(parsed.description);
      setVisibility(parsed.visibility);
      setGear(parsed.gear);
      setPerceivedExertion(parsed.perceivedExertion);
      setIsRace(parsed.isRace);
      setWorkoutType(parsed.workoutType);
      setHideHr(parsed.hideHr);
      setHidePower(parsed.hidePower);
      setStartDate(tsToDateStr(parsed.startTime));
      setStartTimeOfDay(tsToTimeStr(parsed.startTime));
    } catch (err) {
      logClientError("ActivityEditPage.loadActivity", err, { activityId });
      setLoadError(err instanceof Error ? err.message : t("edit.loadErrorFallback"));
    } finally {
      setLoading(false);
    }
  }, [activityId, t]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const isOwner = !!data && !!user && user.uid === data.userId;

  const handleSave = async () => {
    if (!activityId || !data || !isOwner || saving) return;
    setSaving(true);
    try {
      const newStartTime = combineToTs(startDate, startTimeOfDay, data.startTime);
      await updateDoc(doc(firestore, "activities", activityId), {
        name: name.trim(),
        description: description.trim(),
        visibility,
        gear: gear.trim(),
        perceivedExertion: perceivedExertion,
        isRace,
        workoutType,
        hideHr,
        hidePower,
        startTime: newStartTime,
      });
      showToast(t("edit.toastSaved"));
      navigate(`/activity/${activityId}`);
    } catch (err) {
      logClientError("ActivityEditPage.handleSave", err, { activityId, visibility, workoutType });
      showToast(err instanceof Error ? err.message : t("edit.toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activityId || !isOwner) return;
    if (!window.confirm(t("edit.deleteConfirm"))) return;
    setSaving(true);
    try {
      await updateDoc(doc(firestore, "activities", activityId), { deletedAt: Date.now() });
      showToast(t("edit.toastDeleted"));
      navigate("/log");
    } catch (err) {
      logClientError("ActivityEditPage.handleDelete", err, { activityId });
      showToast(t("edit.toastDeleteFailed"));
      setSaving(false);
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
        <PermissionGate title={t("edit.loginRequired")} description={t("edit.loginRequiredDesc")} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("edit.loadError")} description={loadError} onRetry={loadActivity} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🗒️"
          title={t("edit.notFound")}
          actions={[{ label: t("edit.logBtn"), variant: "primary", onClick: () => navigate("/log") }]}
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
          actions={[{ label: t("edit.detailBtn"), variant: "primary", onClick: () => navigate(`/activity/${activityId}`) }]}
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
        eyebrow={t("edit.eyebrow")}
        title={name || data.name || t("edit.noName")}
        subtitle={`${tCommon(getSportLabelKey(data.type))} · ${data.startTime ? new Date(data.startTime).toLocaleDateString("ko-KR") : "-"}`}
      />

      {/* 기본 정보 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionBasic")}</h2>

        <label className="flex flex-col" style={{ gap: 6, marginBottom: 'var(--space-4)' }}>
          <Text variant="eyebrow">{t("edit.fieldName")}</Text>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("edit.namePlaceholder")}
            style={fieldStyle}
          />
        </label>

        <label className="flex flex-col" style={{ gap: 6, marginBottom: 'var(--space-4)' }}>
          <Text variant="eyebrow">{t("edit.fieldDesc")}</Text>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={t("edit.descPlaceholder")}
            style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <label className="flex flex-col" style={{ gap: 6 }}>
          <Text variant="eyebrow">{gearLabelFor(data.type)}</Text>
          <input
            type="text"
            value={gear}
            onChange={(e) => setGear(e.target.value)}
            placeholder={gearPlaceholderFor(data.type)}
            style={fieldStyle}
          />
        </label>
      </Card>

      {/* 시작 일시 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionDateTime")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("edit.fieldDate")}</Text>
            <DateField value={startDate} onChange={setStartDate} placeholder={t("edit.datePlaceholder")} />
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("edit.fieldTime")}</Text>
            <TimeField value={startTimeOfDay} onChange={setStartTimeOfDay} placeholder={t("edit.timePlaceholder")} />
          </div>
        </div>
      </Card>

      {/* 운동 유형 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionWorkoutType")}</h2>
        <div role="radiogroup" aria-label={t("edit.workoutTypeAria")} className="flex items-center flex-wrap" style={{ gap: 6 }}>
          {WORKOUT_TYPES.map((o) => {
            const active = workoutType === o.v;
            return (
              <Button
                key={o.v || "none"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setWorkoutType(o.v)} variant="secondary" size="sm"
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
      </Card>

      {/* 공개 설정 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionVisibility")}</h2>
        <div role="radiogroup" aria-label={t("edit.visibilityAria")} className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
          {VISIBILITY_OPTIONS.map((o) => {
            const active = visibility === o.v;
            return (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setVisibility(o.v)}
                className="text-left"
                style={{
                  padding: 'var(--space-3)',
                  border: "1px solid",
                  borderColor: active ? "var(--lime)" : "var(--line-soft)",
                  background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                  borderRadius: "var(--r-md)",
                  cursor: "pointer",
                }}
              >
                <div className="font-semibold text-[length:var(--fs-sm)]" style={{ color: "var(--ink-0)" }}>{o.label}</div>
                <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>{o.description}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 세부 */}
      <Card padding="none" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
        <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("edit.sectionDetails")}</h2>
        <label className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <input type="checkbox" checked={isRace} onChange={(e) => setIsRace(e.target.checked)} />
          <span className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-1)" }}>{t("edit.isRaceLabel")}</span>
        </label>

        <div>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{t("edit.rpeLabel")}</Text>
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-1)' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const active = perceivedExertion === n;
              return (
                <Button
                  key={n}
                  type="button"
                  onClick={() => setPerceivedExertion(active ? null : n)}
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
          <div className="text-[length:var(--fs-xs)] mt-2" style={{ color: "var(--ink-3)" }}>
            {t("edit.rpeHint")}
          </div>
        </div>

        {/* 데이터 숨기기 */}
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: "1px solid var(--line-soft)" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{t("edit.sectionHideData")}</Text>
          <label className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 6 }}>
            <input type="checkbox" checked={hideHr} onChange={(e) => setHideHr(e.target.checked)} />
            <span className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-1)" }}>{t("edit.hideHr")}</span>
          </label>
          <label className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <input type="checkbox" checked={hidePower} onChange={(e) => setHidePower(e.target.checked)} />
            <span className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-1)" }}>{t("edit.hidePower")}</span>
          </label>
          <div className="text-[length:var(--fs-xs)] mt-2" style={{ color: "var(--ink-3)" }}>
            {t("edit.hideDataHint")}
          </div>
        </div>
      </Card>

      {/* 저장/취소/삭제 */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-2)' }}>
        <Button
          type="button"
          onClick={handleDelete}
          disabled={saving} variant="secondary" size="sm"
          style={{ color: "var(--rose)", borderColor: "color-mix(in oklch, var(--rose) 40%, transparent)" }}
        >
          🗑 {t("edit.deleteBtn")}
        </Button>
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          <Button
            type="button"
            onClick={() => navigate(`/activity/${activityId}`)}
            disabled={saving} variant="secondary"
          >
            {t("edit.cancelBtn")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving} variant="primary"
          >
            {saving ? t("edit.savingBtn") : t("edit.saveBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
