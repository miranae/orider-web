import { useEffect, useRef, useCallback, useMemo } from "react";
import Map, { Source, Layer, Marker, Popup, useMap } from "react-map-gl/mapbox";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getMapboxToken, MAP_STYLE, DEFAULT_VIEW, applyKoreaCyclingStyle } from "../../utils/mapbox";
import { decodePolyline } from "../../utils/polyline";

export interface LocationData {
  uid: string;
  lat: number;
  lng: number;
  speed: number;
  distance: number;
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

function toGeoJSONCollection(locations: LocationData[], selectedUid: string | null): GeoJSON.FeatureCollection {
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
        rank: loc.overallRank,
        color: STATUS_COLORS[normalizeStatusKey(loc.status)] ?? "#4CAF50",
        selected: loc.uid === selectedUid,
      },
    })),
  };
}

function FlyToSelected({
  locations,
  selectedUid,
}: {
  locations: LocationData[];
  selectedUid: string | null;
}) {
  const { current: map } = useMap();
  const prevUid = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !selectedUid || selectedUid === prevUid.current) return;
    const loc = locations.find((l) => l.uid === selectedUid);
    if (loc) {
      map.flyTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 800 });
    }
    prevUid.current = selectedUid;
  }, [map, selectedUid, locations]);

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

export default function EventMap({
  locations,
  selectedUid,
  onSelectParticipant,
  coursePolylines = [],
  courseLatlngs = [],
  checkpoints = [],
  waypoints = [],
  fitToCourse = true,
}: EventMapProps) {
  const mapboxToken = getMapboxToken();
  const { t } = useTranslation("event");
  const [popupInfo, setPopupInfo] = useState<LocationData | null>(null);

  const getStatusLabel = (status: string): string => {
    const key = normalizeStatusKey(status);
    const i18nKey = STATUS_LABEL_KEYS[key];
    if (!i18nKey) return status;
    if (i18nKey === "SOS" || i18nKey === "DNF") return i18nKey;
    return t(i18nKey);
  };

  const geojson = toGeoJSONCollection(locations, selectedUid);
  const routeGeojson = useMemo(
    () => buildRouteGeoJSON(coursePolylines, courseLatlngs),
    [coursePolylines, courseLatlngs]
  );
  const hasCourse = coursePolylines.length > 0 || courseLatlngs.length > 0;

  const handleMarkerClick = useCallback(
    (loc: LocationData) => {
      onSelectParticipant(loc.uid === selectedUid ? null : loc.uid);
      setPopupInfo(loc.uid === selectedUid ? null : loc);
    },
    [selectedUid, onSelectParticipant]
  );

  // Sync popup with selectedUid changes from table
  useEffect(() => {
    if (!selectedUid) {
      setPopupInfo(null);
      return;
    }
    const loc = locations.find((l) => l.uid === selectedUid);
    setPopupInfo(loc ?? null);
  }, [selectedUid, locations]);

  return (
    <Map
      mapboxAccessToken={mapboxToken}
      mapStyle={MAP_STYLE}
      initialViewState={DEFAULT_VIEW}
      onLoad={(e) => applyKoreaCyclingStyle(e.target)}
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
          />
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
            onSelectParticipant(null);
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
            <div>{popupInfo.speed.toFixed(1)} km/h</div>
            <div>{(popupInfo.distance / 1000).toFixed(1)} km</div>
            {popupInfo.overallRank != null && (
              <div>{t("dashboard.alert.overallRank", { rank: popupInfo.overallRank })}</div>
            )}
          </div>
        </Popup>
      )}

      <FlyToSelected locations={locations} selectedUid={selectedUid} />
    </Map>
  );
}
