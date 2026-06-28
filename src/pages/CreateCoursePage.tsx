import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { track, trackActivationStep } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import RouteMap from "../components/RouteMap";
import ElevationChart from "../components/ElevationChart";
import { Card } from "../theme/components";

// ── Types ────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  description: string;
  startTime: number;
  summary: {
    distance: number;
    ridingTimeMillis: number;
    elevationGain: number;
  };
  thumbnailTrack: string;
}

interface StreamData {
  latlng?: [number, number][];
  altitude?: number[];
  distance?: number[];
  time?: number[];
}

type CreateMode = "activity" | "section" | "gpx";

// ── Helpers ──────────────────────────────────────────────────────────

function computeStats(
  altitude: number[],
  distance: number[],
): { distance: number; elevationGain: number; avgGrade: number; maxGrade: number } {
  if (altitude.length < 2) {
    return { distance: 0, elevationGain: 0, avgGrade: 0, maxGrade: 0 };
  }

  const firstDist = distance[0] ?? 0;
  const lastDist = distance[distance.length - 1] ?? 0;
  const totalDist = lastDist - firstDist;
  let elevGain = 0;
  let maxGrade = 0;

  for (let i = 1; i < altitude.length; i++) {
    const dAlt = (altitude[i] ?? 0) - (altitude[i - 1] ?? 0);
    const dDist = (distance[i] ?? 0) - (distance[i - 1] ?? 0);
    if (dAlt > 0) elevGain += dAlt;
    if (dDist > 0) {
      const grade = Math.abs((dAlt / dDist) * 100);
      if (grade > maxGrade && grade < 100) maxGrade = grade;
    }
  }

  // 코스는 순환/왕복이 많아 net grade 대신 획득고도/거리 사용
  const avgGrade = totalDist > 0 ? (elevGain / totalDist) * 100 : 0;

  return {
    distance: Math.round(totalDist),
    elevationGain: Math.round(elevGain),
    avgGrade: Math.round(avgGrade * 10) / 10,
    maxGrade: Math.round(maxGrade * 10) / 10,
  };
}

function StatsPanel({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const { t } = useTranslation("course");
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6">
      <div className="border-l-2 border-[var(--lime)] pl-3">
        <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{t("distance")}</div>
        <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {(stats.distance / 1000).toFixed(2)} <span className="text-[length:var(--fs-sm)] font-normal text-[var(--ink-2)]">km</span>
        </div>
      </div>
      <div className="border-l-2 border-[var(--lime)] pl-3">
        <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{t("elevationGainShort")}</div>
        <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {stats.elevationGain} <span className="text-[length:var(--fs-sm)] font-normal text-[var(--ink-2)]">m</span>
        </div>
      </div>
      <div className="border-l-2 border-[var(--line)] pl-3">
        <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{t("averageGrade")}</div>
        <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {stats.avgGrade} <span className="text-[length:var(--fs-sm)] font-normal text-[var(--ink-2)]">%</span>
        </div>
      </div>
      <div className="border-l-2 border-[var(--line)] pl-3">
        <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{t("maxGrade")}</div>
        <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {stats.maxGrade} <span className="text-[length:var(--fs-sm)] font-normal text-[var(--ink-2)]">%</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function CreateCoursePage() {
  const { t } = useTranslation("course");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activityId = searchParams.get("activityId");
  const modeParam = searchParams.get("mode");

  // Determine initial mode
  const initialMode: CreateMode = modeParam === "section"
    ? "section"
    : modeParam === "gpx"
      ? "gpx"
      : activityId
        ? "activity"
        : "gpx";

  const [mode, setMode] = useState<CreateMode>(initialMode);

  // Activity streams
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [streams, setStreams] = useState<StreamData | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Range selection (section mode)
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // GPX upload
  const [gpxXml, setGpxXml] = useState<string | null>(null);
  const [gpxFileName, setGpxFileName] = useState<string>("");
  const [gpxLatlng, setGpxLatlng] = useState<[number, number][] | null>(null);
  const [gpxStats, setGpxStats] = useState<ReturnType<typeof computeStats> | null>(null);

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // 노면/난이도 — 생성 시 입력(기존엔 편집 후에만 설정 가능했음, #489). 빈 값 허용.
  const [surface, setSurface] = useState<"" | "paved" | "gravel" | "mixed">("");
  const [difficulty, setDifficulty] = useState<number | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);

  // ── Load activity streams ──
  const loadActivityStreams = useCallback(async (aid: string) => {
    setLoadingStreams(true);
    setStreams(null);
    setStreamError(null);

    try {
      const actDoc = await getDoc(doc(firestore, "activities", aid));
      if (actDoc.exists()) {
        const d = actDoc.data();
        setSelectedActivity({
          id: actDoc.id,
          description: d.description ?? "Untitled",
          startTime: d.startTime ?? d.createdAt ?? Date.now(),
          summary: d.summary ?? { distance: 0, ridingTimeMillis: 0, elevationGain: 0 },
          thumbnailTrack: d.thumbnailTrack ?? "",
        });
      }

      let data: StreamData | null = null;
      const stravaId = aid.startsWith("strava_")
        ? parseInt(aid.replace("strava_", ""), 10)
        : null;

      if (stravaId) {
        const fn = httpsCallable(functions, "stravaGetActivityStreams");
        const result = await fn({ stravaActivityId: stravaId });
        data = result.data as StreamData;
      } else {
        const fn = httpsCallable(functions, "getActivityStreamsForSegment");
        const result = await fn({ activityId: aid });
        data = result.data as StreamData;
      }

      if (!data?.latlng || data.latlng.length === 0) {
        setStreamError(t("error.noStreamData"));
        return;
      }

      setStreams(data);
      setRangeStart(0);
      setRangeEnd(data.latlng.length - 1);
    } catch (err: unknown) {
      logClientError("CreateCoursePage.loadStreams", err, { activityId: selectedActivity?.id });
      const fbErr = err as { code?: string; message?: string };
      setStreamError(t("error.streamLoadFailed", { message: fbErr.message ?? String(err) }));
    } finally {
      setLoadingStreams(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !activityId || mode === "gpx") return;
    loadActivityStreams(activityId);
  }, [user, activityId, mode, loadActivityStreams]);

  // ── Keyboard arrows for range (section mode) ──
  useEffect(() => {
    if (mode !== "section" || createdCourseId || !streams?.latlng) return;
    const maxIdx = streams.latlng.length - 1;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -1 : 1;

      if (e.shiftKey) {
        setRangeEnd((prev) => Math.max(0, Math.min(maxIdx, prev + delta)));
      } else {
        setRangeStart((prev) => Math.max(0, Math.min(maxIdx, prev + delta)));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, createdCourseId, streams]);

  // ── GPX file handler ──
  const handleGpxFile = (file: File) => {
    setGpxFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const xml = reader.result as string;
      setGpxXml(xml);

      // 간단 파싱하여 미리보기 생성 (DOM 기반)
      try {
        const parser = new DOMParser();
        const gpxDoc = parser.parseFromString(xml, "text/xml");
        const trkpts = gpxDoc.querySelectorAll("trkpt");
        const points: [number, number][] = [];
        const alts: number[] = [];

        trkpts.forEach((pt) => {
          const lat = parseFloat(pt.getAttribute("lat") ?? "0");
          const lon = parseFloat(pt.getAttribute("lon") ?? "0");
          if (lat && lon) {
            points.push([lat, lon]);
            const ele = pt.querySelector("ele");
            alts.push(ele ? parseFloat(ele.textContent ?? "0") : 0);
          }
        });

        setGpxLatlng(points);

        // 거리 계산 (haversine)
        const dist: number[] = [0];
        for (let i = 1; i < points.length; i++) {
          const [lat1, lon1] = points[i - 1]!;
          const [lat2, lon2] = points[i]!;
          const R = 6371000;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          dist.push(dist[i - 1]! + d);
        }

        setGpxStats(computeStats(alts, dist));

        // GPX name 자동 채움
        const nameEl = gpxDoc.querySelector("trk > name") ?? gpxDoc.querySelector("metadata > name");
        if (nameEl?.textContent && !name) {
          setName(nameEl.textContent);
        }
      } catch {
        // preview 실패해도 업로드는 가능
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".gpx")) {
      handleGpxFile(file);
    }
  };

  // ── Computed ──
  const lowIdx = Math.min(rangeStart, rangeEnd);
  const highIdx = Math.max(rangeStart, rangeEnd);

  const sectionStats = useMemo(() => {
    if (mode !== "section" || !streams?.altitude || !streams?.distance) return null;
    if (lowIdx === highIdx) return null;
    const altSlice = streams.altitude.slice(lowIdx, highIdx + 1);
    const distSlice = streams.distance.slice(lowIdx, highIdx + 1);
    return computeStats(altSlice, distSlice);
  }, [mode, streams, lowIdx, highIdx]);

  const activityStats = useMemo(() => {
    if (mode !== "activity" || !streams?.altitude || !streams?.distance) return null;
    return computeStats(streams.altitude, streams.distance);
  }, [mode, streams]);

  const currentStats = mode === "section" ? sectionStats : mode === "activity" ? activityStats : gpxStats;

  const elevationData = useMemo(() => {
    const alt = streams?.altitude;
    const dist = streams?.distance;
    if (!alt || !dist) return [];
    return alt.map((elev, i) => ({ distance: dist[i] ?? 0, elevation: elev }));
  }, [streams]);

  const markerPosition = useMemo<[number, number] | null>(() => {
    if (hoverIndex == null || !streams?.latlng) return null;
    return streams.latlng[hoverIndex] ?? null;
  }, [hoverIndex, streams]);

  const rangeValidation = useMemo(() => {
    const errors: string[] = [];
    if (mode === "section" && streams?.latlng) {
      const pointCount = highIdx - lowIdx + 1;
      if (pointCount < 10) errors.push(t("creation.pointsNeeded", { count: pointCount }));
      if (sectionStats && sectionStats.distance < 100) {
        errors.push(t("creation.distanceNeeded", { distance: sectionStats.distance }));
      }
    }
    return errors;
  }, [mode, streams, lowIdx, highIdx, sectionStats, t]);

  const isFormValid = name.length >= 2 && name.length <= 50 && rangeValidation.length === 0;

  const handleRangeChange = useCallback((s: number, e: number) => {
    setRangeStart(s);
    setRangeEnd(e);
  }, []);

  // ── Submit ──
  const handleSubmit = async () => {
    if (!isFormValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    // submit 메타: 시도하는 코스의 거리/고도 — funnel 분석 시 어떤 규모의 코스가
    // 실패율 높은지 파악. currentStats 는 미리 계산된 값 (mode 별 분기 끝남).
    const submitMeta = {
      mode,
      distance_km: currentStats ? Math.round(currentStats.distance / 100) / 10 : 0,
      elevation_m: currentStats?.elevationGain ?? 0,
      avg_grade_pct: currentStats?.avgGrade ?? 0,
    };
    track("course_create_submit", submitMeta);

    try {
      let result: { courseId: string };

      if (mode === "activity" && selectedActivity) {
        const fn = httpsCallable<unknown, { courseId: string }>(functions, "createCourseFromActivity");
        const res = await fn({
          activityId: selectedActivity.id,
          name,
          description,
          surface: surface || null,
          difficulty,
        });
        result = res.data;
      } else if (mode === "section" && selectedActivity) {
        const fn = httpsCallable<unknown, { courseId: string }>(functions, "createCourseFromSection");
        const res = await fn({
          activityId: selectedActivity.id,
          startIndex: lowIdx,
          endIndex: highIdx,
          name,
          description,
          surface: surface || null,
          difficulty,
        });
        result = res.data;
      } else if (mode === "gpx" && gpxXml) {
        const fn = httpsCallable<unknown, { courseId: string }>(functions, "createCourseFromGpx");
        const res = await fn({
          gpxXml,
          name,
          description,
          surface: surface || null,
          difficulty,
        });
        result = res.data;
      } else {
        setSubmitError(t("error.missingData"));
        // GPX 모드인데 데이터 누락(파일 미파싱 등)도 임포트 실패로 집계 — 성공률 지표 누락 방지.
        if (mode === "gpx") {
          track("or_route_import_complete", { status: "fail", count: 0 });
        }
        setSubmitting(false);
        return;
      }

      setCreatedCourseId(result.courseId);
      track("course_create_ok", {
        ...submitMeta,
        course_id: result.courseId,
      });
      trackActivationStep(user?.uid ?? null, "first_course_create", {
        course_id: result.courseId,
        mode,
      });
      // E5 or_route_import_complete (웹 대칭) — GPX 임포트 경로 완주만 측정(앱과 동일 이벤트명).
      //  activity/section 모드는 "임포트"가 아닌 기존 데이터 기반 생성이라 제외.
      if (mode === "gpx") {
        track("or_route_import_complete", { status: "ok", count: 1 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("error.createFailed");
      setSubmitError(msg);
      track("course_create_fail", { ...submitMeta, err: msg });
      if (mode === "gpx") {
        track("or_route_import_complete", { status: "fail", count: 0 });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Auth guard ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/courses" replace />;

  // ── Success ──
  if (createdCourseId) {
    return (
      <div className="space-y-6">
        <Card padding="none" className="p-8 text-center">
          <div className="relative inline-flex items-center justify-center mb-6">
            <span className="absolute w-16 h-16 rounded-full bg-green-400/30 animate-ping" />
            <span className="relative w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--ink-0)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          </div>
          <h2 className="text-[length:var(--fs-xl)] font-bold mb-2">{t("creation.success")}</h2>
          <p className="text-[var(--ink-2)] text-[length:var(--fs-sm)] mb-6">{t("creation.successDesc")}</p>
          <div className="flex gap-3 justify-center">
            <Link
              to={`/course/${createdCourseId}`}
              className="px-6 py-2.5 bg-[var(--lime)] text-[var(--bg-0)] font-medium rounded-[var(--r-lg)] hover:opacity-90 transition-opacity"
            >
              {t("button.viewCourse")}
            </Link>
            <Link
              to="/courses"
              className="px-6 py-2.5 bg-[var(--bg-2)] text-[var(--ink-1)] font-medium rounded-[var(--r-lg)] hover:bg-[var(--bg-3)] transition-colors"
            >
              {t("button.courseList")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // ── Main Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[length:var(--fs-2xl)] font-bold">{t("createTitle")}</h1>
          {selectedActivity && mode !== "gpx" && (
            <p className="text-[var(--ink-2)] text-[length:var(--fs-sm)] mt-1">
              {selectedActivity.description} · {new Date(selectedActivity.startTime).toLocaleDateString(localeTag())}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate(-1)}
          className="text-[length:var(--fs-sm)] text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors"
        >
          {t("button.cancel")}
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-[var(--bg-2)] rounded-[var(--r-lg)] p-1">
        {activityId && (
          <>
            <button
              onClick={() => setMode("activity")}
              className={`flex-1 px-3 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] transition-colors ${
                mode === "activity"
                  ? "bg-[var(--bg-1)] text-[var(--ink-0)]"
                  : "text-[var(--ink-2)] hover:text-[var(--ink-0)]"
              }`}
            >
              {t("creation.activityMode")}
            </button>
            <button
              onClick={() => setMode("section")}
              className={`flex-1 px-3 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] transition-colors ${
                mode === "section"
                  ? "bg-[var(--bg-1)] text-[var(--ink-0)]"
                  : "text-[var(--ink-2)] hover:text-[var(--ink-0)]"
              }`}
            >
              {t("creation.sectionMode")}
            </button>
          </>
        )}
        <button
          onClick={() => setMode("gpx")}
          className={`flex-1 px-3 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-md)] transition-colors ${
            mode === "gpx"
              ? "bg-[var(--bg-1)] text-[var(--ink-0)]"
              : "text-[var(--ink-2)] hover:text-[var(--ink-0)]"
          }`}
        >
          {t("creation.gpxMode")}
        </button>
      </div>

      {/* ── Activity / Section Mode ── */}
      {mode !== "gpx" && (
        <>
          {/* Loading */}
          {loadingStreams && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
              <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)]">{t("gpx.loading")}</p>
            </div>
          )}

          {/* Error */}
          {!loadingStreams && streamError && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-[var(--r-lg)] p-4 text-center">
                <p className="text-red-600">{streamError}</p>
              </div>
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 text-[length:var(--fs-sm)] text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors"
              >
                &larr; {t("button.goBack")}
              </button>
            </div>
          )}

          {/* No activity selected */}
          {!loadingStreams && !streamError && !activityId && (
            <div className="text-center py-16">
              <p className="text-[var(--ink-2)]">{t("empty.noActivity")}</p>
              <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 text-[length:var(--fs-sm)] text-[var(--lime)] hover:underline">
                &larr; {t("button.goBack")}
              </button>
            </div>
          )}

          {/* Stream loaded */}
          {!loadingStreams && streams && (
            <>
              {/* Map */}
              {(streams.latlng?.length ?? 0) > 0 && (
                <RouteMap
                  latlng={streams.latlng!}
                  height="h-[32rem]"
                  interactive
                  rounded
                  highlightRange={mode === "section" ? { startIndex: rangeStart, endIndex: rangeEnd } : undefined}
                  onHighlightRangeChange={mode === "section" ? handleRangeChange : undefined}
                  markerPosition={markerPosition}
                />
              )}

              {/* Elevation chart (section mode) */}
              {mode === "section" && elevationData.length > 0 && (
                <Card padding="none" className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] font-medium">
                      {t("gpx.dragHint")}
                    </div>
                  </div>
                  <ElevationChart
                    data={elevationData}
                    height={200}
                    rangeMode
                    range={[rangeStart, rangeEnd]}
                    onRangeChange={(range) => handleRangeChange(range[0], range[1])}
                    onHoverIndex={setHoverIndex}
                  />
                </Card>
              )}

              {/* Elevation chart (activity mode - read only) */}
              {mode === "activity" && elevationData.length > 0 && (
                <Card padding="none" className="p-4">
                  <ElevationChart
                    data={elevationData}
                    height={160}
                    onHoverIndex={setHoverIndex}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ── GPX Upload Mode ── */}
      {mode === "gpx" && (
        <>
          {!gpxXml ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-[var(--line)] rounded-[var(--r-lg)] p-12 text-center hover:border-[var(--lime)]/60 transition-colors"
            >
              <svg className="w-12 h-12 mx-auto text-[var(--ink-3)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-[length:var(--fs-sm)] text-[var(--ink-1)] mb-2">{t("gpx.dropHere")}</p>
              <label className="inline-block px-4 py-2 bg-[var(--lime)] text-[var(--bg-0)] text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] hover:opacity-90 transition-opacity cursor-pointer">
                {t("gpx.selectFile")}
                <input
                  type="file"
                  accept=".gpx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleGpxFile(file);
                  }}
                />
              </label>
              <p className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mt-2">{t("gpx.note")}</p>
            </div>
          ) : (
            <>
              {/* GPX loaded */}
              <div className="bg-green-50 border border-green-200 rounded-[var(--r-lg)] p-3 flex items-center justify-between">
                <span className="text-[length:var(--fs-sm)] text-green-700">
                  {t("gpx.loaded", { filename: gpxFileName, pointCount: gpxLatlng?.length ?? 0 })}
                </span>
                <button
                  onClick={() => {
                    setGpxXml(null);
                    setGpxLatlng(null);
                    setGpxStats(null);
                    setGpxFileName("");
                  }}
                  className="text-[length:var(--fs-xs)] text-[var(--ink-2)] hover:text-red-400 transition-colors"
                >
                  {t("button.reselect")}
                </button>
              </div>

              {/* GPX Map preview */}
              {gpxLatlng && gpxLatlng.length > 0 && (
                <RouteMap
                  latlng={gpxLatlng}
                  height="h-[32rem]"
                  interactive
                  rounded
                />
              )}
            </>
          )}
        </>
      )}

      {/* ── Form + Stats ── */}
      {((mode !== "gpx" && streams) || (mode === "gpx" && gpxXml)) && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Info form */}
          <Card padding="none" className="lg:flex-1 p-4 space-y-4">
            <div>
              <label className="block text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)] mb-1">
                {t("form.courseName")} <span className="text-red-500">{t("form.nameRequired")}</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.courseNamePlaceholder")}
                maxLength={50}
                className="w-full px-3 py-2 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-lg)] text-[length:var(--fs-sm)] text-[var(--ink-1)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
              />
              <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mt-1">{t("form.charLimit", { current: name.length, max: 50 })}</div>
            </div>

            <div>
              <label className="block text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)] mb-1">
                {t("form.description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                maxLength={200}
                rows={2}
                className="w-full px-3 py-2 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-lg)] text-[length:var(--fs-sm)] text-[var(--ink-1)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent resize-none"
              />
            </div>

            {/* 노면 — 생성 시 입력(#489) */}
            <div>
              <label className="block text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)] mb-1">{t("edit.surface")}</label>
              <div role="radiogroup" aria-label={t("edit.surface")} className="flex items-center flex-wrap gap-1.5">
                {([
                  { v: "" as const, label: t("edit.surface.unspecified") },
                  { v: "paved" as const, label: t("edit.surface.paved") },
                  { v: "gravel" as const, label: t("edit.surface.gravel") },
                  { v: "mixed" as const, label: t("edit.surface.mixed") },
                ]).map((o) => {
                  const active = surface === o.v;
                  return (
                    <button
                      key={o.v || "none"}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSurface(o.v)}
                      className="px-2.5 py-1 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
                      style={active
                        ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" }
                        : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 난이도 — 생성 시 입력(#489) */}
            <div>
              <label className="block text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)] mb-1">{t("edit.difficultyLabel")}</label>
              <div role="radiogroup" aria-label={t("edit.difficultyLabel")} className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = difficulty === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDifficulty(active ? null : n)}
                      className="w-9 h-9 text-[length:var(--fs-sm)] rounded-[var(--r-sm)] border font-semibold transition-colors"
                      style={active
                        ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" }
                        : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Stats + Submit */}
          {currentStats && (
            <Card padding="none" className="lg:flex-1 p-3 flex flex-col">
              <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] font-medium mb-2">
                {mode === "section" ? t("creation.sectionStats") : t("creation.courseStats")}
              </div>
              <StatsPanel stats={currentStats} />

              {/* Errors */}
              {rangeValidation.length > 0 && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-[var(--r-sm)] p-2">
                  {rangeValidation.map((msg) => (
                    <p key={msg} className="text-red-600 text-[length:var(--fs-xs)]">{msg}</p>
                  ))}
                </div>
              )}
              {submitError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-[var(--r-sm)] p-2">
                  <p className="text-red-600 text-[length:var(--fs-xs)]">{submitError}</p>
                </div>
              )}

              {/* Submit */}
              <div className="mt-auto pt-3 border-t border-[var(--line-soft)] mt-3">
                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid || submitting}
                  className="w-full py-3 bg-[var(--lime)] text-[var(--bg-0)] text-[length:var(--fs-base)] font-semibold rounded-[var(--r-lg)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t("button.registering")}
                    </span>
                  ) : (
                    t("button.register")
                  )}
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Bottom nav */}
      <div className="flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-[length:var(--fs-sm)] text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors"
        >
          &larr; {t("button.goBack")}
        </button>
      </div>
    </div>
  );
}
