import SegmentLeaderboard from "../features/segments/SegmentLeaderboard";
import { loadMySegmentAttempts } from "../services/segmentLeaderboard";
import { segmentMetric } from "../features/segments/segmentMetric";
import SegmentSurface from "../features/segments/SegmentSurface";
import SegmentClimbCategory from "../features/segments/SegmentClimbCategory";
import GlossaryText from "../components/common/GlossaryText";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";
import TabNav from "../components/TabNav";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { collection, query, orderBy, where, getDocs, limit, addDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useSegmentMetadata } from "../hooks/useSegmentMetadata";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { decodePolyline } from "../utils/polyline";
import RouteMap from "../components/RouteMap";
import SegmentHistoryPanel from "../features/segments/SegmentHistoryPanel";
import { segmentHistoryContext } from "../features/segments/segmentHistoryNavigation";
import { Button, Card, Text, buttonClass } from "../theme/components";
import { isVisibleCourseDocData } from "../features/courses/courseVisibility";
import { isImplausibleAvgSpeed } from "../utils/activitySanity";

/** 비현실 평속(80 km/h 초과 등)은 "—" 로 가린다. 세그먼트 기록은 bike 기준. */
function formatEffortSpeed(avgKph: number): string {
  return isImplausibleAvgSpeed(avgKph, "bike") ? "— km/h" : `${avgKph.toFixed(1)} km/h`;
}

export function parseSegmentLatlng(value: string | null | undefined): [number, number][] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const latlng = parsed.filter((point): point is [number, number] =>
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number",
    );
    return latlng.length > 0 ? latlng : null;
  } catch {
    return null;
  }
}

interface SegmentData {
  id: string;
  name: string;
  distance: number;
  averageGrade: number;
  maximumGrade: number;
  elevationHigh: number;
  elevationLow: number;
  climbCategory: number;
  city?: string;
  state?: string;
  startLatlng?: [number, number] | null;
  endLatlng?: [number, number] | null;
  segmentLatlng?: string | null;
  polyline?: string | null;
  source?: string;
  status?: string;
  description?: string;
  createdByUid?: string | null;
  photos?: {
    source: string;
    url: string;
    location: [number, number];
    caption?: string;
    attribution: string;
  }[];
}

const STATUS_BADGE_STYLES: Record<string, React.CSSProperties> = {
  pending: { background: "color-mix(in oklch, var(--amber) 14%, var(--bg-2))", color: "var(--amber)", border: "1px solid color-mix(in oklch, var(--amber) 30%, transparent)" },
  rejected: { background: "color-mix(in oklch, var(--rose) 14%, var(--bg-2))", color: "var(--rose)", border: "1px solid color-mix(in oklch, var(--rose) 30%, transparent)" },
  hidden: { background: "var(--bg-3)", color: "var(--ink-3)", border: "1px solid var(--line-soft)" },
};

const SEGMENT_PAGE_STACK_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-6)",
};

const SEGMENT_SECTION_STACK_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const SEGMENT_INLINE_WRAP_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--space-2)",
};

const SEGMENT_TOAST_STYLE: React.CSSProperties = {
  zIndex: 10000,
  background: "var(--bg-4)",
  color: "var(--ink-0)",
  border: "1px solid var(--line)",
  padding: "var(--space-2) var(--space-4)",
};

interface EffortData {
  deletedAt?: unknown;
  id: string;
  segmentId: string;
  activityId: string;
  userId: string;
  nickname: string;
  profileImage?: string | null;
  elapsedTime: number;
  movingTime: number;
  distance: number;
  averageSpeed: number;
  averageWatts: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageCadence: number | null;
  prRank: number | null;
  komRank: number | null;
  startDate: number;
  source?: string;
}

// ── EXIF GPS extraction ─────────────────────────────────────────────

async function extractGpsFromFile(file: File): Promise<[number, number] | null> {
  try {
    const buf = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        const exifOffset = offset + 4;
        if (view.getUint32(exifOffset) !== 0x45786966) break;
        const tiffStart = exifOffset + 6;
        const le = view.getUint16(tiffStart) === 0x4949;
        const g16 = (o: number) => view.getUint16(o, le);
        const g32 = (o: number) => view.getUint32(o, le);
        const readRational = (o: number) => g32(o) / g32(o + 4);

        const ifd0Count = g16(tiffStart + g32(tiffStart + 4));
        let gpsOffset = 0;
        for (let i = 0; i < ifd0Count; i++) {
          const entry = tiffStart + g32(tiffStart + 4) + 2 + i * 12;
          if (entry + 12 > view.byteLength) break;
          if (g16(entry) === 0x8825) { gpsOffset = tiffStart + g32(entry + 8); break; }
        }
        if (!gpsOffset || gpsOffset + 2 > view.byteLength) return null;

        const gpsCount = g16(gpsOffset);
        const tags: Record<number, { type: number; count: number; valueOffset: number }> = {};
        for (let i = 0; i < gpsCount; i++) {
          const e = gpsOffset + 2 + i * 12;
          if (e + 12 > view.byteLength) break;
          tags[g16(e)] = { type: g16(e + 2), count: g32(e + 4), valueOffset: tiffStart + g32(e + 8) };
        }

        const toDeg = (tag: { valueOffset: number }) => {
          const o = tag.valueOffset;
          return readRational(o) + readRational(o + 8) / 60 + readRational(o + 16) / 3600;
        };

        if (!tags[2] || !tags[4]) return null;
        let lat = toDeg(tags[2]);
        let lng = toDeg(tags[4]);

        const latRef = tags[1] ? String.fromCharCode(view.getUint8(gpsOffset + 2 + (() => {
          for (let i = 0; i < gpsCount; i++) { if (g16(gpsOffset + 2 + i * 12) === 1) return i * 12 + 8; }
          return 0;
        })())) : "N";
        const lngRef = tags[3] ? String.fromCharCode(view.getUint8(gpsOffset + 2 + (() => {
          for (let i = 0; i < gpsCount; i++) { if (g16(gpsOffset + 2 + i * 12) === 3) return i * 12 + 8; }
          return 0;
        })())) : "E";

        if (latRef === "S") lat = -lat;
        if (lngRef === "W") lng = -lng;

        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          return [lat, lng];
        }
        return null;
      }
      const len = view.getUint16(offset + 2);
      offset += 2 + len;
    }
  } catch { /* ignore */ }
  return null;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function SegmentPage() {
  return <SegmentSurface><SegmentDetailContent /></SegmentSurface>;
}

function SegmentDetailContent() {
  const detailLocation = useLocation();
  const [detailParams, setDetailParams] = useSearchParams();
  const requestedTab = detailParams.get("tab") ?? (detailParams.has("currentActivityId") || detailParams.has("cachedComparison") ? "mine" : "overview");
  const setDetailTab = (tab: string) => { const next = new URLSearchParams(detailParams); if (tab === "overview") next.delete("tab"); else next.set("tab", tab); setDetailParams(next, { replace: true, state: detailLocation.state }); };
  const { t } = useTranslation("segment");
  const { segmentId } = useParams<{ segmentId: string }>();
  const [searchParams] = useSearchParams();
  const cachedGapEntry = getRuntimeConfig().appEnvironment === "stage" && searchParams.get("cachedComparison") === "1";
  const drilldown = useMemo(() => segmentHistoryContext(searchParams), [searchParams]);
  const drilldownKey = JSON.stringify([segmentId, drilldown]);
  const { user, profile } = useAuth();
  const detailTab = requestedTab === "ranking" ? "ranking" : requestedTab === "mine" && user && !user.isAnonymous ? "mine" : "overview";
  const gapServices = useFirebaseServices();
  const { data: segment, loading: segLoading } = useSegmentMetadata<SegmentData>(segmentId);

  // Photo upload
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [userPhotos, setUserPhotos] = useState<{ id: string; url: string; location: [number, number]; caption?: string; uploaderNickname: string }[]>([]);
  const [flyToPosition, setFlyToPosition] = useState<[number, number] | null>(null);
  const [gapMarker, setGapMarker] = useState<{ user: typeof user; segment: typeof segment; position: [number, number] } | null>(null);
  const onGapMarker = useCallback((position: [number, number] | null) => setGapMarker(position ? { user, segment, position } : null), [user, segment]);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [resolvedLatlng, setResolvedLatlng] = useState<[number, number][] | null>(null);

  useEffect(() => {
    setResolvedLatlng(null);
  }, [segmentId]);

  // Subscribe to approved user photos for this segment
  useEffect(() => {
    if (!segmentId) return;
    const q = query(
      collection(firestore, "segment_photos"),
      where("segmentId", "==", segmentId),
      where("status", "==", "approved"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          url: data.url as string,
          location: data.location as [number, number],
          caption: data.caption as string | undefined,
          uploaderNickname: data.uploaderNickname as string,
        };
      });
      items.sort((x, y) => (x.id > y.id ? 1 : -1));
      setUserPhotos(items);
    });
    return unsub;
  }, [segmentId]);

  // Photo upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!user || !profile) { showToast(t("error.loginRequired")); return; }
    if (!segmentId) return;
    if (!file.type.startsWith("image/")) { showToast(t("error.imageOnly")); return; }

    setUploading(true);
    try {
      const gps = await extractGpsFromFile(file);
      if (!gps) {
        showToast(t("error.noGps"));
        setUploading(false);
        return;
      }

      const bitmap = await createImageBitmap(file);
      const maxSide = 1920;
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > maxSide || h > maxSide) {
        const ratio = maxSide / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp", 0.8),
      );

      if (blob.size > 5 * 1024 * 1024) {
        showToast(t("error.fileTooLarge"));
        setUploading(false);
        return;
      }

      const photoId = crypto.randomUUID();
      const storagePath = `segment_photos/${user.uid}/${segmentId}/${photoId}.webp`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(firestore, "segment_photos"), {
        segmentId,
        uploaderId: user.uid,
        uploaderNickname: profile.nickname,
        uploaderProfileImage: profile.photoURL ?? null,
        storagePath,
        url,
        location: gps,
        status: "pending",
        createdAt: Date.now(),
      });

      showToast(t("error.photoUploadSuccess"));
    } catch (err) {
      logClientError("SegmentPage.uploadPhoto", err, { segmentId });
      showToast(t("error.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  // 원본 이력은 사용자 요청 때 최대 50개만 읽는다. 현재 시도 선택은 패널에서 명시한다.
  const [historySeed, setHistorySeed] = useState<{ key: string; epoch: object; rows: EffortData[]; error: boolean } | null>(null);
  const [historyVisibility, setHistoryVisibility] = useState<{ key: string; open: boolean } | null>(null);
  const showAllEfforts = historyVisibility?.key === drilldownKey ? historyVisibility.open : drilldown !== null;
  const historySeedKey = user && segmentId ? JSON.stringify([user.uid, segmentId]) : null;
  const historySeedEpoch = useMemo(() => ({}), [historySeedKey, user, showAllEfforts]);
  useEffect(() => {
    if (!segmentId || !user || user.isAnonymous || !showAllEfforts || !historySeedKey) return;
    let active = true;
    const uid = user.uid;
    void (async () => {
      try {
        const owned = await loadMySegmentAttempts(gapServices, uid, segmentId);
        if (active) setHistorySeed({ key: historySeedKey, epoch: historySeedEpoch, rows: owned as EffortData[], error: false });
      } catch (err) {
        logClientError("SegmentPage.fetchMyEfforts", err, { segmentId });
        if (active) setHistorySeed({ key: historySeedKey, epoch: historySeedEpoch, rows: [], error: true });
      }
    })();
    return () => { active = false; };
  }, [segmentId, user, showAllEfforts, historySeedKey, historySeedEpoch, gapServices]);
  const currentHistorySeed = historySeed?.key === historySeedKey && historySeed.epoch === historySeedEpoch ? historySeed : null;

  // Segment stats
  const elevGain = useMemo(
    () => (segment ? Math.max(0, segment.elevationHigh - segment.elevationLow) : 0),
    [segment],
  );

  // 이 세그먼트를 쓰는 코스 — 역링크(#495). courses.segmentIds array-contains 쿼리.
  const [usedByCourses, setUsedByCourses] = useState<{ id: string; name: string; distance: number; elevationGain: number }[]>([]);
  useEffect(() => {
    if (!segmentId) return;
    let cancelled = false;
    getDocs(query(
      collection(firestore, "courses"),
      where("segmentIds", "array-contains", segmentId),
      where("deletedAt", "==", null),
      orderBy("createdAt", "desc"),
      limit(6),
    ))
      .then((snap) => {
        if (cancelled) return;
        setUsedByCourses(snap.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .filter((item) => isVisibleCourseDocData(item.data))
          .map((item) => ({ id: item.id, name: item.data.name ?? "", distance: item.data.distance ?? 0, elevationGain: item.data.elevationGain ?? 0 })));
      })
      .catch((err) => { logClientError("SegmentPage.usedByCourses", err, { segmentId }); });
    return () => { cancelled = true; };
  }, [segmentId]);

  const myBestEffort = currentHistorySeed?.rows.reduce<EffortData | null>((best, row) => !best || row.elapsedTime < best.elapsedTime ? row : best, null) ?? null;

  if (segLoading) {
    return (
      <div className="site-shell" style={SEGMENT_PAGE_STACK_STYLE}>
        <div className="h-[28rem] rounded-[var(--r-lg)] animate-pulse" style={{ background: "var(--bg-3)" }} />
        <Card>
          <div className="h-8 rounded-[var(--r-sm)] w-1/3 animate-pulse" style={{ background: "var(--bg-3)" }} />
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={SEGMENT_SECTION_STACK_STYLE}>
                <div className="h-3 rounded-[var(--r-sm)] w-16 animate-pulse" style={{ background: "var(--bg-3)" }} />
                <div className="h-6 rounded-[var(--r-sm)] w-20 animate-pulse" style={{ background: "var(--bg-3)" }} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "var(--space-4)" }}>
          {[1, 2].map((i) => (
            <Card key={i} className="h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!segment) {
    return (
      <div className="text-center" style={{ color: "var(--ink-3)", paddingBlock: "var(--space-8)" }}>
        <p className="text-[length:var(--fs-lg)]">{t("error.notFound")}</p>
        <Link to="/" className="text-[length:var(--ft-body-size)] inline-block hover:underline" style={{ color: "var(--lime)", marginTop: "var(--space-2)" }}>{t("button.goBack")}</Link>
      </div>
    );
  }


  return (
    <div className="site-shell" style={SEGMENT_PAGE_STACK_STYLE}>
      {/* Toast */}
      {toast && createPortal(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 text-[length:var(--ft-body-size)] rounded-[var(--r-lg)]" style={SEGMENT_TOAST_STYLE}>
          {toast}
        </div>,
        document.body,
      )}

      {/* Header */}
      <Card data-testid="D3-0">
        <div style={{ ...SEGMENT_INLINE_WRAP_STYLE, gap: "var(--space-3)" }}>
          <SegmentClimbCategory category={segment.climbCategory} />
          <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{segment.name}</h1>
          <Button data-testid="D3-0-share" variant="secondary" size="sm" onClick={async () => {
            const url = window.location.origin + window.location.pathname;
            try {
              if (navigator.share) await navigator.share({ title: segment.name, url });
              else { await navigator.clipboard.writeText(url); showToast(t("detail.shareCopied")); }
            } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) { logClientError("SegmentPage.share", error, { segmentId }); showToast(t("detail.shareFailed")); } }
          }}>{t("detail.share")}</Button>
          {(() => {
            const badgeStyle = segment.status ? STATUS_BADGE_STYLES[segment.status] : null;
            const badgeLabel = segment.status && (segment.status === "pending" || segment.status === "rejected" || segment.status === "hidden")
              ? t(`status.${segment.status}`)
              : null;
            return badgeStyle && badgeLabel && (
              <span className="text-[length:var(--ft-body-size)] font-semibold rounded-[var(--r-sm)]" style={{ ...badgeStyle, padding: "var(--space-1) var(--space-2)" }}>
                {badgeLabel}
              </span>
            );
          })()}
        </div>
        {(segment.city || segment.state) && (
          <p className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)", marginTop: "var(--space-1)" }}>
            {[segment.city, segment.state].filter(Boolean).join(", ")}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
          <div style={SEGMENT_SECTION_STACK_STYLE}>
            <Text as="div" variant="eyebrow"><GlossaryText>{t("distance")}</GlossaryText></Text>
            <Text as="div" variant="dataMedium">{segmentMetric(segment.distance, 2, 1000)}<Text variant="unit">km</Text></Text>
          </div>
          <div style={SEGMENT_SECTION_STACK_STYLE}>
            <Text as="div" variant="eyebrow"><GlossaryText>{t("elevationGain")}</GlossaryText></Text>
            <Text as="div" variant="dataMedium">{segmentMetric(elevGain)}<Text variant="unit">m</Text></Text>
          </div>
          <div style={SEGMENT_SECTION_STACK_STYLE}>
            <Text as="div" variant="eyebrow"><GlossaryText>{t("averageGrade")}</GlossaryText></Text>
            <Text as="div" variant="dataMedium">{segmentMetric(segment.averageGrade, 1)}<Text variant="unit">%</Text></Text>
          </div>
          <div style={SEGMENT_SECTION_STACK_STYLE}>
            <Text as="div" variant="eyebrow"><GlossaryText>{t("maxGrade")}</GlossaryText></Text>
            <Text as="div" variant="dataMedium">{segmentMetric(segment.maximumGrade, 1)}<Text variant="unit">%</Text></Text>
          </div>
        </div>
      </Card>

      <TabNav tabs={[{ id: "overview", label: t("detailTabs.overview"), specId: "D3-T" }, { id: "ranking", label: t("detailTabs.ranking"), specId: "D3-T" }, ...(user && !user.isAnonymous ? [{ id: "mine", label: t("myRecord"), specId: "D3-T" }] : [])]} activeTab={detailTab} onChange={setDetailTab} />
      <div data-testid="D3-1" style={detailTab !== "overview" ? { display: "none" } : undefined}>
      {/* Map */}
      {(() => {
        const storedPolyline = cachedGapEntry && typeof segment.polyline === "string" && segment.polyline.length <= 32768
          ? decodePolyline(segment.polyline, 4097) : null;
        const parsed = parseSegmentLatlng(segment.segmentLatlng)
          ?? (storedPolyline && storedPolyline.length >= 2 && storedPolyline.length <= 4096
            && storedPolyline.every(p => Number.isFinite(p[0]) && Math.abs(p[0]) <= 90 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 180) ? storedPolyline : null);
        const latlng = (parsed && parsed.length > 0)
          ? parsed
          : resolvedLatlng
            ? resolvedLatlng
            : (segment.startLatlng && segment.endLatlng)
              ? [segment.startLatlng, segment.endLatlng]
              : null;
        return latlng && (
          <RouteMap
            latlng={latlng}
            height="h-[28rem]"
            interactive
            rounded
            flyToPosition={flyToPosition}
            markerPosition={cachedGapEntry && gapServices.auth.currentUser?.uid === user?.uid && !gapServices.auth.currentUser?.isAnonymous && gapMarker?.user === user && gapMarker.segment === segment ? gapMarker.position : null}
            photos={[
              ...(segment.photos?.map((p, i) => ({
                id: `seg-photo-${i}`,
                url: p.url,
                location: p.location,
                caption: p.caption ?? p.attribution,
              })) ?? []),
              ...userPhotos.map((p) => ({
                id: `user-photo-${p.id}`,
                url: p.url,
                location: p.location,
                caption: p.caption ?? p.uploaderNickname,
              })),
            ]}
          />
        );
      })()}

      {/* Photo Gallery */}
      {((segment.photos && segment.photos.length > 0) || userPhotos.length > 0 || user) && (
        <Card>
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-3)" }}>
            <h3 className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("photo.title")}</h3>
            {user && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <Button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploading} variant="primary" size="sm" className="disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t("button.uploadingPhoto")}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      {t("button.addPhoto")}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
          {((segment.photos && segment.photos.length > 0) || userPhotos.length > 0) && (
            <div className="flex overflow-x-auto scrollbar-thin" style={{ gap: "var(--space-3)", paddingBottom: "var(--space-2)" }}>
              {segment.photos?.map((photo, i) => (
                <div key={`auto-${i}`} className="flex-shrink-0 group relative">
                  <img
                    src={photo.url}
                    alt={photo.caption || t("photo.photoAlt", { index: i + 1 })}
                    className="h-40 w-auto rounded-[var(--r-lg)] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                      setFlyToPosition(null);
                      setTimeout(() => setFlyToPosition(photo.location), 10);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-lg px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[length:var(--ft-body-size)] text-[var(--ink-0)]/80 truncate">{photo.attribution}</p>
                  </div>
                </div>
              ))}
              {userPhotos.map((photo) => (
                <div key={`user-${photo.id}`} className="flex-shrink-0 group relative">
                  <img
                    src={photo.url}
                    alt={photo.caption || t("photo.userPhoto")}
                    className="h-40 w-auto rounded-[var(--r-lg)] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                      setFlyToPosition(null);
                      setTimeout(() => setFlyToPosition(photo.location), 10);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-lg px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[length:var(--ft-body-size)] text-[var(--ink-0)]/80 truncate">{photo.uploaderNickname}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(!segment.photos || segment.photos.length === 0) && userPhotos.length === 0 && user && (
            <p className="text-[length:var(--ft-body-size)] text-center" style={{ color: "var(--ink-3)", paddingBlock: "var(--space-4)" }}>
              {t("empty.noPhotos")}
            </p>
          )}
        </Card>
      )}

      </div>
      {/* KOM + My Best */}
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "var(--space-4)" }}>
        {/* My Best */}
        {detailTab === "mine" && <Card data-testid="D3-3">
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("myRecord")}</Text>
          {myBestEffort ? (
            <div>
              <div style={SEGMENT_INLINE_WRAP_STYLE}>
                <Text as="div" variant="dataLarge" style={{ color: "var(--ink-0)" }}>{formatTime(myBestEffort.elapsedTime)}</Text>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)", marginTop: "var(--space-1)" }}>
                <span><GlossaryText>{t("kom.avgSpeed")}</GlossaryText> {formatEffortSpeed(myBestEffort.averageSpeed)}</span>
                {myBestEffort.averageWatts != null && <span><GlossaryText>{t("kom.power")}</GlossaryText> {myBestEffort.averageWatts} W</span>}
                {myBestEffort.averageHeartrate != null && <span><GlossaryText>{t("kom.heartrate")}</GlossaryText> {Math.round(myBestEffort.averageHeartrate)} bpm</span>}
              </div>
              <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-4)", marginTop: "var(--space-1)" }}>
                {new Date(myBestEffort.startDate).toLocaleDateString(localeTag())}
              </div>
            </div>
          ) : user ? (
            <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>{t("empty.noMyRecord")}</div>
          ) : (
            <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>{t("empty.loginRequired")}</div>
          )}
        </Card>}
      </div>

      {detailTab === "ranking" && <Text as="p">{t("nativeBoard.legendPreparing")}</Text>}

      {/* 이 세그먼트를 쓰는 코스 — 역링크(#495) */}
      {detailTab === "overview" && usedByCourses.length > 0 && (
        <Card>
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-2)" }}>{t("usedByCourses")}</Text>
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "var(--space-2)" }}>
            {usedByCourses.map((c) => (
              <Link key={c.id} to={`/course/${c.id}`}>
                <Card padding="compact" className="hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                  <span className="font-semibold text-[length:var(--ft-body-size)] truncate" style={{ color: "var(--ink-0)" }}>{c.name}</span>
                  <div className="text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)", marginTop: "var(--space-1)" }}>{(c.distance / 1000).toFixed(1)}km · ↑{Math.round(c.elevationGain)}m</div>
                </Card>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {detailTab === "ranking" && segmentId && <SegmentLeaderboard key={`${segmentId}:${user?.uid ?? ""}`} segmentId={segmentId} />}

      {/* My History */}
      {detailTab === "mine" && user && !user.isAnonymous && (
        <Card padding="none" className="overflow-hidden">
          <button
            onClick={() => setHistoryVisibility({ key: drilldownKey, open: !showAllEfforts })}
            aria-expanded={showAllEfforts}
            className={buttonClass({ variant: "ghost", className: "w-full flex items-center justify-between transition-colors" })}
            style={{ borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-5)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-2)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
          >
            <h2 className="font-semibold text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-0)" }}>{t("myHistory")}</h2>
            <svg
              className={`w-4 h-4 transition-transform ${showAllEfforts ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ color: "var(--ink-3)" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAllEfforts && segmentId && <SegmentHistoryPanel cachedGapEntry={cachedGapEntry} sourceIdentity={JSON.stringify([segment])} onGapMarker={onGapMarker} callableEnabled={getRuntimeConfig().activityAnalysisExpansionEnabled === true} key={`${historySeedKey}:${drilldownKey}`} initialSelection={drilldown} segmentId={segmentId} seeds={currentHistorySeed?.rows ?? []} seedLoading={!currentHistorySeed} seedError={currentHistorySeed?.error ?? false} />}
        </Card>
      )}
    </div>
  );
}
