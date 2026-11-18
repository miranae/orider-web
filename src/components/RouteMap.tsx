import { onIdTokenChanged } from "firebase/auth";
import { NativeActivityPhotoImage } from "./activity/NativeActivityPhotoImage";
import type { NativePhotoReference } from "../services/nativeActivityPhoto";
import type { ReactNode, CSSProperties } from "react";
import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import Map, { Source, Layer, Marker, Popup, useMap } from "react-map-gl/mapbox";
import { ImageOff, LocateFixed, Minus, Plus } from "lucide-react";
import { Button, MapNavigation, MapControlButton } from "../theme/components";
import type { LngLatBoundsLike } from "mapbox-gl";
// 컨트롤/팝업 스타일. 메인 entry 가 아닌 RouteMap chunk 와 함께 로드 (홈 진입 시 1.6MB 절약).
import "mapbox-gl/dist/mapbox-gl.css";
import { logClientError } from "../services/errorLogger";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { buildStaticRouteGeometry } from "../utils/staticRoutePath";
import { getMapboxToken, MAP_STYLE, applyKoreaCyclingStyle } from "../utils/mapbox";
import { RECORDED_TRACK_COLOR } from "../theme/mapColors";
import { isRoutePosition, hasRouteLine, drawableRouteSlots, routeTrackSlots, routeSlots, routeGeometry, routeGeometryBounds, projectRouteSlots, routeBounds as getBounds, shortestLongitudeDelta, type RouteSlot } from "../utils/routeGeometry";
import { ICON_SIZE } from "../theme/tokens/icon";

export interface PhotoMarker {
  id: string;
  url: string;
  nativePhoto?: NativePhotoReference;
  location: [number, number];
  caption?: string | null;
}

export interface WaypointMarker {
  lat: number;
  lon: number;
  name: string;
  icon: ReactNode;
  active?: boolean;
}

interface RouteMapProps {
  polyline?: string;
  latlng?: [number, number][];
  /** 서로 떨어진 경로는 연결하지 않고 각각 그린다. latlng/polyline보다 우선한다. */
  routeParts?: [number, number][][];
  height?: string;
  interactive?: boolean;
  rounded?: boolean;
  markerPosition?: [number, number] | null;
  photos?: PhotoMarker[];
  waypoints?: WaypointMarker[];
  highlightRange?: { startIndex: number; endIndex: number };
  onHighlightRangeChange?: (startIndex: number, endIndex: number) => void;
  /** Increment requestId to repeat a camera request for the same indices. */
  flyToRange?: { startIndex: number; endIndex: number; requestId?: number } | null;
  /** Range indices refer to raw samples even while the measured stream is unavailable. */
  rangeUsesRawSamples?: boolean;
  flyToPosition?: [number, number] | null;
  onLoad?: () => void;
  /** 피드에서 배경 타일이 준비되기 전 보여줄 플레이스홀더 */
  loadingPlaceholder?: ReactNode;
  preserveDrawingBuffer?: boolean;
  /** Mapbox resize 동안 강제로 적용할 pixel ratio (캡처 backing 해상도 고정용) */
  pixelRatio?: number;
  /** 초기 fitBounds 패딩(px). 기본 20. 피드 썸네일은 라인이 가장자리에 붙지 않게 더 키운다. */
  fitPadding?: number;
  /** 캔버스 캡처에 포함되는 경로 시작(초록)·종료(빨강) 마커 */
  showRouteEndpoints?: boolean;
  /** 상세 경로의 선명도를 조절한다. 다른 지도는 기본 두께를 유지한다. */
  routeLineWidth?: number;
  /** 활동 상세에서만 명시적 확대·축소·전체 경로 및 컨테이너 크기 동기화를 활성화한다. */
  navigationLabels?: { zoomIn: string; zoomOut: string; fitRoute: string };
  /** Mapbox 렌더링이 실패했을 때 보여줄 저장된 정적 지도 이미지 */
  fallbackImageUrl?: string | null;
  fallbackImageAlt?: string;
  /** Mapbox 실패 fallback 전용 높이. 상세 화면에서 지도 실패가 본문을 밀어내지 않게 사용한다. */
  fallbackHeight?: string;
}

function toPointGeoJSON(lat: number, lng: number): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [lng, lat] },
  };
}

export { routeBounds as getBounds } from "../utils/routeGeometry";

function findNearestIndex(positions: RouteSlot[], lat: number, lng: number): number {
  let minDist = Infinity;
  let minIdx = -1;
  for (let i = 0; i < positions.length; i++) {
    const point = positions[i];
    if (!point) continue;
    const dlat = point[0] - lat;
    const dlng = shortestLongitudeDelta(point[1] - lng);
    const dist = dlat * dlat + dlng * dlng;
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

export function supportsWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function firstIndexAtOrAfter(values: readonly number[], target: number): number {
  let first = 0, last = values.length;
  while (first < last) {
    const mid = Math.floor((first + last) / 2);
    if (values[mid]! < target) first = mid + 1;
    else last = mid;
  }
  return first;
}

function useMapMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

function RouteMapPhotoImage({ photo, style, retryable = false, onRetry }: { photo: PhotoMarker; style: CSSProperties; retryable?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation("activity");
  const services = useFirebaseServices();
  const viewer = services.auth?.currentUser;
  const mounted = useMapMounted();
  const scope = useRef({ services, viewer, generation: 0 });
  if (scope.current.services !== services || scope.current.viewer !== viewer) scope.current = { services, viewer, generation: scope.current.generation + 1 };
  const currentScope = scope.current;
  const [failedFor, setFailedFor] = useState<typeof currentScope | null>(null);
  const logged = useRef(new WeakSet<typeof currentScope>());
  const failed = failedFor === currentScope;
  const onError = () => {
    const isCurrent = () => mounted.current && scope.current === currentScope && services.auth?.currentUser === viewer;
    if (isCurrent()) setFailedFor(currentScope);
    if (logged.current.has(currentScope)) return;
    logged.current.add(currentScope);
    logClientError("RouteMap.photo", new Error("map_photo_image_load_failed"), { stage: "photo_image", native: Boolean(photo.nativePhoto) }, services, viewer, isCurrent() ? "" : "superseded", isCurrent);
  };
  if (failed) return <div data-map-photo-failed style={{ ...style, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"var(--space-8)" }}>
    <span role="img" aria-label={t("publicDetail.photosFailed")}><ImageOff size={ICON_SIZE.sm} aria-hidden="true" /></span>
    {retryable && <Button size="sm" variant="outline" onClick={() => { logged.current.delete(currentScope); setFailedFor(null); onRetry?.(); }}>{t("page.retry")}</Button>}
  </div>;
  return photo.nativePhoto
    ? <NativeActivityPhotoImage key={currentScope.generation} nativePhoto={photo.nativePhoto} retryable={retryable} alt={photo.caption || ""} style={style} onError={onError} />
    : <img key={currentScope.generation} src={photo.url} alt={photo.caption || ""} loading="lazy" decoding="async" style={style} onError={onError} />;
}

export function RouteMapFallback({
  positions,
  segmentStarts,
  pointsOnly,
  highlightRange,
  selectedPosition,
  imageUrl,
  imageAlt,
  height,
  rounded,
  title,
  description,
}: {
  positions: RouteSlot[];
  segmentStarts?: number[];
  pointsOnly?: boolean;
  highlightRange?: RouteMapProps["highlightRange"];
  selectedPosition?: [number,number];
  imageUrl?: string | null;
  imageAlt: string;
  height: string;
  rounded: boolean;
  title: string;
  description: string;
}) {
  const { t } = useTranslation("common");
  const containerClass = `${height} ${rounded ? "rounded-[var(--r-lg)]" : ""} overflow-hidden`;
  const services = useFirebaseServices();
  const viewer = services.auth?.currentUser;
  const mounted = useMapMounted();
  const scope = useRef({ services, viewer, imageUrl, generation: 0 });
  if (scope.current.services !== services || scope.current.viewer !== viewer || scope.current.imageUrl !== imageUrl) {
    scope.current = { services, viewer, imageUrl, generation: scope.current.generation + 1 };
  }
  const currentScope = scope.current;
  const [failedImage, setFailedImage] = useState<typeof currentScope | null>(null);
  const loggedImage = useRef(new WeakSet<typeof currentScope>());
  const startIndex = highlightRange?.startIndex, endIndex = highlightRange?.endIndex;
  const selectedLatitude = selectedPosition?.[0], selectedLongitude = selectedPosition?.[1];
  // Static point-only previews keep interactive targets without mounting every valid sample.
  const sample = useMemo(() => {
    if (!pointsOnly || positions.length <= 256) return null;
    const valid: number[] = [];
    positions.forEach((point, index) => { if (isRoutePosition(point)) valid.push(index); });
    const preview = valid.length <= 256 ? valid
      : Array.from({ length: 256 }, (_, index) => valid[Math.round(index * (valid.length - 1) / 255)]!);
    return { valid, preview };
  }, [positions, pointsOnly]);
  const { path, points, selectionPath, selectionPoints = [] } = useMemo(() => {
    const range = startIndex != null && endIndex != null ? { startIndex, endIndex } : undefined;
    const target = selectedLatitude != null && selectedLongitude != null ? [selectedLatitude, selectedLongitude] as [number, number] : undefined;
    if (!sample) return buildStaticRouteGeometry(positions, segmentStarts, { pointsOnly, range, selectedPosition: target });
    const boundaries: number[] = [];
    if (range) {
      const min = Math.min(range.startIndex, range.endIndex), max = Math.max(range.startIndex, range.endIndex);
      const first = sample.valid[firstIndexAtOrAfter(sample.valid, min)];
      const last = sample.valid[firstIndexAtOrAfter(sample.valid, max + 1) - 1];
      if (first !== undefined && first <= max) boundaries.push(first);
      if (last !== undefined && last !== first && last >= min) boundaries.push(last);
    }
    const indices = [...new Set([...sample.preview, ...boundaries])].sort((first, second) => first - second);
    const from = range ? indices.findIndex(index => index >= Math.min(range.startIndex, range.endIndex)) : -1;
    const reverseEnd = range ? [...indices].reverse().findIndex(index => index <= Math.max(range.startIndex, range.endIndex)) : -1;
    const to = reverseEnd >= 0 ? indices.length - 1 - reverseEnd : -1;
    return buildStaticRouteGeometry(indices.map(index => positions[index]!), [], {
      pointsOnly: true, range: from >= 0 && to >= from ? { startIndex: from, endIndex: to } : undefined, selectedPosition: target,
    });
  }, [positions, segmentStarts, pointsOnly, startIndex, endIndex, selectedLatitude, selectedLongitude, sample]);
  const hasSelection = Boolean(selectionPath || selectionPoints.length);
  if (imageUrl && failedImage !== currentScope && !hasSelection) {
    return (
      <div className={containerClass} style={{ background: "var(--bg-1)" }}>
        <img
          key={currentScope.generation}
          src={imageUrl}
          alt={imageAlt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            const isCurrent = () => mounted.current && scope.current === currentScope && services.auth?.currentUser === viewer;
            if (isCurrent()) setFailedImage(currentScope);
            if (loggedImage.current.has(currentScope)) return;
            loggedImage.current.add(currentScope);
            logClientError("RouteMap.image", new Error("route_image_load_failed"), {
              stage: "static_image", routeSlotCount: positions.length,
            }, services, viewer, isCurrent() ? "" : "superseded", isCurrent);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${containerClass} relative`}
      role="status"
      aria-live="polite"
      style={{
        background: "linear-gradient(135deg, var(--bg-1), var(--bg-2))",
        color: "var(--ink-2)",
        border: "1px solid var(--line-soft)",
      }}
    >
      {(path || points.length > 0 || selectionPoints.length > 0) && (
        <svg viewBox="0 0 320 160" className="absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          {points.map(([x,y], index) => <circle key={index} cx={x} cy={y} r="4" fill={hasSelection ? "var(--ink-3)" : "var(--lime)"} stroke="var(--bg-1)" strokeWidth="2" />)}
          {path && <path d={path} fill="none" stroke="color-mix(in oklch, var(--lime) 36%, transparent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
          {path && <path d={path} fill="none" stroke={hasSelection ? "var(--ink-3)" : "var(--lime)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {selectionPath && <path data-route-static-selection d={selectionPath} fill="none" stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {selectionPoints.map(([x,y], index) => <circle data-route-static-selection key={index} cx={x} cy={y} r="6" fill="var(--lime)" stroke="var(--ink-0)" strokeWidth="2" />)}
        </svg>
      )}
      <div
        data-route-fallback-badge
        className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1"
        style={{ background: "color-mix(in srgb, var(--bg-0) 88%, transparent)", border: "1px solid var(--line-soft)", boxShadow: "var(--shadow-sm)" }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--amber)" }} aria-hidden="true" />
        <span className="truncate text-[length:var(--fs-xs)] font-medium" style={{ color: "var(--ink-1)" }}>{path ? t("map.routePreviewTitle") : title}</span>
        <span className="sr-only">{path ? t("map.routePreviewDescription") : description}</span>
      </div>
    </div>
  );
}

function routeFitOptions(bounds: LngLatBoundsLike, padding: number, duration?: number) {
  const isPoint = Array.isArray(bounds) && Array.isArray(bounds[0]) && Array.isArray(bounds[1])
    && bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1];
  return { padding, ...(duration == null ? {} : { duration }), ...(isPoint ? { maxZoom: 15 } : {}) };
}

function RouteNavigation({ labels, bounds, padding, onFit }: {
  labels: NonNullable<RouteMapProps["navigationLabels"]>;
  bounds: LngLatBoundsLike;
  padding: number;
  onFit: () => void;
}) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || typeof ResizeObserver === "undefined") return;
    // 컨테이너 높이만 바뀌어도 canvas를 갱신한다. 카메라와 선택 구간은 그대로 둔다.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  const motion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 250;
  return <MapNavigation aria-label={labels.fitRoute}>
    <MapControlButton iconOnly aria-label={labels.zoomIn} title={labels.zoomIn} onClick={() => map?.zoomIn({ duration: motion() })}><Plus size={ICON_SIZE.md} aria-hidden="true" /></MapControlButton>
    <MapControlButton iconOnly aria-label={labels.zoomOut} title={labels.zoomOut} onClick={() => map?.zoomOut({ duration: motion() })}><Minus size={ICON_SIZE.md} aria-hidden="true" /></MapControlButton>
    <MapControlButton iconOnly aria-label={labels.fitRoute} title={labels.fitRoute} onClick={() => {
      if (!map) return;
      map.fitBounds(bounds, routeFitOptions(bounds, padding, motion()));
      onFit();
    }}><LocateFixed size={ICON_SIZE.md} aria-hidden="true" /></MapControlButton>
  </MapNavigation>;
}

function RouteCameraControls({ bounds, navigationBounds, autoFitKey, disabled, padding, labels, onFit }: {
  bounds: LngLatBoundsLike;
  navigationBounds: LngLatBoundsLike;
  autoFitKey: string;
  disabled: boolean;
  padding: number;
  labels: RouteMapProps["navigationLabels"];
  onFit: () => void;
}) {
  const { current: map } = useMap();
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (disabled) { fittedKey.current = null; return; }
    if (fittedKey.current !== autoFitKey && map) {
      map.fitBounds(bounds, routeFitOptions(bounds, padding, 0));
      fittedKey.current = autoFitKey;
    }
  }, [map, bounds, autoFitKey, disabled, padding]);
  return labels ? <RouteNavigation labels={labels} bounds={navigationBounds} padding={padding} onFit={() => {
    fittedKey.current = autoFitKey;
    onFit();
  }} /> : null;
}

function FlyToSegmentRange({ positions, segmentStarts, range: rawRange, fullBounds, photoPosition, fullPadding, fullRouteRequested, rangeAfterPhoto }: {
  positions: RouteSlot[];
  segmentStarts: readonly number[];
  range: { startIndex: number; endIndex: number; requestId?: number } | null | undefined;
  fullBounds: LngLatBoundsLike;
  photoPosition?: [number, number] | null;
  fullPadding: number;
  fullRouteRequested: boolean;
  rangeAfterPhoto: boolean;
}) {
  const { current: map } = useMap();
  const startIndex = rawRange?.startIndex, endIndex = rawRange?.endIndex, requestId = rawRange?.requestId;
  const range = useMemo(() => startIndex != null && endIndex != null ? { startIndex, endIndex, requestId } : null, [startIndex, endIndex, requestId]);
  const requestedRange = useRef(range);
  const previousPhoto = useRef<RouteSlot>(null);
  const prevRange = useRef<{ startIndex: number; endIndex: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const rangeChanged = requestedRange.current?.startIndex !== range?.startIndex || requestedRange.current?.endIndex !== range?.endIndex || requestedRange.current?.requestId !== range?.requestId;
    requestedRange.current = range;
    const photo = isRoutePosition(photoPosition) ? photoPosition : null;
    const previous = previousPhoto.current;
    const photoChanged = photo && (!previous || photo[0] !== previous[0] || photo[1] !== previous[1]);
    if (photoChanged) prevRange.current = null;
    previousPhoto.current = photo ? [photo[0], photo[1]] : null;
    // New chart selections may move the camera, but background route updates may
    // not override a photo the user has already located.
    if (fullRouteRequested && !rangeChanged || photo && !rangeAfterPhoto && (photoChanged || !rangeChanged && !prevRange.current)) return;
    if (range) {
      const lo = Math.max(0, Math.min(range.startIndex, range.endIndex));
      const hi = Math.max(range.startIndex, range.endIndex);
      if (positions.length > 1 && lo === 0 && hi === positions.length - 1) {
        map.fitBounds(fullBounds, routeFitOptions(fullBounds, fullPadding));
        prevRange.current = range;
        return;
      }
      const slice = positions.slice(lo, hi + 1);
      const geometry = routeGeometry(slice, segmentStarts.map(index => index - lo)).geometry;
      const bounds = routeGeometryBounds(geometry) ?? routeGeometryBounds(geometry, slice, true);
      if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      else map.fitBounds(fullBounds, routeFitOptions(fullBounds, fullPadding));
      prevRange.current = bounds ? range : null;
    } else if (prevRange.current) {
      map.fitBounds(fullBounds, routeFitOptions(fullBounds, fullPadding));
      prevRange.current = null;
    }
  }, [map, positions, segmentStarts, range, fullBounds, photoPosition, fullPadding, fullRouteRequested, rangeAfterPhoto]);

  return null;
}

function FlyToPositionControl({ position, fullBounds, fullPadding, rangeActive, suppressed }: {
  position: [number, number] | null | undefined;
  fullBounds: LngLatBoundsLike;
  fullPadding: number;
  rangeActive: boolean;
  suppressed: boolean;
}) {
  const { current: map } = useMap();
  const prevPosition = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!map) return;
    if (suppressed) {
      prevPosition.current = isRoutePosition(position) ? [position[0], position[1]] : null;
      return;
    }
    if (isRoutePosition(position)) {
      // 같은 좌표면 재실행 금지 — fullBounds 참조가 매 렌더(예: 고도표 호버)마다 새로 생겨도
      // effect 가 재실행되어 마지막 사진으로 반복 flyTo 되는 버그 방지.
      const prev = prevPosition.current;
      if (prev && prev[0] === position[0] && prev[1] === position[1]) return;
      map.flyTo({ center: [position[1], position[0]], zoom: 15, duration: 800 });
      prevPosition.current = position;
    } else if (prevPosition.current) {
      if (!rangeActive) map.fitBounds(fullBounds, routeFitOptions(fullBounds, fullPadding));
      prevPosition.current = null;
    }
  }, [map, position, fullBounds, fullPadding, rangeActive, suppressed]);

  return null;
}

export default function RouteMap({
  polyline,
  latlng,
  routeParts,
  height = "h-48",
  interactive = false,
  rounded = true,
  markerPosition: rawMarkerPosition,
  photos,
  waypoints,
  highlightRange: rawHighlightRange,
  onHighlightRangeChange: rawOnHighlightRangeChange,
  flyToRange: rawFlyToRange,
  rangeUsesRawSamples = false,
  flyToPosition,
  onLoad,
  loadingPlaceholder,
  preserveDrawingBuffer,
  pixelRatio,
  fitPadding = 20,
  showRouteEndpoints = false,
  routeLineWidth = 2,
  navigationLabels,
  fallbackImageUrl,
  fallbackImageAlt,
  fallbackHeight,
}: RouteMapProps) {
  const { t } = useTranslation("common");
  const firebaseServices = useFirebaseServices();
  const mapErrorLogged = useRef(new WeakSet<object>());
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [photoRetryVersions, setPhotoRetryVersions] = useState<Record<string, number>>({});
  const selectedPhoto = photos?.find(photo => photo.id === selectedPhotoId);
  const [mapFailed, setMapFailed] = useState(false);
  const [readyFor, setReadyFor] = useState<object | null>(null);
  const [webglSupported] = useState(() => supportsWebGL());
  const mapViewer = firebaseServices.auth?.currentUser;
  const [, observeMapViewer] = useState(mapViewer);
  useEffect(() => {
    const auth = firebaseServices.auth;
    if (auth) return onIdTokenChanged(auth, observeMapViewer);
  }, [firebaseServices.auth]);

  const { routePositions, sourcePositions, segmentStarts, streamFallback } = useMemo(() => {
    const parts: RouteSlot[] = [];
    const segmentStarts: number[] = [];
    if (Array.isArray(routeParts)) {
      for (const part of routeParts) {
        segmentStarts.push(parts.length);
        for (const point of routeSlots(part)) parts.push(point);
      }
      return { routePositions: parts, sourcePositions: parts, segmentStarts, streamFallback: false };
    }
    const measured = routeSlots(latlng);
    const useMeasuredIndices = rangeUsesRawSamples || measured.length > 0;
    if (hasRouteLine(measured)) return { routePositions: measured, sourcePositions: measured, segmentStarts, streamFallback: false };
    const thumbnail = polyline ? routeTrackSlots(polyline) : [];
    if (hasRouteLine(thumbnail)) return { routePositions: thumbnail,
      sourcePositions: useMeasuredIndices ? measured : thumbnail, segmentStarts, streamFallback: useMeasuredIndices };
    const useThumbnailPoint = !measured.some(isRoutePosition) && thumbnail.some(isRoutePosition);
    const positions = useThumbnailPoint ? thumbnail : measured.length ? measured : thumbnail;
    return { routePositions: positions, sourcePositions: useMeasuredIndices ? measured : positions, segmentStarts,
      streamFallback: useMeasuredIndices && positions !== measured };
  }, [polyline, latlng, routeParts, rangeUsesRawSamples]);
  // Geometry has its own thumbnail clock; point interactions retain the measured source clock.
  const positions = useMemo(() => drawableRouteSlots(routePositions, segmentStarts), [routePositions, segmentStarts]);
  const mapRouteSlots = useMemo(() => projectRouteSlots(routePositions, segmentStarts), [routePositions, segmentStarts]);
  const mapLineSlots = useMemo(() => drawableRouteSlots(mapRouteSlots, segmentStarts), [mapRouteSlots, segmentStarts]);
  const mapRangeSlots = useMemo(() => streamFallback ? projectRouteSlots(sourcePositions, segmentStarts) : mapRouteSlots,
    [streamFallback, sourcePositions, segmentStarts, mapRouteSlots]);
  const highlightRange = rawHighlightRange;
  const onHighlightRangeChange = rawOnHighlightRangeChange;
  const flyToRange = rawFlyToRange;
  const markerPosition = rawMarkerPosition;
  const photoCommand = JSON.stringify([flyToPosition?.[0], flyToPosition?.[1]]);
  const rangeCommand = JSON.stringify([flyToRange?.startIndex, flyToRange?.endIndex, flyToRange?.requestId]);
  const cameraIntent = useRef({ photoCommand, rangeCommand, full: false, rangeAfterPhoto: false });
  if (cameraIntent.current.photoCommand !== photoCommand || cameraIntent.current.rangeCommand !== rangeCommand) {
    const rangeAfterPhoto = cameraIntent.current.photoCommand === photoCommand && isRoutePosition(flyToPosition) && Boolean(flyToRange);
    cameraIntent.current = { photoCommand, rangeCommand, full: false, rangeAfterPhoto };
  }

  // hook 호출은 early return 이전에 모두 마쳐야 한다 (Rules of Hooks).
  // positions 가 비어있을 때도 같은 순서로 hook 이 호출되도록 빈 GeoJSON 으로 폴백.
  const endpoints = useMemo(() => {
    const valid = (streamFallback ? routePositions : sourcePositions).filter(isRoutePosition);
    return showRouteEndpoints && valid.length >= 2 ? [valid[0]!, valid[valid.length - 1]!] : [];
  }, [sourcePositions, routePositions, streamFallback, showRouteEndpoints]);
  const navigationPoints = useMemo(() => {
    const points: [number, number][] = [];
    const add = (point: unknown) => { if (isRoutePosition(point)) points.push([point[0], point[1]]); };
    add(flyToPosition);
    if (highlightRange) { add(sourcePositions[highlightRange.startIndex]); add(sourcePositions[highlightRange.endIndex]); }
    if (flyToRange && flyToRange.startIndex === flyToRange.endIndex) add(sourcePositions[flyToRange.startIndex]);
    return points;
  }, [flyToPosition, highlightRange, flyToRange, sourcePositions]);
  const activePoints = useMemo(() => isRoutePosition(markerPosition) ? [...navigationPoints, markerPosition] : navigationPoints, [navigationPoints, markerPosition]);
  const standalonePositions = useMemo(() => hasRouteLine(positions, segmentStarts) ? [] : routePositions.filter(isRoutePosition), [positions, segmentStarts, routePositions]);
  const standaloneGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: "FeatureCollection", features: standalonePositions.map(point => ({
      type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [point[1], point[0]] },
    })),
  }), [standalonePositions]);
  const hasRecordedPosition = useMemo(() => sourcePositions.some(isRoutePosition) || routePositions.some(isRoutePosition), [sourcePositions, routePositions]);
  const locationCommand = hasRecordedPosition ? null : photoCommand;
  const mapScope = useMemo(() => ({ firebaseServices, mapViewer, polyline, latlng, routeParts, fallbackImageUrl, locationCommand }),
    [firebaseServices, mapViewer, polyline, latlng, routeParts, fallbackImageUrl, locationCommand]);
  const hasLocatedAttachment = hasRecordedPosition && (photos?.some(photo => isRoutePosition(photo?.location))
    || waypoints?.some(point => isRoutePosition([point?.lat, point?.lon])));
  const attachmentPositions = useMemo(() => {
    const points: [number, number][] = [];
    const add = (point: unknown) => { if (isRoutePosition(point)) points.push([point[0], point[1]]); };
    // Passive attachments must not replace a saved route image or create a map request on their own.
    if (hasRecordedPosition || activePoints.length > 0) {
      if (Array.isArray(photos)) photos.forEach(photo => add(photo?.location));
      if (Array.isArray(waypoints)) waypoints.forEach(point => add([point?.lat, point?.lon]));
    }
    return points;
  }, [hasRecordedPosition, activePoints.length, photos, waypoints]);
  const pointPositions = useMemo(() => [...standalonePositions, ...endpoints, ...activePoints, ...attachmentPositions],
    [standalonePositions, endpoints, activePoints, attachmentPositions]);
  const fullRouteGeoJSON = useMemo(() => routeGeometry(mapLineSlots, segmentStarts), [mapLineSlots, segmentStarts]);
  const routeBounds = useMemo(() => routeGeometryBounds(fullRouteGeoJSON.geometry, endpoints), [endpoints, fullRouteGeoJSON]);
  const standaloneBounds = useMemo(() => standalonePositions.length ? getBounds([...standalonePositions, ...attachmentPositions], true) : null,
    [standalonePositions, attachmentPositions]);
  const pointBounds = useMemo(() => getBounds(pointPositions, true), [pointPositions]);
  // Hover/highlight points do not define the recorded route's camera. Explicit point
  // navigation has its own controller; route fit remains stable after photo navigation.
  const recordedBounds = useMemo(() => routeBounds ?? getBounds(standalonePositions, true), [routeBounds, standalonePositions]);
  const bounds = cameraIntent.current.full && recordedBounds ? recordedBounds : routeBounds ?? standaloneBounds ?? pointBounds;
  const fullRouteBounds = recordedBounds ?? bounds;
  const routeBoundsKey = recordedBounds?.flat().join(",") ?? "";
  const mapInstance = useRef({ routeBoundsKey, firebaseServices, mapViewer, generation: 0 });
  const previousMap = mapInstance.current;
  if (previousMap.routeBoundsKey !== routeBoundsKey || previousMap.firebaseServices !== firebaseServices || previousMap.mapViewer !== mapViewer) {
    mapInstance.current = { routeBoundsKey, firebaseServices, mapViewer, generation: previousMap.generation + 1 };
  }
  const drawable = useMemo(() => hasRouteLine(positions, segmentStarts), [positions, segmentStarts]);
  const highlightGeoJSON = useMemo(() => {
    if (streamFallback || !highlightRange || positions.length === 0) return null;
    const lo = Math.max(0, Math.min(highlightRange.startIndex, highlightRange.endIndex));
    const hi = Math.max(highlightRange.startIndex, highlightRange.endIndex);
    return routeGeometry(mapLineSlots.slice(lo, hi + 1), segmentStarts.map(index => index - lo));
  }, [positions.length, mapLineSlots, highlightRange, segmentStarts, streamFallback]);

  const markerGeoJSON = useMemo(() => {
    if (!isRoutePosition(markerPosition)) return null;
    return toPointGeoJSON(markerPosition[0], markerPosition[1]);
  }, [markerPosition]);
  const selectedPoint = flyToRange && flyToRange.startIndex === flyToRange.endIndex ? sourcePositions[flyToRange.startIndex] : null;
  const selectedPointGeoJSON = useMemo(() => isRoutePosition(selectedPoint) ? toPointGeoJSON(selectedPoint[0], selectedPoint[1]) : null, [selectedPoint]);

  const endpointGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(() => {
    if (endpoints.length < 2) return null;
    const start = endpoints[0]!;
    const end = endpoints[1]!;
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { endpoint: "start" }, geometry: { type: "Point", coordinates: [start[1], start[0]] } },
        { type: "Feature", properties: { endpoint: "end" }, geometry: { type: "Point", coordinates: [end[1], end[0]] } },
      ],
    };
  }, [endpoints]);

  const handleStartDrag = useCallback((e: { lngLat: { lat: number; lng: number } }) => {
    if (!onHighlightRangeChange || !highlightRange) return;
    const idx = findNearestIndex(sourcePositions, e.lngLat.lat, e.lngLat.lng);
    if (idx >= 0) onHighlightRangeChange(idx, highlightRange.endIndex);
  }, [sourcePositions, onHighlightRangeChange, highlightRange]);

  const handleEndDrag = useCallback((e: { lngLat: { lat: number; lng: number } }) => {
    if (!onHighlightRangeChange || !highlightRange) return;
    const idx = findNearestIndex(sourcePositions, e.lngLat.lat, e.lngLat.lng);
    if (idx >= 0) onHighlightRangeChange(highlightRange.startIndex, idx);
  }, [sourcePositions, onHighlightRangeChange, highlightRange]);

  const mapOpenedFor = useRef<typeof mapScope | null>(null);
  if (activePoints.length > 0) mapOpenedFor.current = mapScope;
  const hasRouteBounds = Boolean(bounds) && !(!drawable && standalonePositions.length !== 1
    && !(Array.isArray(routeParts) && endpoints.length > 0) && fallbackImageUrl && mapOpenedFor.current !== mapScope && !hasLocatedAttachment);
  const mapboxToken = getMapboxToken();
  const mapDisplayable = hasRouteBounds && Boolean(mapboxToken) && webglSupported;
  const mapGeneration = mapInstance.current.generation;
  const readiness = useMemo(() => ({ polyline, latlng, routeParts, locationCommand, mapGeneration, mapDisplayable }),
    [polyline, latlng, routeParts, locationCommand, mapGeneration, mapDisplayable]);
  const readinessRef = useRef(readiness);
  readinessRef.current = readiness;
  const mapReady = readyFor === readiness;
  const mapContext = useMemo(() => ({ mapScope, mapGeneration, mapDisplayable }), [mapScope, mapGeneration, mapDisplayable]);
  const mapContextRef = useRef(mapContext);
  mapContextRef.current = mapContext;
  useEffect(() => { setMapFailed(false); }, [mapContext]);
  const mounted = useMapMounted();
  const handleMapError = useCallback((event: { error?: unknown } = {}) => {
    const sameMap = () => mounted.current && mapContextRef.current === mapContext;
    const isCurrent = () => sameMap() && firebaseServices.auth?.currentUser === mapScope.mapViewer;
    if (!mapErrorLogged.current.has(mapContext)) {
      mapErrorLogged.current.add(mapContext);
      const detail = event.error && typeof event.error === "object" ? event.error as { status?: unknown; message?: unknown } : {};
      const status = typeof detail.status === "number" && Number.isInteger(detail.status) && detail.status >= 100 && detail.status <= 599 ? detail.status : null;
      const message = typeof detail.message === "string" ? detail.message.toLowerCase() : "";
      const kind = status != null && status >= 400 ? "http" : /webgl|context lost|gpu/.test(message) ? "webgl"
        : /geojson|coordinate|bounds/.test(message) ? "geometry" : /network|fetch|load/.test(message) ? "network" : "sdk";
      logClientError("RouteMap.mapbox", new Error(`mapbox_${kind}_failure${status == null ? "" : `_${status}`}`), {
        stage: "mapbox_render_or_request", kind, status, routeSlotCount: sourcePositions.length,
        pointCount: pointPositions.length, hasSavedImage: Boolean(fallbackImageUrl), hasRouteLine: drawable,
      }, firebaseServices, mapScope.mapViewer, isCurrent() ? "" : "superseded", isCurrent);
    }
    if (isCurrent()) setMapFailed(true);
  }, [sourcePositions.length, pointPositions.length, fallbackImageUrl, drawable, firebaseServices, mapScope, mapContext, mounted]);

  const previewRange = highlightRange ?? flyToRange;
  const selectedMeasuredPoint = streamFallback && previewRange?.startIndex === previewRange?.endIndex
    && previewRange ? sourcePositions[previewRange.startIndex] : null;
  const pointAlreadyInPreview = !streamFallback && previewRange?.startIndex === flyToRange?.startIndex && previewRange?.endIndex === flyToRange?.endIndex;
  const fallbackPhoto = cameraIntent.current.full || cameraIntent.current.rangeAfterPhoto ? null : flyToPosition;
  const fallbackSelectedPosition = [fallbackPhoto, pointAlreadyInPreview ? null : selectedPoint, selectedMeasuredPoint, drawable ? null : markerPosition].find(isRoutePosition);
  if (!hasRouteBounds || !bounds) {
    if (fallbackImageUrl) {
      return <RouteMapFallback positions={routePositions} highlightRange={streamFallback ? undefined : highlightRange ?? flyToRange ?? undefined} selectedPosition={fallbackSelectedPosition} pointsOnly={!drawable} imageUrl={fallbackImageUrl}
        imageAlt={fallbackImageAlt ?? t("map.routeImageAlt")}
        height={fallbackHeight ?? height} rounded={rounded}
        title={t("map.unavailableTitle")} description={t("map.unavailableDescription")} />;
    }
    return (
      <div className={`${height} ${rounded ? "rounded-[var(--r-lg)]" : ""} flex items-center justify-center text-[length:var(--fs-sm)]`} style={{ background: "var(--bg-1)", color: "var(--ink-3)" }}>
        {t("map.noRouteData")}
      </div>
    );
  }

  const containerClass = `${height} ${rounded ? "rounded-[var(--r-lg)]" : ""} overflow-hidden`;
  const fallback = (
    <RouteMapFallback
      positions={routePositions} highlightRange={streamFallback ? undefined : highlightRange ?? flyToRange ?? undefined} selectedPosition={fallbackSelectedPosition}
      pointsOnly={!drawable}
      segmentStarts={segmentStarts}
      imageUrl={fallbackImageUrl}
      imageAlt={fallbackImageAlt ?? t("map.routeImageAlt")}
      height={fallbackHeight ?? height}
      rounded={rounded}
      title={t("map.unavailableTitle")}
      description={t("map.unavailableDescription")}
    />
  );

  if (!mapboxToken || mapFailed || !webglSupported) {
    return fallback;
  }

  return (
    <div className={`${containerClass} relative`}>
      {loadingPlaceholder && !mapReady && <div data-map-thumbnail-loading className="absolute inset-0 z-10">{loadingPlaceholder}</div>}
      <ErrorBoundary key={mapInstance.current.generation} fallback={() => fallback} onError={error => handleMapError({ error })}>
        <Map
          mapboxAccessToken={mapboxToken}
          mapStyle={MAP_STYLE}
          preserveDrawingBuffer={preserveDrawingBuffer}
          initialViewState={{ bounds, fitBoundsOptions: routeFitOptions(bounds, fitPadding) }}
          onLoad={(e) => {
            applyKoreaCyclingStyle(e.target);
            if (pixelRatio) resizeMapAtPixelRatio(e.target, pixelRatio);
            if (onLoad) { e.target.once("idle", onLoad); }
          }}
          onIdle={loadingPlaceholder ? () => { if (readinessRef.current === readiness) setReadyFor(readiness); } : undefined}
          onError={handleMapError}
          interactive={interactive}
          cooperativeGestures={interactive}
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
                "line-width": 1.5,
                "line-opacity": 0.5,
              }} layout={{ "line-cap": "round", "line-join": "round" }} />
            </Source>
            {/* Highlighted segment */}
            {highlightGeoJSON && (
              <Source type="geojson" data={highlightGeoJSON}>
                <Layer id="highlight-glow" type="line" paint={{
                  "line-color": RECORDED_TRACK_COLOR,
                  "line-width": 5,
                  "line-opacity": 0.45,
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
                <Layer id="highlight-main" type="line" paint={{
                  "line-color": RECORDED_TRACK_COLOR,
                  "line-width": routeLineWidth,
                  "line-opacity": 0.95,
                }} layout={{ "line-cap": "round", "line-join": "round" }} />
              </Source>
            )}
            {/* Start marker */}
            {sourcePositions[highlightRange.startIndex] && (
              <Marker
                longitude={sourcePositions[highlightRange.startIndex]![1]}
                latitude={sourcePositions[highlightRange.startIndex]![0]}
                draggable={!!onHighlightRangeChange}
                onDragEnd={handleStartDrag}
                anchor="center"
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--color-success)", border: "3px solid white", boxShadow: "0 2px 6px color-mix(in srgb, var(--bg-0) 30%, transparent)", cursor: onHighlightRangeChange ? "grab" : "default" }} />
              </Marker>
            )}
            {/* End marker */}
            {sourcePositions[highlightRange.endIndex] && (
              <Marker
                longitude={sourcePositions[highlightRange.endIndex]![1]}
                latitude={sourcePositions[highlightRange.endIndex]![0]}
                draggable={!!onHighlightRangeChange}
                onDragEnd={handleEndDrag}
                anchor="center"
              >
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--color-error)", border: "3px solid white", boxShadow: "0 2px 6px color-mix(in srgb, var(--bg-0) 30%, transparent)", cursor: onHighlightRangeChange ? "grab" : "default" }} />
              </Marker>
            )}
          </>
        ) : (
          <Source type="geojson" data={fullRouteGeoJSON}>
            <Layer id="route-glow" type="line" paint={{
              "line-color": RECORDED_TRACK_COLOR,
              "line-width": 5,
              "line-opacity": 0.45,
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="route-main" type="line" paint={{
              "line-color": RECORDED_TRACK_COLOR,
              "line-width": routeLineWidth,
              "line-opacity": 0.95,
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>
        )}

        {/* Photo markers */}
        {photos?.filter(photo => isRoutePosition(photo.location)).map((photo) => (
          <Marker
            key={photo.id}
            longitude={photo.location[1]}
            latitude={photo.location[0]}
            anchor="center"
            onClick={(e: { originalEvent: MouseEvent }) => {
              e.originalEvent.stopPropagation();
              setSelectedPhotoId(photo.id);
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: "50%", border: "3px solid var(--ink-0)",
              boxShadow: "0 2px 6px color-mix(in srgb, var(--bg-0) 30%, transparent)", overflow: "hidden", background: "var(--bg-3)", cursor: "pointer",
            }}>
              <RouteMapPhotoImage key={`${photo.nativePhoto ? `${photo.nativePhoto.activityId}:${photo.nativePhoto.photoId}` : photo.url}:${photoRetryVersions[photo.id] ?? 0}`} photo={photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </Marker>
        ))}
        {/* Waypoint markers */}
        {waypoints?.filter(wp => isRoutePosition([wp.lat, wp.lon])).map((wp, i) => (
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
                  ? "drop-shadow(0 0 6px color-mix(in srgb, var(--amber) 80%, transparent)) drop-shadow(0 0 12px color-mix(in srgb, var(--amber) 40%, transparent))"
                  : "drop-shadow(0 1px 2px color-mix(in srgb, var(--bg-0) 50%, transparent))",
              }}>
                {wp.icon}
              </div>
              <div style={{
                marginTop: "var(--space-0-5)", fontSize: "var(--fs-xs)", fontWeight: 700,
                color: "var(--ink-0)",
                background: wp.active ? "color-mix(in srgb, var(--amber) 90%, transparent)" : "color-mix(in srgb, var(--bg-0) 60%, transparent)",
                borderRadius: "var(--r-sm)", padding: "1px 4px",
                whiteSpace: "nowrap", maxWidth: wp.active ? 200 : 100,
                overflow: "hidden", textOverflow: "ellipsis",
                boxShadow: wp.active ? "0 0 8px color-mix(in srgb, var(--amber) 50%, transparent)" : "none",
              }}>
                {wp.name}
              </div>
            </div>
          </Marker>
        ))}

        {selectedPhoto && isRoutePosition(selectedPhoto.location) && (
          <Popup
            longitude={selectedPhoto.location[1]}
            latitude={selectedPhoto.location[0]}
            anchor="bottom"
            onClose={() => setSelectedPhotoId(null)}
            closeOnClick   // 사진 외 지도 영역 클릭 시 닫힘
            closeButton={false}
            maxWidth="280px"
          >
            <div style={{ position: "relative" }}>
              {/* 기본 mapbox 닫기 버튼은 흐려서 사진 위에서 안 보임 → 작고 깔끔한 커스텀 버튼으로 교체 */}
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSelectedPhotoId(null)}
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
                  background: "color-mix(in srgb, var(--bg-0) 55%, transparent)",
                  color: "var(--ink-0)",
                  cursor: "pointer",
                  backdropFilter: "blur(2px)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2 L8 8 M8 2 L2 8" />
                </svg>
              </button>
              <RouteMapPhotoImage key={`${selectedPhoto.nativePhoto ? `${selectedPhoto.nativePhoto.activityId}:${selectedPhoto.nativePhoto.photoId}` : selectedPhoto.url}:${photoRetryVersions[selectedPhoto.id] ?? 0}`} photo={selectedPhoto} retryable onRetry={() => setPhotoRetryVersions(previous => ({ ...previous, [selectedPhoto.id]: (previous[selectedPhoto.id] ?? 0) + 1 }))} style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: "var(--r-sm)" }} />
              {selectedPhoto.caption && (
                <p style={{ margin: "8px 0 0", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{selectedPhoto.caption}</p>
              )}
            </div>
          </Popup>
        )}

        {selectedPointGeoJSON && (
          <Source type="geojson" data={selectedPointGeoJSON}>
            <Layer id="route-selected-point" type="circle" paint={{
              "circle-radius": 7,
              "circle-color": RECORDED_TRACK_COLOR,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            }} />
          </Source>
        )}
        {/* Hover marker from chart interaction */}
        {markerGeoJSON && (
          <Source type="geojson" data={markerGeoJSON}>
            <Layer id="hover-marker-outer" type="circle" paint={{
              "circle-radius": 7,
              "circle-color": "#ffffff",
              "circle-stroke-color": RECORDED_TRACK_COLOR,
              "circle-stroke-width": 3,
            }} />
          </Source>
        )}

        {/* WebGL 레이어로 그려 캔버스 기반 공유 썸네일에도 포함한다. */}
        {standalonePositions.length > 0 && <Source type="geojson" data={standaloneGeoJSON}>
          <Layer id="route-standalone-points" type="circle" paint={{
            "circle-radius": 4, "circle-color": RECORDED_TRACK_COLOR,
            "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
          }} />
        </Source>}
        {endpointGeoJSON && (
          <Source type="geojson" data={endpointGeoJSON}>
            <Layer id="route-endpoint-halo" type="circle" paint={{
              "circle-radius": 8,
              "circle-color": "#ffffff",
              "circle-stroke-color": "rgba(0,0,0,0.32)",
              "circle-stroke-width": 1.5,
            }} />
            <Layer id="route-endpoint-core" type="circle" paint={{
              "circle-radius": 5,
              "circle-color": ["match", ["get", "endpoint"], "start", "#16a34a", "#dc2626"],
            }} />
          </Source>
        )}

        <RouteCameraControls labels={navigationLabels} bounds={bounds} navigationBounds={fullRouteBounds ?? bounds}
          autoFitKey={JSON.stringify(recordedBounds ?? bounds)} disabled={(isRoutePosition(flyToPosition) || (!drawable && isRoutePosition(selectedPoint))) && !cameraIntent.current.full}
          padding={fitPadding} onFit={() => { cameraIntent.current.full = true; }} />
        <FlyToSegmentRange positions={mapRangeSlots} segmentStarts={segmentStarts} range={flyToRange} fullBounds={fullRouteBounds ?? bounds}
          photoPosition={flyToPosition} fullPadding={fitPadding} fullRouteRequested={cameraIntent.current.full}
          rangeAfterPhoto={cameraIntent.current.rangeAfterPhoto} />
        {flyToPosition !== undefined && (
          <FlyToPositionControl position={flyToPosition} fullBounds={fullRouteBounds ?? bounds} fullPadding={fitPadding} rangeActive={Boolean(flyToRange)}
            suppressed={cameraIntent.current.full || cameraIntent.current.rangeAfterPhoto} />
        )}
        </Map>
      </ErrorBoundary>
      {!drawable && <div role="status" data-route-no-line className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--fs-xs)]" style={{ background: "var(--bg-1)", color: "var(--ink-2)" }}>{t("map.noRouteData")}</div>}
    </div>
  );
}

/** Mapbox GL 3.19에는 setPixelRatio API가 없으므로 resize가 읽는 DPR만 동기 구간에서 고정한다. */
export function resizeMapAtPixelRatio(
  map: { resize: () => unknown; getContainer: () => HTMLElement },
  pixelRatio: number,
) {
  const ownDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  const container = map.getContainer();
  const originalWidth = container.style.width;
  try {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: pixelRatio });
    // Mapbox GL 3.19 resize()는 container 크기가 같으면 backing resize를 생략한다.
    // public API가 실제 dimension change를 관찰하게 한 뒤 원래 logical viewport로 되돌린다.
    container.style.width = `${container.getBoundingClientRect().width + 1}px`;
    map.resize();
    container.style.width = originalWidth;
    map.resize();
  } finally {
    container.style.width = originalWidth;
    if (ownDescriptor) Object.defineProperty(window, "devicePixelRatio", ownDescriptor);
    else delete (window as unknown as { devicePixelRatio?: number }).devicePixelRatio;
  }
}
