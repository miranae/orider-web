import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import JSZip from "jszip";
import { firestore, functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { makeRelSecAt } from "../utils/streamTime";
import type { Activity, ActivityStreams, Comment, Kudos, FollowRelation } from "@shared/types";

export interface ExportProgress {
  phase: "activities" | "streams" | "social" | "photos" | "zip";
  current: number;
  total: number;
  label: string;
}

interface StreamPhoto {
  id: string;
  url: string | null;
  caption: string | null;
  location: [number, number] | null;
}

interface StreamSegmentEffort {
  id: number;
  name: string;
  elapsedTime: number;
  movingTime: number;
  distance: number;
  prRank: number | null;
  komRank: number | null;
  segment: {
    id: number;
    name: string;
    distance: number;
    averageGrade: number;
    maximumGrade: number;
    elevationHigh: number;
    elevationLow: number;
    climbCategory: number;
  };
}

interface ParsedStream extends ActivityStreams {
  segment_efforts?: StreamSegmentEffort[];
  photos?: StreamPhoto[];
}

// ── GPX Generation ──────────────────────────────────────────────────

function generateGpx(activity: Activity, streams: ParsedStream): string {
  const latlng = streams.latlng;
  if (!latlng || latlng.length === 0) return "";

  const startTime = activity.startTime;
  const timeArr = streams.time;
  // streams.time 단위 정규화(상대 초). 절대 epoch 스트림(O-Rider) 백업 시 <time> 이
  // 서기 5만년대로 오버플로우하던 버그 방지 — ExportTab 의 정본 exporter 와 동일 헬퍼.
  const relSecAt = makeRelSecAt(timeArr);
  const altArr = streams.altitude;
  const hrArr = streams.heartrate;
  const wattsArr = streams.watts;
  const cadArr = streams.cadence;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx creator="O-Rider" version="1.1" ' +
    'xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
  );
  lines.push("  <trk>");
  lines.push(`    <name>${escapeXml(activity.description || "Ride")}</name>`);
  lines.push("    <trkseg>");

  for (let i = 0; i < latlng.length; i++) {
    const pt = latlng[i];
    if (!pt) continue;
    const [lat, lon] = pt;

    let trkpt = `      <trkpt lat="${lat}" lon="${lon}">`;

    if (altArr?.[i] != null) {
      trkpt += `<ele>${altArr[i]}</ele>`;
    }

    const relSec = relSecAt(i);
    if (relSec != null) {
      const ts = new Date(startTime + relSec * 1000).toISOString();
      trkpt += `<time>${ts}</time>`;
    }

    const hasExt = (hrArr?.[i] != null) || (wattsArr?.[i] != null) || (cadArr?.[i] != null);
    if (hasExt) {
      trkpt += "<extensions><gpxtpx:TrackPointExtension>";
      if (hrArr?.[i] != null) trkpt += `<gpxtpx:hr>${hrArr[i]}</gpxtpx:hr>`;
      if (cadArr?.[i] != null) trkpt += `<gpxtpx:cad>${cadArr[i]}</gpxtpx:cad>`;
      if (wattsArr?.[i] != null) trkpt += `<gpxtpx:power>${wattsArr[i]}</gpxtpx:power>`;
      trkpt += "</gpxtpx:TrackPointExtension></extensions>";
    }

    trkpt += "</trkpt>";
    lines.push(trkpt);
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");

  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── CSV Generation ──────────────────────────────────────────────────

function generateCsv(activities: Activity[]): string {
  const BOM = "\uFEFF";
  const headers = [
    "날짜", "제목", "거리(km)", "시간(분)", "평속(km/h)", "최고속도(km/h)",
    "획득고도(m)", "평균심박", "최대심박", "평균파워(W)", "최대파워(W)",
    "평균케이던스", "칼로리", "출처",
  ];

  const rows = activities.map((a) => {
    const s = a.summary;
    const date = new Date(a.startTime).toISOString().slice(0, 10);
    const distKm = (s.distance / 1000).toFixed(1);
    const timeMin = Math.round(s.ridingTimeMillis / 60000);
    const source = (a as Activity & { source?: string }).source ?? "orider";
    return [
      date,
      csvEscape(a.description || ""),
      distKm,
      timeMin,
      s.averageSpeed?.toFixed(1) ?? "",
      s.maxSpeed?.toFixed(1) ?? "",
      Math.round(s.elevationGain),
      s.averageHeartRate?.toFixed(0) ?? "",
      s.maxHeartRate?.toFixed(0) ?? "",
      s.averagePower?.toFixed(0) ?? "",
      s.maxPower?.toFixed(0) ?? "",
      s.averageCadence?.toFixed(0) ?? "",
      s.calories ?? "",
      source,
    ].join(",");
  });

  return BOM + headers.join(",") + "\n" + rows.join("\n");
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Folder name helper ──────────────────────────────────────────────

function activityFolderName(a: Activity): string {
  const date = new Date(a.startTime).toISOString().slice(0, 10);
  const name = (a.description || "ride")
    .replace(/[/\\:*?"<>|]/g, "_")
    .slice(0, 40)
    .trim();
  return `${date}_${name}`;
}

// ── Main hook ───────────────────────────────────────────────────────

export function useExport() {
  const { user, profile } = useAuth();
  const { t } = useTranslation("activity");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const exportData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const zip = new JSZip();
      const uid = user.uid;

      // ── Phase 1: Load activities ──────────────────────────────
      setProgress({ phase: "activities", current: 0, total: 0, label: t("export.phaseActivities") });

      const activitiesSnap = await getDocs(
        query(collection(firestore, "activities"), where("userId", "==", uid), where("deletedAt", "==", null)),
      );
      const activities: (Activity & { source?: string; stravaActivityId?: number })[] =
        activitiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity & { source?: string; stravaActivityId?: number });

      activities.sort((a, b) => b.startTime - a.startTime);

      setProgress({ phase: "activities", current: activities.length, total: activities.length, label: t("export.phaseActivitiesLoaded", { count: activities.length }) });

      // ── Phase 2: Load GPS streams (10 at a time) ──────────────
      const streamMap = new Map<string, ParsedStream>();
      const total = activities.length;

      for (let i = 0; i < activities.length; i += 10) {
        setProgress({ phase: "streams", current: i, total, label: t("export.phaseStreams", { current: i, total }) });

        const batch = activities.slice(i, i + 10);
        const getStreams = httpsCallable<{ stravaActivityId: number }, ParsedStream>(
          functions, "stravaGetActivityStreams",
        );
        const results = await Promise.all(
          batch.map(async (a) => {
            try {
              const streamDocId = a.source === "strava" && a.stravaActivityId
                ? `strava_${a.stravaActivityId}`
                : a.id;
              const streamDoc = await getDoc(doc(firestore, "activity_streams", streamDocId));
              if (!streamDoc.exists()) return null;
              const data = streamDoc.data();
              if (data?.storage === "gcs" && a.stravaActivityId) {
                // GCS-stored stream: fetch via Cloud Function
                try {
                  const result = await getStreams({ stravaActivityId: a.stravaActivityId });
                  return { id: a.id, stream: result.data };
                } catch {
                  return null;
                }
              }
              if (typeof data?.json === "string") {
                try {
                  return { id: a.id, stream: JSON.parse(data.json) as ParsedStream };
                } catch {
                  return null;
                }
              }
              return { id: a.id, stream: data as ParsedStream };
            } catch {
              // Permission denied or doc doesn't exist — skip
              return null;
            }
          }),
        );

        for (const r of results) {
          if (r) streamMap.set(r.id, r.stream);
        }
      }

      setProgress({ phase: "streams", current: total, total, label: t("export.phaseStreamsDone", { done: streamMap.size, total }) });

      // ── Phase 3: Load social data (comments, kudos, following, followers) ──
      setProgress({ phase: "social", current: 0, total: 4, label: t("export.phaseSocial") });

      // Comments & kudos per activity
      const commentsMap = new Map<string, Comment[]>();
      const kudosMap = new Map<string, Kudos[]>();

      for (let i = 0; i < activities.length; i += 10) {
        const batch = activities.slice(i, i + 10);
        await Promise.all(
          batch.map(async (a) => {
            try {
              const [commentsSnap, kudosSnap] = await Promise.all([
                getDocs(collection(firestore, "activities", a.id, "comments")),
                getDocs(collection(firestore, "activities", a.id, "kudos")),
              ]);
              if (!commentsSnap.empty) {
                commentsMap.set(
                  a.id,
                  commentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Comment),
                );
              }
              if (!kudosSnap.empty) {
                kudosMap.set(
                  a.id,
                  kudosSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Kudos),
                );
              }
            } catch {
              // Permission denied — skip
            }
          }),
        );
      }

      setProgress({ phase: "social", current: 2, total: 4, label: t("export.phaseSocialFollowing") });

      // Following & followers
      const [followingSnap, followersSnap] = await Promise.all([
        getDocs(collection(firestore, "following", uid, "users")),
        getDocs(collection(firestore, "followers", uid, "users")),
      ]);

      const following = followingSnap.docs.map((d) => ({ userId: d.id, ...d.data() }) as FollowRelation);
      const followers = followersSnap.docs.map((d) => ({ userId: d.id, ...d.data() }) as FollowRelation);

      // Segment PRs
      setProgress({ phase: "social", current: 3, total: 4, label: t("export.phaseSocialPrs") });

      let segmentPRs: { segmentId: string; segmentName: string; [key: string]: unknown }[] = [];
      try {
        const prsSnap = await getDocs(collection(firestore, "user_prs", uid, "segments"));
        segmentPRs = prsSnap.docs.map((d) => ({ segmentId: d.id, segmentName: "", ...d.data() }));
      } catch {
        // user_prs collection may not exist
      }

      setProgress({ phase: "social", current: 4, total: 4, label: t("export.phaseSocialDone") });

      // ── Phase 4: Download photos ──────────────────────────────
      const proxyPhotoDownload = httpsCallable<{ url: string }, { data: string; contentType: string }>(
        functions, "proxyPhotoDownload",
      );

      // Collect all photos
      interface PhotoRef {
        activityId: string;
        photo: StreamPhoto;
        index: number;
      }
      const allPhotos: PhotoRef[] = [];

      for (const a of activities) {
        const stream = streamMap.get(a.id);
        if (stream?.photos) {
          stream.photos.forEach((p, i) => {
            if (p.url) {
              allPhotos.push({ activityId: a.id, photo: p, index: i });
            }
          });
        }
      }

      const photoDataMap = new Map<string, { data: Uint8Array; ext: string }>();

      if (allPhotos.length > 0) {
        for (let i = 0; i < allPhotos.length; i += 5) {
          setProgress({
            phase: "photos",
            current: i,
            total: allPhotos.length,
            label: t("export.phasePhotos", { current: i, total: allPhotos.length }),
          });

          const batch = allPhotos.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map(async (ref) => {
              const url = ref.photo.url!;
              try {
                let data: Uint8Array;
                let ext: string;
                if (url.includes("firebasestorage.googleapis.com")) {
                  // GCS-stored photo: fetch directly (no proxy needed)
                  const resp = await fetch(url);
                  if (!resp.ok) throw new Error(`Photo fetch failed: ${resp.status}`);
                  const contentType = resp.headers.get("content-type") ?? "image/jpeg";
                  ext = contentType.includes("png") ? "png" : "jpg";
                  data = new Uint8Array(await resp.arrayBuffer());
                } else {
                  // Legacy Strava CDN URL: use proxy (returns base64)
                  const result = await proxyPhotoDownload({ url });
                  ext = result.data.contentType.includes("png") ? "png" : "jpg";
                  const binary = atob(result.data.data);
                  data = new Uint8Array(binary.length);
                  for (let j = 0; j < binary.length; j++) data[j] = binary.charCodeAt(j);
                }
                return { key: `${ref.activityId}_${ref.index}`, data, ext };
              } catch (e) {
                console.warn(`[export] 사진 다운로드 실패:`, url, e);
                return null;
              }
            }),
          );

          for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
              photoDataMap.set(r.value.key, { data: r.value.data, ext: r.value.ext });
            }
          }
        }
      }

      setProgress({
        phase: "photos",
        current: allPhotos.length,
        total: allPhotos.length,
        label: t("export.phasePhotosDone", { done: photoDataMap.size, total: allPhotos.length }),
      });

      // ── Phase 5: Build ZIP ────────────────────────────────────
      setProgress({ phase: "zip", current: 0, total: 1, label: t("export.phaseZip") });

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

      // metadata.json
      zip.file("metadata.json", JSON.stringify({
        exportedAt: now.toISOString(),
        platform: "O-Rider Web",
        version: "1.0",
        activityCount: activities.length,
        streamCount: streamMap.size,
        photoCount: photoDataMap.size,
      }, null, 2));

      // profile.json
      zip.file("profile.json", JSON.stringify({
        userId: uid,
        nickname: profile?.nickname ?? user.displayName,
        email: profile?.email ?? user.email,
        stravaConnected: profile?.stravaConnected ?? false,
        stravaNickname: profile?.stravaNickname ?? null,
      }, null, 2));

      // activities.csv
      zip.file("activities.csv", generateCsv(activities));

      // Per-activity files
      const actFolder = zip.folder("activities")!;

      for (const a of activities) {
        const folderName = activityFolderName(a);
        const folder = actFolder.folder(folderName)!;

        // activity.json
        folder.file("activity.json", JSON.stringify(a, null, 2));

        // track.gpx
        const stream = streamMap.get(a.id);
        if (stream?.latlng && stream.latlng.length > 0) {
          const gpx = generateGpx(a, stream);
          if (gpx) folder.file("track.gpx", gpx);
        }

        // comments.json
        const comments = commentsMap.get(a.id);
        if (comments && comments.length > 0) {
          folder.file("comments.json", JSON.stringify(comments, null, 2));
        }

        // kudos.json
        const kudos = kudosMap.get(a.id);
        if (kudos && kudos.length > 0) {
          folder.file("kudos.json", JSON.stringify(kudos, null, 2));
        }

        // photos
        if (stream?.photos && stream.photos.length > 0) {
          const photosFolder = folder.folder("photos")!;
          stream.photos.forEach((p, i) => {
            const photoKey = `${a.id}_${i}`;
            const photoData = photoDataMap.get(photoKey);
            if (photoData) {
              photosFolder.file(`photo_${i + 1}.${photoData.ext}`, photoData.data);
            } else if (p.url) {
              // Include URL reference if download failed
              const refFolder = photosFolder;
              refFolder.file(`photo_${i + 1}_url.txt`, p.url);
            }
          });
        }
      }

      // segments/personal_records.json
      if (segmentPRs.length > 0) {
        const segFolder = zip.folder("segments")!;
        segFolder.file("personal_records.json", JSON.stringify(segmentPRs, null, 2));
      }

      // social/
      const socialFolder = zip.folder("social")!;
      socialFolder.file("following.json", JSON.stringify(following, null, 2));
      socialFolder.file("followers.json", JSON.stringify(followers, null, 2));

      // Generate ZIP → 자동 다운로드
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const fileName = `orider-export-${dateStr}.zip`;
      const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setProgress({ phase: "zip", current: 1, total: 1, label: t("export.phaseZipDone", { sizeMB }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("export.errorFailed"));
    } finally {
      setLoading(false);
    }
  }, [user, profile, t]);

  return { exportData, loading, error, progress };
}
