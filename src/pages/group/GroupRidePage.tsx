import { usePublicActivityMaps } from "../../hooks/usePublicActivityMaps";
import { useGroupRideActivities } from "../../hooks/useGroupRideActivities";
import { X, LocateFixed } from "lucide-react";
import { groupRideMapRange } from "./groupRideMapRange";
import SportIcon from "../../components/common/SportIcon";
import { useState, useEffect, useMemo, useRef, useCallback, useId } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../../utils/localeDate";
import { getDiscipline } from "../../utils/disciplineFilter";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import {
  doc, getDoc,
} from "firebase/firestore";
import { auth, ensureAppCheckReady, firestore, functions } from "../../services/firebase";
import { debugLog, logClientError } from "../../services/errorLogger";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { getActivityStreams } from "../../services/personalDataApi";
import { isPermissionDeniedError } from "../../utils/firebaseErrors";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../contexts/AuthContext";
import type { Activity, ActivityStreams } from "@shared/types";
import { useGroup } from "../../hooks/useGroup";
import { formatElapsedBoundary } from "../../features/activity/detail/activityRangeSelection";
import { getStreamPhotos } from "../../features/activity/detail/activityDetailDerived";

import Map, { Source, Layer, Marker } from "react-map-gl/mapbox";
import type { LngLatBoundsLike } from "mapbox-gl";
import { getMapboxToken, MAP_STYLE, applyKoreaCyclingStyle } from "../../utils/mapbox";
import { decodeTrack } from "../../utils/polyline";
import { getBounds } from "../../components/RouteMap";

import GroupRidePerformanceChart, { type GroupRideOverlay } from "./GroupRidePerformanceChart";
import InfoTip from "../../components/InfoTip";
import type { MapRef } from "react-map-gl/mapbox";
import "./ClubSurface.css";
import "./GroupRidePage.css";
import { EmptyState, ErrorState } from "../../components/redesign";
import { Button, Card, Checkbox, DataTable, IconButton, Section, type DataTableColumn, ChartHeader, ChartLegend, ChartValue, MapControlButton, MapNavigation, MapResizeControls, Text, ToggleButton, ToggleControls } from "../../theme/components";
import { useOriderTheme } from "../../theme";
import { FUNCTIONAL_COLORS } from "../../theme/generated";
import { getComparisonSeriesColors } from "../../theme/charts/comparisonSeriesColors";
import { observedRideRange } from "./groupRideRangeMetrics";
import { groupRideClock, nearestClockSample, clockSampleTolerance } from "./groupRideClock";
import { GroupRideOverlayControls } from "./GroupRideOverlayControls";
import { ICON_SIZE } from "../../theme/tokens/icon";



export default function GroupRidePage() {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation(["group", "common"]);
  const { groupId, rideId } = useParams();
  const { user } = useAuth();
  const { group } = useGroup(groupId);
  const { variant, theme } = useOriderTheme();
  const darkMapCasing = variant === theme.scheme.dark;
  const riderColors = getComparisonSeriesColors(darkMapCasing ? "dark" : "light");
  const { context: loadedActivityContext, activities: loadedActivities, loading, loadingMore, error: loadError, hasMore, limited, loadMore, refresh } = useGroupRideActivities(rideId, user);
  const [riderNames, setRiderNames] = useState<globalThis.Map<string, string>>(new globalThis.Map());
  const activities = useMemo(() => loadedActivities.map((activity, index) => ({
    ...activity,
    nickname: activity.nickname?.trim() || riderNames.get(activity.userId)?.trim() || t("rides.riderFallback", { number: index + 1 }),
  })), [loadedActivities, riderNames, t]);
  const riderActivityCounts = useMemo(() => {
    const counts = new globalThis.Map<string, number>();
    activities.forEach(activity => {
      if (typeof activity.userId === "string" && activity.userId.trim()) {
        counts.set(activity.userId, (counts.get(activity.userId) ?? 0) + 1);
      }
    });
    return counts;
  }, [activities]);
  const riderLabels = useMemo(() => new globalThis.Map(activities.map(activity => {
    const sameRider = activities.filter(other => other.userId === activity.userId);
    const label = sameRider.length > 1
      ? t("ridePage.riderActivity", { name: activity.nickname, distance: (activity.summary.distance / 1000).toFixed(1) })
      : activity.nickname;
    const collisions = sameRider.filter(other => (other.summary.distance / 1000).toFixed(1) === (activity.summary.distance / 1000).toFixed(1));
    return [activity.id, collisions.length > 1 ? `${label} · ${t("ridePage.recordNumber", { number: [...collisions].sort((a, b) => a.id.localeCompare(b.id)).findIndex(other => other.id === activity.id) + 1 })}` : label];
  })), [activities, t]);
  const riderLabel = (activity: Activity) => riderLabels.get(activity.id) ?? activity.nickname;
  const activityColors = useMemo(() => new globalThis.Map([...activities].sort((a, b) => a.id.localeCompare(b.id)).map((activity, index) => [activity.id, riderColors[index % riderColors.length]!])), [activities, riderColors]);
  const colorOf = (activity: Activity) => activityColors.get(activity.id)!;
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const mapId = useId();
  const [streams, setStreams] = useState<Record<string, ActivityStreams>>({});
  const [streamErrors, setStreamErrors] = useState<Set<string>>(new Set());
  const [pendingStreams, setPendingStreams] = useState<Set<string>>(new Set());
  const [streamRetry, setStreamRetry] = useState(0);
  const [hiddenRiders, setHiddenRiders] = useState<{ context: typeof loadedActivityContext; ids: Set<string> } | null>(null);
  const visibleRiders = useMemo(() => new Set(loadedActivities.filter(activity => hiddenRiders?.context !== loadedActivityContext || !hiddenRiders.ids.has(activity.id)).map(activity => activity.id)), [loadedActivities, loadedActivityContext, hiddenRiders]);
const { maps: currentPublicMaps } = usePublicActivityMaps(activities.filter(activity => activity.userId !== user?.uid && visibleRiders.has(activity.id)).map(activity => activity.id));
  const [chartAxis, setChartAxis] = useState<"distance" | "time">("distance");
  const [selectedViewport, setSelectedViewport] = useState<{ axis: "distance" | "time"; start: number; end: number } | null>(null);
  const [fullViewport, setFullViewport] = useState<{ axis: "distance" | "time"; start: number; end: number } | null>(null);
  const handleViewportChange = useCallback((range: [number, number] | null, fullRange?: [number, number]) => {
    if (fullRange) setFullViewport(previous => previous?.axis === chartAxis && previous.start === fullRange[0] && previous.end === fullRange[1] ? previous : { axis: chartAxis, start: fullRange[0], end: fullRange[1] });
    setSelectedViewport(previous => !range ? null : previous?.axis === chartAxis && previous.start === range[0] && previous.end === range[1] ? previous : { axis: chartAxis, start: range[0], end: range[1] });
  }, [chartAxis]);
  const dismissedInspectionIndex = useRef<number | null>(null);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set(["hr", "power", "speed"]));
  const [hoverCoordinate, setHoverCoordinate] = useState<number | null>(null);
  const dismissedCoordinate = useRef<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [inspectionIndex, setInspectionIndex] = useState<number | null>(null);
  const inspectionChartRef = useRef<HTMLDivElement>(null);
  const requestedStreams = useRef(new Set<string>());
  const runningPowerOnly = activities.length > 0 && activities.every(activity => getDiscipline(activity.type) === "run");
  const mixedPowerSports = activities.some(activity => getDiscipline(activity.type) === "run") && !runningPowerOnly;

  useEffect(() => {
    requestedStreams.current.clear();
    setStreams({}); setStreamErrors(new Set()); setPendingStreams(new Set());
    setSelectedViewport(null); setFullViewport(null);
  }, [rideId, user, loadedActivityContext]);
  // 공개 이름 보강은 요약/스트림 로드와 분리해 프로필 장애가 기록을 가리지 않게 한다.
  useEffect(() => {
    let cancelled = false;
    setRiderNames(new globalThis.Map());
    const missingIds = [...new Set(loadedActivities.filter(activity => !activity.nickname?.trim()).map(activity => activity.userId))];
    if (missingIds.length > 0) void getPublicUserProfiles(missingIds).then(profiles => {
      if (!cancelled) setRiderNames(new globalThis.Map([...profiles].map(([id, profile]) => [id, profile.nickname])));
    }).catch(error => {
      if (!cancelled) logClientError("GroupRidePage.publicProfiles", error, { count: missingIds.length });
    });
    return () => { cancelled = true; };
  }, [loadedActivities]);

  // 스트림은 같은 조회 컨텍스트의 활동만 사용한다. 로그인 전 기록을 새 계정으로 요청하지 않는다.
  useEffect(() => {
    let cancelled = false;
    const requestOwner = auth.currentUser;
    const started = new Set<string>();
    const isCurrent = () => !cancelled && auth.currentUser === requestOwner;
    loadedActivities.forEach(async (a) => {
      if (requestedStreams.current.has(a.id)) return;
      requestedStreams.current.add(a.id);
      started.add(a.id);
      started.add(a.id);
      if (a.source !== "orider" && a.source !== "strava") return;
      setPendingStreams(previous => new Set(previous).add(a.id));
      try {
        if (a.source === "strava" && a.stravaActivityId) {
          await ensureAppCheckReady();
          if (!isCurrent()) return;
          const getStreamsFn = httpsCallable(functions, "stravaGetActivityStreams");
          const result = await getStreamsFn({ stravaActivityId: a.stravaActivityId });
          if (isCurrent() && result.data) {
            setStreams((prev) => ({ ...prev, [a.id]: result.data as unknown as ActivityStreams }));
          }
        } else if (a.source === "strava") {
          const viaApi = await getActivityStreams(a.id);
          if (isCurrent()) setStreams(prev => ({ ...prev, [a.id]: viaApi }));
        } else if (a.source === "orider") {
          // Orider 활동은 activity_streams/{activityId}에서 직접 읽는다. 직접 읽기가
          // 거부되면 활동 공개 범위와 접근 권한을 검증하는 인증 스트림 API로 받는다.
          let streamSnap;
          try {
            streamSnap = await getDoc(doc(firestore, "activity_streams", a.id));
          } catch (readErr) {
            if (!isPermissionDeniedError(readErr)) throw readErr;
            debugLog("groupRide.streams.direct_read_denied_api_fallback", { activityId: a.id, rideId });
            const viaApi = await getActivityStreams(a.id);
            if (isCurrent()) setStreams((prev) => ({ ...prev, [a.id]: viaApi }));
            return;
          }
          if (!isCurrent()) return;
          if (!streamSnap.exists()) throw new Error("STREAMS_MISSING");
          const data = streamSnap.data();
          if (data.storage === "gcs" && typeof data.gcsPath === "string") {
            const viaApi = await getActivityStreams(a.id);
            if (isCurrent()) setStreams((prev) => ({ ...prev, [a.id]: viaApi }));
          } else if (typeof data.json === "string") {
            setStreams((prev) => ({ ...prev, [a.id]: JSON.parse(data.json) as ActivityStreams }));
          } else if (["latlng", "altitude", "velocity_smooth", "heartrate", "watts", "cadence"].some(key => Array.isArray(data[key]))) {
            setStreams((prev) => ({ ...prev, [a.id]: data as ActivityStreams }));
          } else {
            throw new Error("STREAMS_MISSING");
          }
        }
      } catch (err) {
        if (isCurrent()) {
          setStreamErrors(previous => new Set(previous).add(a.id));
          logClientError("GroupRidePage.loadStream", err, { activityId: a.id, rideId });
        }
      } finally {
        started.delete(a.id);
        if (isCurrent()) setPendingStreams(previous => {
          const next = new Set(previous); next.delete(a.id); return next;
        });
      }
    });
    return () => { cancelled = true; started.forEach(id => requestedStreams.current.delete(id)); };
  }, [loadedActivities, rideId, streamRetry, user, loadedActivityContext]);

  const toggleRider = (activityId: string) => {
    setHiddenRiders(previous => {
      const next = new Set(previous?.context === loadedActivityContext ? previous.ids : []);
      if (next.has(activityId)) next.delete(activityId); else next.add(activityId);
      return { context: loadedActivityContext, ids: next };
    });
  };

  const toggleOverlay = useCallback((key: string) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Visible activities with streams ──
  const visibleActivities = useMemo(
    () => activities.filter((a) => visibleRiders.has(a.id)),
    [activities, visibleRiders],
  );

  const ridePhotos = useMemo(() => {
    if (group?.toggles?.ridePhotos !== true) return [];
    return activities.flatMap((activity) =>
      getStreamPhotos(streams[activity.id] ?? null)
        .filter((photo) => !!photo.url)
        .map((photo) => ({ ...photo, activityId: activity.id, riderName: riderLabel(activity) })),
    );
  }, [activities, group?.toggles?.ridePhotos, streams]);

  const clockAxes = useMemo(() => new globalThis.Map(activities.map(activity => [activity.id, groupRideClock(activity, streams[activity.id])])), [activities, streams]);
  const clockTolerances = useMemo(() => new globalThis.Map([...clockAxes].map(([id, axis]) => [id, clockSampleTolerance(axis)])), [clockAxes]);
  const clockOrigin = useMemo(() => Math.min(...[...clockAxes.values()].flatMap(axis => axis?.length ? [axis[0]!] : [])), [clockAxes]);

  // ── Multi-route map data (ALL activities for stable bounds) ──
  const allRouteGeoJSONs = useMemo(() => {
    return activities.map((a) => {
      const color = colorOf(a);
      let positions: [number, number][] = [];

      const s = streams[a.id];
      if (a.userId === user?.uid && s?.latlng && s.latlng.length > 0) {
        positions = s.latlng;
      } else if (a.userId === user?.uid && a.thumbnailTrack) {
        positions = decodeTrack(a.thumbnailTrack) as [number, number][];
      } else if (currentPublicMaps[a.id]?.mapPreview.encodedPolyline) {
        positions = decodeTrack(currentPublicMaps[a.id]!.mapPreview.encodedPolyline!) as [number, number][];
      }

      if (positions.length === 0) return null;

      // A simplified/privacy-clipped preview has no correspondence to raw sensor indices.
      const geojson = groupRideMapRange({ latlng: positions }, a.userId === user?.uid && s?.latlng?.length ? clockAxes.get(a.id) : null);

      return { id: a.id, geojson, color, positions };
    }).filter(Boolean) as { id: string; geojson: GeoJSON.Feature<GeoJSON.MultiLineString>; color: string; positions: [number, number][] }[];
  }, [activities, streams, clockAxes, activityColors, currentPublicMaps, user]);

  // Bounds from ALL routes (stable — does not change on rider toggle)
  const mapBounds = useMemo((): LngLatBoundsLike | null => {
    const allPositions = allRouteGeoJSONs.flatMap((r) => r.positions).filter(([lat, lng]) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0));
    if (allPositions.length === 0) return null;
    return getBounds(allPositions);
  }, [allRouteGeoJSONs]);

  useEffect(() => {
    const frame = mapFrameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [loading, mapBounds]);

  // Visible routes (for display — changes on rider toggle)
  const visibleRouteGeoJSONs = useMemo(() => {
    return allRouteGeoJSONs.filter((r) => visibleRiders.has(r.id));
  }, [allRouteGeoJSONs, visibleRiders]);

  const highlightedRange = selectedViewport?.axis === chartAxis ? selectedViewport : null;
  const highlightedRouteGeoJSONs = useMemo(() => highlightedRange ? visibleRouteGeoJSONs.map(route => ({
    ...route,
    geojson: groupRideMapRange(streams[route.id], clockAxes.get(route.id), {
      axis: chartAxis,
      start: chartAxis === "time" ? clockOrigin + highlightedRange.start * 60_000 : highlightedRange.start * 1000,
      end: chartAxis === "time" ? clockOrigin + highlightedRange.end * 60_000 : highlightedRange.end * 1000,
    }),
  })) : [], [highlightedRange, visibleRouteGeoJSONs, streams, clockAxes, clockOrigin, chartAxis]);

  const clockZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayLocale = localeTag();
  const formatClock = useCallback((epoch: number, withDate = false) => new Date(epoch).toLocaleString(displayLocale, {
    ...(withDate ? { month: "short", day: "numeric" } as const : {}), hour: "2-digit", minute: "2-digit", ...(withDate ? { second: "2-digit" } as const : {}), hour12: false,
  }), [displayLocale]);
  const formatChartTick = useCallback((value: number) => formatClock(clockOrigin + value * 60_000), [formatClock, clockOrigin]);
  const formatChartRange = useCallback((value: number) => formatClock(clockOrigin + value * 60_000, true), [formatClock, clockOrigin]);

  // ── ElevationChart: first visible rider as base, others as overlays ──
  const elevationChartData = useMemo(() => {
    const withStreams = visibleActivities.filter(activity => {
      const stream = streams[activity.id];
      const axis = chartAxis === "time" ? clockAxes.get(activity.id) : stream?.distance;
      return axis?.some((coordinate, index) => Number.isFinite(coordinate) && [stream?.altitude?.[index], stream?.watts?.[index], stream?.velocity_smooth?.[index], stream?.cadence?.[index], (stream?.heartrate?.[index] ?? 0) > 0 ? stream?.heartrate?.[index] : undefined].some(Number.isFinite));
    });
    if (withStreams.length === 0) return null;

    const baseActivity = withStreams[0]!;
    const baseStream = streams[baseActivity.id]!;
    const baseAxis = chartAxis === "time" ? clockAxes.get(baseActivity.id) ?? [] : baseStream.distance ?? [];
    const basePoints = baseAxis.flatMap((coordinate, index) => {
      const elevation = baseStream.altitude?.[index];
      const hasSample = [elevation, baseStream.watts?.[index], baseStream.velocity_smooth?.[index], baseStream.cadence?.[index], (baseStream.heartrate?.[index] ?? 0) > 0 ? baseStream.heartrate?.[index] : undefined].some(Number.isFinite);
      return Number.isFinite(coordinate) && hasSample
        ? [{ distance: baseStream.distance?.[index] ?? NaN, elevation: Number.isFinite(elevation) ? elevation! : NaN, streamIndex: index }]
        : [];
    });
    const baseData = basePoints.map(({ distance, elevation }) => ({ distance, elevation }));

    // Other riders as elevation overlays
    const overlays: GroupRideOverlay[] = [];
    for (let ri = 1; ri < withStreams.length; ri++) {
      const a = withStreams[ri]!;
      const s = streams[a.id]!;
      const color = colorOf(a);
      if (s.altitude) {
        overlays.push({
          key: `elevation:${a.id}`,
          label: t("ridePage.elevationOf", { name: riderLabel(a) }),
          data: s.altitude,
          distance: s.distance,
          elapsedAxisSec: clockAxes.get(a.id)?.map(epoch => (epoch - clockOrigin) / 1000),
          color,
          yAxisID: "yElev",
          borderDash: [],
          unit: "m",
        });
      }
    }

    return { baseData, overlays, records: withStreams, baseEpochMs: basePoints.map(point => clockAxes.get(baseActivity.id)?.[point.streamIndex]), baseElapsedAxisSec: basePoints.map(point => ((clockAxes.get(baseActivity.id)?.[point.streamIndex] ?? NaN) - clockOrigin) / 1000), baseActivityId: baseActivity.id, baseIndices: basePoints.map(point => point.streamIndex), baseName: riderLabel(baseActivity), baseColor: colorOf(baseActivity) };
  }, [visibleActivities, streams, activities, chartAxis, clockAxes, clockOrigin, activityColors]);

  const handleElevHover = useCallback((index: number | null) => {
    // 잘못된 다른 dataset index나 pointerleave로 마지막 유효한 선택을 지우지 않는다.
    if (index == null || !Number.isInteger(index) || index < 0 || index >= (elevationChartData?.baseData.length ?? 0)
      || index === dismissedInspectionIndex.current) return;
    dismissedInspectionIndex.current = null;
    setHoverCoordinate(null);
    setHoverIndex(index);
    setInspectionIndex(null);
  }, [elevationChartData]);

  const handleHoverCoordinate = useCallback((coordinate: number | null) => {
    if (coordinate == null || !Number.isFinite(coordinate) || coordinate < 0 || coordinate === dismissedCoordinate.current) return;
    dismissedCoordinate.current = null;
    setHoverCoordinate(coordinate); setHoverIndex(null); setInspectionIndex(null);
  }, []);

  // ── Performance overlay configs (speed, HR, power, cadence) ──
  interface OverlayConfig {
    key: string;
    label: string;
    unit: string;
    color: string;
    dotColor: string;
    yAxisID: string;
    getData: (s: ActivityStreams) => Array<number | null> | undefined;
  }

  const PERF_OVERLAY_CONFIGS: OverlayConfig[] = useMemo(() => [
    { key: "hr", label: t("rides.streamLabels.hr"), unit: "bpm", color: `color-mix(in srgb, ${variant.chartColors.heartRate} 70%, transparent)`, dotColor: variant.chartColors.heartRate, yAxisID: "yHR", getData: (s) => s.heartrate?.map(value => Number.isFinite(value) && value > 0 ? value : null) },
    { key: "power", label: t(runningPowerOnly ? "rides.streamLabels.runningPower" : mixedPowerSports ? "rides.streamLabels.output" : "rides.streamLabels.power"), unit: "W", color: `color-mix(in srgb, ${variant.chartColors.power} 70%, transparent)`, dotColor: variant.chartColors.power, yAxisID: "yPower", getData: (s) => s.watts },
    { key: "speed", label: t("rides.streamLabels.speed"), unit: "km/h", color: `color-mix(in srgb, ${variant.chartColors.speed} 70%, transparent)`, dotColor: variant.chartColors.speed, yAxisID: "ySpeed", getData: (s) => s.velocity_smooth?.map((value) => Number.isFinite(value) ? value * 3.6 : null) },
    { key: "cadence", label: t("ridePage.overlay.cadence"), unit: "rpm", color: `color-mix(in srgb, ${variant.chartColors.cadence} 70%, transparent)`, dotColor: variant.chartColors.cadence, yAxisID: "yCadence", getData: (s) => s.cadence },
  ], [t, variant, runningPowerOnly, mixedPowerSports]);

  // Which performance overlays are available (at least one rider has data)
  const availablePerfOverlays = useMemo(() => {
    const withStreams = visibleActivities.filter((a) => (chartAxis === "time" ? clockAxes.get(a.id) : streams[a.id]?.distance)?.some(Number.isFinite));
    return PERF_OVERLAY_CONFIGS.filter((cfg) =>
      withStreams.some((a) => {
        const data = cfg.getData(streams[a.id]!);
        return data && data.some(Number.isFinite);
      }),
    );
  }, [visibleActivities, streams, PERF_OVERLAY_CONFIGS, chartAxis, clockAxes]);

  // Build full overlay list for ElevationChart (rider elevations + active performance overlays)
  const fullOverlays = useMemo((): GroupRideOverlay[] => {
    const result = [...(elevationChartData?.overlays ?? [])];

    // 선택된 각 활동의 센서값을 해당 활동의 거리축으로 표시한다.
    const withStreams = visibleActivities.filter((a) => (chartAxis === "time" ? clockAxes.get(a.id) : streams[a.id]?.distance)?.some(Number.isFinite));
    for (const cfg of PERF_OVERLAY_CONFIGS) {
      if (!activeOverlays.has(cfg.key)) continue;
      for (const rider of withStreams) {
        const data = cfg.getData(streams[rider.id]!);
        if (!data?.some(Number.isFinite)) continue;
        result.push({
          key: `${cfg.key}:${rider.id}`,
          label: `${riderLabel(rider)} · ${cfg.key === "power" ? t(getDiscipline(rider.type) === "run" ? "rides.streamLabels.runningPower" : "rides.streamLabels.power") : cfg.label} (${cfg.unit})`,
          data,
          distance: streams[rider.id]?.distance,
          elapsedAxisSec: clockAxes.get(rider.id)?.map(epoch => (epoch - clockOrigin) / 1000),
          color: colorOf(rider),
          yAxisID: cfg.yAxisID,
          borderDash: cfg.key === "speed" ? [8, 3] : cfg.key === "hr" ? [2, 3] : cfg.key === "power" ? [10, 3, 2, 3] : [4, 4],
          unit: cfg.unit,
        });
      }
    }

    return result;
  }, [elevationChartData, visibleActivities, streams, PERF_OVERLAY_CONFIGS, activeOverlays, t, chartAxis, clockAxes, clockOrigin, activityColors]);

  const inspectedIndex = hoverIndex ?? inspectionIndex;
  const inspectedDistance = chartAxis === "distance" && hoverCoordinate != null ? hoverCoordinate * 1000 : inspectedIndex === null ? undefined : elevationChartData?.baseData[inspectedIndex]?.distance;
  const inspectedTime = chartAxis === "time" && hoverCoordinate != null ? clockOrigin + hoverCoordinate * 60_000 : inspectedIndex === null ? undefined : elevationChartData?.baseEpochMs[inspectedIndex];
  const hasInspection = Number.isFinite(chartAxis === "time" ? inspectedTime : inspectedDistance);
  const inspectedRiders = useMemo(() => {
    return visibleActivities.map(activity => {
      const stream = streams[activity.id];
      const distances = stream?.distance;
      let index = -1;
      if (hoverCoordinate == null && inspectedIndex != null && activity.id === elevationChartData?.baseActivityId) {
        index = elevationChartData.baseIndices[inspectedIndex] ?? -1;
      } else if (chartAxis === "time" && Number.isFinite(inspectedTime)) {
        index = nearestClockSample(clockAxes.get(activity.id), inspectedTime!, clockTolerances.get(activity.id));
      } else if (chartAxis === "distance" && Number.isFinite(inspectedDistance) && distances?.length && inspectedDistance! >= distances[0]! && inspectedDistance! <= distances[distances.length - 1]!) {
        let low = 0; let high = distances.length - 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (distances[middle]! < inspectedDistance!) low = middle + 1;
          else high = middle;
        }
        index = low > 0 && Math.abs(distances[low - 1]! - inspectedDistance!) <= Math.abs(distances[low]! - inspectedDistance!) ? low - 1 : low;
      }
      const value = (values?: readonly (number | null)[], scale = 1) => index >= 0 && Number.isFinite(values?.[index]) ? values![index]! * scale : null;
      return { activity, selectedIndex: index, sampleTime: index >= 0 ? clockAxes.get(activity.id)?.[index] : undefined, values: [
        { key: "elevation", label: t("rides.streamLabels.elevation"), unit: "m", value: value(stream?.altitude) },
        ...PERF_OVERLAY_CONFIGS.filter(config => config.key !== "cadence" || activeOverlays.has(config.key)).map(config => ({
          key: config.key,
          label: config.key === "power" ? t(getDiscipline(activity.type) === "run" ? "rides.streamLabels.runningPower" : "rides.streamLabels.power") : config.label,
          unit: config.unit,
          value: value(config.key === "speed" ? stream?.velocity_smooth : stream ? config.getData(stream) : undefined, config.key === "speed" ? 3.6 : 1),
        })),
      ].sort((a, b) => ["hr", "power", "speed", "cadence", "elevation"].indexOf(a.key) - ["hr", "power", "speed", "cadence", "elevation"].indexOf(b.key)) };
    });
  }, [inspectedDistance, inspectedTime, visibleActivities, streams, PERF_OVERLAY_CONFIGS, activeOverlays, t, chartAxis, clockAxes, clockTolerances, hoverCoordinate, inspectedIndex, elevationChartData]);


  const hoverMarkerPosition = useMemo((): [number, number] | null => {
    const base = inspectedRiders.find(row => row.activity.id === elevationChartData?.baseActivityId);
    return base && base.activity.userId === user?.uid && base.selectedIndex >= 0 ? streams[base.activity.id]?.latlng?.[base.selectedIndex] ?? null : null;
  }, [inspectedRiders, elevationChartData, streams, user]);

  const averageViewport = selectedViewport?.axis === chartAxis ? selectedViewport : fullViewport?.axis === chartAxis ? fullViewport : null;
  const intervalReports = useMemo(() => new globalThis.Map(visibleActivities.map(activity => [activity.id, averageViewport ? observedRideRange(streams[activity.id], clockAxes.get(activity.id), {
    axis: chartAxis,
    start: chartAxis === "time" ? clockOrigin + averageViewport.start * 60_000 : averageViewport.start * 1000,
    end: chartAxis === "time" ? clockOrigin + averageViewport.end * 60_000 : averageViewport.end * 1000,
  }) : null])), [visibleActivities, averageViewport, chartAxis, streams, clockAxes, clockOrigin]);
  const coverageDetails = visibleActivities.flatMap(activity => {
    const report = intervalReports.get(activity.id);
    if (!report || report.state === "unavailable") return [`${riderLabel(activity)}: ${t(report?.reason === "distance" ? "ridePage.range.missingDistance" : "ridePage.range.missingClock")}`];
    return (["hr", "power", "speed"] as const).map(key => {
      const metric = report.metrics[key];
      const coverage = metric.fraction == null ? t("ridePage.range.coverageUnknown", { duration: formatElapsedBoundary(Math.round(metric.measuredSec * 10) / 10) }) : t("ridePage.range.coverage", { duration: formatElapsedBoundary(Math.round(metric.measuredSec * 10) / 10), percent: Math.round(metric.fraction * 100) });
      return `${riderLabel(activity)} · ${PERF_OVERLAY_CONFIGS.find(config => config.key === key)?.label}: ${coverage}${report.partialRange ? ` · ${t("ridePage.range.partial")}` : ""}`;
    });
  }).join(". ");

  const hasVisibleStreamErrors = visibleActivities.some(activity => streamErrors.has(activity.id));

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-5 w-32 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />
        <div className="h-80 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} />)}
        </div>
        <div className="h-48 rounded-[var(--r-lg)]" style={{ background: "var(--bg-2)" }} />
      </div>
    );
  }

  if (loadError && activities.length === 0) {
    return <ErrorState title={t("error.loadFailed")} onRetry={refresh} />;
  }

  if (activities.length === 0 && !hasMore) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<SportIcon sport="bike" size={ICON_SIZE.lg} style={{ marginInline: "auto" }} />}
          title={t("empty.rideNotFound")}
          actions={[{ label: t("rides.groupRides"), variant: "primary", href: `/club/${groupId}/rides` }]}
        />
      </div>
    );
  }

  const date = new Date(Math.min(...activities.map((a) => a.startTime)));
  const dateStr = activities.length ? date.toLocaleDateString(localeTag(), { year: "numeric", month: "long", day: "numeric", weekday: "short" }) : "";
  type InspectionRow = (typeof inspectedRiders)[number];
  const comparisonRows: InspectionRow[] = activities.map(activity => inspectedRiders.find(row => row.activity.id === activity.id) ?? { activity, values: [], selectedIndex: -1, sampleTime: undefined });
  const recordLegend = <ChartLegend marker="dot" align="end" aria-label={t("ridePage.selectionTitle")} items={[
    ...visibleActivities.slice(0, 4).map(activity => {
      const hasFlow = elevationChartData?.records.some(record => record.id === activity.id) || fullOverlays.some(overlay => overlay.key?.endsWith(`:${activity.id}`));
      return { seriesId: activity.id, color: hasFlow ? colorOf(activity) : `color-mix(in srgb, ${colorOf(activity)} 30%, transparent)`, label: <span>{riderLabel(activity)}{!hasFlow && <span className="club-ride-legend-state"> · {t(streamErrors.has(activity.id) ? "ridePage.chart.recordFailed" : pendingStreams.has(activity.id) ? "ridePage.chart.recordLoading" : chartAxis === "time" && !clockAxes.get(activity.id) ? "ridePage.chart.recordNoClock" : "ridePage.chart.recordNoFlow")}</span>}</span> };
    }),
    ...(visibleActivities.length > 4 ? [{ seriesId: "additional-records", color: "transparent", label: <span aria-label={t("ridePage.chart.additionalRecords", { count: visibleActivities.length - 4 })} title={t("ridePage.chart.additionalRecords", { count: visibleActivities.length - 4 })}>…</span> }] : []),
  ]} />;
  const inspectionColumns: DataTableColumn<InspectionRow>[] = [
    { id: "record", header: t("ridePage.comparisonTable.name"), rowHeader: true,
      cell: ({ activity }) => <div className="club-ride-record-choice"><Checkbox color={colorOf(activity)} checked={visibleRiders.has(activity.id)} onChange={() => toggleRider(activity.id)} aria-label={t("ridePage.recordCheckbox", { name: riderLabel(activity) })} />
        <div><Link to={`/activity/${activity.id}`} className="club-ride-record-link">{riderLabel(activity)}</Link>{!visibleRiders.has(activity.id) && <Text as="span" variant="caption" tone="tertiary"> · {t("ridePage.recordHidden")}</Text>}</div></div> },
    ...["hr", "power", "speed", ...(activeOverlays.has("cadence") ? ["cadence"] : []), "elevation"].map(key => {
      const config = PERF_OVERLAY_CONFIGS.find(metric => metric.key === key);
      return { id: key, header: `${config?.label ?? t("rides.streamLabels.elevation")} (${config?.unit ?? "m"})`, align: "end" as const,
        cell: ({ activity, values }: InspectionRow) => {
          const value = values.find(item => item.key === key)?.value;
          const metric = key === "hr" || key === "power" || key === "speed" ? intervalReports.get(activity.id)?.metrics[key] : undefined;
          return <span className={key === "elevation" ? "club-ride-secondary-elevation" : undefined}><ChartValue primary={value == null ? "—" : value.toFixed(key === "speed" ? 1 : 0)} secondary={["hr", "power", "speed"].includes(key) ? t("ridePage.range.inlineAverage", { value: metric?.average == null ? "—" : metric.average.toFixed(1) }) : undefined} /></span>;
        } };
    }),
    ...(chartAxis === "time" ? [{ id: "sampleTime", header: t("ridePage.chart.sampleTime"), align: "end" as const,
      cell: ({ sampleTime }: InspectionRow) => sampleTime == null ? "—" : formatClock(sampleTime, true) }] : []),
  ];



  return (
    <div className="club-surface club-ride-detail">
      <Link to={`/club/${groupId}/rides`} className="text-[length:var(--ft-body-medium-size)] mb-4 inline-block" style={{ color: "var(--lime)" }}>{t("ridePage.back")}</Link>
      {group?.name && <p className="club-ride-context">{group.name}</p>}
      <Text as="h1" variant="pageTitle" data-testid="C2R-0" className="mb-1">{dateStr} {t("rides.groupRides")}</Text>
      <p className="text-[length:var(--ft-body-medium-size)] mb-2" style={{ color: "var(--ink-2)" }}>{t("ridePage.activityParticipants", { activities: activities.length, participants: riderActivityCounts.size })}</p>
      <p className="club-record-scope" data-testid="club-ride-detail-scope">{t("ridePage.detailScope")}</p>

      <p>{t("ridePage.discoveryScope")}</p>
      {loadError && <p role="alert">{t("error.loadFailed")}</p>}
      {hasMore && <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{t(loadingMore ? "ridePage.discoveryLoading" : "ridePage.discoveryMore")}</Button>}
      {limited && <p>{t("ridePage.discoveryLimited")}</p>}
      <Button variant="ghost" disabled={loading || loadingMore} onClick={refresh}>{t("ridePage.discoveryRefresh")}</Button>
      {pendingStreams.size > 0 && <p role="status">{t("rides.streamLoading")}</p>}
      {streamErrors.size > 0 && <Card className="mb-4">
        <p role="alert">{t("rides.streamFailed")}</p>
        <Button variant="secondary" disabled={pendingStreams.size > 0} onClick={() => {
          streamErrors.forEach(id => requestedStreams.current.delete(id));
          setStreamErrors(new Set());
          setStreamRetry(value => value + 1);
        }}>{t("invite.retry")}</Button>
      </Card>}
      <div className="club-ride-content">
          <section className="club-ride-selection" aria-labelledby="ride-selection-heading">
            <Text as="h2" variant="subtitle" id="ride-selection-heading" className="mb-3">{t("ridePage.selectionTitle")}</Text>
            <p className="club-ride-section-note">{t("ridePage.selectionScope", { count: visibleRiders.size, total: activities.length })}</p>
            <ToggleControls aria-label={t("ridePage.selectionTitle")}>
              {activities.map(a => <ToggleButton data-testid="C2R-0-1" key={a.id}
                selected={visibleRiders.has(a.id)} onClick={() => toggleRider(a.id)}
                aria-label={t(visibleRiders.has(a.id) ? "ridePage.hideRider" : "ridePage.showRider", { name: riderLabel(a) })}>
                {riderLabel(a)}
              </ToggleButton>)}
            </ToggleControls>
          </section>
        <div className="min-w-0">
          {/* 루트 맵 - 전체 참가자 경로 표시 (항상 렌더링, 바운드만 필요) */}
          {mapBounds && (
            <div ref={mapFrameRef} id={mapId} data-testid="C2R-1" className="club-ride-map" data-map-expanded={mapExpanded}>
              <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                mapStyle={MAP_STYLE}
                initialViewState={{ bounds: mapBounds, fitBoundsOptions: { padding: 30 } }}
                onLoad={(e) => applyKoreaCyclingStyle(e.target)}
                interactive={true}
                scrollZoom={true}
                dragPan={true}
                dragRotate={false}
                doubleClickZoom={true}
                touchZoomRotate={true}
                attributionControl={false}
                style={{ width: "100%", height: "100%" }}
              >
                {visibleRouteGeoJSONs.map((route) => (
                  <Source key={route.id} type="geojson" data={route.geojson}>
                    <Layer
                      id={`route-glow-${route.id}`}
                      type="line"
                      paint={{
                        "line-color": route.color,
                        "line-width": 8,
                        "line-opacity": highlightedRange ? 0.04 : 0.3,
                      }}
                      layout={{ "line-cap": "round", "line-join": "round" }}
                    />
                    <Layer id={`route-casing-${route.id}`} type="line"
                      paint={{ "line-color": FUNCTIONAL_COLORS.map.routeCasing, "line-width": 5, "line-opacity": darkMapCasing ? highlightedRange ? 0.2 : 0.85 : 0 }}
                      layout={{ "line-cap": "round", "line-join": "round" }} />
                    <Layer
                      id={`route-main-${route.id}`}
                      type="line"
                      paint={{
                        "line-color": route.color,
                        "line-width": 3,
                        "line-opacity": highlightedRange ? 0.2 : 0.9,
                      }}
                      layout={{ "line-cap": "round", "line-join": "round" }}
                    />
                  </Source>
                ))}
                {highlightedRouteGeoJSONs.map(route => (
                  <Source key={`range-${route.id}`} id={`range-source-${route.id}`} type="geojson" data={route.geojson}>
                    <Layer id={`range-glow-${route.id}`} type="line" paint={{ "line-color": route.color, "line-width": 10, "line-opacity": 0.2 }} layout={{ "line-cap": "round", "line-join": "round" }} />
                    <Layer id={`range-casing-${route.id}`} type="line"
                      paint={{ "line-color": FUNCTIONAL_COLORS.map.routeCasing, "line-width": 7, "line-opacity": darkMapCasing ? 0.9 : 0 }}
                      layout={{ "line-cap": "round", "line-join": "round" }} />
                    <Layer id={`range-main-${route.id}`} type="line" paint={{ "line-color": route.color, "line-width": 5, "line-opacity": 0.95 }} layout={{ "line-cap": "round", "line-join": "round" }} />
                  </Source>
                ))}
                {hoverMarkerPosition && (
                  <Marker
                    longitude={hoverMarkerPosition[1]}
                    latitude={hoverMarkerPosition[0]}
                    anchor="center"
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        border: "2px solid white",
                        boxShadow: "0 0 4px color-mix(in srgb, var(--bg-0) 30%, transparent)",
                      }}
                    />
                  </Marker>
                )}
              </Map>
              <MapResizeControls expanded={mapExpanded} controlsId={mapId} expandLabel={t("ridePage.map.expand")} collapseLabel={t("ridePage.map.collapse")} onToggle={() => setMapExpanded(value => !value)} />
              <MapNavigation orientation="horizontal"><MapControlButton aria-label={t("ridePage.map.fit")} onClick={() => mapRef.current?.fitBounds(mapBounds, { padding: 30 })}><LocateFixed size={ICON_SIZE.md} />{t("ridePage.map.fit")}</MapControlButton></MapNavigation>
            </div>
          )}

          {highlightedRange && <p className="club-ride-section-note" role="status">{t("ridePage.map.selectedRange")}</p>}
          {visibleRiders.size === 0 && <p role="status" className="club-ride-empty">{t("ridePage.noneSelected")}</p>}
          {visibleRiders.size > 0 && visibleRouteGeoJSONs.every(route => route.geojson.geometry.coordinates.length === 0) && pendingStreams.size === 0 && !hasVisibleStreamErrors && <p className="club-ride-empty">{t("ridePage.noRoute")}</p>}
          {visibleRiders.size > 0 && !elevationChartData && pendingStreams.size === 0 && !hasVisibleStreamErrors && <p className="club-ride-section-note">{t(chartAxis === "time" ? "ridePage.chart.noClock" : "ridePage.noElevation")}</p>}
          <ToggleControls variant="axis" aria-label={t("ridePage.chart.axisChoice")}>
            {(["distance", "time"] as const).map(axis => <ToggleButton key={axis} selected={chartAxis === axis} onClick={() => { setChartAxis(axis); setSelectedViewport(null); setFullViewport(null); setHoverCoordinate(null); dismissedCoordinate.current = null; dismissedInspectionIndex.current = null; setHoverIndex(null); setInspectionIndex(null); }}>{t(axis === "time" ? "ridePage.chart.timeMode" : "ridePage.chart.distanceMode")}</ToggleButton>)}
          </ToggleControls>
          {/* 고도 & 성능 차트 */}
            <Card data-testid={elevationChartData ? "C2R-2" : undefined} className="mb-8">
              <ChartHeader size="compact" className="mb-3" title={<Text as="h2" variant="subtitle">{t("ridePage.elevationAndPerf")}</Text>} />

              <p className="club-ride-section-note">{t(chartAxis === "time" ? "ridePage.chart.timeCoverage" : "ridePage.chart.coverage", { selected: visibleActivities.length, count: elevationChartData?.records.length ?? 0 })}</p>
              <p className="club-ride-section-note"><InfoTip activation="click" tone="accent" content={t(chartAxis === "time" ? "ridePage.chart.timeHelp" : "ridePage.chart.distanceHelp")}>{t(chartAxis === "time" ? "ridePage.chart.timeBasis" : "ridePage.chart.distanceBasis", { timezone: clockZone })}</InfoTip>{elevationChartData && <> · {t("ridePage.chart.baseRecord", { name: elevationChartData.baseName })}</>}</p>
              <GroupRideOverlayControls
                overlays={availablePerfOverlays}
                activeOverlays={activeOverlays}
                onToggle={toggleOverlay}
                elevationLabel={t("ridePage.chart.elevationBackground")}
              />

              {visibleActivities.length > 0 && <p id="ride-chart-inspection-hint" className="text-[length:var(--ft-body-small-size)] mb-2" style={{ color: "var(--ink-2)" }}>{t("ridePage.chart.inspectHint")}</p>}
              <div ref={inspectionChartRef} tabIndex={visibleActivities.length > 0 ? 0 : undefined} role="group" aria-label={t("ridePage.elevationAndPerf")} aria-describedby={visibleActivities.length > 0 ? "ride-chart-inspection-hint" : undefined}
                className="relative rounded-[var(--r-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onPointerDown={event => { if (event.pointerType === "touch") event.currentTarget.focus({ preventScroll: true }); }}
                onFocus={event => { if (elevationChartData && event.target === event.currentTarget) { setInspectionIndex(hoverIndex ?? 0); setHoverIndex(hoverIndex ?? 0); } }}
                onKeyDown={event => {
                  if (event.key === "Escape") {
                    event.preventDefault(); event.stopPropagation();
                    event.currentTarget.focus({ preventScroll: true });
                    dismissedInspectionIndex.current = inspectedIndex;
                    dismissedCoordinate.current = hoverCoordinate; setHoverCoordinate(null);
                    setInspectionIndex(null); setHoverIndex(null);
                    return;
                  }
                  if (!elevationChartData || event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const last = elevationChartData.baseData.length - 1;
                  const current = inspectedIndex ?? 0;
                  const next = event.key === "Home" ? 0 : event.key === "End" ? last : Math.max(0, Math.min(last, current + (event.key === "ArrowLeft" ? -1 : 1)));
                  dismissedInspectionIndex.current = null;
                  setHoverCoordinate(null); dismissedCoordinate.current = null;
                  setHoverIndex(next); setInspectionIndex(next);
                }}>
              {elevationChartData && <GroupRidePerformanceChart
                data={elevationChartData.baseData}
                baseLabel={t("ridePage.elevationOf", { name: elevationChartData.baseName })}
                baseColor={elevationChartData.baseColor}
                xAxis={chartAxis === "time" ? "elapsed" : "distance"}
                elapsedAxisSec={chartAxis === "time" ? elevationChartData.baseElapsedAxisSec : undefined}
                formatXAxisTick={chartAxis === "time" ? formatChartTick : undefined}
                formatRangeValue={chartAxis === "time" ? formatChartRange : undefined}
                xAxisLabel={t(chartAxis === "time" ? "ridePage.chart.timeMode" : "rides.streamLabels.distanceAxis")}
                activeMetrics={activeOverlays}
                beforePlot={recordLegend}
                powerLabel={PERF_OVERLAY_CONFIGS.find(config => config.key === "power")?.label}
                selectedCoordinate={hasInspection ? chartAxis === "time" ? (inspectedTime! - clockOrigin) / 60_000 : inspectedDistance! / 1000 : null}
                onHoverCoordinate={handleHoverCoordinate}
                onViewportChange={handleViewportChange}
                onHoverIndex={handleElevHover}
                overlays={fullOverlays.length > 0 ? fullOverlays : undefined}
              />}
              <Section data-testid="ride-chart-inspection" role="group" headingId="ride-chart-comparison-heading" headingLevel={3}
                title={t("ridePage.chart.comparisonTitle")}
                description={visibleActivities.length > 0 ? <span className="club-ride-inspection-coordinate">{hasInspection ? chartAxis === "time" ? `${formatClock(inspectedTime!, true)} · ${clockZone}` : `${t("rides.streamLabels.distanceAxis")} · ${(inspectedDistance! / 1000).toFixed(2)}` : t("ridePage.chart.selectSample")}</span> : undefined}
                onPointerDown={event => event.stopPropagation()}
                className="club-ride-chart-comparison"
                actions={<IconButton variant="ghost" size="sm" icon={<X aria-hidden="true" />} disabled={!hasInspection} aria-label={t("common:button.close")} onClick={event => {
                  event.stopPropagation(); inspectionChartRef.current?.focus({ preventScroll: true });
                  dismissedInspectionIndex.current = inspectedIndex; dismissedCoordinate.current = hoverCoordinate; setHoverCoordinate(null); setInspectionIndex(null); setHoverIndex(null);
                }} />}>
                {visibleActivities.length > 0 && <p className="club-ride-section-note" data-testid="ride-range-context">{t(selectedViewport ? "ridePage.range.visibleScope" : "ridePage.range.fullScope")}{averageViewport && <> · {chartAxis === "time" ? t("ridePage.range.clockContext", { start: formatChartRange(averageViewport.start), end: formatChartRange(averageViewport.end), duration: formatElapsedBoundary(Math.round((averageViewport.end - averageViewport.start) * 600) / 10), timezone: clockZone }) : t("ridePage.range.distanceContext", { start: averageViewport.start.toFixed(2), end: averageViewport.end.toFixed(2), width: (averageViewport.end - averageViewport.start).toFixed(2) })}</>}</p>}
                <DataTable caption={t("ridePage.chart.pointTitle")} captionVisibility="screen-reader" rowHeaderWidth="selectable" columns={inspectionColumns}
                  rows={comparisonRows} rowKey={row => row.activity.id} emptyLabel={t(visibleRiders.size === 0 ? "ridePage.noneSelected" : "ridePage.chart.selectSample")} />
                {visibleActivities.length > 0 && <p className="club-ride-section-note"><InfoTip activation="click" tone="accent" label={t("ridePage.range.methodTitle")} title={t("ridePage.range.methodTitle")} content={`${t("ridePage.range.definition")} ${t(chartAxis === "time" ? "ridePage.range.timeBasis" : "ridePage.range.distanceBasis")} ${t(chartAxis === "time" ? "ridePage.chart.timeSampleBasis" : "ridePage.chart.sampleBasis")} ${t("ridePage.missingMetric")} ${coverageDetails}`}>{t("ridePage.range.methodTrigger")}</InfoTip> · {t("ridePage.range.shortDefinition")}</p>}
              </Section>
              </div>
            </Card>

        </div>

      </div>
          {ridePhotos.length > 0 && (
            <Card className="mb-8">
              <Section title={t("ridePage.photos.title")} actions={<Text variant="bodySmall" tone="tertiary">{t("ridePage.photos.count", { count: ridePhotos.length })}</Text>}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ridePhotos.map((photo, index) => (
                  <figure key={`${photo.activityId}-${photo.id}-${index}`} style={{ margin: 0 }}>
                    <a data-testid="C2R-4-1" href={photo.url ?? undefined} target="_blank" rel="noreferrer" aria-label={t("ridePage.photos.open", { name: photo.riderName })}>
                      <img src={photo.url ?? ""} alt={photo.caption ?? t("ridePage.photos.alt", { name: photo.riderName })} loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid var(--line-soft)" }} />
                    </a>
                    <figcaption className="text-[length:var(--fs-xs)] mt-1 truncate" style={{ color: "var(--ink-3)" }}>
                      {photo.riderName}{photo.caption ? ` · ${photo.caption}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
              </Section>
            </Card>
          )}
    </div>
  );
}
