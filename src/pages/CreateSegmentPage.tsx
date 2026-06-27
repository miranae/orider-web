import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useSegmentCreator } from "../hooks/useSegmentCreator";
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

type Category = "climb" | "sprint" | "flat";

// ── Helpers ──────────────────────────────────────────────────────────

function computeStats(
  altitude: number[],
  distance: number[],
): { distance: number; elevationGain: number; avgGrade: number; maxGrade: number; climbCategory: number } {
  if (altitude.length < 2) {
    return { distance: 0, elevationGain: 0, avgGrade: 0, maxGrade: 0, climbCategory: 0 };
  }

  const firstDist = distance[0] ?? 0;
  const lastDist = distance[distance.length - 1] ?? 0;
  const firstAlt = altitude[0] ?? 0;
  const lastAlt = altitude[altitude.length - 1] ?? 0;
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

  const avgGrade = totalDist > 0 ? ((lastAlt - firstAlt) / totalDist) * 100 : 0;

  const grade = (elevGain / Math.max(totalDist, 1)) * 100;
  const score = elevGain * grade;
  let climbCategory = 0;
  if (score >= 8000) climbCategory = 5;
  else if (score >= 4000) climbCategory = 4;
  else if (score >= 2000) climbCategory = 3;
  else if (score >= 800) climbCategory = 2;
  else if (score >= 200) climbCategory = 1;

  return {
    distance: Math.round(totalDist),
    elevationGain: Math.round(elevGain),
    avgGrade: Math.round(avgGrade * 10) / 10,
    maxGrade: Math.round(maxGrade * 10) / 10,
    climbCategory,
  };
}

// CLIMB_LABELS defined in component to use translations

const CLIMB_COLORS: Record<number, string> = {
  5: "bg-red-600 text-[var(--ink-0)]",
  4: "bg-red-500 text-[var(--ink-0)]",
  3: "bg-[var(--amber)] text-[var(--bg-0)]",
  2: "bg-yellow-500 text-[var(--ink-0)]",
  1: "bg-green-500 text-[var(--ink-0)]",
};


// ── Sub-components ───────────────────────────────────────────────────

function ClimbBadge({ category, climbLabels }: { category: number; climbLabels: Record<number, string> }) {
  if (category === 0) return null;
  const color = CLIMB_COLORS[category] ?? "bg-[var(--bg-2)] text-[var(--ink-1)]";
  return (
    <span className={`px-2.5 py-1 text-[length:var(--fs-xs)] font-bold rounded-[var(--r-sm)] ${color}`}>
      {climbLabels[category]}
    </span>
  );
}

function StatsPanel({ stats, t }: { stats: ReturnType<typeof computeStats>; t: any }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6">
      <div className="border-l-2 border-[var(--lime)] pl-3">
        <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{t("distance")}</div>
        <div className="text-[length:var(--fs-lg)] font-bold text-[var(--ink-0)]">
          {(stats.distance / 1000).toFixed(2)} <span className="text-[length:var(--fs-sm)] font-normal text-[var(--ink-2)]">km</span>
        </div>
      </div>
      <div className="border-l-2 border-[var(--lime)] pl-3">
        <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] uppercase tracking-wide">{t("elevationGain")}</div>
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

export default function CreateSegmentPage() {
  const { t } = useTranslation("segment");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activityId = searchParams.get("activityId");
  const { createProposal, loading: submitting, error: submitError } = useSegmentCreator();

  const CLIMB_LABELS: Record<number, string> = {
    5: "HC", 4: "Cat 1", 3: "Cat 2", 2: "Cat 3", 1: "Cat 4", 0: t("climb.none"),
  };

  const CATEGORY_INFO: Record<Category, { icon: string; label: string; desc: string }> = {
    climb: { icon: "⛰", label: t("form.categoryClimb"), desc: t("form.categoryClimbDesc") },
    sprint: { icon: "⚡", label: t("form.categorySprint"), desc: t("form.categorySprintDesc") },
    flat: { icon: "🛣", label: t("form.categoryFlat"), desc: t("form.categoryFlatDesc") },
  };

  // Activity
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  // Streams
  const [streams, setStreams] = useState<StreamData | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Range selection (start > end means reversed direction)
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const reversed = rangeStart > rangeEnd;

  // Info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("climb");

  // Success
  const [createdSegmentId, setCreatedSegmentId] = useState<string | null>(null);

  // ── Keyboard arrow keys for fine-tuning range ──
  useEffect(() => {
    if (createdSegmentId || !streams?.latlng) return;
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
  }, [createdSegmentId, streams, rangeStart, rangeEnd]);

  // ── Load activity and streams ──
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
      console.error("Failed to load streams:", err);
      const fbErr = err as { code?: string; message?: string; details?: unknown };
      const code = fbErr.code ?? "unknown";
      const msg = fbErr.message ?? String(err);
      setStreamError(t("error.streamLoadFailed", { code, message: msg }));
    } finally {
      setLoadingStreams(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !activityId) return;
    loadActivityStreams(activityId);
  }, [user, activityId, loadActivityStreams]);

  // ── Computed ──
  const lowIdx = Math.min(rangeStart, rangeEnd);
  const highIdx = Math.max(rangeStart, rangeEnd);

  const segmentStats = useMemo(() => {
    if (!streams?.altitude || !streams?.distance) return null;
    if (lowIdx === highIdx) return null;
    const altSlice = streams.altitude.slice(lowIdx, highIdx + 1);
    const distSlice = streams.distance.slice(lowIdx, highIdx + 1);
    if (reversed) {
      const altRev = [...altSlice].reverse();
      const totalDist = (distSlice[distSlice.length - 1] ?? 0) - (distSlice[0] ?? 0);
      const distRev = altRev.map((_, i) => {
        const origIdx = altSlice.length - 1 - i;
        return totalDist - ((distSlice[origIdx] ?? 0) - (distSlice[0] ?? 0));
      });
      return computeStats(altRev, distRev);
    }
    return computeStats(altSlice, distSlice);
  }, [streams, lowIdx, highIdx, reversed]);

  useEffect(() => {
    if (!segmentStats) return;
    if (segmentStats.avgGrade > 3) setCategory("climb");
    else if (segmentStats.distance < 1000 && segmentStats.avgGrade < 1) setCategory("sprint");
    else setCategory("flat");
  }, [segmentStats]);

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
    if (!streams?.latlng) return errors;
    const pointCount = highIdx - lowIdx + 1;
    if (pointCount < 30) errors.push(t("creation.pointsNeeded", { count: pointCount }));
    if (segmentStats && segmentStats.distance < 300) {
      errors.push(t("creation.distanceNeeded", { distance: segmentStats.distance }));
    }
    return errors;
  }, [streams, lowIdx, highIdx, segmentStats, t]);

  const isFormValid = name.length >= 2 && name.length <= 50 && rangeValidation.length === 0;

  const startKm = streams?.distance ? (streams.distance[rangeStart] ?? 0) / 1000 : 0;
  const endKm = streams?.distance ? (streams.distance[rangeEnd] ?? 0) / 1000 : 0;
  const totalKm = streams?.distance ? (streams.distance[streams.distance.length - 1] ?? 0) / 1000 : 0;
  const selectedKm = Math.abs(endKm - startKm);

  const handleRangeChange = useCallback((s: number, e: number) => {
    setRangeStart(s);
    setRangeEnd(e);
  }, []);

  // ── Submit ──
  const handleSubmit = async () => {
    if (!selectedActivity || !segmentStats || !isFormValid) return;
    // rangeStart/rangeEnd encode direction: start > end means reversed
    // Server always expects startIndex < endIndex, so use lowIdx/highIdx
    const result = await createProposal({
      activityId: selectedActivity.id,
      startIndex: lowIdx,
      endIndex: highIdx,
      name,
      description,
      category,
    });
    if (result) setCreatedSegmentId(result.segmentId);
  };

  // ── Auth guard ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/explore" replace />;

  if (!activityId) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--ink-2)]">{t("empty.noActivity")}</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 text-[length:var(--fs-sm)] text-[var(--lime)] hover:underline">
          &larr; {t("button.goBack")}
        </button>
      </div>
    );
  }

  // ── Success ──
  if (createdSegmentId) {
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
          <p className="text-[var(--ink-2)] text-[length:var(--fs-sm)] mb-1">{t("creation.successDesc")}</p>
          <p className="text-[var(--ink-3)] text-[length:var(--fs-xs)] mb-6">{t("creation.successNote")}</p>
          <div className="flex gap-3 justify-center">
            <Link
              to={`/segment/${createdSegmentId}`}
              className="px-6 py-2.5 bg-[var(--lime)] text-[var(--bg-0)] font-medium rounded-[var(--r-lg)] hover:opacity-90 transition-opacity"
            >
              {t("button.viewSegment")}
            </Link>
            <button
              onClick={() => navigate(`/athlete/${user.uid}`)}
              className="px-6 py-2.5 bg-[var(--bg-2)] text-[var(--ink-1)] font-medium rounded-[var(--r-lg)] hover:bg-[var(--bg-3)] transition-colors"
            >
              {t("button.goBack")}
            </button>
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
          {selectedActivity && (
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

      {/* Loading */}
      {loadingStreams && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-4 border-[var(--lime)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)]">{t("loading.segments")}</p>
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

      {/* Main content — all in one */}
      {!loadingStreams && streams && (
        <>
          {/* Map */}
          {(streams.latlng?.length ?? 0) > 0 && (
            <RouteMap
              latlng={streams.latlng!}
              height="h-[32rem]"
              interactive
              rounded
              highlightRange={{ startIndex: rangeStart, endIndex: rangeEnd }}
              onHighlightRangeChange={handleRangeChange}
              markerPosition={markerPosition}
            />
          )}
          {/* Direction indicator */}
          {reversed && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--lime)]/10 border border-[var(--lime)]/30 rounded-[var(--r-lg)] text-[length:var(--fs-xs)] text-[var(--lime)]">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              {t("creation.reversed")}
            </div>
          )}

          {/* Elevation chart */}
          {elevationData.length > 0 && (
            <Card padding="none" className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] font-medium">
                  {t("creation.instructionDrag")}<kbd className="px-1 py-0.5 bg-[var(--bg-2)] rounded-[var(--r-sm)] text-[10px]">&larr;&rarr;</kbd>{t("creation.instructionArrows")}<kbd className="px-1 py-0.5 bg-[var(--bg-2)] rounded-[var(--r-sm)] text-[10px]">{t("creation.instructionShift")}&larr;&rarr;</kbd>{t("creation.instructionEnd")}<kbd className="px-1 py-0.5 bg-[var(--bg-2)] rounded-[var(--r-sm)] text-[10px]">{t("creation.instructionCtrl")}</kbd>{t("creation.instructionFine")}
                </div>
                <div className="flex items-center gap-3 text-[length:var(--fs-xs)] font-mono text-[var(--ink-2)]">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{startKm.toFixed(2)} km</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />{endKm.toFixed(2)} km</span>
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
              <div className="flex items-center justify-end mt-2">
                <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">
                  {t("creation.fullDistance", { total: totalKm.toFixed(1), selected: selectedKm.toFixed(2) })}
                </div>
              </div>
            </Card>
          )}

          {/* Info + Stats/Submit — side by side on desktop */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Info form (left) */}
            <Card padding="none" className="lg:flex-1 p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[length:var(--fs-sm)] font-medium text-[var(--ink-1)] mb-1">
                  {t("form.segmentName")} <span className="text-red-500">{t("form.nameRequired")}</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("form.namePlaceholder")}
                  maxLength={50}
                  className="w-full px-3 py-2 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--r-lg)] text-[length:var(--fs-sm)] text-[var(--ink-1)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)] focus:border-transparent"
                />
                <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mt-1">{t("form.nameLength", { current: name.length })}</div>
              </div>

              {/* Description */}
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

              {/* Category */}
              <div className="grid grid-cols-3 gap-2">
                {(["climb", "sprint", "flat"] as Category[]).map((cat) => {
                  const info = CATEGORY_INFO[cat];
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-[var(--r-lg)] border-2 transition-all text-left ${
                        isSelected
                          ? "border-[var(--lime)] bg-[var(--lime)]/10"
                          : "border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-soft)]"
                      }`}
                    >
                      <span className="text-[length:var(--fs-lg)]">{info.icon}</span>
                      <div>
                        <div className={`text-[length:var(--fs-sm)] font-medium ${isSelected ? "text-[var(--lime)]" : "text-[var(--ink-1)]"}`}>
                          {info.label}
                        </div>
                        <div className="text-[10px] text-[var(--ink-3)] hidden sm:block">{info.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Stats + Submit (right) */}
            {segmentStats && (
              <Card padding="none" className="lg:flex-1 p-3 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[length:var(--fs-xs)] text-[var(--ink-2)] font-medium">{t("creation.sectionStats")}</div>
                  {segmentStats.climbCategory > 0 && <ClimbBadge category={segmentStats.climbCategory} climbLabels={CLIMB_LABELS} />}
                </div>
                <StatsPanel stats={segmentStats} t={t} />

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
                        {t("button.submitting")}
                      </span>
                    ) : (
                      t("button.submit")
                    )}
                  </button>
                  <p className="text-[10px] text-[var(--ink-3)] text-center mt-1.5">
                    {t("creation.submitNote")}
                  </p>
                </div>
              </Card>
            )}
          </div>

          {/* Bottom nav */}
          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-[length:var(--fs-sm)] text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors"
            >
              &larr; {t("button.goBack")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
