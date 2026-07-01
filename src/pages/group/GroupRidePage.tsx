import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import { firestore, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../contexts/AuthContext";
import type { Activity, ActivityStreams } from "@shared/types";

import Map, { Source, Layer, Marker } from "react-map-gl/mapbox";
import type { LngLatBoundsLike } from "mapbox-gl";
import { getMapboxToken, MAP_STYLE, applyKoreaCyclingStyle } from "../../utils/mapbox";
import { decodeTrack } from "../../utils/polyline";
import { getBounds } from "../../components/RouteMap";

import ElevationChart from "../../components/ElevationChart";
import type { OverlayDataset } from "../../components/ElevationChart";
import ComparisonChart from "../../components/ComparisonChart";
import { EmptyState } from "../../components/redesign";
import { Card } from "../../theme/components";

const RIDER_COLORS = [
  "#f97316", "#3b82f6", "#22c55e", "#ef4444", "#a855f7",
  "#06b6d4", "#f59e0b", "#ec4899",
];

export default function GroupRidePage() {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation("group");
  const { groupId, rideId } = useParams();
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [streams, setStreams] = useState<Record<string, ActivityStreams>>({});
  const [loading, setLoading] = useState(true);
  const [visibleRiders, setVisibleRiders] = useState<Set<string>>(new Set());
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const requestedStreams = useRef(new Set<string>());

  // Fetch activities for this group ride
  // groupRideId는 시간 겹침 기반 자동 매칭 — 그룹 멤버 여부와 무관.
  // 사전 그룹 + 현장 동행을 함께 표시하는 것이 의도된 동작.
  useEffect(() => {
    if (!rideId) return;
    setLoading(true);

    const everyoneQuery = query(
      collection(firestore, "activities"),
      where("groupRideId", "==", rideId),
      where("deletedAt", "==", null),
      where("visibility", "==", "everyone"),
    );

    const fetchActivities = async () => {
      try {
        const everyoneSnap = await getDocs(everyoneQuery);
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
        logClientError("GroupRidePage.fetchActivities", err, { rideId });
      }
      setLoading(false);
    };

    fetchActivities();
  }, [rideId, user]);

  // 스트림 로드: 항상 CF 경유 (다른 유저의 스트림은 클라이언트에서 직접 읽을 수 없음)
  useEffect(() => {
    activities.forEach(async (a) => {
      if (requestedStreams.current.has(a.id)) return;
      requestedStreams.current.add(a.id);
      try {
        if (a.source === "strava" && a.stravaActivityId) {
          const getStreamsFn = httpsCallable(functions, "stravaGetActivityStreams");
          const result = await getStreamsFn({ stravaActivityId: a.stravaActivityId });
          if (result.data) {
            setStreams((prev) => ({ ...prev, [a.id]: result.data as unknown as ActivityStreams }));
          }
        } else if (a.source === "orider") {
          // Orider 활동은 activity_streams/{activityId}에서 직접 읽기 (본인 데이터)
          const streamSnap = await getDoc(doc(firestore, "activity_streams", a.id));
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
        logClientError("GroupRidePage.loadStream", err, { activityId: a.id, rideId });
      }
    });
  }, [activities]);

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
    setHoverIndex(index);
  }, []);

  const hoverMarkerPosition = useMemo((): [number, number] | null => {
    if (hoverIndex == null) return null;
    const firstVisible = visibleActivities.find((a) => streams[a.id]?.latlng);
    if (!firstVisible) return null;
    const latlng = streams[firstVisible.id]?.latlng;
    const dist = streams[firstVisible.id]?.distance;
    if (!latlng || !dist) return null;
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
    { key: "speed", label: t("ridePage.overlay.speed"), unit: "km/h", color: "rgba(59, 130, 246, 0.7)", dotColor: "#3b82f6", yAxisID: "ySpeed", getData: (s) => s.velocity_smooth?.map((v) => v * 3.6) },
    { key: "hr", label: t("ridePage.overlay.hr"), unit: "bpm", color: "rgba(239, 68, 68, 0.7)", dotColor: "#ef4444", yAxisID: "yHR", getData: (s) => s.heartrate },
    { key: "power", label: t("ridePage.overlay.power"), unit: "W", color: "rgba(168, 85, 247, 0.7)", dotColor: "#a855f7", yAxisID: "yPower", getData: (s) => s.watts },
    { key: "cadence", label: t("ridePage.overlay.cadence"), unit: "rpm", color: "rgba(6, 182, 212, 0.7)", dotColor: "#06b6d4", yAxisID: "yCadence", getData: (s) => s.cadence },
  ], [t]);

  // Which performance overlays are available (at least one rider has data)
  const availablePerfOverlays = useMemo(() => {
    const withStreams = visibleActivities.filter((a) => streams[a.id]);
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
    const withStreams = visibleActivities.filter((a) => streams[a.id]);
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
        label: `${cfg.label} (${cfg.unit})`,
        data,
        color: cfg.color,
        yAxisID: cfg.yAxisID,
        unit: cfg.unit,
      });
    }

    return result;
  }, [elevationChartData, visibleActivities, streams, PERF_OVERLAY_CONFIGS, activeOverlays]);

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

    const charts: { title: string; labels: string[]; datasets: { label: string; data: number[]; color: string }[]; unit: string }[] = [];

    // Distance
    charts.push({
      title: t("ridePage.chart.distance"),
      labels: [t("ridePage.comparisonTable.distance")],
      datasets: riders.map((r) => ({
        label: r.label,
        data: [parseFloat((r.summary.distance / 1000).toFixed(1))],
        color: r.color,
      })),
      unit: " km",
    });

    // Avg speed
    charts.push({
      title: t("ridePage.chart.avgSpeed"),
      labels: [t("ridePage.comparisonTable.speed")],
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
        title: t("ridePage.chart.avgHR"),
        labels: [t("ridePage.comparisonTable.hr")],
        datasets: riders.map((r) => ({
          label: r.label,
          data: [r.summary.averageHeartRate ?? 0],
          color: r.color,
        })),
        unit: " bpm",
      });
    }

    // Avg power (only if at least one rider has it)
    if (riders.some((r) => r.summary.averagePower)) {
      charts.push({
        title: t("ridePage.chart.avgPower"),
        labels: [t("ridePage.comparisonTable.power")],
        datasets: riders.map((r) => ({
          label: r.label,
          data: [r.summary.averagePower ?? 0],
          color: r.color,
        })),
        unit: " W",
      });
    }

    return charts;
  }, [activities]);

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

  if (activities.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          icon="🚴"
          title={t("empty.rideNotFound")}
          actions={[{ label: t("rides.groupRides"), variant: "primary", href: `/group/${groupId}/rides` }]}
        />
      </div>
    );
  }

  const date = new Date(Math.min(...activities.map((a) => a.startTime)));
  const dateStr = date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  return (
    <div>
      <Link to={`/group/${groupId}/rides`} className="text-[length:var(--fs-sm)] mb-4 inline-block" style={{ color: "var(--lime)" }}>{t("ridePage.back")}</Link>
      <h1 className="text-[length:var(--fs-xl)] font-bold mb-1" style={{ color: "var(--ink-0)" }}>{dateStr} {t("rides.groupRides")}</h1>
      <p className="text-[length:var(--fs-sm)] mb-6" style={{ color: "var(--ink-2)" }}>{t("ridePage.participants", { count: activities.length })}</p>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* 루트 맵 - 전체 참가자 경로 표시 (항상 렌더링, 바운드만 필요) */}
          {mapBounds && (
            <div className="mb-8 rounded-[var(--r-lg)] overflow-hidden h-80 sm:h-96">
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
            <Card padding="none" className="p-5 mb-8" style={{ borderRadius: "var(--r-md)" }}>
              <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>
                {t("ridePage.elevation")} {availablePerfOverlays.length > 0 ? t("ridePage.elevationAndPerf") : t("ridePage.elevationProfile")}
              </h3>

              {/* Overlay toggle buttons */}
              {availablePerfOverlays.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-full cursor-default"
                    style={{
                      background: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                      color: "var(--color-success)",
                      border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
                    }}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    {t("ridePage.overlay.elevation")}
                  </span>
                  {availablePerfOverlays.map((cfg) => (
                    <button
                      key={cfg.key}
                      onClick={() => toggleOverlay(cfg.key)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--fs-xs)] font-medium rounded-full border transition-colors"
                      style={activeOverlays.has(cfg.key) ? {
                        color: cfg.dotColor,
                        borderColor: cfg.dotColor,
                        backgroundColor: `${cfg.dotColor}15`,
                      } : {
                        background: "var(--bg-2)",
                        color: "var(--ink-3)",
                        borderColor: "var(--line)",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: activeOverlays.has(cfg.key) ? cfg.dotColor : "var(--ink-3)" }}
                      />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              )}

              <ElevationChart
                data={elevationChartData.baseData}
                height={fullOverlays.length > 0 ? 320 : 200}
                onHoverIndex={handleElevHover}
                overlays={fullOverlays.length > 0 ? fullOverlays : undefined}
              />
            </Card>
          )}

          {/* 비교 바 차트 */}
          {comparisonCharts.length > 0 && (
            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {comparisonCharts.map((chart) => (
                  <Card key={chart.title} padding="none" className="p-4" style={{ borderRadius: "var(--r-md)" }}>
                    <h3 className="text-[length:var(--fs-xs)] font-medium mb-2" style={{ color: "var(--ink-2)" }}>{chart.title}</h3>
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
        </div>

        {/* Sidebar */}
        <div className="lg:w-80 flex-shrink-0 lg:sticky lg:top-6 lg:self-start space-y-6">
          {/* 참가자 토글 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-md)" }}>
            <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("ridePage.riders")}</h3>
            <div className="flex flex-wrap gap-2">
              {activities.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => toggleRider(a.id)}
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
                  {a.nickname}
                </button>
              ))}
            </div>
          </Card>

          {/* 비교 테이블 */}
          <Card padding="none" className="p-4" style={{ borderRadius: "var(--r-md)" }}>
            <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("ridePage.comparison")}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[length:var(--fs-sm)]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th className="text-left py-2 pr-2 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.name")}</th>
                    <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.distance")}</th>
                    <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.time")}</th>
                    <th className="text-right py-2 pl-1 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.speed")}</th>
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
                        <td className="text-right py-2 px-1 whitespace-nowrap" style={{ color: "var(--ink-0)" }}>{(s.distance / 1000).toFixed(1)}km</td>
                        <td className="text-right py-2 px-1 whitespace-nowrap" style={{ color: "var(--ink-0)" }}>{hours}:{String(mins).padStart(2, "0")}</td>
                        <td className="text-right py-2 pl-1 whitespace-nowrap" style={{ color: "var(--ink-0)" }}>{s.averageSpeed.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activities.some((a) => a.summary.averageHeartRate || a.summary.averagePower || a.avgPower || a.summary.averageCadence) && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <table className="w-full text-[length:var(--fs-sm)]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)" }}>
                      <th className="text-left py-2 pr-2 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.name")}</th>
                      <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.hr")}</th>
                      <th className="text-right py-2 px-1 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.power")}</th>
                      <th className="text-right py-2 pl-1 font-medium" style={{ color: "var(--ink-2)" }}>{t("ridePage.comparisonTable.cadence")}</th>
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
                          <td className="text-right py-2 px-1" style={{ color: "var(--ink-0)" }}>{s.averageHeartRate ?? "-"}</td>
                          <td className="text-right py-2 px-1" style={{ color: "var(--ink-0)" }}>{(s.averagePower ?? a.avgPower) != null ? Math.round((s.averagePower ?? a.avgPower)!) : "-"}</td>
                          <td className="text-right py-2 pl-1" style={{ color: "var(--ink-0)" }}>{s.averageCadence ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
