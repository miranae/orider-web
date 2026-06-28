import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import Map, { Source, Layer, Marker, Popup, useMap } from "react-map-gl/mapbox";
import type { LngLatBoundsLike } from "mapbox-gl";
// 컨트롤/팝업 스타일. 메인 entry 가 아닌 RouteMap chunk 와 함께 로드 (홈 진입 시 1.6MB 절약).
import "mapbox-gl/dist/mapbox-gl.css";
import { decodeTrack } from "../utils/polyline";
import { MAPBOX_TOKEN, MAP_STYLE, applyKoreaCyclingStyle } from "../utils/mapbox";

export interface PhotoMarker {
  id: string;
  url: string;
  location: [number, number];
  caption?: string | null;
}

export interface WaypointMarker {
  lat: number;
  lon: number;
  name: string;
  icon: string;
  active?: boolean;
}

interface RouteMapProps {
  polyline?: string;
  latlng?: [number, number][];
  height?: string;
  interactive?: boolean;
  rounded?: boolean;
  markerPosition?: [number, number] | null;
  photos?: PhotoMarker[];
  waypoints?: WaypointMarker[];
  highlightRange?: { startIndex: number; endIndex: number };
  onHighlightRangeChange?: (startIndex: number, endIndex: number) => void;
  flyToRange?: { startIndex: number; endIndex: number } | null;
  flyToPosition?: [number, number] | null;
  onLoad?: () => void;
  preserveDrawingBuffer?: boolean;
  /** 기기 DPR 무관, 강제로 적용할 pixel ratio (캡처용 썸네일 품질 일관성) */
  pixelRatio?: number;
  /** 초기 fitBounds 패딩(px). 기본 20. 피드 썸네일은 라인이 가장자리에 붙지 않게 더 키운다. */
  fitPadding?: number;
}

function toGeoJSON(positions: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: positions.map(([lat, lng]) => [lng, lat]),
    },
  };
}

function toPointGeoJSON(lat: number, lng: number): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

export function getBounds(positions: [number, number][]): LngLatBoundsLike {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of positions) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

function findNearestIndex(positions: [number, number][], lat: number, lng: number): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < positions.length; i++) {
    const dlat = (positions[i]?.[0] ?? 0) - lat;
    const dlng = (positions[i]?.[1] ?? 0) - lng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

function FitBoundsOnLoad({ bounds }: { bounds: LngLatBoundsLike }) {
  const { current: map } = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && map) {
      map.fitBounds(bounds, { padding: 20, duration: 0 });
      fitted.current = true;
    }
  }, [map, bounds]);
  return null;
}

function FlyToSegmentRange({ positions, range, fullBounds }: {
  positions: [number, number][];
  range: { startIndex: number; endIndex: number } | null | undefined;
  fullBounds: LngLatBoundsLike;
}) {
  const { current: map } = useMap();
  const prevRange = useRef<{ startIndex: number; endIndex: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    if (range) {
      const lo = Math.min(range.startIndex, range.endIndex);
      const hi = Math.max(range.startIndex, range.endIndex);
      const segment = positions.slice(lo, hi + 1);
      if (segment.length > 0) {
        map.fitBounds(getBounds(segment), { padding: 40, maxZoom: 15 });
      }
      prevRange.current = range;
    } else if (prevRange.current) {
      map.fitBounds(fullBounds, { padding: 20 });
      prevRange.current = null;
    }
  }, [map, positions, range, fullBounds]);

  return null;
}

function FlyToPositionControl({ position, fullBounds }: {
  position: [number, number] | null | undefined;
  fullBounds: LngLatBoundsLike;
}) {
  const { current: map } = useMap();
  const prevPosition = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!map) return;
    if (position) {
      // 같은 좌표면 재실행 금지 — fullBounds 참조가 매 렌더(예: 고도표 호버)마다 새로 생겨도
      // effect 가 재실행되어 마지막 사진으로 반복 flyTo 되는 버그 방지.
      const prev = prevPosition.current;
      if (prev && prev[0] === position[0] && prev[1] === position[1]) return;
      map.flyTo({ center: [position[1], position[0]], zoom: 15, duration: 800 });
      prevPosition.current = position;
    } else if (prevPosition.current) {
      map.fitBounds(fullBounds, { padding: 20 });
      prevPosition.current = null;
    }
  }, [map, position, fullBounds]);

  return null;
}

export default function RouteMap({
  polyline,
  latlng,
  height = "h-48",
  interactive = false,
  rounded = true,
  markerPosition,
  photos,
  waypoints,
  highlightRange,
  onHighlightRangeChange,
  flyToRange,
  flyToPosition,
  onLoad,
  preserveDrawingBuffer,
  pixelRatio,
  fitPadding = 20,
}: RouteMapProps) {
  const { t } = useTranslation("common");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoMarker | null>(null);

  const positions: [number, number][] = useMemo(() => {
    if (latlng && latlng.length > 0) return latlng;
    if (polyline && polyline.length > 0) return decodeTrack(polyline) as [number, number][];
    return [];
  }, [polyline, latlng]);

  // hook 호출은 early return 이전에 모두 마쳐야 한다 (Rules of Hooks).
  // positions 가 비어있을 때도 같은 순서로 hook 이 호출되도록 빈 GeoJSON 으로 폴백.
  const fullRouteGeoJSON = useMemo(() => toGeoJSON(positions), [positions]);

  const highlightGeoJSON = useMemo(() => {
    if (!highlightRange || positions.length === 0) return null;
    const lo = Math.min(highlightRange.startIndex, highlightRange.endIndex);
    const hi = Math.max(highlightRange.startIndex, highlightRange.endIndex);
    return toGeoJSON(positions.slice(lo, hi + 1));
  }, [positions, highlightRange]);

  const markerGeoJSON = useMemo(() => {
    if (!markerPosition) return null;
    return toPointGeoJSON(markerPosition[0], markerPosition[1]);
  }, [markerPosition]);

  const handleStartDrag = useCallback((e: { lngLat: { lat: number; lng: number } }) => {
    if (!onHighlightRangeChange || !highlightRange) return;
    const idx = findNearestIndex(positions, e.lngLat.lat, e.lngLat.lng);
    onHighlightRangeChange(idx, highlightRange.endIndex);
  }, [positions, onHighlightRangeChange, highlightRange]);

  const handleEndDrag = useCallback((e: { lngLat: { lat: number; lng: number } }) => {
    if (!onHighlightRangeChange || !highlightRange) return;
    const idx = findNearestIndex(positions, e.lngLat.lat, e.lngLat.lng);
    onHighlightRangeChange(highlightRange.startIndex, idx);
  }, [positions, onHighlightRangeChange, highlightRange]);

  if (positions.length === 0) {
    return (
      <div className={`${height} ${rounded ? "rounded-[var(--r-lg)]" : ""} flex items-center justify-center text-[length:var(--fs-sm)]`} style={{ background: "var(--bg-1)", color: "var(--ink-3)" }}>
        {t("map.noRouteData")}
      </div>
    );
  }

  const bounds = getBounds(positions);

  return (
    <div className={`${height} ${rounded ? "rounded-[var(--r-lg)]" : ""} overflow-hidden`}>
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        preserveDrawingBuffer={preserveDrawingBuffer}
        initialViewState={{ bounds, fitBoundsOptions: { padding: fitPadding } }}
        onLoad={(e) => {
          applyKoreaCyclingStyle(e.target);
          // 캡처 모드: 기기 DPR 무관하게 고정 해상도로 렌더링
          if (pixelRatio && typeof (e.target as unknown as { setPixelRatio?: (n: number) => void }).setPixelRatio === "function") {
            (e.target as unknown as { setPixelRatio: (n: number) => void }).setPixelRatio(pixelRatio);
          }
          if (onLoad) { e.target.once("idle", onLoad); }
        }}
        interactive={interactive}
        scrollZoom={interactive}
        dragPan={interactive}
        dragRotate={false}
        doubleClickZoom={interactive}
        touchZoomRotate={interactive}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        {highlightRange ? (
          <>
            {/* Full route in gray */}
            <Source type="geojson" data={fullRouteGeoJSON}>
              <Layer id="route-gray" type="line" paint={{
                "line-color": "#9CA3AF",
                "line-width": 3,
                "line-opacity": 0.5,
              }} layout={{ "line-cap": "round", "line-join": "round" }} />
            </Source>
            {/* Highlighted segment */}
            {highlightGeoJSON && (
              <Source type="geojson" data={highlightGeoJSON}>
                <Layer id="highlight-glow" type="line" paint={{
                  "line-color": "#FDBA74",
                  "line-width": 10,
                  "line-opacity": 0.45,
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
                <Layer id="highlight-main" type="line" paint={{
                  "line-color": "#F97316",
                  "line-width": 4,
                  "line-opacity": 0.95,
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
              </Source>
            )}
            {/* Start marker */}
            {positions[highlightRange.startIndex] && (
              <Marker
                longitude={positions[highlightRange.startIndex]![1]}
                latitude={positions[highlightRange.startIndex]![0]}
                draggable={!!onHighlightRangeChange}
                onDragEnd={handleStartDrag}
                anchor="center"
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--color-success)", border: "3px solid white", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", cursor: onHighlightRangeChange ? "grab" : "default" }} />
              </Marker>
            )}
            {/* End marker */}
            {positions[highlightRange.endIndex] && (
              <Marker
                longitude={positions[highlightRange.endIndex]![1]}
                latitude={positions[highlightRange.endIndex]![0]}
                draggable={!!onHighlightRangeChange}
                onDragEnd={handleEndDrag}
                anchor="center"
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--color-error)", border: "3px solid white", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", cursor: onHighlightRangeChange ? "grab" : "default" }} />
              </Marker>
            )}
          </>
        ) : (
          <Source type="geojson" data={fullRouteGeoJSON}>
            <Layer id="route-glow" type="line" paint={{
              "line-color": "#FDBA74",
              "line-width": 10,
              "line-opacity": 0.45,
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="route-main" type="line" paint={{
              "line-color": "#F97316",
              "line-width": 4,
              "line-opacity": 0.95,
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
        )}

        {/* Photo markers */}
        {photos?.map((photo) => (
          <Marker
            key={photo.id}
            longitude={photo.location[1]}
            latitude={photo.location[0]}
            anchor="center"
            onClick={(e: { originalEvent: MouseEvent }) => {
              e.originalEvent.stopPropagation();
              setSelectedPhoto(photo);
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--ink-0)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)", overflow: "hidden", background: "var(--bg-3)", cursor: "pointer",
            }}>
              <img src={photo.url} alt={photo.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </Marker>
        ))}
        {/* Waypoint markers */}
        {waypoints?.map((wp, i) => (
          <Marker
            key={`wp-${i}`}
            longitude={wp.lon}
            latitude={wp.lat}
            anchor="bottom"
          >
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", cursor: "default",
              transition: "transform 0.2s ease",
              transform: wp.active ? "scale(1.4)" : "scale(1)",
              zIndex: wp.active ? 100 : 1,
            }}>
              <div style={{
                fontSize: "var(--fs-xl)", lineHeight: 1,
                filter: wp.active
                  ? "drop-shadow(0 0 6px rgba(249,115,22,0.8)) drop-shadow(0 0 12px rgba(249,115,22,0.4))"
                  : "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
              }}>
                {wp.icon}
              </div>
              <div style={{
                marginTop: 2, fontSize: "var(--fs-xs)", fontWeight: 700,
                color: "var(--ink-0)",
                background: wp.active ? "rgba(249,115,22,0.9)" : "rgba(0,0,0,0.6)",
                borderRadius: "var(--r-sm)", padding: "1px 4px",
                whiteSpace: "nowrap", maxWidth: wp.active ? 200 : 100,
                overflow: "hidden", textOverflow: "ellipsis",
                boxShadow: wp.active ? "0 0 8px rgba(249,115,22,0.5)" : "none",
              }}>
                {wp.name}
              </div>
            </div>
          </Marker>
        ))}

        {selectedPhoto && (
          <Popup
            longitude={selectedPhoto.location[1]}
            latitude={selectedPhoto.location[0]}
            anchor="bottom"
            onClose={() => setSelectedPhoto(null)}
            closeOnClick   // 사진 외 지도 영역 클릭 시 닫힘
            closeButton={false}
            maxWidth="280px"
          >
            <div style={{ position: "relative" }}>
              {/* 기본 mapbox 닫기 버튼은 흐려서 사진 위에서 안 보임 → 작고 깔끔한 커스텀 버튼으로 교체 */}
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSelectedPhoto(null)}
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 18,
                  height: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  border: "none",
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.55)",
                  color: "var(--ink-0)",
                  cursor: "pointer",
                  backdropFilter: "blur(2px)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2 L8 8 M8 2 L2 8" />
                </svg>
              </button>
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.caption || ""}
                style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: "var(--r-sm)" }}
              />
              {selectedPhoto.caption && (
                <p style={{ margin: "8px 0 0", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{selectedPhoto.caption}</p>
              )}
            </div>
          </Popup>
        )}

        {/* Hover marker from chart interaction */}
        {markerGeoJSON && (
          <Source type="geojson" data={markerGeoJSON}>
            <Layer id="hover-marker-outer" type="circle" paint={{
              "circle-radius": 7,
              "circle-color": "#ffffff",
              "circle-stroke-color": "#F97316",
              "circle-stroke-width": 3,
            }} />
          </Source>
        )}

        <FitBoundsOnLoad bounds={bounds} />
        {flyToRange !== undefined && (
          <FlyToSegmentRange positions={positions} range={flyToRange} fullBounds={bounds} />
        )}
        {flyToPosition !== undefined && (
          <FlyToPositionControl position={flyToPosition} fullBounds={bounds} />
        )}
      </Map>
    </div>
  );
}
