import "./RideStoryPhotoPicker.css";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, doc, getDocs, limit as firestoreLimit, orderBy, query, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { CloudUpload, Loader2, MapPinned, Send } from "lucide-react";
import { matchesDiscipline } from "@shared/sport/discipline";
import { useToast } from "../../contexts/ToastContext";
import { firestore, functions, storage } from "../../services/firebase";
import { resizeImageToWebp } from "../../features/activity/detail/imageResize";
import { Button, Chip } from "../../theme/components";
import Modal from "../Modal";
import { getSportLabelKey } from "../../utils/sportType";
import { decodeTrack } from "../../utils/polyline";
import { ICON_SIZE } from "../../theme/tokens/icon";

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
  startTime: number;
  mapImageUrl: string | null;
  thumbnailTrack: string | null;
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
  onPreview?: (selection: RideStorySelection) => void;
}

const MAX_PHOTOS_PER_ACTIVITY = 10;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function copyFor(language: string) {
  const ko = language.startsWith("ko");
  return {
    title: ko ? "Ride Story 사진 선택" : "Choose a Ride Story photo",
    body: ko
      ? "포스터에 담을 활동과 사진을 고르세요. 사진이 없거나 사진을 쓰고 싶지 않으면 경로가 중심인 포스터로 보낼 수 있습니다."
      : "Choose the activity and photo for the poster. If there is no photo, or you prefer not to use one, send a route-focused poster.",
    loading: ko ? "최근 활동과 사진을 불러오는 중" : "Loading recent rides and photos",
    noOptions: ko ? "최근 90일 안에 포스터로 만들 자전거 활동이 없습니다." : "No cycling activities from the last 90 days are available for a poster.",
    noPhotos: ko ? "경로 포스터 선택" : "Use route poster",
    noPhotoItems: ko ? "업로드된 활동 사진이 없습니다. 왼쪽 경로 포스터를 선택하세요." : "No uploaded activity photos. Choose the route poster on the left.",
    routePreview: ko ? "경로 미리보기" : "Route preview",
    noRoute: ko ? "경로 썸네일 없음" : "No route preview",
    photos: ko ? "사진" : "Photos",
    uploadPhoto: ko ? "사진 업로드" : "Upload photo",
    uploadingPhoto: ko ? "업로드 중" : "Uploading",
    uploadHelp: ko ? "포스터 배경으로 쓸 사진을 추가합니다. 촬영 위치 정보는 저장하지 않습니다." : "Add a poster background photo. Photo location metadata is not saved.",
    imageOnly: ko ? "이미지 파일만 업로드할 수 있습니다." : "Only image files can be uploaded.",
    tooManyPhotos: ko ? `활동당 사진은 최대 ${MAX_PHOTOS_PER_ACTIVITY}장까지 업로드할 수 있습니다.` : `You can upload up to ${MAX_PHOTOS_PER_ACTIVITY} photos per activity.`,
    photoTooLarge: ko ? "사진 용량이 너무 큽니다. 다른 사진을 선택하세요." : "The photo is too large. Choose another photo.",
    uploadFailed: ko ? "사진을 업로드하지 못했습니다." : "Could not upload the photo.",
    uploaded: ko ? "사진을 업로드했습니다." : "Photo uploaded.",
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

function activityDateLabel(startTime: number, language: string) {
  if (!startTime) return "";
  return new Date(startTime).toLocaleDateString(language.startsWith("ko") ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

function activityDurationMin(data: Record<string, unknown>) {
  const summary = (data.summary ?? {}) as Record<string, unknown>;
  const ms = safeNumber(summary.ridingTimeMillis) || safeNumber(summary.movingTimeMillis) || safeNumber(summary.elapsedTimeMillis);
  const sec = safeNumber(summary.movingTimeSec) || (ms > 0 ? ms / 1000 : 0);
  return Math.round(sec / 60);
}

function formatDuration(minutes: number, ko: boolean) {
  if (minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return ko ? `${m}분` : `${m} min`;
  return ko ? `${h}시간 ${m}분` : `${h} h ${m} min`;
}

async function loadOptions(userId: string, language: string, sportLabel: (type: string) => string): Promise<RideStoryActivityOption[]> {
  const activitiesRef = collection(firestore, "activities");
  const now = Date.now();
  const since = now - 90 * 24 * 60 * 60 * 1000;
  const activitySnap = await getDocs(query(
    activitiesRef,
    where("userId", "==", userId),
    where("startTime", ">=", since),
    where("startTime", "<=", now),
    orderBy("startTime", "desc"),
  ));
  // Same eligibility as the server recipe loader; filter before limiting so non-rides
  // cannot crowd valid cycling activities out of the selection list.
  const eligible = activitySnap.docs.filter((activityDoc) => {
    const data = activityDoc.data() as Record<string, unknown>;
    return !data.deletedAt && !data.isDeleted && matchesDiscipline(data.type, "bike")
      && typeof data.startTime === "number" && Number.isFinite(data.startTime)
      && data.startTime >= since && data.startTime <= now;
  }).sort((left, right) => safeNumber(right.data().startTime) - safeNumber(left.data().startTime)).slice(0, 12);
  const activities = await Promise.all(eligible.map(async (activityDoc) => {
    const data = activityDoc.data() as Record<string, unknown>;
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
    const date = activityDateLabel(safeNumber(data.startTime), language);
    const type = sportLabel(safeString(data.type));
    // 피드와 같은 description을 우선하고, 연동 식별자는 사용자 제목으로 노출하지 않는다.
    const name = [data.description, data.name, data.title, data.activityName]
      .map(value => safeString(value)).find(value => value && value !== activityDoc.id && !/^(orider|strava)_/i.test(value));
    return {
      id: activityDoc.id,
      name: name || [date, type].filter(Boolean).join(" · "),
      date,
      type,
      distanceKm: Math.round((safeNumber(summary.distance) || safeNumber(data.distance)) / 100) / 10,
      durationMin: activityDurationMin(data),
      elevationGainM: Math.round(safeNumber(summary.elevationGain) || safeNumber(data.elevationGain)),
      startTime: safeNumber(data.startTime),
      mapImageUrl: safeString(data.mapImageUrl) || null,
      thumbnailTrack: safeString(data.thumbnailTrack) || null,
      photos,
    };
  }));
  return activities
    .filter((activity): activity is RideStoryActivityOption => Boolean(activity))
    .sort((a, b) => b.startTime - a.startTime)
    .sort((a, b) => Number(b.photos.length > 0) - Number(a.photos.length > 0));
}

export function RideStoryPhotoPicker({ open, userId, onClose, onSent, onFailed, onPreview }: RideStoryPhotoPickerProps) {
  const { t, i18n } = useTranslation("common");
  const { showToast } = useToast();
  const copy = copyFor(i18n.language);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [options, setOptions] = useState<RideStoryActivityOption[]>([]);
  const [selection, setSelection] = useState<RideStorySelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingActivityId, setUploadingActivityId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setOptions([]);
    setSelection(null);
    void loadOptions(userId, i18n.language, type => t(getSportLabelKey(type)))
      .then((nextOptions) => {
        if (!active) return;
        setOptions(nextOptions);
        const preferred = nextOptions.find((activity) => activity.photos.length > 0) ?? nextOptions[0] ?? null;
        setSelection(preferred ? { activityId: preferred.id, photoId: preferred.photos[0]?.id ?? null } : null);
      })
      .catch(() => {
        if (!active) return;
        setError(copy.loadFailed);
        showToast(copy.loadFailed, "error");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [copy.loadFailed, open, showToast, userId, i18n.language, t]);

  if (!open) return null;

  const uploadPhoto = async (activity: RideStoryActivityOption, file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      showToast(copy.imageOnly, "error");
      return;
    }
    if (activity.photos.length >= MAX_PHOTOS_PER_ACTIVITY) {
      showToast(copy.tooManyPhotos, "error");
      return;
    }
    setUploadingActivityId(activity.id);
    try {
      const blob = await resizeImageToWebp(file);
      if (blob.size > MAX_UPLOAD_BYTES) {
        showToast(copy.photoTooLarge, "error");
        return;
      }
      const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `activity_photos/${userId}/${activity.id}/${photoId}.webp`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(firestore, "activity_photos", activity.id, "photos", photoId), {
        storagePath,
        url,
        userId,
        createdAt: Date.now(),
        deletedAt: null,
      });
      const nextPhoto = { id: photoId, url };
      setOptions((prev) => prev.map((item) => (
        item.id === activity.id ? { ...item, photos: [...item.photos, nextPhoto] } : item
      )));
      setSelection({ activityId: activity.id, photoId });
      showToast(copy.uploaded);
    } catch {
      showToast(copy.uploadFailed, "error");
    } finally {
      setUploadingActivityId(null);
    }
  };

  const send = async () => {
    if (!selection || sending || uploadingActivityId) return;
    setSending(true);
    try {
      const fn = httpsCallable<
        { recipeId: string; lang: string; activityId: string; photoId: string | null },
        { sent: boolean; recipeId: string; email: string }
      >(functions, "sendCreatorRecipeEmail", { timeout: 60_000 });
      const result = await fn({ recipeId: "ride-story", lang: i18n.language.startsWith("en") ? "en" : "ko", ...selection });
      if (!result.data.sent) throw new Error("creator/email-not-sent");
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
    <Modal layer={150} portalClassName="ride-story-picker" open={open} onClose={onClose} title={copy.title} maxWidth="max-w-3xl" accessible>
      <div className="ride-story-picker-content min-w-0">
        <div className="border-b pb-4" style={{ borderColor: "var(--line-soft)" }}>
          <div>
            <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.body}</p>
          </div>
        </div>

        <div className="ride-story-picker-scroll py-4">
          {loading ? (
            <PickerMessage>{copy.loading}</PickerMessage>
          ) : error ? (
            <PickerMessage>{error}</PickerMessage>
          ) : options.length === 0 ? (
            <PickerMessage>{copy.noOptions}</PickerMessage>
          ) : (
            <div className="space-y-4">
              {options.map((activity) => (
                <RideStoryActivityRow
                  key={activity.id}
                  activity={activity}
                  selection={selection}
                  copy={{
                    noPhotoLabel: copy.noPhotos,
                    noRoute: copy.noRoute,
                    noPhotoItems: copy.noPhotoItems,
                    photos: copy.photos,
                    routePreview: copy.routePreview,
                    uploadPhoto: copy.uploadPhoto,
                    uploadingPhoto: copy.uploadingPhoto,
                    uploadHelp: copy.uploadHelp,
                    ko: i18n.language.startsWith("ko"),
                  }}
                  uploading={uploadingActivityId === activity.id}
                  onSelect={setSelection}
                  onUpload={(file) => void uploadPhoto(activity, file)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="ride-story-picker-footer flex flex-wrap justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--line-soft)" }}>
          <Button size="md" variant="secondary" onClick={onClose}>{copy.cancel}</Button>
          {onPreview && <Button size="md" variant="primary" disabled={!selection || loading || Boolean(uploadingActivityId)} onClick={() => { if (selection) onPreview(selection); }}>{i18n.language.startsWith("ko") ? "선택 결과 미리보기" : "Preview selected output"}</Button>}
          <Button size="md" variant="secondary" disabled={!selection || loading || Boolean(uploadingActivityId)} loading={sending} leadingIcon={<Send size={ICON_SIZE.md} />} onClick={() => void send()}>
            {copy.send}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PickerMessage({ children }: { children: string }) {
  return (
    <div className="rounded-[var(--r-md)] border p-4 text-[length:var(--ft-body-size)]" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
      {children}
    </div>
  );
}

function RideStoryActivityRow({
  activity,
  selection,
  copy,
  uploading,
  onSelect,
  onUpload,
}: {
  activity: RideStoryActivityOption;
  selection: RideStorySelection | null;
  copy: { ko: boolean; noPhotoLabel: string; noPhotoItems: string; noRoute: string; photos: string; routePreview: string; uploadPhoto: string; uploadingPhoto: string; uploadHelp: string };
  uploading: boolean;
  onSelect: (selection: RideStorySelection) => void;
  onUpload: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activitySelected = selection?.activityId === activity.id;
  const uploadDisabled = uploading || activity.photos.length >= MAX_PHOTOS_PER_ACTIVITY;
  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  };
  return (
    <section className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: activitySelected ? "var(--lime)" : "var(--line-soft)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-[length:var(--fs-base)] font-semibold leading-5" style={{ color: "var(--ink-0)" }}>{activity.name}</h3>
          <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>
            {activity.name !== [activity.date, activity.type].filter(Boolean).join(" · ") && <>{activity.date} · {activity.type}<br /></>}
            <span className="ride-story-metric">{copy.ko ? "이동거리" : "Distance"} <span>{activity.distanceKm.toFixed(1)} km</span></span>{" · "}
            <span className="ride-story-metric">{copy.ko ? "활동시간" : "Activity time"} <span>{formatDuration(activity.durationMin, copy.ko)}</span></span>{" · "}
            <span className="ride-story-metric">{copy.ko ? "상승고도" : "Elevation gain"} <span>{activity.elevationGainM} m</span></span>
          </p>
        </div>
        <Chip>{copy.ko ? `활동사진 ${activity.photos.length}장` : `${activity.photos.length} ${activity.photos.length === 1 ? "photo" : "photos"}`}</Chip>
      </div>

      <div data-testid="E6-1-5" className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,240px)_1fr]">
        <div>
          <div className="mb-1 flex items-center gap-1 text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-3)" }}>
            <MapPinned size={ICON_SIZE.xs} />
            {copy.routePreview}
          </div>
          <button
            type="button"
            aria-pressed={selection?.activityId === activity.id && selection.photoId === null}
            onClick={() => onSelect({ activityId: activity.id, photoId: null })}
            className="block w-full overflow-hidden rounded-[var(--r-md)] border-2 text-left"
            style={{
              borderColor: selection?.activityId === activity.id && selection.photoId === null ? "var(--lime)" : "var(--line-soft)",
              background: "var(--bg-1)",
            }}
          >
            <RoutePosterPreview activity={activity} routeLabel={copy.routePreview} fallbackLabel={copy.noRoute} />
            <div className="border-t px-3 py-2 text-[length:var(--ft-body-size)] font-semibold" style={{ borderColor: "var(--line-soft)", color: "var(--ink-1)" }}>
              {copy.noPhotoLabel}
            </div>
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-3)" }}>
            <span>{copy.photos}</span>
            <span className="tabular-nums">{activity.photos.length}/{MAX_PHOTOS_PER_ACTIVITY}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {activity.photos.map((photo, index) => {
              const selected = selection?.activityId === activity.id && selection.photoId === photo.id;
              return (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`${activity.name} ${copy.photos} ${index + 1}`}
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
              disabled={uploadDisabled}
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-[var(--r-md)] border-2 border-dashed p-2 text-center text-[length:var(--ft-body-size)] font-semibold leading-4 disabled:opacity-50"
              style={{ borderColor: "var(--line-soft)", background: "var(--bg-1)", color: "var(--ink-2)" }}
            >
              <span className="flex h-full flex-col items-center justify-center gap-1">
                {uploading ? <Loader2 size={ICON_SIZE.md} className="animate-spin" /> : <CloudUpload size={ICON_SIZE.md} />}
                {uploading ? copy.uploadingPhoto : copy.uploadPhoto}
              </span>
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadChange} />
          {activity.photos.length === 0 && (
            <div className="mt-2 rounded-[var(--r-md)] border p-3 text-[length:var(--ft-body-size)] leading-5" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)", color: "var(--ink-3)" }}>
              {copy.noPhotoItems} {copy.uploadHelp}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RoutePosterPreview({ activity, routeLabel, fallbackLabel }: { activity: RideStoryActivityOption; routeLabel: string; fallbackLabel: string }) {
  if (activity.mapImageUrl) {
    return <img src={activity.mapImageUrl} alt={routeLabel} className="aspect-[4/3] w-full object-cover" loading="lazy" />;
  }
  const path = buildRouteSvgPath(activity.thumbnailTrack);
  if (!path) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>
        {fallbackLabel}
      </div>
    );
  }
  return (
    <svg viewBox="0 0 240 180" className="block aspect-[4/3] w-full" role="img" aria-label={routeLabel}>
      <rect width="240" height="180" rx="16" fill="var(--bg-1)" />
      <path d={path} fill="none" stroke="color-mix(in srgb, var(--lime) 28%, transparent)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="var(--lime)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildRouteSvgPath(polyline: string | null) {
  if (!polyline) return null;
  const points = decodeTrack(polyline) as [number, number][];
  if (points.length < 2) return null;
  const width = 240;
  const height = 180;
  const padding = 24;
  const lats = points.map((point) => point[0]);
  const lngs = points.map((point) => point[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.000001);
  const lngSpan = Math.max(maxLng - minLng, 0.000001);
  return points
    .map(([lat, lng], index) => {
      const x = padding + ((lng - minLng) / lngSpan) * (width - padding * 2);
      const y = padding + (1 - (lat - minLat) / latSpan) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}
