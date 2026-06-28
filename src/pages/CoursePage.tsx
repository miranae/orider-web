import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { firestore, functions, storage } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useDocument } from "../hooks/useFirestore";
import { useAuth } from "../contexts/AuthContext";
import RouteMap from "../components/RouteMap";
import ElevationChart from "../components/ElevationChart";
import Avatar from "../components/Avatar";
import { decodePolyline } from "../utils/polyline";
import { EmptyState, LoadingSkeleton } from "../components/redesign";
import { Button, buttonClass, Card, Chip, Text } from "../theme/components";

interface CourseData {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  creatorNickname: string;
  creatorProfileImage: string | null;
  source: string;
  polyline: string;
  distance: number;
  elevationGain: number;
  averageGrade: number;
  maximumGrade: number;
  elevationHigh: number;
  elevationLow: number;
  elevationProfile?: { d: number; e: number }[];
  climbs?: { gain: number; dist: number; cat: number }[];
  photos?: {
    source: string;
    url: string;
    location: [number, number];
    caption?: string;
    attribution: string;
  }[];
  regions: string[];
  likeCount: number;
  viewCount: number;
  createdAt: number;
  deletedAt: number | null;
  segmentIds?: string[];
}

function climbCatLabel(cat: number): string {
  if (cat === 5) return "HC";
  return `Cat ${5 - cat}`;
}

function climbBadgeStyle(cat: number): React.CSSProperties {
  switch (cat) {
    case 5: return { background: "var(--rose)", color: "#1a0005" };
    case 4: return { background: "var(--rose)", color: "#1a0005", opacity: 0.85 };
    case 3: return { background: "var(--amber)", color: "#1a0800" };
    case 2: return { background: "var(--amber)", color: "#1a0800", opacity: 0.75 };
    case 1: return { background: "var(--lime)", color: "var(--primary-fg)" };
    default: return { background: "var(--bg-3)", color: "var(--ink-3)" };
  }
}

// ── GPX generation from polyline ────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateCourseGpx(course: CourseData): string {
  const points = decodePolyline(course.polyline);
  if (points.length === 0) return "";

  // elevationProfile에서 고도 보간
  const elevations: number[] = [];
  if (course.elevationProfile && course.elevationProfile.length > 0) {
    const ep = course.elevationProfile;
    for (let i = 0; i < points.length; i++) {
      const frac = points.length > 1 ? i / (points.length - 1) : 0;
      const idx = frac * (ep.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, ep.length - 1);
      const t = idx - lo;
      elevations.push(ep[lo]!.e + (ep[hi]!.e - ep[lo]!.e) * t);
    }
  }

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx creator="O-Rider" version="1.1" ' +
    'xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
  );
  lines.push("  <trk>");
  lines.push(`    <name>${escapeXml(course.name)}</name>`);
  if (course.description) {
    lines.push(`    <desc>${escapeXml(course.description)}</desc>`);
  }
  lines.push("    <trkseg>");

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    const ele = elevations[i];
    if (ele != null) {
      lines.push(`      <trkpt lat="${pt[0].toFixed(6)}" lon="${pt[1].toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`);
    } else {
      lines.push(`      <trkpt lat="${pt[0].toFixed(6)}" lon="${pt[1].toFixed(6)}"></trkpt>`);
    }
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");

  return lines.join("\n");
}

function downloadGpx(course: CourseData) {
  const gpx = generateCourseGpx(course);
  if (!gpx) return;

  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${course.name.replace(/[/\\:*?"<>|]/g, "_")}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

// ── Component ───────────────────────────────────────────────────────

export default function CoursePage() {
  const { t } = useTranslation("course");
  const { courseId } = useParams<{ courseId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { data: course, loading: courseLoading } = useDocument<CourseData>("courses", courseId);

  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewCounted, setViewCounted] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Elevation hover → map marker
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Photo click → map zoom
  const [flyToPosition, setFlyToPosition] = useState<[number, number] | null>(null);

  // User photo upload
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // User-uploaded approved photos
  const [userPhotos, setUserPhotos] = useState<{ id: string; url: string; location: [number, number]; caption?: string; uploaderNickname: string }[]>([]);

  // 이 코스의 세그먼트 — 정방향 역링크(#495). course.segmentIds 로 세그먼트 문서 로드.
  const [linkedSegments, setLinkedSegments] = useState<{ id: string; name: string; distance: number; averageGrade: number; climbCategory: number }[]>([]);
  useEffect(() => {
    const ids = (course?.segmentIds ?? []).slice(0, 12);
    if (ids.length === 0) { setLinkedSegments([]); return; }
    let cancelled = false;
    Promise.all(ids.map((id) => getDoc(doc(firestore, "segments", id))))
      .then((snaps) => {
        if (cancelled) return;
        setLinkedSegments(snaps.filter((s) => s.exists()).map((s) => {
          const x = s.data()!;
          return { id: s.id, name: x.name ?? "", distance: x.distance ?? 0, averageGrade: x.averageGrade ?? 0, climbCategory: x.climbCategory ?? 0 };
        }));
      })
      .catch((err) => { logClientError("CoursePage.linkedSegments", err, { courseId }); });
    return () => { cancelled = true; };
  }, [course?.segmentIds, courseId]);

  const points = useMemo(
    () => (course?.polyline ? decodePolyline(course.polyline) : []),
    [course?.polyline],
  );

  // 폴리라인의 누적 거리(m) — 마커를 거리 기준으로 매핑하기 위해 미리 계산
  const cumDistances = useMemo<number[]>(() => {
    if (points.length < 2) return [];
    const R = 6371000; // 지구 반지름(m)
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (!prev || !curr) {
        cum.push(cum[i - 1] ?? 0);
        continue;
      }
      const [lat1, lng1] = prev;
      const [lat2, lng2] = curr;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      const seg = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      cum.push((cum[i - 1] ?? 0) + seg);
    }
    return cum;
  }, [points]);

  const markerPosition = useMemo<[number, number] | null>(() => {
    const profile = course?.elevationProfile;
    if (hoverIndex == null || !profile || points.length < 2 || cumDistances.length < 2) return null;
    const hp = profile[hoverIndex];
    if (!hp) return null;
    // elevationProfile 의 거리(d, m)는 스트림 인덱스 기준 샘플이라 폴리라인 인덱스와 1:1 이 아님.
    // → 거리 비율로 변환해 폴리라인 누적 거리에서 동일 지점을 찾는다(인덱스 비율 매핑은 마커가 엉뚱한 곳으로 감).
    const totalProfileD = profile[profile.length - 1]?.d ?? 0;
    const totalPolyD = cumDistances[cumDistances.length - 1] ?? 0;
    if (totalProfileD <= 0 || totalPolyD <= 0) return null;
    const targetD = (hp.d / totalProfileD) * totalPolyD;
    // 누적 거리 배열에서 targetD 가 속한 구간을 이분 탐색
    let lo = 0;
    let hi = cumDistances.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cumDistances[mid] ?? 0) < targetD) lo = mid + 1;
      else hi = mid;
    }
    const hiIdx = Math.max(1, lo);
    const loIdx = hiIdx - 1;
    const cumLo = cumDistances[loIdx] ?? 0;
    const cumHi = cumDistances[hiIdx] ?? 0;
    const segLen = cumHi - cumLo;
    const t = segLen > 0 ? (targetD - cumLo) / segLen : 0;
    const pLo = points[loIdx];
    const pHi = points[hiIdx];
    if (!pLo || !pHi) return null;
    return [
      pLo[0] + (pHi[0] - pLo[0]) * t,
      pLo[1] + (pHi[1] - pLo[1]) * t,
    ] as [number, number];
  }, [hoverIndex, course?.elevationProfile, points, cumDistances]);

  // 사진 선택으로 지도가 확대돼 있으면 호버 마커가 뷰포트 밖이라 안 보임 →
  // 고도표 호버 시작 시 전체 경로 뷰로 복귀시켜 마커가 보이게 한다.
  const handleElevHover = useCallback((i: number | null) => {
    setHoverIndex(i);
    if (i != null) setFlyToPosition(null);
  }, []);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Subscribe to approved user photos for this course
  useEffect(() => {
    if (!courseId) return;
    const q = query(
      collection(firestore, "course_photos"),
      where("courseId", "==", courseId),
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
  }, [courseId]);

  // Photo upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!user || !profile) {
      showToast(t("error.loginRequired"));
      return;
    }
    if (!courseId) return;

    if (!file.type.startsWith("image/")) {
      showToast(t("error.imageOnly"));
      return;
    }

    setUploading(true);
    try {
      // Extract GPS from EXIF
      const gps = await extractGpsFromFile(file);
      if (!gps) {
        showToast(t("error.noGps"));
        setUploading(false);
        return;
      }

      // Resize image
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

      // Upload to Storage
      const photoId = crypto.randomUUID();
      const storagePath = `course_photos/${user.uid}/${courseId}/${photoId}.webp`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);

      // Write Firestore doc
      await addDoc(collection(firestore, "course_photos"), {
        courseId,
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
      logClientError("CoursePage.uploadPhoto", err, { courseId });
      showToast(t("error.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  // 좋아요 상태 확인
  useEffect(() => {
    if (!courseId || !user) return;
    getDoc(doc(firestore, "courses", courseId, "likes", user.uid)).then((snap) => {
      setLiked(snap.exists());
    });
  }, [courseId, user]);

  // 조회수 증가 (1회, 서버사이드 — 로그인 사용자만)
  useEffect(() => {
    if (!courseId || !user || viewCounted) return;
    setViewCounted(true);
    const fn = httpsCallable(functions, "incrementCourseViewCount");
    fn({ courseId }).catch((err) => logClientError("CoursePage.viewCount", err, {}));
  }, [courseId, user, viewCounted]);

  const handleToggleLike = async () => {
    if (!courseId || !user || !profile || likeLoading) return;
    setLikeLoading(true);

    try {
      const likeRef = doc(firestore, "courses", courseId, "likes", user.uid);
      if (liked) {
        await deleteDoc(likeRef);
        setLiked(false);
      } else {
        await setDoc(likeRef, {
          nickname: profile.nickname,
          profileImage: profile.photoURL ?? null,
          createdAt: Date.now(),
        });
        setLiked(true);
      }
    } catch (err) {
      logClientError("CoursePage.handleToggleLike", err, { courseId, liked });
    } finally {
      setLikeLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!courseId || deleting) return;
    if (!confirm(t("error.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const fn = httpsCallable(functions, "deleteMyCourse");
      await fn({ courseId });
      navigate("/courses", { replace: true });
    } catch (err) {
      logClientError("CoursePage.handleDelete", err, { courseId });
      alert(t("error.deleteFailed"));
      setDeleting(false);
    }
  };

  // ── Share ──────────────────────────────────────────────────────────

  const handleShare = async () => {
    const url = window.location.href;
    const text = course ? `${course.name} — ${(course.distance / 1000).toFixed(1)}km, ${Math.round(course.elevationGain)}m` : "";

    if (navigator.share) {
      try {
        await navigator.share({ title: course?.name ?? t("share.courseTitle"), text, url });
      } catch {
        // user cancelled share
      }
    } else {
      await navigator.clipboard.writeText(url);
      showToast(t("link.copied"));
    }
  };

  const handleSendToApp = async () => {
    if (!courseId || !user) {
      showToast(t("error.loginRequired"));
      return;
    }
    try {
      const fn = httpsCallable(functions, "sendCourseToApp");
      await fn({ courseId });
      showToast(t("link.sentToApp"));
    } catch {
      showToast(t("link.sendFailed"));
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────

  const startEditing = () => {
    if (!course) return;
    setEditName(course.name);
    setEditDesc(course.description || "");
    setEditing(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!courseId || saving) return;
    const trimName = editName.trim();
    const trimDesc = editDesc.trim();

    if (trimName.length < 2 || trimName.length > 50) {
      alert(t("error.nameLength"));
      return;
    }
    if (trimDesc.length > 200) {
      alert(t("error.descriptionLength"));
      return;
    }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "updateMyCourse");
      await fn({ courseId, name: trimName, description: trimDesc });
      setEditing(false);
      showToast(t("error.updateSuccess"));
    } catch (err) {
      logClientError("CoursePage.handleSaveEdit", err, { courseId });
      alert(t("error.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  // ── GPX Export ─────────────────────────────────────────────────────

  const handleExportGpx = () => {
    if (!course) return;
    downloadGpx(course);
    showToast(t("gpx.export"));
  };

  const isOwner = user?.uid === course?.creatorId;

  if (courseLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 py-4">
        <LoadingSkeleton kind="chart" />
        <LoadingSkeleton kind="list" count={3} />
      </div>
    );
  }

  if (!course || course.deletedAt) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🗺️"
          title={t("error.notFound")}
          description={course?.deletedAt ? t("error.deleted") : undefined}
          actions={[{ label: t("button.courseList"), variant: "primary", href: "/courses" }]}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toast (portal to body to avoid Leaflet stacking context) */}
      {toast && createPortal(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-[length:var(--fs-sm)] rounded-[var(--r-lg)]" style={{ zIndex: 10000, background: "var(--bg-4)", color: "var(--ink-0)", border: "1px solid var(--line)" }}>
          {toast}
        </div>,
        document.body,
      )}

      {/* Map */}
      {course.polyline && (
        <RouteMap
          polyline={course.polyline}
          height="h-[28rem]"
          interactive
          rounded
          markerPosition={markerPosition}
          flyToPosition={flyToPosition}
          photos={[
            ...(course.photos?.map((p, i) => ({
              id: `course-photo-${i}`,
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
      )}

      {/* Photo Gallery */}
      {((course.photos && course.photos.length > 0) || userPhotos.length > 0 || user) && (
        <Card padding="none" className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Text as="h3" variant="eyebrow">{t("photo.title")}</Text>
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
                  disabled={uploading} variant="primary" size="sm" className="flex items-center gap-1.5 disabled:opacity-50"
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
          {((course.photos && course.photos.length > 0) || userPhotos.length > 0) && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {course.photos?.map((photo, i) => (
                <div key={`auto-${i}`} className="flex-shrink-0 group relative">
                  <img
                    src={photo.url}
                    alt={photo.caption || t("photo.title") + ` ${i + 1}`}
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
          {(!course.photos || course.photos.length === 0) && userPhotos.length === 0 && user && (
            <p className="text-[length:var(--fs-sm)] text-center py-4" style={{ color: "var(--ink-3)" }}>
              {t("empty.noPhotos")}
            </p>
          )}
        </Card>
      )}

      {/* Elevation Chart */}
      {course.elevationProfile && course.elevationProfile.length > 0 && (
        <Card padding="none" className="p-4">
          <ElevationChart
            data={course.elevationProfile.map((p) => ({ distance: p.d, elevation: p.e }))}
            height={180}
            onHoverIndex={handleElevHover}
          />
        </Card>
      )}

      {/* Header + Info */}
      <Card padding="none" className="p-5">
        {editing ? (
          /* ── Edit Mode ────────────────────────────────────────── */
          <div className="space-y-3">
            <div>
              <Text as="label" variant="eyebrow" className="mb-1 block">{t("form.courseName")}</Text>
              <input
                ref={nameInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="w-full px-3 py-2 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-0)" }}
              />
              <div className="text-[length:var(--fs-xs)] text-right mt-0.5" style={{ color: "var(--ink-4)" }}>{t("form.charLimit", { current: editName.length, max: 50 })}</div>
            </div>
            <div>
              <Text as="label" variant="eyebrow" className="mb-1 block">{t("form.description")}</Text>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={200}
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none resize-none"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-0)" }}
              />
              <div className="text-[length:var(--fs-xs)] text-right mt-0.5" style={{ color: "var(--ink-4)" }}>{t("form.charLimit", { current: editDesc.length, max: 200 })}</div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveEdit}
                disabled={saving} variant="primary" className="disabled:opacity-50"
              >
                {saving ? t("button.saving") : t("button.save")}
              </Button>
              <Button
                onClick={cancelEditing} variant="ghost"
              >
                {t("button.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          /* ── View Mode ────────────────────────────────────────── */
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{course.name}</h1>
              {course.regions.map((r) => (
                <Chip key={r} variant="accent">{r}</Chip>
              ))}
            </div>

            {course.description && (
              <p className="text-[length:var(--fs-sm)] mt-2" style={{ color: "var(--ink-2)" }}>{course.description}</p>
            )}
          </>
        )}

        {/* Creator */}
        {!editing && (
          <div className="flex items-center gap-2 mt-3">
            <Avatar
              name={course.creatorNickname}
              imageUrl={course.creatorProfileImage}
              size="sm"
              userId={course.creatorId}
            />
            <div>
              <Link
                to={`/athlete/${course.creatorId}`}
                className="text-[length:var(--fs-sm)] font-medium transition-colors hover:underline"
                style={{ color: "var(--ink-1)" }}
              >
                {course.creatorNickname}
              </Link>
              <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-4)" }}>
                {new Date(course.createdAt).toLocaleDateString(localeTag())} {t("creator.registered")}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div>
            <Text as="div" variant="eyebrow" className="mb-1">{t("distance")}</Text>
            <Text variant="dataMedium">{(course.distance / 1000).toFixed(2)}</Text><Text variant="unit">km</Text>
          </div>
          <div>
            <Text as="div" variant="eyebrow" className="mb-1">{t("elevationGainShort")}</Text>
            <Text variant="dataMedium">{Math.round(course.elevationGain)}</Text><Text variant="unit">m</Text>
          </div>
          <div>
            <Text as="div" variant="eyebrow" className="mb-1">{t("elevation")}</Text>
            <Text variant="dataMedium">{Math.round(course.elevationLow)}–{Math.round(course.elevationHigh)}</Text><Text variant="unit">m</Text>
          </div>
          <div>
            <Text as="div" variant="eyebrow" className="mb-1">{t("maxGrade")}</Text>
            <Text variant="dataMedium">{course.maximumGrade.toFixed(1)}</Text><Text variant="unit">%</Text>
          </div>
        </div>

        {/* Climb badges */}
        {course.climbs && course.climbs.length > 0 && (
          <div className="mt-3">
            <Text as="div" variant="eyebrow" className="mb-1.5">{t("climbSection")}</Text>
            <div className="flex gap-1.5 flex-wrap">
              {[...course.climbs].sort((a, b) => b.cat - a.cat).map((climb, i) => (
                <span
                  key={i}
                  className="px-2 py-1 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-sm)]"
                  style={climbBadgeStyle(climb.cat)}
                >
                  {climbCatLabel(climb.cat)} · {Math.round(climb.gain)}m / {(climb.dist / 1000).toFixed(1)}km
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 이 코스의 세그먼트 — 정방향 역링크(#495) */}
        {linkedSegments.length > 0 && (
          <div className="mt-3">
            <Text as="div" variant="eyebrow" className="mb-1.5">{t("courseSegments")}</Text>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {linkedSegments.map((s) => (
                <Link key={s.id} to={`/segment/${s.id}`}>
                  <Card padding="none" className="p-3! hover:border-[var(--lime)]/50 transition-colors" style={{ borderRadius: "var(--r-lg)" }}>
                    <div className="flex items-center gap-2">
                      {s.climbCategory >= 1 && <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] font-bold" style={{ background: "var(--bg-3)", color: "var(--lime)" }}>{s.climbCategory >= 5 ? "HC" : `Cat ${s.climbCategory}`}</span>}
                      <span className="font-semibold text-[length:var(--fs-sm)] truncate" style={{ color: "var(--ink-0)" }}>{s.name}</span>
                    </div>
                    <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{(s.distance / 1000).toFixed(1)}km · {s.averageGrade.toFixed(1)}%</div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 flex-wrap" style={{ borderTop: "1px solid var(--line-soft)" }}>
          {/* Like */}
          {user && (
            <Button
              onClick={handleToggleLike}
              disabled={likeLoading} variant="secondary" className="flex items-center gap-1.5"
              style={liked ? { color: "var(--lime)", borderColor: "var(--lime)" } : undefined}
            >
              <svg className="w-4 h-4" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {course.likeCount > 0 ? course.likeCount : t("button.share")}
            </Button>
          )}

          {/* 시뮬레이터 (실험실) */}
          <Link
            to={`/lab?courseId=${courseId}`}
            className={buttonClass({ variant: "secondary" }) + " flex items-center gap-1.5"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3v6l-5 9a1 1 0 00.9 1.5h14.2A1 1 0 0020 18l-5-9V3" />
              <path d="M7 3h10M8.5 13h7" />
            </svg>
            {t("button.simulate")}
          </Link>

          {/* GPX Export */}
          <Button onClick={handleExportGpx} variant="secondary" className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t("button.export")}
          </Button>

          {/* Share */}
          <Button onClick={handleShare} variant="secondary" className="flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            {t("button.share")}
          </Button>

          {/* 앱으로 보내기 */}
          <Button onClick={handleSendToApp} variant="primary" className="flex items-center gap-1.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 18V6M12 6l-5 5M12 6l5 5"/>
              <rect x="3" y="14" width="18" height="7" rx="2"/>
            </svg>
            {t("button.sendToApp")}
          </Button>

          {/* View count */}
          <span className="text-[length:var(--fs-xs)] flex items-center gap-1" style={{ color: "var(--ink-4)" }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {course.viewCount}
          </span>

          {/* Owner actions */}
          {isOwner && (
            <div className="ml-auto flex items-center gap-2">
              <Button onClick={startEditing} variant="secondary" size="sm">{t("button.edit")}</Button>
              <Button
                onClick={handleDelete}
                disabled={deleting} variant="secondary" size="sm" className="disabled:opacity-50"
                style={{ color: "var(--rose)", borderColor: "var(--rose)" }}
              >
                {deleting ? t("error.deleteDeleting") : t("button.delete")}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Back */}
      <div className="flex items-center">
        <Link
          to="/courses"
          className="px-4 py-2 text-[length:var(--fs-sm)] transition-colors hover:underline"
          style={{ color: "var(--ink-3)" }}
        >
          &larr; {t("button.courseList")}
        </Link>
      </div>
    </div>
  );
}
