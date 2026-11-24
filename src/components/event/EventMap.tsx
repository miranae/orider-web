import { logClientError } from "../../services/errorLogger";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useCallback, useMemo } from "react";
import Map, { Source, Layer, Marker, Popup, useMap, type MapRef } from "react-map-gl/mapbox";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getMapboxToken, MAP_STYLE, DEFAULT_VIEW, applyKoreaCyclingStyle } from "../../utils/mapbox";
import { decodePolyline } from "../../utils/polyline";

export interface LocationData {
  rideKind?: "outdoor" | "virtual";
  speedAvailable?: boolean;
  distanceAvailable?: boolean;
  uid: string;
  lat: number;
  lng: number;
  speed: number | null;
  distance: number | null;
  status: string;
  displayName: string;
  bib: number | null;
  category: string | null;
  rank: number | null;
  overallRank: number | null;
  lastCp: number | null;
  geohash: string | null;
}

export interface CheckpointMarker {
  cpId: string;
  name: string;
  lat: number;
  lng: number;
}

export type WaypointLane = "KOM" | "AID" | "CUT" | "SEG";

export interface CourseWaypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lane: WaypointLane;
}

const LANE_STYLE: Record<WaypointLane, { color: string; emoji: string }> = {
  KOM: { color: "#c6f432", emoji: "⛰️" },
  AID: { color: "#06b6d4", emoji: "🍌" },
  CUT: { color: "#f97316", emoji: "⏱️" },
  SEG: { color: "#facc15", emoji: "🏁" },
};

interface EventMapProps {
  followSelected?: boolean;
  /** Closing a popup keeps the watched rider and camera selected. */
  preserveSelectionOnPopupClose?: boolean;
  locations: LocationData[];
  selectedUid: string | null;
  onSelectParticipant: (uid: string | null) => void;
  /** Encoded polyline 문자열 배열 — 코스 경로 표시용 */
  coursePolylines?: string[];
  /** Raw [[lat, lng], ...] 배열 — GPX 직파싱한 코스를 그대로 넘길 때 사용 */
  courseLatlngs?: Array<Array<[number, number]>>;
  /** 체크포인트 위치 마커 (이벤트 운영용 CP) */
  checkpoints?: CheckpointMarker[];
  /** GPX 웨이포인트 — KOM/AID/CUT/SEG */
  waypoints?: CourseWaypoint[];
  /** 첫 로드시 코스에 맞춰 fitBounds */
  fitToCourse?: boolean;
  onWorldViewport?: (view: { lat: number; lon: number }) => void;
  /** 운영자 대시보드 표(ParticipantTable pendingFinish)와 같은 규칙: 행사 종료 전 완주자 순위를 숨기고 "결과 대기"로 보인다. */
  pendingFinish?: boolean;
  /**
   * Mapbox 치명적 런타임 오류(인증·스타일·WebGL 컨텍스트 손실) 발생 시 호출된다.
   * 호출된 쪽에서 지도 대체(RouteMap 등)로 전환할 수 있다.
   * 타일 하나 실패 같은 일시 오류는 무시하고 호출하지 않는다.
   */
  onFatalMapError?: () => void;
  /** 오류 기록 경로. 임베드 운영 화면은 주입 서비스(서버 백업 로그)를 쓰는 기록 함수를 넘긴다. 기본은 logClientError. */
  onLogError?: (source: string, error: unknown, context?: Record<string, unknown>) => void;
}

/** WebGL 컨텍스트 손실 후 복구(webglcontextrestored)를 기다리는 시간. 넘으면 치명 오류로 보고 대체한다. */
export const WEBGL_CONTEXT_RESTORE_MS = 3000;

/** 지도에 보일 종합 순위. 표와 같은 규칙으로 결과 확정 전 완주자 순위는 숨긴다(#4078). */
export function visibleOverallRank(loc: Pick<LocationData, "status" | "overallRank">, pendingFinish = false): number | null {
  return pendingFinish && normalizeStatusKey(loc.status) === "FINISHED" ? null : loc.overallRank;
}

const STATUS_COLORS: Record<string, string> = {
  RIDING: "#4CAF50",
  FINISHED: "#9E9E9E",
  SOS: "#F44336",
  DNF: "#212121",
  OFF_COURSE: "#FF9800",
  LOST_SIGNAL: "#607D8B",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  RIDING: "liveView.riding",
  FINISHED: "stats.finished",
  SOS: "SOS",
  DNF: "DNF",
  OFF_COURSE: "dashboard.status.offCourse",
  LOST_SIGNAL: "participantTable.status.lostSignal",
};

function normalizeStatusKey(s: string): string {
  return (s || "").toUpperCase();
}

function toGeoJSONCollection(locations: LocationData[], selectedUid: string | null, pendingFinish: boolean): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((loc) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [loc.lng, loc.lat],
      },
      properties: {
        uid: loc.uid,
        displayName: loc.displayName,
        bib: loc.bib,
        status: loc.status,
        speed: loc.speed,
        rank: visibleOverallRank(loc, pendingFinish),
        color: STATUS_COLORS[normalizeStatusKey(loc.status)] ?? "#4CAF50",
        selected: loc.uid === selectedUid,
      },
    })),
  };
}

function FlyToSelected({
  locations,
  selectedUid,
  followSelected,
}: {
  followSelected: boolean;
  locations: LocationData[];
  selectedUid: string | null;
}) {
  const { current: map } = useMap();
  const previousTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedUid) { previousTarget.current = null; return; }
    if (!map) return;
    const loc = locations.find((l) => l.uid === selectedUid);
    const target = loc ? (followSelected ? `${selectedUid}/${loc.lat}/${loc.lng}` : selectedUid) : null;
    if (target === previousTarget.current) return;
    if (loc) {
      map.flyTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 800 });
    }
    previousTarget.current = target;
  }, [map, selectedUid, locations, followSelected]);

  return null;
}

function buildRouteGeoJSON(
  polylines: string[],
  latlngs: Array<Array<[number, number]>>
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  polylines
    .filter((p) => typeof p === "string" && p.length > 0)
    .forEach((encoded, idx) => {
      const points = decodePolyline(encoded);
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: points.map(([lat, lng]) => [lng, lat]),
        },
        properties: { idx, source: "polyline" },
      });
    });
  latlngs.forEach((track, idx) => {
    if (!Array.isArray(track) || track.length < 2) return;
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: track.map(([lat, lng]) => [lng, lat]),
      },
      properties: { idx, source: "latlng" },
    });
  });
  return { type: "FeatureCollection", features };
}

function FitToBounds({
  polylines,
  latlngs,
  enabled,
}: {
  polylines: string[];
  latlngs: Array<Array<[number, number]>>;
  enabled: boolean;
}) {
  const { current: map } = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !map || fittedRef.current) return;
    if (polylines.length === 0 && latlngs.length === 0) return;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    let hasPoint = false;
    const visit = (lat: number, lng: number) => {
      hasPoint = true;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    };
    for (const p of polylines) {
      if (!p) continue;
      for (const [lat, lng] of decodePolyline(p)) visit(lat, lng);
    }
    for (const track of latlngs) {
      for (const [lat, lng] of track) visit(lat, lng);
    }
    if (!hasPoint) return;
    if (minLat === maxLat) {
      minLat -= 0.0005;
      maxLat += 0.0005;
    }
    if (minLng === maxLng) {
      minLng -= 0.0005;
      maxLng += 0.0005;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 40, duration: 600 }
    );
    fittedRef.current = true;
  }, [map, polylines, latlngs, enabled]);

  return null;
}

type FatalMapKind = "auth" | "webgl_context" | "load_timeout";

/**
 * 첫 load 이벤트가 이 시간(ms) 안에 오지 않으면 대체 지도로 전환한다.
 * onFatalMapError가 없는 화면에서는 타이머가 동작하지 않는다.
 */
export const LOAD_TIMEOUT_MS = 10_000;

/** load 이후 Mapbox 오류가 치명적(인증 실패)이면 종류를 돌려준다. 타일 하나 실패 등 일시 오류는 null이다. */
function fatalMapboxError(event: { error?: unknown; tile?: unknown }): { kind: FatalMapKind; status: number } | null {
  if (event.tile != null) return null;
  const e = event.error && typeof event.error === "object" ? event.error as { status?: unknown } : {};
  const status = typeof e.status === "number" && Number.isInteger(e.status) && e.status >= 100 && e.status <= 599 ? e.status : null;
  if (status === 401 || status === 403) return { kind: "auth", status };
  return null;
}

export default function EventMap({
  locations,
  selectedUid,
  onSelectParticipant,
  coursePolylines = [],
  courseLatlngs = [],
  checkpoints = [],
  waypoints = [],
  fitToCourse = true,
  followSelected = false,
  preserveSelectionOnPopupClose = false,
  onWorldViewport,
  pendingFinish = false,
  onFatalMapError,
  onLogError = logClientError,
}: EventMapProps) {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation("event");
  const [popupInfo, setPopupInfo] = useState<LocationData | null>(null);
  const [dismissedUid, setDismissedUid] = useState<string | null>(null);
  const previousPopupSelection = useRef(selectedUid);
  const fatalErrorLogged = useRef(false);
  const loadedRef = useRef(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapInstance, setMapInstance] = useState<MapRef | null>(null);
  const failFatal = useCallback((kind: FatalMapKind, status: number | null) => {
    if (!fatalErrorLogged.current) {
      fatalErrorLogged.current = true;
      onLogError("EventMap.mapbox", new Error(`mapbox_${kind}_failure${status == null ? "" : `_${status}`}`), {
        stage: "mapbox_runtime", kind, ...(status != null ? { status } : {}),
      });
    }
    onFatalMapError?.();
  }, [onFatalMapError, onLogError]);
  const handleMapError = useCallback((event: { error?: unknown; sourceId?: unknown; tile?: unknown }) => {
    // 원본 오류와 실패한 소스를 항상 먼저 기록한다. onFatalMapError 없는 화면(관전 등)에서도 P12 로그 보존.
    onLogError("EventMap.render", event.error, typeof event.sourceId === "string" ? { sourceId: event.sourceId } : undefined);
    // 스타일·소스(TileJSON) 인증 실패(401·403, 개별 타일 제외)는 load 전후와 관계없이 치명이다.
    // load 전에 실패한 뒤 Mapbox가 load를 보내도 배경이 빈 지도로 남으므로 타이머를 기다리지 않는다(토큰 만료·교체).
    const fatal = fatalMapboxError(event);
    if (fatal) { failFatal(fatal.kind, fatal.status); return; }
    // 그 밖의 load 전 오류는 로그만 남기고, load가 N초 안에 오지 않으면 타이머가 대체 지도로 전환한다.
    // load 이후의 기타 오류는 일시 오류다.
  }, [failFatal, onLogError]);
  // WebGL 컨텍스트 손실은 onError가 아니라 캔버스의 webglcontextlost 이벤트로 온다. 제한 시간 안에 복구되지 않으면 대체한다.
  // 캔버스는 onLoad 이전에도 존재하므로 맵 ref가 세팅되는 즉시(onLoad 전) 감시를 시작한다(Fix 1).
  const failFatalRef = useRef(failFatal);
  useEffect(() => { failFatalRef.current = failFatal; }, [failFatal]);
  const stopContextWatch = useRef<(() => void) | null>(null);
  useEffect(() => () => stopContextWatch.current?.(), []);
  const watchContextLoss = (canvas: HTMLCanvasElement) => {
    stopContextWatch.current?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lost = () => {
      clearTimeout(timer);
      timer = setTimeout(() => failFatalRef.current("webgl_context", null), WEBGL_CONTEXT_RESTORE_MS);
    };
    const restored = () => { clearTimeout(timer); timer = undefined; };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    stopContextWatch.current = () => {
      clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  };
  // 맵 ref가 세팅되면 즉시(onLoad 전) 캔버스에 WebGL 감시 등록한다.
  useEffect(() => {
    if (!mapInstance) return;
    watchContextLoss(mapInstance.getCanvas());
  }, [mapInstance]);

  // onFatalMapError가 있을 때만 로드 타임아웃 타이머를 시작한다.
  // load 이벤트가 LOAD_TIMEOUT_MS 안에 오지 않으면 대체 지도로 전환한다.
  // 부모가 렌더마다 새 인라인 콜백을 넘겨도 기한이 다시 시작되지 않도록, 콜백 존재 여부에만 의존한다
  // (최신 콜백은 failFatalRef로 호출한다).
  const hasFatalHandler = onFatalMapError != null;
  useEffect(() => {
    if (!hasFatalHandler) return;
    loadTimerRef.current = setTimeout(() => {
      if (!loadedRef.current) failFatalRef.current("load_timeout", null);
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimerRef.current != null) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
    };
  }, [hasFatalHandler]);

  const getStatusLabel = (status: string): string => {
    const key = normalizeStatusKey(status);
    if (pendingFinish && key === "FINISHED") return t("dashboard.status.resultPending");
    const i18nKey = STATUS_LABEL_KEYS[key];
    if (!i18nKey) return status;
    if (i18nKey === "SOS" || i18nKey === "DNF") return i18nKey;
    return t(i18nKey);
  };

  const geojson = toGeoJSONCollection(locations, selectedUid, pendingFinish);
  const routeGeojson = useMemo(
    () => buildRouteGeoJSON(coursePolylines, courseLatlngs),
    [coursePolylines, courseLatlngs]
  );
  const hasCourse = coursePolylines.length > 0 || courseLatlngs.length > 0;

  const handleMarkerClick = useCallback(
    (loc: LocationData) => {
      setDismissedUid(null);
      onSelectParticipant(preserveSelectionOnPopupClose ? loc.uid : loc.uid === selectedUid ? null : loc.uid);
      setPopupInfo(preserveSelectionOnPopupClose ? loc : loc.uid === selectedUid ? null : loc);
    },
    [selectedUid, onSelectParticipant, preserveSelectionOnPopupClose]
  );

  // Sync popup with selectedUid changes from table
  useEffect(() => {
    const changed = previousPopupSelection.current !== selectedUid;
    previousPopupSelection.current = selectedUid;
    if (changed) setDismissedUid(null);
    if (!selectedUid || (preserveSelectionOnPopupClose && !changed && dismissedUid === selectedUid)) {
      setPopupInfo(null);
      return;
    }
    const loc = locations.find((l) => l.uid === selectedUid);
    setPopupInfo(loc ?? null);
  }, [selectedUid, locations, dismissedUid, preserveSelectionOnPopupClose]);

  return (
    <Map
      ref={setMapInstance}
      mapboxAccessToken={mapboxToken}
      mapStyle={MAP_STYLE}
      initialViewState={DEFAULT_VIEW}
      onLoad={(e) => {
        loadedRef.current = true;
        if (loadTimerRef.current != null) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
        try { applyKoreaCyclingStyle(e.target, onLogError); }
        catch (error) { onLogError("EventMap.style", error); }
      }}
      onError={handleMapError}
      onMoveEnd={onWorldViewport ? ({ viewState }) => onWorldViewport({
        lat: Math.round(viewState.latitude * 200) / 200,
        lon: Math.round(viewState.longitude * 200) / 200,
      }) : undefined}
      dragRotate={false}
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Course route polylines */}
      {hasCourse && (
        <Source id="event-course-route" type="geojson" data={routeGeojson}>
          {/* outline */}
          <Layer
            id="event-course-route-casing"
            type="line"
            paint={{
              "line-color": "var(--primary-fg)",
              "line-width": 7,
              "line-opacity": 0.85,
            }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
          {/* main — lime */}
          <Layer
            id="event-course-route-line"
            type="line"
            paint={{
              "line-color": "#c6f432",
              "line-width": 4,
              "line-opacity": 1,
            }}
            layout={{ "line-cap": "round", "line-join": "round" }}
          />
        </Source>
      )}

      {/* Course waypoints — KOM/AID/CUT/SEG */}
      {waypoints.map((w) => {
        const s = LANE_STYLE[w.lane];
        return (
          <Marker key={w.id} longitude={w.lng} latitude={w.lat} anchor="center">
            <div
              title={`${w.lane} · ${w.name}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--primary-fg)",
                border: `2px solid ${s.color}`,
                display: "grid",
                placeItems: "center",
                fontSize: "var(--fs-2xs)",
                lineHeight: 1,
                boxShadow: "0 0 0 2px color-mix(in srgb, var(--bg-0) 45%, transparent)",
              }}
              aria-label={`${w.lane} ${w.name}`}
            >
              {s.emoji}
            </div>
          </Marker>
        );
      })}

      {/* Checkpoint markers */}
      {checkpoints.map((cp, i) => (
        <Marker key={cp.cpId} longitude={cp.lng} latitude={cp.lat} anchor="center">
          <div
            title={cp.name}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--primary-fg)",
              border: "2px solid var(--chart-cadence)",
              display: "grid",
              placeItems: "center",
              fontSize: "var(--fs-2xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--chart-cadence)",
              fontWeight: 700,
              boxShadow: "0 0 0 2px color-mix(in srgb, var(--bg-0) 45%, transparent)",
            }}
            aria-label={cp.name}
          >
            {i + 1}
          </div>
        </Marker>
      ))}

      <FitToBounds polylines={coursePolylines} latlngs={courseLatlngs} enabled={fitToCourse} />

      {/* Participant circles via GeoJSON + Layer */}
      <Source id="participants" type="geojson" data={geojson}>
        {/* Shadow ring for selected */}
        <Layer
          id="participants-selected-ring"
          type="circle"
          paint={{
            "circle-radius": 14,
            "circle-color": "transparent",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#1565C0",
            "circle-opacity": ["case", ["==", ["get", "selected"], true], 1, 0],
            "circle-stroke-opacity": ["case", ["==", ["get", "selected"], true], 1, 0],
          }}
        />
        {/* Main dot */}
        <Layer
          id="participants-circle"
          type="circle"
          paint={{
            "circle-radius": ["case", ["==", ["get", "selected"], true], 9, 6],
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
      </Source>

      {/* Clickable Marker overlay (invisible, for click handling) */}
      {locations.map((loc) => (
        <Marker
          key={loc.uid}
          longitude={loc.lng}
          latitude={loc.lat}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            handleMarkerClick(loc);
          }}
        >
          {/* Transparent hit target */}
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              cursor: "pointer",
              background: "transparent",
            }}
          >
            {loc.rideKind && <span
              className="pointer-events-none absolute whitespace-nowrap rounded-full px-1.5 text-[length:var(--fs-xs)]"
              style={{ left: 18, top: 0, color: "var(--ink-0)", background: "var(--bg-0)" }}
            >{loc.rideKind === "virtual" ? "가상" : "실외"}</span>}
          </div>
        </Marker>
      ))}

      {/* Popup for selected participant */}
      {popupInfo && (
        <Popup
          longitude={popupInfo.lng}
          latitude={popupInfo.lat}
          anchor="bottom"
          onClose={() => {
            setPopupInfo(null);
            if (preserveSelectionOnPopupClose) setDismissedUid(selectedUid);
            else onSelectParticipant(null);
          }}
          closeOnClick={false}
          maxWidth="200px"
        >
          <div style={{ fontSize: "var(--fs-xs)", lineHeight: 1.6 }}>
            <div style={{ fontWeight: "bold", marginBottom: "var(--space-0-5)" }}>
              {popupInfo.bib != null ? `#${popupInfo.bib} ` : ""}
              {popupInfo.displayName}
            </div>
            {popupInfo.category && (
              <div style={{ color: "var(--ink-3)" }}>{popupInfo.category}</div>
            )}
            <div>
              {t("liveView.statusLabel")}: {getStatusLabel(popupInfo.status)}
            </div>
            <div>{popupInfo.speedAvailable === false || popupInfo.speed == null ? "—" : `${(popupInfo.speed ?? 0).toFixed(1)} km/h`}</div>
            <div>{popupInfo.distanceAvailable === false || popupInfo.distance == null ? "—" : `${((popupInfo.distance ?? 0) / 1000).toFixed(1)} km`}</div>
            {visibleOverallRank(popupInfo, pendingFinish) != null && (
              <div>{t("dashboard.alert.overallRank", { rank: visibleOverallRank(popupInfo, pendingFinish) })}</div>
            )}
          </div>
        </Popup>
      )}

      <FlyToSelected locations={locations} selectedUid={selectedUid} followSelected={followSelected} />
    </Map>
  );
}
