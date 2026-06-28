import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { collection, query, orderBy, where, getDocs, limit, addDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useDocument } from "../hooks/useFirestore";
import { useAuth } from "../contexts/AuthContext";
import { usePdc } from "../hooks/usePdc";
import { predictSegmentTimeSec, predictedRank } from "@shared/training/segmentPrediction";
import { useStrava } from "../hooks/useStrava";
import RouteMap from "../components/RouteMap";
import Avatar from "../components/Avatar";
import { Button, Card, Text } from "../theme/components";
import { isImplausibleAvgSpeed } from "../utils/activitySanity";

/** 비현실 평속(80 km/h 초과 등)은 "—" 로 가린다. 세그먼트 기록은 bike 기준. */
function formatEffortSpeed(avgKph: number): string {
  return isImplausibleAvgSpeed(avgKph, "bike") ? "— km/h" : `${avgKph.toFixed(1)} km/h`;
}

const CATEGORY_COLORS: Record<number, { bg: string; label: string }> = {
  5: { bg: "bg-red-600 text-[var(--ink-0)]", label: "HC" },
  4: { bg: "bg-red-500 text-[var(--ink-0)]", label: "Cat 1" },
  3: { bg: "bg-[var(--amber)] text-[var(--bg-0)]", label: "Cat 2" },
  2: { bg: "bg-yellow-500 text-[var(--ink-0)]", label: "Cat 3" },
  1: { bg: "bg-green-500 text-[var(--ink-0)]", label: "Cat 4" },
};

// rank 1 = amber, rank 2 = aqua, rank 3 = rose
const RANK_STYLES = [
  { bg: "color-mix(in oklch, var(--amber) 18%, var(--bg-2))", color: "var(--amber)", border: "color-mix(in oklch, var(--amber) 35%, transparent)" },
  { bg: "color-mix(in oklch, var(--aqua) 18%, var(--bg-2))", color: "var(--aqua)", border: "color-mix(in oklch, var(--aqua) 35%, transparent)" },
  { bg: "color-mix(in oklch, var(--rose) 18%, var(--bg-2))", color: "var(--rose)", border: "color-mix(in oklch, var(--rose) 35%, transparent)" },
];

function rankStyle(rank: number): React.CSSProperties {
  const s = rank >= 1 && rank <= 3 ? RANK_STYLES[rank - 1] : undefined;
  if (!s) return { background: "var(--bg-3)", color: "var(--ink-2)", border: "1px solid var(--line-soft)" };
  return { background: s.bg, color: s.color, border: `1px solid ${s.border}` };
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

/** Local Legend 스냅샷(#490) — segments/{id}/legend/current. */
interface LegendStanding {
  userId: string;
  nickname: string | null;
  profileImage: string | null;
  effortCount: number;
}
interface LegendDoc {
  leader: LegendStanding | null;
  runnerUp: LegendStanding | null;
  riderCount: number;
  totalEfforts: number;
  handoverCount: number;
  windowDays: number;
  computedAt: number;
}
/** 스냅샷 신선도 한도 — 주 1회 cron 기준 2주 미갱신이면 조용한 세그먼트로 보고 숨김. */
const LEGEND_STALE_MS = 14 * 24 * 60 * 60 * 1000;

const STATUS_BADGE_STYLES: Record<string, React.CSSProperties> = {
  pending: { background: "color-mix(in oklch, var(--amber) 14%, var(--bg-2))", color: "var(--amber)", border: "1px solid color-mix(in oklch, var(--amber) 30%, transparent)" },
  rejected: { background: "color-mix(in oklch, var(--rose) 14%, var(--bg-2))", color: "var(--rose)", border: "1px solid color-mix(in oklch, var(--rose) 30%, transparent)" },
  hidden: { background: "var(--bg-3)", color: "var(--ink-3)", border: "1px solid var(--line-soft)" },
};

interface EffortData {
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
  const { t } = useTranslation("segment");
  const { segmentId } = useParams<{ segmentId: string }>();
  const { user, profile } = useAuth();
  const { getStreams } = useStrava();
  const { data: segment, loading: segLoading } = useDocument<SegmentData>("segments", segmentId);

  // Photo upload
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [userPhotos, setUserPhotos] = useState<{ id: string; url: string; location: [number, number]; caption?: string; uploaderNickname: string }[]>([]);
  const [flyToPosition, setFlyToPosition] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [efforts, setEfforts] = useState<EffortData[]>([]);
  const [loadingEfforts, setLoadingEfforts] = useState(true);
  const [myOutsideEffort, setMyOutsideEffort] = useState<EffortData | null>(null);
  const [resolvedLatlng, setResolvedLatlng] = useState<[number, number][] | null>(null);
  const fetchedRef = useRef(false);

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

  // Fetch efforts sorted by elapsedTime (leaderboard)
  useEffect(() => {
    if (!segmentId) return;

    const fetchEfforts = async () => {
      setLoadingEfforts(true);
      try {
        // 상위 200개 기록 조회
        const q = query(
          collection(firestore, `segment_efforts/${segmentId}/efforts`),
          orderBy("elapsedTime", "asc"),
          limit(200),
        );
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EffortData);

        // Deduplicate: keep best effort per user
        const bestByUser = new Map<string, EffortData>();
        for (const e of items) {
          const existing = bestByUser.get(e.userId);
          if (!existing || e.elapsedTime < existing.elapsedTime) {
            bestByUser.set(e.userId, e);
          }
        }

        // 현재 사용자의 기록이 상위 200개에 없으면 별도 조회
        let myEffortOutsideTop = false;
        if (user && !bestByUser.has(user.uid)) {
          const myQ = query(
            collection(firestore, `segment_efforts/${segmentId}/efforts`),
            where("userId", "==", user.uid),
            limit(10),
          );
          const mySnap = await getDocs(myQ);
          if (!mySnap.empty) {
            // 사용자의 최고 기록 찾기
            let best: EffortData | null = null;
            for (const d of mySnap.docs) {
              const e = { id: d.id, ...d.data() } as EffortData;
              if (!best || e.elapsedTime < best.elapsedTime) best = e;
            }
            if (best) {
              bestByUser.set(user.uid, best);
              myEffortOutsideTop = true;
            }
          }
        }

        const sorted = Array.from(bestByUser.values()).sort((a, b) => a.elapsedTime - b.elapsedTime);
        // 200위 밖 사용자 기록은 리더보드에서 제외하고 별도 보관
        if (myEffortOutsideTop && user) {
          const myEntry = sorted.find((e) => e.userId === user.uid);
          if (myEntry) {
            setEfforts(sorted.filter((e) => e.userId !== user.uid));
            setMyOutsideEffort(myEntry);
            return;
          }
        }
        setMyOutsideEffort(null);
        setEfforts(sorted);
      } catch (err) {
        logClientError("SegmentPage.fetchEfforts", err, { segmentId });
      } finally {
        setLoadingEfforts(false);
      }
    };

    fetchEfforts();
  }, [segmentId, user]);

  // Auto-resolve segment route: if segmentLatlng is missing, fetch activity streams to populate it
  useEffect(() => {
    if (fetchedRef.current) return;
    if (!segment || (segment.segmentLatlng && segment.segmentLatlng.length > 2)) return;
    if (!user || !profile?.stravaConnected) return;
    if (efforts.length === 0 || loadingEfforts) return;

    // Find an effort with a strava activityId
    const effort = efforts.find((e) => e.activityId?.startsWith("strava_"));
    if (!effort) return;

    const stravaId = parseInt(effort.activityId.replace("strava_", ""), 10);
    if (!stravaId) return;

    fetchedRef.current = true;
    // getStreams triggers stravaGetActivityStreams which saves segmentLatlng as side-effect
    getStreams(stravaId).then((data) => {
      // Extract segment route from streams for immediate display
      const streams = data as { latlng?: [number, number][]; segment_efforts?: { segment: { id: number }; startIndex: number; endIndex: number }[] };
      if (!streams?.latlng || !streams?.segment_efforts) return;

      const stravaSegId = segment.source === "strava" ? (segment as SegmentData & { stravaSegmentId?: number }).stravaSegmentId : null;
      if (!stravaSegId) return;

      const matchingEffort = streams.segment_efforts.find((e) => e.segment.id === stravaSegId);
      if (!matchingEffort) return;

      const slice = streams.latlng.slice(matchingEffort.startIndex, matchingEffort.endIndex + 1);
      if (slice.length > 0) setResolvedLatlng(slice);
    }).catch((err) => logClientError("SegmentPage.bg", err, {}));
  }, [segment, user, profile?.stravaConnected, efforts, loadingEfforts]);

  // My all efforts (for personal history)
  const [allEfforts, setAllEfforts] = useState<EffortData[]>([]);
  const [showAllEfforts, setShowAllEfforts] = useState(false);

  useEffect(() => {
    if (!segmentId || !user || !showAllEfforts) return;

    const fetchMyEfforts = async () => {
      try {
        const q = query(
          collection(firestore, `segment_efforts/${segmentId}/efforts`),
          where("userId", "==", user.uid),
          orderBy("startDate", "desc"),
        );
        const snap = await getDocs(q);
        setAllEfforts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EffortData),
        );
      } catch (err) {
        logClientError("SegmentPage.fetchMyEfforts", err, { segmentId });
      }
    };

    fetchMyEfforts();
  }, [segmentId, user, showAllEfforts]);

  // Segment stats
  const elevGain = useMemo(
    () => (segment ? Math.max(0, segment.elevationHigh - segment.elevationLow) : 0),
    [segment],
  );

  // 무결성(#494): 비현실 속도(GPS noise/차량 오등록) effort 는 리더보드/KOM 표시에서 제외 —
  // 가짜로 빠른 기록이 #1·KOM 으로 보이지 않게. 서버 komRank 산정과 동일 룰.
  const validEfforts = useMemo(() => efforts.filter((e) => !isImplausibleAvgSpeed(e.averageSpeed, "bike")), [efforts]);
  const komEffort = validEfforts[0] ?? null;

  // 이 세그먼트를 쓰는 코스 — 역링크(#495). courses.segmentIds array-contains 쿼리.
  const [usedByCourses, setUsedByCourses] = useState<{ id: string; name: string; distance: number; elevationGain: number }[]>([]);
  useEffect(() => {
    if (!segmentId) return;
    let cancelled = false;
    getDocs(query(
      collection(firestore, "courses"),
      where("deletedAt", "==", null),
      where("segmentIds", "array-contains", segmentId),
      orderBy("createdAt", "desc"),
      limit(6),
    ))
      .then((snap) => {
        if (cancelled) return;
        setUsedByCourses(snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, name: x.name ?? "", distance: x.distance ?? 0, elevationGain: x.elevationGain ?? 0 };
        }));
      })
      .catch((err) => { logClientError("SegmentPage.usedByCourses", err, { segmentId }); });
    return () => { cancelled = true; };
  }, [segmentId]);

  // Local Legend — 90일 최다완주 스냅샷 단일 doc 구독(#490). cron 미배포 시 null(빈 상태).
  const { data: legend } = useDocument<LegendDoc>(
    `segments/${segmentId}/legend`,
    segmentId ? "current" : undefined,
  );
  // 스냅샷이 마지막 cron 이후 너무 오래됐으면(세그먼트가 조용해짐) 숨김.
  const legendFresh =
    !!legend?.leader &&
    typeof legend.computedAt === "number" &&
    Date.now() - legend.computedAt < LEGEND_STALE_MS;

  // 내가 달리면? — PDC(CP/W') × 세그먼트 물리로 결정적 예상기록 + 도달 순위(#487).
  const { pdc } = usePdc(user?.uid);
  const prediction = useMemo(() => {
    if (!segment || !pdc?.cp || !profile?.weightKg) return null;
    const sec = predictSegmentTimeSec({
      distanceM: segment.distance,
      avgGradePct: segment.averageGrade,
      cp: pdc.cp.value,
      wPrime: pdc.cp.wPrime,
      riderWeightKg: profile.weightKg,
    });
    if (sec == null) return null;
    // sec 는 초, effort.elapsedTime 은 ms → 초로 환산해 비교. 유효 effort 만(무결성).
    return { sec, rank: predictedRank(sec, validEfforts.map((e) => e.elapsedTime / 1000)) };
  }, [segment, pdc, profile?.weightKg, validEfforts]);

  const myBestEffort = useMemo(
    () => {
      if (!user) return null;
      const inBoard = validEfforts.find((e) => e.userId === user.uid);
      return inBoard ?? myOutsideEffort;
    },
    [validEfforts, user, myOutsideEffort],
  );
  const myRank = useMemo(() => {
    if (!user) return 0;
    const idx = validEfforts.findIndex((e) => e.userId === user.uid);
    if (idx >= 0) return idx + 1;
    if (myOutsideEffort) return -1; // 200위 밖 표시용
    return 0;
  }, [validEfforts, user, myOutsideEffort]);

  if (segLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-[28rem] rounded-[var(--r-lg)] animate-pulse" style={{ background: "var(--bg-3)" }} />
        <Card padding="none" className="p-5! space-y-4">
          <div className="h-8 rounded-[var(--r-sm)] w-1/3 animate-pulse" style={{ background: "var(--bg-3)" }} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 rounded-[var(--r-sm)] w-16 animate-pulse" style={{ background: "var(--bg-3)" }} />
                <div className="h-6 rounded-[var(--r-sm)] w-20 animate-pulse" style={{ background: "var(--bg-3)" }} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} padding="none" className="p-4 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!segment) {
    return (
      <div className="text-center py-16" style={{ color: "var(--ink-3)" }}>
        <p className="text-[length:var(--fs-lg)]">{t("error.notFound")}</p>
        <Link to="/" className="text-[length:var(--fs-sm)] mt-2 inline-block hover:underline" style={{ color: "var(--lime)" }}>{t("button.goBack")}</Link>
      </div>
    );
  }

  const cat = CATEGORY_COLORS[segment.climbCategory];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toast */}
      {toast && createPortal(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)]" style={{ zIndex: 10000, background: "var(--bg-4)", color: "var(--ink-0)", border: "1px solid var(--line)" }}>
          {toast}
        </div>,
        document.body,
      )}

      {/* Map */}
      {(() => {
        const parsed: [number, number][] | null = segment.segmentLatlng
          ? JSON.parse(segment.segmentLatlng)
          : null;
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
        <Card padding="none" className="p-4!">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("photo.title")}</h3>
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
                  disabled={uploading} variant="primary" className="flex items-center gap-1.5 px-3 py-1.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-lg)] disabled:opacity-50"
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
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
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
                    <p className="text-[10px] text-[var(--ink-0)]/80 truncate">{photo.attribution}</p>
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
                    <p className="text-[10px] text-[var(--ink-0)]/80 truncate">{photo.uploaderNickname}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(!segment.photos || segment.photos.length === 0) && userPhotos.length === 0 && user && (
            <p className="text-[length:var(--fs-sm)] text-center py-4" style={{ color: "var(--ink-3)" }}>
              {t("empty.noPhotos")}
            </p>
          )}
        </Card>
      )}

      {/* Header */}
      <Card padding="none" className="p-5!">
        <div className="flex items-center gap-3 flex-wrap">
          {cat && (
            <span className={`px-2.5 py-1 text-[length:var(--fs-xs)] font-bold rounded-[var(--r-sm)] ${cat.bg}`}>
              {cat.label}
            </span>
          )}
          <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{segment.name}</h1>
          {(() => {
            const badgeStyle = segment.status ? STATUS_BADGE_STYLES[segment.status] : null;
            const badgeLabel = segment.status && (segment.status === "pending" || segment.status === "rejected" || segment.status === "hidden")
              ? t(`status.${segment.status}`)
              : null;
            return badgeStyle && badgeLabel && (
              <span className="px-2.5 py-1 text-[length:var(--fs-xs)] font-semibold rounded-[var(--r-sm)]" style={badgeStyle}>
                {badgeLabel}
              </span>
            );
          })()}
        </div>
        {(segment.city || segment.state) && (
          <p className="text-[length:var(--fs-sm)] mt-1" style={{ color: "var(--ink-2)" }}>
            {[segment.city, segment.state].filter(Boolean).join(", ")}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div>
            <Text as="div" variant="eyebrow">{t("distance")}</Text>
            <Text as="div" variant="dataMedium" className="mt-1">{(segment.distance / 1000).toFixed(2)}<Text variant="unit">km</Text></Text>
          </div>
          <div>
            <Text as="div" variant="eyebrow">{t("elevationGain")}</Text>
            <Text as="div" variant="dataMedium" className="mt-1">{Math.round(elevGain)}<Text variant="unit">m</Text></Text>
          </div>
          <div>
            <Text as="div" variant="eyebrow">{t("averageGrade")}</Text>
            <Text as="div" variant="dataMedium" className="mt-1">{segment.averageGrade.toFixed(1)}<Text variant="unit">%</Text></Text>
          </div>
          <div>
            <Text as="div" variant="eyebrow">{t("maxGrade")}</Text>
            <Text as="div" variant="dataMedium" className="mt-1">{segment.maximumGrade.toFixed(1)}<Text variant="unit">%</Text></Text>
          </div>
        </div>
      </Card>

      {/* KOM + My Best */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* KOM */}
        <Card padding="none" className="p-4!">
          <Text as="div" variant="eyebrow" className="mb-2">{t("kom.title")}</Text>
          {komEffort ? (
            <div className="flex items-center gap-3">
              <Avatar name={komEffort.nickname} imageUrl={komEffort.profileImage} size="md" userId={komEffort.userId} />
              <div className="flex-1">
                <Link to={`/athlete/${komEffort.userId}`} className="font-semibold text-[length:var(--fs-sm)] hover:underline" style={{ color: "var(--ink-0)" }}>
                  {komEffort.nickname}
                </Link>
                <Text as="div" variant="dataLarge" className="mt-0.5" style={{ color: "var(--lime)" }}>{formatTime(komEffort.elapsedTime)}</Text>
                <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                  {formatEffortSpeed(komEffort.averageSpeed)}
                  {komEffort.averageWatts != null && ` · ${komEffort.averageWatts}W`}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{t("kom.noRecord")}</div>
          )}
        </Card>

        {/* My Best */}
        <Card padding="none" className="p-4!">
          <Text as="div" variant="eyebrow" className="mb-2">{t("myRecord")}</Text>
          {myBestEffort ? (
            <div>
              <div className="flex items-center gap-2">
                <Text as="div" variant="dataLarge" style={{ color: "var(--ink-0)" }}>{formatTime(myBestEffort.elapsedTime)}</Text>
                {myRank !== 0 && (
                  <span
                    className="text-[length:var(--fs-xs)] font-bold px-2 py-0.5 rounded-[var(--r-sm)]"
                    style={myRank > 0 && myRank <= 3 ? rankStyle(myRank) : { background: "var(--bg-3)", color: "var(--ink-2)", border: "1px solid var(--line-soft)" }}
                  >
                    {myRank === -1 ? "200+" : `#${myRank}`}
                  </span>
                )}
              </div>
              <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
                {formatEffortSpeed(myBestEffort.averageSpeed)}
                {myBestEffort.averageWatts != null && ` · ${myBestEffort.averageWatts}W`}
                {myBestEffort.averageHeartrate != null && ` · ${Math.round(myBestEffort.averageHeartrate)} bpm`}
              </div>
              <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-4)" }}>
                {new Date(myBestEffort.startDate).toLocaleDateString(localeTag())}
              </div>
            </div>
          ) : user ? (
            <div className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{t("empty.noMyRecord")}</div>
          ) : (
            <div className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{t("empty.loginRequired")}</div>
          )}
        </Card>
      </div>

      {/* Local Legend — 90일 최다완주(#490) */}
      <Card padding="none" className="p-4!">
        <div className="flex items-baseline justify-between mb-2">
          <Text as="div" variant="eyebrow">👑 {t("legend.title")}</Text>
          <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>{t("legend.subtitle")}</span>
        </div>
        {legendFresh && legend?.leader ? (
          <div className="flex items-center gap-3">
            <Avatar name={legend.leader.nickname ?? ""} imageUrl={legend.leader.profileImage} size="md" userId={legend.leader.userId} />
            <div className="flex-1">
              <Link to={`/athlete/${legend.leader.userId}`} className="font-semibold text-[length:var(--fs-sm)] hover:underline" style={{ color: "var(--ink-0)" }}>
                {legend.leader.nickname || t("table.rider")}
              </Link>
              <Text as="div" variant="dataLarge" className="mt-0.5" style={{ color: "var(--amber)" }}>
                {t("legend.efforts", { count: legend.leader.effortCount })}
              </Text>
              <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>
                {t("legend.riders", { count: legend.riderCount })}
                {legend.handoverCount > 0 && ` · ${t("legend.handover", { count: legend.handoverCount })}`}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{t("legend.empty")}</div>
        )}
      </Card>

      {/* 내가 달리면? — PDC 기반 결정적 예상기록(#487) */}
      <Card padding="none" className="p-4!">
        <Text as="div" variant="eyebrow" className="mb-2">{t("predict.title")}</Text>
        {prediction ? (
          <div className="flex items-center gap-3 flex-wrap">
            <Text as="div" variant="dataLarge" style={{ color: "var(--lime)" }}>{formatTime(prediction.sec * 1000)}</Text>
            <span
              className="text-[length:var(--fs-xs)] font-bold px-2 py-0.5 rounded-[var(--r-sm)]"
              style={prediction.rank <= 3 ? rankStyle(prediction.rank) : { background: "var(--bg-3)", color: "var(--ink-2)", border: "1px solid var(--line-soft)" }}
            >
              {t("predict.rank", { rank: prediction.rank })}
            </span>
            <Text variant="caption" tone="tertiary">{t("predict.note")}</Text>
          </div>
        ) : user ? (
          <Text variant="body" tone="tertiary" as="p">{t("predict.needData")}</Text>
        ) : (
          <Text variant="body" tone="tertiary" as="p">{t("empty.loginRequired")}</Text>
        )}
      </Card>

      {/* 이 세그먼트를 쓰는 코스 — 역링크(#495) */}
      {usedByCourses.length > 0 && (
        <Card padding="none" className="p-4!">
          <Text as="div" variant="eyebrow" className="mb-2">{t("usedByCourses")}</Text>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {usedByCourses.map((c) => (
              <Link key={c.id} to={`/course/${c.id}`}>
                <Card padding="none" className="p-3! hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                  <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{c.name}</span>
                  <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{(c.distance / 1000).toFixed(1)}km · ↑{Math.round(c.elevationGain)}m</div>
                </Card>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Leaderboard */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <h2 className="font-semibold text-[length:var(--fs-sm)]" style={{ color: "var(--ink-0)" }}>
            {t("stats.leaderboardCount", { count: validEfforts.length })}
          </h2>
        </div>

        {loadingEfforts ? (
          <div className="w-full">
            <div className="px-4 py-2.5 flex gap-4" style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--line-soft)" }}>
              <div className="h-3 rounded-[var(--r-sm)] w-8 animate-pulse" style={{ background: "var(--bg-3)" }} />
              <div className="h-3 rounded-[var(--r-sm)] w-24 animate-pulse" style={{ background: "var(--bg-3)" }} />
              <div className="flex-1" />
              <div className="h-3 rounded-[var(--r-sm)] w-16 animate-pulse" style={{ background: "var(--bg-3)" }} />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <div className="h-4 rounded-[var(--r-sm)] w-6 animate-pulse" style={{ background: "var(--bg-3)" }} />
                <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: "var(--bg-3)" }} />
                <div className="h-4 rounded-[var(--r-sm)] w-28 animate-pulse" style={{ background: "var(--bg-3)" }} />
                <div className="flex-1" />
                <div className="h-4 rounded-[var(--r-sm)] w-16 animate-pulse" style={{ background: "var(--bg-3)" }} />
              </div>
            ))}
          </div>
        ) : validEfforts.length === 0 ? (
          <div className="text-center py-8 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{t("empty.noRecords")}</div>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-[length:var(--fs-sm)]">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--line-soft)" }} className="text-[length:var(--fs-xs)]">
                <th className="text-left px-4 py-2.5 font-medium w-12" style={{ color: "var(--ink-3)" }}>{t("table.rank")}</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--ink-3)" }}>{t("table.rider")}</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: "var(--ink-3)" }}>{t("table.time")}</th>
                <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell" style={{ color: "var(--ink-3)" }}>{t("table.avgSpeed")}</th>
                <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell" style={{ color: "var(--ink-3)" }}>{t("table.power")}</th>
                <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell" style={{ color: "var(--ink-3)" }}>{t("table.heartrate")}</th>
                <th className="text-right px-4 py-2.5 font-medium hidden lg:table-cell" style={{ color: "var(--ink-3)" }}>{t("table.date")}</th>
              </tr>
            </thead>
            <tbody>
              {validEfforts.map((effort, i) => {
                const isMe = user?.uid === effort.userId;
                const rank = i + 1;
                return (
                  <tr
                    key={effort.id}
                    className="transition-colors"
                    style={{
                      borderBottom: "1px solid var(--line-soft)",
                      background: isMe ? "color-mix(in oklch, var(--lime) 8%, var(--bg-1))" : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isMe) (e.currentTarget as HTMLElement).style.background = "var(--bg-2)"; }}
                    onMouseLeave={(e) => { if (!isMe) (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <td className="px-4 py-3 font-medium">
                      {rank <= 3 ? (
                        <span className="text-[length:var(--fs-xs)] font-bold px-1.5 py-0.5 rounded-[var(--r-sm)]" style={rankStyle(rank)}>
                          {rank}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>{rank}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={effort.nickname || "Rider"} imageUrl={effort.profileImage} size="sm" userId={effort.userId} />
                        <Link
                          to={`/athlete/${effort.userId}`}
                          className="font-medium hover:underline"
                          style={{ color: isMe ? "var(--lime)" : "var(--ink-1)" }}
                        >
                          {effort.nickname || "Rider"}
                          {isMe && <span className="text-[length:var(--fs-xs)] ml-1" style={{ color: "var(--ink-3)" }}>{t("table.me")}</span>}
                        </Link>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 font-mono font-semibold" style={{ color: "var(--ink-0)" }}>
                      {formatTime(effort.elapsedTime)}
                    </td>
                    <td className="text-right px-4 py-3 hidden sm:table-cell" style={{ color: "var(--ink-2)" }}>
                      {formatEffortSpeed(effort.averageSpeed)}
                    </td>
                    <td className="text-right px-4 py-3 hidden md:table-cell" style={{ color: "var(--aqua)" }}>
                      {effort.averageWatts != null ? `${effort.averageWatts}W` : "-"}
                    </td>
                    <td className="text-right px-4 py-3 hidden md:table-cell" style={{ color: "var(--rose)" }}>
                      {effort.averageHeartrate != null ? `${Math.round(effort.averageHeartrate)}` : "-"}
                    </td>
                    <td className="text-right px-4 py-3 hidden lg:table-cell" style={{ color: "var(--ink-3)" }}>
                      {new Date(effort.startDate).toLocaleDateString(localeTag())}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* My History */}
      {user && myBestEffort && (
        <Card padding="none" className="overflow-hidden">
          <button
            onClick={() => setShowAllEfforts(!showAllEfforts)}
            className="w-full px-5 py-3 flex items-center justify-between transition-colors"
            style={{ borderBottom: "1px solid var(--line-soft)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-2)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
          >
            <h2 className="font-semibold text-[length:var(--fs-sm)]" style={{ color: "var(--ink-0)" }}>{t("myHistory")}</h2>
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
          {showAllEfforts && (
            <div>
              {allEfforts.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--lime)", borderTopColor: "transparent" }} />
                </div>
              ) : (
                allEfforts.map((effort) => {
                  const isBest = effort.id === myBestEffort.id;
                  return (
                    <div
                      key={effort.id}
                      className="px-5 py-3 flex items-center justify-between"
                      style={{
                        borderBottom: "1px solid var(--line-soft)",
                        background: isBest ? "color-mix(in oklch, var(--lime) 8%, var(--bg-1))" : undefined,
                      }}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{new Date(effort.startDate).toLocaleDateString(localeTag())}</span>
                          {isBest && (
                            <span className="text-[length:var(--fs-xs)] font-bold px-1.5 py-0.5 rounded-[var(--r-sm)]" style={{ background: "color-mix(in oklch, var(--amber) 18%, var(--bg-2))", color: "var(--amber)", border: "1px solid color-mix(in oklch, var(--amber) 35%, transparent)" }}>BEST</span>
                          )}
                          {effort.prRank != null && effort.prRank <= 3 && (
                            <span className="text-[length:var(--fs-xs)] font-bold px-1.5 py-0.5 rounded-[var(--r-sm)]" style={rankStyle(effort.prRank)}>
                              PR #{effort.prRank}
                            </span>
                          )}
                        </div>
                        <Link to={`/activity/${effort.activityId}`} className="text-[length:var(--fs-xs)] hover:underline mt-0.5 inline-block" style={{ color: "var(--lime)" }}>
                          {t("activity.view")}
                        </Link>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold" style={{ color: "var(--ink-0)" }}>{formatTime(effort.elapsedTime)}</div>
                        <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                          {formatEffortSpeed(effort.averageSpeed)}
                          {effort.averageWatts != null && ` · ${effort.averageWatts}W`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
