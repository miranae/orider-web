import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, getDocs, limit as firestoreLimit, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Send } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { firestore, functions } from "../../services/firebase";
import { Button, Chip } from "../../theme/components";

interface RideStoryPhotoOption {
  id: string;
  url: string;
}

interface RideStoryActivityOption {
  id: string;
  name: string;
  date: string;
  type: string;
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
  photos: RideStoryPhotoOption[];
}

interface RideStorySelection {
  activityId: string;
  photoId: string | null;
}

interface RideStoryPhotoPickerProps {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onSent: () => void;
  onFailed: () => void;
}

function copyFor(language: string) {
  const ko = language.startsWith("ko");
  return {
    title: ko ? "Ride Story 사진 선택" : "Choose a Ride Story photo",
    body: ko
      ? "포스터 배경으로 쓸 활동 사진을 고르세요. 사진이 없으면 경로 실루엣 중심 포스터로 보낼 수 있습니다."
      : "Choose the activity photo for the poster background. If there is no photo, send a route-silhouette poster.",
    loading: ko ? "최근 활동과 사진을 불러오는 중" : "Loading recent rides and photos",
    noOptions: ko ? "최근 활동을 찾지 못했습니다." : "No recent activities found.",
    noPhotos: ko ? "사진 없이 경로 포스터" : "Route poster without photo",
    send: ko ? "선택한 사진으로 받기" : "Send selected",
    cancel: ko ? "취소" : "Cancel",
    loadFailed: ko ? "사진 목록을 불러오지 못했습니다" : "Could not load photos",
    sent: ko ? "발송 완료" : "Sent",
    sendFailed: ko ? "이메일을 보내지 못했습니다" : "Could not send email",
  };
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function activityDateLabel(startTime: number) {
  if (!startTime) return "";
  return new Date(startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function activityDurationMin(data: Record<string, unknown>) {
  const summary = (data.summary ?? {}) as Record<string, unknown>;
  const ms = safeNumber(summary.ridingTimeMillis) || safeNumber(summary.movingTimeMillis) || safeNumber(summary.elapsedTimeMillis);
  const sec = safeNumber(summary.movingTimeSec) || (ms > 0 ? ms / 1000 : 0);
  return Math.round(sec / 60);
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

async function loadOptions(userId: string): Promise<RideStoryActivityOption[]> {
  const activitySnap = await getDocs(query(
    collection(firestore, "activities"),
    where("userId", "==", userId),
    orderBy("startTime", "desc"),
    firestoreLimit(12),
  ));
  const activities = await Promise.all(activitySnap.docs.map(async (activityDoc) => {
    const data = activityDoc.data() as Record<string, unknown>;
    if (data.deletedAt) return null;
    const summary = (data.summary ?? {}) as Record<string, unknown>;
    const photoSnap = await getDocs(query(
      collection(firestore, "activity_photos", activityDoc.id, "photos"),
      where("deletedAt", "==", null),
      orderBy("createdAt", "asc"),
      firestoreLimit(8),
    )).catch(() => null);
    const photos = photoSnap?.docs
      .map((photoDoc) => {
        const url = safeString((photoDoc.data() as Record<string, unknown>).url);
        return url ? { id: photoDoc.id, url } : null;
      })
      .filter((photo): photo is RideStoryPhotoOption => Boolean(photo)) ?? [];
    return {
      id: activityDoc.id,
      name: safeString(data.name, safeString(data.title, safeString(data.activityName, activityDoc.id))),
      date: activityDateLabel(safeNumber(data.startTime)),
      type: safeString(data.type, "Activity"),
      distanceKm: Math.round((safeNumber(summary.distance) || safeNumber(data.distance)) / 100) / 10,
      durationMin: activityDurationMin(data),
      elevationGainM: Math.round(safeNumber(summary.elevationGain) || safeNumber(data.elevationGain)),
      photos,
    };
  }));
  return activities
    .filter((activity): activity is RideStoryActivityOption => Boolean(activity))
    .sort((a, b) => Number(b.photos.length > 0) - Number(a.photos.length > 0));
}

export function RideStoryPhotoPicker({ open, userId, onClose, onSent, onFailed }: RideStoryPhotoPickerProps) {
  const { i18n } = useTranslation();
  const { showToast } = useToast();
  const copy = copyFor(i18n.language);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [options, setOptions] = useState<RideStoryActivityOption[]>([]);
  const [selection, setSelection] = useState<RideStorySelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setError(null);
    void loadOptions(userId)
      .then((nextOptions) => {
        setOptions(nextOptions);
        const preferred = nextOptions.find((activity) => activity.photos.length > 0) ?? nextOptions[0] ?? null;
        setSelection(preferred ? { activityId: preferred.id, photoId: preferred.photos[0]?.id ?? null } : null);
      })
      .catch(() => {
        setError(copy.loadFailed);
        showToast(copy.loadFailed, "error");
      })
      .finally(() => setLoading(false));
  }, [copy.loadFailed, open, showToast, userId]);

  if (!open) return null;

  const send = async () => {
    if (!selection) return;
    setSending(true);
    try {
      const fn = httpsCallable<
        { recipeId: string; lang: string; activityId: string; photoId: string | null },
        { sent: boolean; recipeId: string; email: string }
      >(functions, "sendCreatorRecipeEmail", { timeout: 60_000 });
      await fn({ recipeId: "ride-story", lang: i18n.language.startsWith("en") ? "en" : "ko", ...selection });
      showToast(copy.sent);
      onSent();
      onClose();
    } catch {
      showToast(copy.sendFailed, "error");
      onFailed();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 md:items-center" role="dialog" aria-modal="true" aria-labelledby="ride-story-picker-title">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[var(--r-lg)] border shadow-2xl" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <div className="flex items-start justify-between gap-4 border-b p-4" style={{ borderColor: "var(--line-soft)" }}>
          <div>
            <h2 id="ride-story-picker-title" className="text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.title}</h2>
            <p className="mt-1 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.body}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>{copy.cancel}</Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <PickerMessage>{copy.loading}</PickerMessage>
          ) : error ? (
            <PickerMessage>{error}</PickerMessage>
          ) : options.length === 0 ? (
            <PickerMessage>{copy.noOptions}</PickerMessage>
          ) : (
            <div className="space-y-4">
              {options.map((activity) => (
                <RideStoryActivityRow key={activity.id} activity={activity} selection={selection} noPhotoLabel={copy.noPhotos} onSelect={setSelection} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4" style={{ borderColor: "var(--line-soft)" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>{copy.cancel}</Button>
          <Button size="sm" variant="primary" disabled={!selection || loading} loading={sending} onClick={() => void send()}>
            <Send size={15} />
            {copy.send}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PickerMessage({ children }: { children: string }) {
  return (
    <div className="rounded-[var(--r-md)] border p-4 text-[length:var(--fs-sm)]" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
      {children}
    </div>
  );
}

function RideStoryActivityRow({
  activity,
  selection,
  noPhotoLabel,
  onSelect,
}: {
  activity: RideStoryActivityOption;
  selection: RideStorySelection | null;
  noPhotoLabel: string;
  onSelect: (selection: RideStorySelection) => void;
}) {
  const activitySelected = selection?.activityId === activity.id;
  return (
    <section className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: activitySelected ? "var(--lime)" : "var(--line-soft)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-[length:var(--fs-base)] font-semibold leading-5" style={{ color: "var(--ink-0)" }}>{activity.name}</h3>
          <p className="mt-1 text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>
            {activity.date} · {activity.type} · {activity.distanceKm.toFixed(1)}km · {formatDuration(activity.durationMin)} · {activity.elevationGainM}m
          </p>
        </div>
        <Chip>{activity.photos.length > 0 ? `${activity.photos.length}` : "0"}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {activity.photos.map((photo) => {
          const selected = selection?.activityId === activity.id && selection.photoId === photo.id;
          return (
            <button
              key={photo.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect({ activityId: activity.id, photoId: photo.id })}
              className="aspect-square overflow-hidden rounded-[var(--r-md)] border-2"
              style={{ borderColor: selected ? "var(--lime)" : "var(--line-soft)", background: "var(--bg-1)" }}
            >
              <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={selection?.activityId === activity.id && selection.photoId === null}
          onClick={() => onSelect({ activityId: activity.id, photoId: null })}
          className="aspect-square rounded-[var(--r-md)] border-2 p-2 text-left text-[length:var(--fs-xs)] font-semibold leading-4"
          style={{
            borderColor: selection?.activityId === activity.id && selection.photoId === null ? "var(--lime)" : "var(--line-soft)",
            background: "var(--bg-1)",
            color: "var(--ink-1)",
          }}
        >
          {noPhotoLabel}
        </button>
      </div>
    </section>
  );
}
