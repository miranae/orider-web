import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapGL, { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import type { LngLatBounds, MapMouseEvent } from "mapbox-gl";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { getMapboxToken, MAP_STYLE, DEFAULT_VIEW, applyKoreaCyclingStyle } from "../../utils/mapbox";
import type { CourseData, LatLngTuple } from "./courseSnapshot";
import { readPlannedRouteColor } from "../../theme/mapColors";

export function isCourseInBounds(course: CourseData, bounds: LngLatBounds, polylineCache: Map<string, LatLngTuple[]>): boolean {
  const pts = polylineCache.get(course.id);
  if (!pts || pts.length === 0) return false;
  const mid = pts[Math.floor(pts.length / 2)]!;
  return bounds.contains([mid[1], mid[0]]);
}

function buildCourseLinesGeoJSON(
  courses: CourseData[],
  polylineCache: Map<string, LatLngTuple[]>,
  hoveredId: string | null,
  selectedId: string | null,
  colors: { selected: string; hovered: string; base: string },
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const course of courses) {
    const pts = polylineCache.get(course.id);
    if (!pts || pts.length < 2) continue;
    const isSelected = selectedId === course.id;
    const isHovered = hoveredId === course.id;
    features.push({
      type: "Feature",
      properties: {
        id: course.id,
        color: isSelected ? colors.selected : isHovered ? colors.hovered : colors.base,
        width: isSelected ? 6 : isHovered ? 5 : 3,
        opacity: isSelected || isHovered ? 0.95 : 0.7,
        glowOpacity: isSelected ? 0.62 : isHovered ? 0.5 : 0,
        name: course.name,
        distance: course.distance,
        elevationGain: course.elevationGain,
      },
      geometry: {
        type: "LineString",
        coordinates: pts.map(([lat, lng]) => [lng, lat]),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

function readCourseMapColors() {
  const plannedRoute = readPlannedRouteColor();
  return {
    selected: plannedRoute,
    hovered: plannedRoute,
    base: plannedRoute,
  };
}

function getCoursePopupPosition(courseId: string | null, polylineCache: Map<string, LatLngTuple[]>): { lat: number; lng: number } | null {
  if (!courseId) return null;
  const pts = polylineCache.get(courseId);
  if (!pts || pts.length === 0) return null;
  const mid = pts[Math.floor(pts.length / 2)]!;
  return { lat: mid[0], lng: mid[1] };
}

function FitAllBounds({ courses, polylineCache }: {
  courses: CourseData[];
  polylineCache: Map<string, LatLngTuple[]>;
}) {
  const { current: map } = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || courses.length === 0 || !map) return;
    const lats: number[] = [];
    const lngs: number[] = [];
    for (const c of courses) {
      const pts = polylineCache.get(c.id);
      if (pts && pts.length > 0) {
        const mid = pts[Math.floor(pts.length / 2)]!;
        lats.push(mid[0]);
        lngs.push(mid[1]);
      }
    }
    if (lats.length === 0) return;

    lats.sort((a, b) => a - b);
    lngs.sort((a, b) => a - b);

    const lo = Math.floor(lats.length * 0.1);
    const hi = Math.max(lo, Math.ceil(lats.length * 0.9) - 1);
    map.fitBounds(
      [[lngs[lo]!, lats[lo]!], [lngs[hi]!, lats[hi]!]],
      { padding: 40, duration: 0 },
    );
    fitted.current = true;
  }, [map, courses, polylineCache]);

  return null;
}

function FlyToCourse({ courseId, polylineCache }: {
  courseId: string | null;
  polylineCache: Map<string, LatLngTuple[]>;
}) {
  const { current: map } = useMap();
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (!courseId || courseId === prevId.current || !map) return;
    prevId.current = courseId;

    const pts = polylineCache.get(courseId);
    if (pts && pts.length >= 2) {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const pt of pts) {
        if (pt[0] < minLat) minLat = pt[0];
        if (pt[0] > maxLat) maxLat = pt[0];
        if (pt[1] < minLng) minLng = pt[1];
        if (pt[1] > maxLng) maxLng = pt[1];
      }
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, maxZoom: 15 });
    }
  }, [courseId, map, polylineCache]);

  return null;
}

export interface CoursesMapProps {
  allCourses: CourseData[];
  visibleCourses: CourseData[];
  polylineCache: Map<string, LatLngTuple[]>;
  selectedId: string | null;
  hoveredId: string | null;
  onBoundsChange: (bounds: LngLatBounds) => void;
  onMapInteraction: () => void;
  onHoverCourse: (courseId: string | null) => void;
  onScrollToCourse: (courseId: string) => void;
  onSelectCourse: (courseId: string) => void;
  onClearSelection: () => void;
  onOpenCourse: (courseId: string) => void;
  onMapFailed: () => void;
  className?: string;
}

export function CoursesMap({
  allCourses,
  visibleCourses,
  polylineCache,
  selectedId,
  hoveredId,
  onBoundsChange,
  onMapInteraction,
  onHoverCourse,
  onScrollToCourse,
  onSelectCourse,
  onClearSelection,
  onOpenCourse,
  onMapFailed,
  className = "h-64 lg:h-auto lg:flex-[2] relative",
}: CoursesMapProps) {
  const { t } = useTranslation("course");
  const mapboxToken = getMapboxToken();
  const [tooltipInfo, setTooltipInfo] = useState<{ lng: number; lat: number; name: string; distance: number; elevGain: number } | null>(null);
  const courseMapColors = useMemo(readCourseMapColors, []);
  const linesGeoJSON = useMemo(
    () => buildCourseLinesGeoJSON(visibleCourses, polylineCache, hoveredId, selectedId, courseMapColors),
    [visibleCourses, polylineCache, hoveredId, selectedId, courseMapColors],
  );
  const selectedCourse = useMemo(
    () => allCourses.find((course) => course.id === selectedId) ?? null,
    [allCourses, selectedId],
  );
  const selectedPopupPosition = useMemo(
    () => getCoursePopupPosition(selectedId, polylineCache),
    [selectedId, polylineCache],
  );
  const handleMoveEnd = useCallback((e: { target: { getBounds: () => LngLatBounds | null }; originalEvent?: unknown }) => {
    const bounds = e.target.getBounds();
    if (bounds) onBoundsChange(bounds);
    if (e.originalEvent) onMapInteraction();
  }, [onBoundsChange, onMapInteraction]);

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["course-lines-hit"] });
    const id = features[0]?.properties?.id;
    if (id) {
      const courseId = String(id);
      onSelectCourse(courseId);
      onScrollToCourse(courseId);
    }
  }, [onScrollToCourse, onSelectCourse]);

  const handleMapDblClick = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["course-lines-hit"] });
    const id = features[0]?.properties?.id;
    if (id) {
      e.preventDefault();
      onOpenCourse(String(id));
    }
  }, [onOpenCourse]);

  const handleMapMouseMove = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["course-lines-hit"] });
    if (features && features.length > 0) {
      const props = features[0]!.properties!;
      map.getCanvas().style.cursor = "pointer";
      onHoverCourse(String(props.id));
      setTooltipInfo({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: String(props.name),
        distance: Number(props.distance),
        elevGain: Number(props.elevationGain),
      });
    } else {
      map.getCanvas().style.cursor = "";
      onHoverCourse(null);
      setTooltipInfo(null);
    }
  }, [onHoverCourse]);

  const handleMapMouseLeave = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  if (!mapboxToken) return null;

  return (
    <div className={className}>
      <ErrorBoundary
        fallback={() => (
          <div className="h-full w-full flex items-center justify-center px-4 text-center" role="status" style={{ background: "var(--bg-1)", color: "var(--ink-3)" }}>
            <div>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("map.unavailableTitle")}</div>
              <div className="mt-1 text-[length:var(--fs-xs)]">{t("map.listPriorityDescription")}</div>
            </div>
          </div>
        )}
        onError={onMapFailed}
      >
        <MapGL
          mapboxAccessToken={mapboxToken}
          mapStyle={MAP_STYLE}
          initialViewState={DEFAULT_VIEW}
          onLoad={(e) => applyKoreaCyclingStyle(e.target)}
          onError={onMapFailed}
          onMoveEnd={handleMoveEnd}
          onClick={handleMapClick}
          onDblClick={handleMapDblClick}
          onMouseMove={handleMapMouseMove}
          onMouseLeave={handleMapMouseLeave}
          attributionControl={false}
          dragRotate={false}
          style={{ width: "100%", height: "100%" }}
          interactiveLayerIds={["course-lines-hit"]}
        >
          <FitAllBounds courses={allCourses} polylineCache={polylineCache} />
          <FlyToCourse courseId={selectedId} polylineCache={polylineCache} />

          <Source id="course-lines" type="geojson" data={linesGeoJSON}>
            <Layer id="course-lines-glow" type="line" paint={{
              "line-color": courseMapColors.hovered,
              "line-width": 10,
              "line-opacity": ["get", "glowOpacity"],
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="course-lines-visible" type="line" paint={{
              "line-color": ["get", "color"],
              "line-width": ["get", "width"],
              "line-opacity": ["get", "opacity"],
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
            <Layer id="course-lines-hit" type="line" paint={{
              "line-color": "#000000",
              "line-width": 20,
              "line-opacity": 0,
            }} layout={{ "line-cap": "round", "line-join": "round" }} />
          </Source>

          {tooltipInfo && (
            <Popup
              longitude={tooltipInfo.lng}
              latitude={tooltipInfo.lat}
              anchor="bottom"
              closeButton={false}
              closeOnClick={false}
              offset={12}
              className="course-tooltip"
            >
              <div style={{ color: "var(--ink-0)", fontSize: "var(--fs-xs)" }}>
                <div style={{ fontWeight: 600 }}>{tooltipInfo.name}</div>
                <div style={{ color: "var(--ink-3)" }}>{(tooltipInfo.distance / 1000).toFixed(1)} km · ▲{Math.round(tooltipInfo.elevGain)}m</div>
              </div>
            </Popup>
          )}
          {selectedCourse && selectedPopupPosition && (
            <Popup
              longitude={selectedPopupPosition.lng}
              latitude={selectedPopupPosition.lat}
              anchor="bottom"
              closeOnClick={false}
              onClose={onClearSelection}
              offset={16}
              className="course-tooltip"
            >
              <div style={{ color: "var(--ink-0)", fontSize: "var(--fs-xs)", minWidth: 180 }}>
                <div style={{ fontWeight: 700 }}>{selectedCourse.name}</div>
                <div style={{ marginTop: "var(--space-1)", color: "var(--ink-3)" }}>
                  {(selectedCourse.distance / 1000).toFixed(1)} km · ▲{Math.round(selectedCourse.elevationGain)}m
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCourse(selectedCourse.id)}
                  className="mt-2 w-full rounded-[var(--r-sm)] px-3 py-1.5 font-semibold"
                  style={{ background: "var(--lime)", color: "var(--primary-fg)" }}
                >
                  {t("button.detailView")}
                </button>
              </div>
            </Popup>
          )}
        </MapGL>
      </ErrorBoundary>
    </div>
  );
}
