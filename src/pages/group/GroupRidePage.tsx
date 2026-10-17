import { X } from "lucide-react";
import SportIcon from "../../components/common/SportIcon";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localeTag } from "../../utils/localeDate";
import { getDiscipline } from "../../utils/disciplineFilter";
import GlossaryText from "../../components/common/GlossaryText";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import {
  collection, query, where, getDocs, doc, getDoc,
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
import { getStreamPhotos } from "../../features/activity/detail/activityDetailDerived";

import Map, { Source, Layer, Marker } from "react-map-gl/mapbox";
import type { LngLatBoundsLike } from "mapbox-gl";
import { getMapboxToken, MAP_STYLE, applyKoreaCyclingStyle } from "../../utils/mapbox";
import { decodeTrack } from "../../utils/polyline";
import { getBounds } from "../../components/RouteMap";

import ElevationChart from "../../components/ElevationChart";
import type { OverlayDataset } from "../../components/ElevationChart";
import ComparisonChart from "../../components/ComparisonChart";
import { EmptyState, ErrorState } from "../../components/redesign";
import { Button, Card } from "../../theme/components";
import { useOriderTheme } from "../../theme";
import { GroupRideOverlayControls } from "./GroupRideOverlayControls";

const RIDER_COLORS = [
  "#f97316", "#3b82f6", "#22c55e", "#ef4444", "#a855f7",
  "#06b6d4", "#f59e0b", "#ec4899",
];

export default function GroupRidePage() {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation(["group", "common"]);
  const { groupId, rideId } = useParams();
  const { user } = useAuth();
  const { group } = useGroup(groupId);
  const { variant } = useOriderTheme();
  const [loadedActivities, setActivities] = useState<Activity[]>([]);
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
  const riderLabel = (activity: Activity) => (riderActivityCounts.get(activity.userId) ?? 0) > 1
    ? t("ridePage.riderActivity", { name: activity.nickname, distance: (activity.summary.distance / 1000).toFixed(1) })
    : activity.nickname;
  const [streams, setStreams] = useState<Record<string, ActivityStreams>>({});
  const [streamErrors, setStreamErrors] = useState<Set<string>>(new Set());
  const [pendingStreams, setPendingStreams] = useState<Set<string>>(new Set());
  const [streamRetry, setStreamRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [visibleRiders, setVisibleRiders] = useState<Set<string>>(new Set());
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [inspectionIndex, setInspectionIndex] = useState<number | null>(null);
  const inspectionChartRef = useRef<HTMLDivElement>(null);
  const requestedStreams = useRef(new Set<string>());
  const runningPowerOnly = activities.length > 0 && activities.every(activity => getDiscipline(activity.type) === "run");
  const mixedPowerSports = activities.some(activity => getDiscipline(activity.type) === "run") && !runningPowerOnly;

  // Fetch activities for this group ride
  // groupRideId는 시간 겹침 기반 자동 매칭 — 그룹 멤버 여부와 무관.
  // 사전 그룹 + 현장 동행을 함께 표시하는 것이 의도된 동작.
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    requestedStreams.current.clear();
    setStreams({});
    setStreamErrors(new Set());
    setPendingStreams(new Set());
    setActivities([]);
    setVisibleRiders(new Set());
    setLoading(true);
    setLoadError(false);

    const everyoneQuery = query(
      collection(firestore, "activities"),
      where("groupRideId", "==", rideId),
      where("deletedAt", "==", null),
      where("visibility", "==", "everyone"),
    );

    const fetchActivities = async () => {
      try {
        const everyoneSnap = await getDocs(everyoneQuery);
        if (cancelled) return;
        const acts = everyoneSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Activity)
          .filter((a) => a.summary != null);

        if (user) {
          const myQuery = query(
            collection(firestore, "activities"),
            where("groupRideId", "==", rideId),
            where("userId", "==", user.uid),
          );
          const mySnap = await getDocs(myQuery);
          if (cancelled) return;
          mySnap.docs.forEach((d) => {
            const a = { id: d.id, ...d.data() } as Activity;
            if (!a.deletedAt && a.summary != null && !acts.some((e) => e.id === a.id)) {
              acts.push(a);
            }
          });
        }

        setActivities(acts);
        setVisibleRiders(new Set(acts.map((a) => a.id)));
      } catch (err) {
        if (!cancelled) {
          logClientError("GroupRidePage.fetchActivities", err, { rideId });
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchActivities();
    return () => { cancelled = true; };
  }, [rideId, user?.uid, retry]);

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

  // 스트림은 활동 원본에만 의존한다. 공개 이름 보강은 진행 중 요청을 취소하지 않는다.
  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && auth.currentUser?.uid === user?.uid;
    loadedActivities.forEach(async (a) => {
      if (requestedStreams.current.has(a.id)) return;
      requestedStreams.current.add(a.id);
      if (a.source !== "orider" && !(a.source === "strava" && a.stravaActivityId)) return;
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
        } else if (a.source === "orider") {
          // Orider 활동은 activity_streams/{activityId}에서 직접 읽는다. 함께 탄 다른 라이더가
          // 심박·파워를 숨겨 직접 읽기가 막히면, 숨긴 채널을 빼 주는 스트림 API 로 받는다.
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
          if (streamSnap.exists()) {
            const data = streamSnap.data();
            if (typeof data.json === "string") {
              setStreams((prev) => ({ ...prev, [a.id]: JSON.parse(data.json) as ActivityStreams }));
            } else if (data.latlng || data.altitude || data.velocity_smooth) {
              setStreams((prev) => ({ ...prev, [a.id]: data as ActivityStreams }));
            }
          }
        }
      } catch (err) {
        if (isCurrent()) {
          setStreamErrors(previous => new Set(previous).add(a.id));
          logClientError("GroupRidePage.loadStream", err, { activityId: a.id, rideId });
        }
      } finally {
        if (isCurrent()) setPendingStreams(previous => {
          const next = new Set(previous); next.delete(a.id); return next;
        });
      }
    });
    return () => { cancelled = true; };
  }, [loadedActivities, rideId, streamRetry, user?.uid]);

  const toggleRider = (activityId: string) => {
    setVisibleRiders((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
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
        .map((photo) => ({ ...photo, activityId: activity.id, riderName: activity.nickname })),
    );
  }, [activities, group?.toggles?.ridePhotos, streams]);

  // ── Multi-route map data (ALL activities for stable bounds) ──
  const allRouteGeoJSONs = useMemo(() => {
    return activities.map((a, idx) => {
      const color = RIDER_COLORS[idx % RIDER_COLORS.length]!;
      let positions: [number, number][] = [];

      const s = streams[a.id];
      if (s?.latlng && s.latlng.length > 0) {
        positions = s.latlng;
      } else if (a.thumbnailTrack) {
        positions = decodeTrack(a.thumbnailTrack) as [number, number][];
      }

      if (positions.length === 0) return null;

      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: positions.map(([lat, lng]) => [lng, lat]),
        },
      };

      return { id: a.id, geojson, color, positions };
    }).filter(Boolean) as { id: string; geojson: GeoJSON.Feature<GeoJSON.LineString>; color: string; positions: [number, number][] }[];
  }, [activities, streams]);

  // Bounds from ALL routes (stable — does not change on rider toggle)
  const mapBounds = useMemo((): LngLatBoundsLike | null => {
    const allPositions = allRouteGeoJSONs.flatMap((r) => r.positions);
    if (allPositions.length === 0) return null;
    return getBounds(allPositions);
  }, [allRouteGeoJSONs]);

  // Visible routes (for display — changes on rider toggle)
  const visibleRouteGeoJSONs = useMemo(() => {
    return allRouteGeoJSONs.filter((r) => visibleRiders.has(r.id));
  }, [allRouteGeoJSONs, visibleRiders]);

  // ── Hover marker: position from first visible rider's stream ──
  const handleElevHover = useCallback((index: number | null) => {
    // The chart canvas leaves before the pointer reaches the scrollable inspector.
    // Dismiss at the containing region boundary instead.
    if (index === null) return;
    setHoverIndex(index);
    setInspectionIndex(null);
  }, []);

  const hoverMarkerPosition = useMemo((): [number, number] | null => {
    if (hoverIndex == null) return null;
    const firstVisible = visibleActivities.find((a) => streams[a.id]?.altitude && streams[a.id]?.distance);
    if (!firstVisible) return null;
    const latlng = streams[firstVisible.id]?.latlng;
    if (!latlng) return null;
    // hoverIndex is based on the elevation chart's sampled data (baseData),
    // which uses distance array indices from the first visible rider's stream.
    if (hoverIndex >= latlng.length) return null;
    return latlng[hoverIndex] ?? null;
  }, [hoverIndex, visibleActivities, streams]);

  // ── ElevationChart: first visible rider as base, others as overlays ──
  const elevationChartData = useMemo(() => {
    const withStreams = visibleActivities.filter((a) => streams[a.id]?.altitude && streams[a.id]?.distance);
    if (withStreams.length === 0) return null;

    const baseActivity = withStreams[0]!;
    const baseStream = streams[baseActivity.id]!;
    const baseData = (baseStream.distance ?? []).map((d, i) => ({
      distance: d,
      elevation: baseStream.altitude?.[i] ?? 0,
    }));

    // Other riders as elevation overlays
    const overlays: OverlayDataset[] = [];
    for (let ri = 1; ri < withStreams.length; ri++) {
      const a = withStreams[ri]!;
      const s = streams[a.id]!;
      const actIdx = activities.indexOf(a);
      const color = RIDER_COLORS[actIdx % RIDER_COLORS.length]!;
      if (s.altitude) {
        overlays.push({
          label: t("ridePage.elevationOf", { name: a.nickname }),
          data: s.altitude,
          distance: s.distance,
          color,
          yAxisID: `yElev_${ri}`,
          unit: "m",
        });
      }
    }

    return { baseData, overlays, baseName: baseActivity.nickname };
  }, [visibleActivities, streams, activities]);

  // ── Performance overlay configs (speed, HR, power, cadence) ──
  interface OverlayConfig {
    key: string;
    label: string;
    unit: string;
    color: string;
    dotColor: string;
    yAxisID: string;
    getData: (s: ActivityStreams) => number[] | undefined;
  }

  const PERF_OVERLAY_CONFIGS: OverlayConfig[] = useMemo(() => [
    { key: "speed", label: t("rides.streamLabels.speed"), unit: "km/h", color: `color-mix(in srgb, ${variant.chartColors.speed} 70%, transparent)`, dotColor: variant.chartColors.speed, yAxisID: "ySpeed", getData: (s) => s.velocity_smooth?.map((v) => v * 3.6) },
    { key: "hr", label: t("rides.streamLabels.hr"), unit: "bpm", color: `color-mix(in srgb, ${variant.chartColors.heartRate} 70%, transparent)`, dotColor: variant.chartColors.heartRate, yAxisID: "yHR", getData: (s) => s.heartrate },
    { key: "power", label: t(runningPowerOnly ? "rides.streamLabels.runningPower" : mixedPowerSports ? "rides.streamLabels.output" : "rides.streamLabels.power"), unit: "W", color: `color-mix(in srgb, ${variant.chartColors.power} 70%, transparent)`, dotColor: variant.chartColors.power, yAxisID: "yPower", getData: (s) => s.watts },
    { key: "cadence", label: t("ridePage.overlay.cadence"), unit: "rpm", color: `color-mix(in srgb, ${variant.chartColors.cadence} 70%, transparent)`, dotColor: variant.chartColors.cadence, yAxisID: "yCadence", getData: (s) => s.cadence },
  ], [t, variant, runningPowerOnly, mixedPowerSports]);

  // Which performance overlays are available (at least one rider has data)
  const availablePerfOverlays = useMemo(() => {
    const withStreams = visibleActivities.filter((a) => streams[a.id]?.distance?.some(Number.isFinite));
    return PERF_OVERLAY_CONFIGS.filter((cfg) =>
      withStreams.some((a) => {
        const data = cfg.getData(streams[a.id]!);
        return data && data.some((v) => v > 0);
      }),
    );
  }, [visibleActivities, streams, PERF_OVERLAY_CONFIGS]);

  // Build full overlay list for ElevationChart (rider elevations + active performance overlays)
  const fullOverlays = useMemo((): OverlayDataset[] => {
    const result = [...(elevationChartData?.overlays ?? [])];

    // Add performance overlays from the first visible rider with that data
    const withStreams = visibleActivities.filter((a) => streams[a.id]?.distance?.some(Number.isFinite));
    for (const cfg of PERF_OVERLAY_CONFIGS) {
      if (!activeOverlays.has(cfg.key)) continue;
      // Use the first rider that has this data
      const rider = withStreams.find((a) => {
        const data = cfg.getData(streams[a.id]!);
        return data && data.some((v) => v > 0);
      });
      if (!rider) continue;
      const data = cfg.getData(streams[rider.id]!)!;
      result.push({
        label: `${cfg.key === "power" ? t(getDiscipline(rider.type) === "run" ? "rides.streamLabels.runningPower" : "rides.streamLabels.power") : cfg.label} (${cfg.unit})`,
        data,
        distance: streams[rider.id]?.distance,
        color: cfg.color,
        yAxisID: cfg.yAxisID,
        unit: cfg.unit,
      });
    }

    return result;
  }, [elevationChartData, visibleActivities, streams, PERF_OVERLAY_CONFIGS, activeOverlays, t]);

  const inspectedIndex = hoverIndex ?? inspectionIndex;
  const inspectedDistance = inspectedIndex === null ? undefined : elevationChartData?.baseData[inspectedIndex]?.distance;
  const inspectedRiders = useMemo(() => {
    if (!Number.isFinite(inspectedDistance)) return [];
    return visibleActivities.map(activity => {
      const stream = streams[activity.id];
      const distances = stream?.distance;
      let index = -1;
      if (distances?.length && inspectedDistance! >= distances[0]! && inspectedDistance! <= distances[distances.length - 1]!) {
        let low = 0; let high = distances.length - 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (distances[middle]! < inspectedDistance!) low = middle + 1;
          else high = middle;
        }
        index = low > 0 && Math.abs(distances[low - 1]! - inspectedDistance!) <= Math.abs(distances[low]! - inspectedDistance!) ? low - 1 : low;
      }
      const value = (values?: number[], scale = 1) => index >= 0 && Number.isFinite(values?.[index]) ? values![index]! * scale : null;
      return { activity, values: [
        { key: "elevation", label: t("rides.streamLabels.elevation"), unit: "m", value: value(stream?.altitude) },
        ...PERF_OVERLAY_CONFIGS.filter(config => activeOverlays.has(config.key)).map(config => ({
          key: config.key,
          label: config.key === "power" ? t(getDiscipline(activity.type) === "run" ? "rides.streamLabels.runningPower" : "rides.streamLabels.power") : config.label,
          unit: config.unit,
          value: value(config.key === "speed" ? stream?.velocity_smooth : stream ? config.getData(stream) : undefined, config.key === "speed" ? 3.6 : 1),
        })),
      ] };
    });
  }, [inspectedDistance, visibleActivities, streams, PERF_OVERLAY_CONFIGS, activeOverlays, t]);

  // ── ComparisonChart data ──
  const comparisonCharts = useMemo(() => {
    if (activities.length < 2) return [];

    const riders = activities.map((a, i) => ({
      label: a.nickname,
      color: RIDER_COLORS[i % RIDER_COLORS.length]!,
      // 가상파워 fallback: summary.averagePower/normalizedPower가 비었으면 활동 top-level 사용
      summary: {
        ...a.summary,
        averagePower: a.summary.averagePower ?? a.avgPower ?? null,
        normalizedPower: a.summary.normalizedPower ?? a.weightedAvgPower ?? null,
      },
    }));

    const charts: { title: string; labels: string[]; datasets: { label: string; data: (number | null)[]; color: string }[]; unit: string }[] = [];

    // Distance
    charts.push({
      title: t("rides.comparisonLabels.distance"),
      labels: [t("rides.comparisonLabels.distance")],
      datasets: riders.map((r) => ({
        label: r.label,
        data: [parseFloat((r.summary.distance / 1000).toFixed(1))],
        color: r.color,
      })),
      unit: " km",
    });

    // Avg speed
    charts.push({
      title: t("rides.comparisonLabels.speed"),
      labels: [t("rides.comparisonLabels.speed")],
      datasets: riders.map((r) => ({
        label: r.label,
        data: [parseFloat(r.summary.averageSpeed.toFixed(1))],
        color: r.color,
      })),
      unit: " km/h",
    });

    // Avg HR (only if at least one rider has it)
    if (riders.some((r) => r.summary.averageHeartRate)) {
      charts.push({
        title: t("rides.comparisonLabels.hr"),
        labels: [t("rides.comparisonLabels.hr")],
        datasets: riders.map((r) => ({
          label: r.label,
          data: [r.summary.averageHeartRate ?? null],
          color: r.color,
        })),
        unit: " bpm",
      });
    }

    // Avg power (only if at least one rider has it)
    if (riders.some((r) => r.summary.averagePower)) {
      charts.push({
        title: t(runningPowerOnly ? "rides.comparisonLabels.runningPower" : mixedPowerSports ? "rides.comparisonLabels.output" : "rides.comparisonLabels.power"),
        labels: [t(runningPowerOnly ? "rides.comparisonLabels.runningPower" : mixedPowerSports ? "rides.comparisonLabels.output" : "rides.comparisonLabels.power")],
        datasets: riders.map((r) => ({
          label: r.label,
          data: [r.summary.averagePower ?? null],
          color: r.color,
        })),
        unit: " W",
      });
    }

    return charts;
  }, [activities, t, runningPowerOnly, mixedPowerSports]);

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

  if (loadError) {
    return <ErrorState title={t("error.loadFailed")} onRetry={() => setRetry(value => value + 1)} />;
  }

  if (activities.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon={<SportIcon sport="bike" size={24} style={{ marginInline: "auto" }} />}
          title={t("empty.rideNotFound")}
          actions={[{ label: t("rides.groupRides"), variant: "primary", href: `/club/${groupId}/rides` }]}
        />
      </div>
    );
  }

  const date = new Date(Math.min(...activities.map((a) => a.startTime)));
  const dateStr = date.toLocaleDateString(localeTag(), { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="club-surface club-ride-detail">
      <Link to={`/club/${groupId}/rides`} className="text-[length:var(--ft-body-medium-size)] mb-4 inline-block" style={{ color: "var(--lime)" }}>{t("ridePage.back")}</Link>
      <h1 data-testid="C2R-0" className="text-[length:var(--fs-xl)] font-bold mb-1" style={{ color: "var(--ink-0)" }}>{dateStr} {t("rides.groupRides")}</h1>
      <p className="text-[length:var(--ft-body-medium-size)] mb-6" style={{ color: "var(--ink-2)" }}>{t("ridePage.activityParticipants", { activities: activities.length, participants: riderActivityCounts.size })}</p>
      <p className="club-record-scope" data-testid="club-ride-detail-scope">{t("ridePage.detailScope")}</p>

      {pendingStreams.size > 0 && <p role="status">{t("rides.streamLoading")}</p>}
      {streamErrors.size > 0 && <Card className="mb-4">
        <p role="alert">{t("rides.streamFailed")}</p>
        <Button variant="secondary" disabled={pendingStreams.size > 0} onClick={() => {
          streamErrors.forEach(id => requestedStreams.current.delete(id));
          setStreamErrors(new Set());
          setStreamRetry(value => value + 1);
        }}>{t("invite.retry")}</Button>
      </Card>}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* 루트 맵 - 전체 참가자 경로 표시 (항상 렌더링, 바운드만 필요) */}
          {mapBounds && (
            <div data-testid="C2R-1" className="mb-8 rounded-[var(--r-lg)] overflow-hidden h-80 sm:h-96">
              <Map
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
                {visibleRouteGeoJSONs.map((route, idx) => (
                  <Source key={route.id} type="geojson" data={route.geojson}>
                    <Layer
                      id={`route-glow-${idx}`}
                      type="line"
                      paint={{
                        "line-color": route.color,
                        "line-width": 8,
                        "line-opacity": 0.3,
                      }}
                      layout={{ "line-cap": "round", "line-join": "round" }}
                    />
                    <Layer
                      id={`route-main-${idx}`}
                      type="line"
                      paint={{
                        "line-color": route.color,
                        "line-width": 3,
                        "line-opacity": 0.9,
                      }}
                      layout={{ "line-cap": "round", "line-join": "round" }}
                    />
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
            </div>
          )}

          {/* 고도 & 성능 차트 */}
          {elevationChartData && (
            <Card data-testid="C2R-2" padding="none" className="p-5 mb-8" style={{ borderRadius: "var(--r-md)" }}>
              <h3 className="text-[length:var(--ft-title-size)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>
                {availablePerfOverlays.length > 0 ? t("ridePage.elevationAndPerf") : t("ridePage.elevationProfile")}
              </h3>

              <GroupRideOverlayControls
                overlays={availablePerfOverlays}
                activeOverlays={activeOverlays}
                onToggle={toggleOverlay}
                elevationLabel={t("rides.streamLabels.elevation")}
              />

              <p id="ride-chart-inspection-hint" className="text-[length:var(--ft-body-size)] mb-2" style={{ color: "var(--ink-2)" }}>{t("ridePage.chart.inspectHint")}</p>
              <div ref={inspectionChartRef} tabIndex={0} role="group" aria-label={t("ridePage.elevationAndPerf")} aria-describedby="ride-chart-inspection-hint"
                className="relative rounded-[var(--r-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onPointerDown={event => { if (event.pointerType === "touch") event.currentTarget.focus({ preventScroll: true }); }}
                onPointerLeave={event => { if (event.pointerType !== "touch") { setInspectionIndex(null); setHoverIndex(null); } }}
                onFocus={event => { if (event.target === event.currentTarget) { setInspectionIndex(hoverIndex ?? 0); setHoverIndex(hoverIndex ?? 0); } }}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setInspectionIndex(null); setHoverIndex(null); } }}
                onKeyDown={event => {
                  if (event.key === "Escape") {
                    event.preventDefault(); event.stopPropagation();
                    event.currentTarget.focus({ preventScroll: true });
                    setInspectionIndex(null); setHoverIndex(null);
                    return;
                  }
                  if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const last = elevationChartData.baseData.length - 1;
                  const current = inspectedIndex ?? 0;
                  const next = event.key === "Home" ? 0 : event.key === "End" ? last : Math.max(0, Math.min(last, current + (event.key === "ArrowLeft" ? -1 : 1)));
                  setHoverIndex(next); setInspectionIndex(next);
                }}>
              <ElevationChart
                data={elevationChartData.baseData}
                xAxisLabel={t("rides.streamLabels.distanceAxis")}
                height={fullOverlays.length > 0 ? 320 : 200}
                onHoverIndex={handleElevHover}
                overlays={fullOverlays.length > 0 ? fullOverlays : undefined}
              />
              {Number.isFinite(inspectedDistance) && <div data-testid="ride-chart-inspection" role="group" aria-label={t("ridePage.elevationAndPerf")} tabIndex={0}
                onPointerDown={event => { event.stopPropagation(); if (event.pointerType === "touch") event.currentTarget.focus({ preventScroll: true }); }}
                className="absolute right-0 top-0 z-10 p-3 rounded-[var(--r-lg)] border text-[length:var(--ft-body-size)]"
                style={{ width: "min(320px, 100%, calc(100vw - 32px))", maxHeight: "min(20rem, 50vh)", overflowY: "auto", background: "var(--bg-1)", borderColor: "var(--line)", boxShadow: "var(--shadow-md)", color: "var(--ink-1)" }}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 mb-2" style={{background:"var(--bg-1)"}}>
                  <p className="font-semibold m-0">{t("rides.streamLabels.distanceAxis")} · {(inspectedDistance! / 1000).toFixed(2)}</p>
                  <Button type="button" variant="ghost" size="sm" aria-label={t("common:button.close")} onClick={event => {
                    event.stopPropagation();
                    inspectionChartRef.current?.focus({ preventScroll: true });
                    setInspectionIndex(null); setHoverIndex(null);
                  }}><X size={18} aria-hidden="true" /></Button>
                </div>
                <p className="mb-3" style={{color:"var(--ink-2)"}}>{t("ridePage.chart.sampleBasis")}</p>
                {inspectedRiders.map(({activity, values}) => <div key={activity.id} className="border-t pt-2 mt-2" style={{borderColor:"var(--line)"}}>
                  <p className="font-semibold mb-2" style={{overflowWrap:"anywhere"}}>{riderLabel(activity)}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {values.map(value => <div key={value.key}><dt style={{color:"var(--ink-2)"}}>{value.label}</dt><dd className="font-medium m-0">{value.value === null ? "—" : `${value.value.toFixed(value.key === "speed" ? 1 : 0)} ${value.unit}`}</dd></div>)}
                  </dl>
                </div>)}
              </div>}
              </div>
            </Card>
          )}

          {/* 비교 바 차트 */}
          {comparisonCharts.length > 0 && (
            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {comparisonCharts.map((chart) => (
                  <Card key={chart.title} padding="none" className="p-4" style={{ borderRadius: "var(--r-md)" }}>
                    <h3 className="text-[length:var(--ft-title-size)] font-medium mb-2" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${chart.title} (${chart.unit.trim()})`}</GlossaryText></h3>
                    <ComparisonChart
                      labels={chart.labels}
                      datasets={chart.datasets}
                      height={160}
                      unit={chart.unit}
                    />
                  </Card>
                ))}
              </div>
            </div>
          )}

          {ridePhotos.length > 0 && (
            <Card padding="none" className="p-5 mb-8" style={{ borderRadius: "var(--r-md)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[length:var(--ft-title-size)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ridePage.photos.title")}</h3>
                <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("ridePage.photos.count", { count: ridePhotos.length })}</span>
              </div>
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
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:w-80 flex-shrink-0 lg:sticky lg:top-6 lg:self-start space-y-6">
          {/* 참가자 토글 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-md)" }}>
            <h3 className="text-[length:var(--ft-title-size)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("ridePage.riders")}</h3>
            <div className="flex flex-wrap gap-2">
              {activities.map((a, i) => (
                <Button variant="secondary" data-testid="C2R-0-1"
                  key={a.id}
                  onClick={() => toggleRider(a.id)}
                  aria-pressed={visibleRiders.has(a.id)}
                  aria-label={t(visibleRiders.has(a.id) ? "ridePage.hideRider" : "ridePage.showRider", { name: riderLabel(a) })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[length:var(--fs-xs)] font-medium transition-colors border"
                  style={visibleRiders.has(a.id) ? {
                    color: RIDER_COLORS[i % RIDER_COLORS.length],
                    borderColor: RIDER_COLORS[i % RIDER_COLORS.length],
                  } : {
                    borderColor: "var(--line)",
                    color: "var(--ink-3)",
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: RIDER_COLORS[i % RIDER_COLORS.length], opacity: visibleRiders.has(a.id) ? 1 : 0.3 }}
                  />
                  {riderLabel(a)}
                </Button>
              ))}
            </div>
          </Card>


        </div>
      </div>
          {/* 비교 테이블 */}
          <Card data-testid="C2R-3" padding="none" className="p-4 mt-6" style={{ borderRadius: "var(--r-md)" }}>
            <h3 className="text-[length:var(--ft-title-size)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("ridePage.comparison")}</h3>
            <p className="sm:hidden text-[length:var(--ft-body-size)] mb-3" style={{ color: "var(--ink-2)" }}>{t("rides.comparisonScrollHint")}</p>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("ridePage.comparison")}>
              <table className="w-full text-[length:var(--ft-body-medium-size)] whitespace-nowrap">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th className="text-left py-2 pr-2 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.name")}</th>
                    <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${t("rides.comparisonLabels.distance")} (km)`}</GlossaryText></th>
                    <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${t("rides.comparisonLabels.time")} (h:mm)`}</GlossaryText></th>
                    <th className="text-right py-2 pl-1 font-medium" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${t("rides.comparisonLabels.speed")} (km/h)`}</GlossaryText></th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a, i) => {
                    const s = a.summary;
                    const hours = Math.floor(s.ridingTimeMillis / 3600000);
                    const mins = Math.floor((s.ridingTimeMillis % 3600000) / 60000);
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                        <td className="py-2 pr-2 font-medium truncate max-w-[80px]" style={{ color: RIDER_COLORS[i % RIDER_COLORS.length] }}>
                          {a.nickname}
                        </td>
                        <td className="text-right py-2 px-1 whitespace-nowrap font-mono" style={{ color: "var(--ink-0)" }}>{(s.distance / 1000).toFixed(1)}km</td>
                        <td className="text-right py-2 px-1 whitespace-nowrap font-mono" style={{ color: "var(--ink-0)" }}>{hours}:{String(mins).padStart(2, "0")}</td>
                        <td className="text-right py-2 pl-1 whitespace-nowrap font-mono" style={{ color: "var(--ink-0)" }}>{s.averageSpeed.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activities.some((a) => a.summary.averageHeartRate || a.summary.averagePower || a.avgPower || a.summary.averageCadence) && (
              <div className="mt-3 pt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={t("ridePage.comparison")} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <table data-testid="C2R-3-1" className="w-full text-[length:var(--ft-body-medium-size)] whitespace-nowrap">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)" }}>
                      <th className="text-left py-2 pr-2 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.name")}</th>
                      <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${t("rides.comparisonLabels.hr")} (bpm)`}</GlossaryText></th>
                      <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${t(runningPowerOnly ? "rides.comparisonLabels.runningPower" : mixedPowerSports ? "rides.comparisonLabels.output" : "rides.comparisonLabels.power")} (W)`}</GlossaryText></th>
                      <th className="text-right py-2 pl-1 font-medium" style={{ color: "var(--ink-2)" }}><GlossaryText>{`${t("rides.comparisonLabels.cadence")} (rpm)`}</GlossaryText></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a, i) => {
                      const s = a.summary;
                      return (
                        <tr key={a.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                          <td className="py-2 pr-2 font-medium truncate max-w-[80px]" style={{ color: RIDER_COLORS[i % RIDER_COLORS.length] }}>
                            {a.nickname}
                          </td>
                          <td className="text-right py-2 px-1 font-mono" style={{ color: "var(--ink-0)" }}>{s.averageHeartRate ?? "—"}</td>
                          <td className="text-right py-2 px-1 font-mono" style={{ color: "var(--ink-0)" }}>{mixedPowerSports && (s.averagePower ?? a.avgPower) != null && <><GlossaryText>{t(getDiscipline(a.type) === "run" ? "rides.comparisonLabels.runningPower" : "rides.comparisonLabels.power")}</GlossaryText> · </>}{(s.averagePower ?? a.avgPower) != null ? Math.round((s.averagePower ?? a.avgPower)!) : "—"}</td>
                          <td className="text-right py-2 pl-1 font-mono" style={{ color: "var(--ink-0)" }}>{s.averageCadence ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
    </div>
  );
}
