import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { stripLangPrefix } from "../i18n/detector";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import MapGL, { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import type { LngLatBounds, MapMouseEvent } from "mapbox-gl";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { decodeTrack } from "../utils/polyline";
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_VIEW, applyKoreaCyclingStyle } from "../utils/mapbox";
import { Button, Card, Chip, Text, buttonClass } from "../theme/components";

type LatLngTuple = [number, number];

interface ClimbInfo {
  gain: number;
  dist: number;
  cat: number;
}

interface CourseData {
  id: string;
  name: string;
  polyline: string;
  distance: number;
  elevationGain: number;
  climbs: ClimbInfo[];
  regions: string[];
  likeCount: number;
  createdAt: number;
  surface: string | null;
  difficulty: number | null;
  startLat: number;
  startLon: number;
}

type SortMode = "latest" | "popular";

/** 두 좌표 간 거리(km) — Haversine. 위치+반경 필터(#495)용. */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function samplePoints(points: LatLngTuple[], maxPoints: number): LatLngTuple[] {
  if (points.length <= maxPoints) return points;
  const result: LatLngTuple[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]!);
  }
  return result;
}

function isInBounds(course: CourseData, bounds: LngLatBounds, polylineCache: Map<string, LatLngTuple[]>): boolean {
  const pts = polylineCache.get(course.id);
  if (!pts || pts.length === 0) return false;
  const mid = pts[Math.floor(pts.length / 2)]!;
  return bounds.contains([mid[1], mid[0]]);
}

function buildCourseLinesGeoJSON(
  courses: CourseData[],
  polylineCache: Map<string, LatLngTuple[]>,
  hoveredId: string | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const course of courses) {
    const pts = polylineCache.get(course.id);
    if (!pts || pts.length < 2) continue;
    const isHovered = hoveredId === course.id;
    features.push({
      type: "Feature",
      properties: {
        id: course.id,
        color: isHovered ? "#a3e635" : "#3B82F6",
        width: isHovered ? 5 : 3,
        opacity: isHovered ? 0.95 : 0.7,
        glowOpacity: isHovered ? 0.5 : 0,
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

/** 초기 1회 전체 코스에 맞게 줌 */
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

/** 선택된 코스로 지도 이동 */
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

function climbCatLabel(cat: number): string {
  if (cat === 5) return "HC";
  return `Cat ${5 - cat}`;
}

function climbBadgeStyle(cat: number): React.CSSProperties {
  switch (cat) {
    case 5: return { background: "var(--rose)", color: "#1a0005" };
    case 4: return { background: "var(--rose)", color: "#1a0005", opacity: 0.85 };
    case 3: return { background: "var(--amber)", color: "#1a0800" };
    case 2: return { background: "var(--amber)", color: "#1a0800", opacity: 0.75 };
    case 1: return { background: "var(--lime)", color: "var(--primary-fg)" };
    default: return { background: "var(--bg-3)", color: "var(--ink-3)" };
  }
}

/** 노면 칩 색(#495 노면 시각구분) — 포장(아쿠아)·그래블(앰버)·혼합(중간). */
function surfaceChipStyle(surface: string): React.CSSProperties {
  switch (surface) {
    case "paved": return { background: "color-mix(in oklch, var(--aqua) 16%, var(--bg-2))", color: "var(--aqua)" };
    case "gravel": return { background: "color-mix(in oklch, var(--amber) 16%, var(--bg-2))", color: "var(--amber)" };
    case "mixed": return { background: "var(--bg-3)", color: "var(--ink-2)" };
    default: return { background: "var(--bg-3)", color: "var(--ink-3)" };
  }
}

export default function CoursesPage() {
  const { t } = useTranslation("course");
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isVisible = stripLangPrefix(location.pathname) === "/courses";
  const [hasRendered, setHasRendered] = useState(isVisible);

  useEffect(() => {
    if (isVisible) setHasRendered(true);
  }, [isVisible]);

  const [allCourses, setAllCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [surfaceFilter, setSurfaceFilter] = useState<"" | "paved" | "gravel" | "mixed">("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null);
  // 위치+반경 필터(#495) — 내 주변 코스. geolocation 1회 취득 후 km 반경 클라 필터.
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<LngLatBounds | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<{ lng: number; lat: number; name: string; distance: number; elevGain: number } | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const polylineCache = useRef<Map<string, LatLngTuple[]>>(new Map());

  const handleMoveEnd = useCallback((e: any) => {
    const b = e.target.getBounds();
    if (b) setMapBounds(b);
    if (e.originalEvent) {
      setSelectedId(null);
      setHoveredId(null);
    }
  }, []);

  useEffect(() => {
    const q = query(
      collection(firestore, "courses"),
      where("deletedAt", "==", null),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const map = new Map<string, CourseData>();

      for (const c of allCourses) map.set(c.id, c);

      for (const change of snapshot.docChanges()) {
        const d = change.doc;
        const data = d.data();
        if (change.type === "removed") {
          map.delete(d.id);
          polylineCache.current.delete(d.id);
        } else {
          const course: CourseData = {
            id: d.id,
            name: data.name ?? "",
            polyline: data.polyline ?? "",
            distance: data.distance ?? 0,
            elevationGain: data.elevationGain ?? 0,
            climbs: data.climbs ?? [],
            regions: data.regions ?? [],
            likeCount: data.likeCount ?? 0,
            createdAt: data.createdAt ?? 0,
            surface: data.surface ?? null,
            difficulty: typeof data.difficulty === "number" ? data.difficulty : null,
            startLat: typeof data.startLat === "number" ? data.startLat : 0,
            startLon: typeof data.startLon === "number" ? data.startLon : 0,
          };
          map.set(d.id, course);
          if (course.polyline) {
            const decoded = decodeTrack(course.polyline) as LatLngTuple[];
            polylineCache.current.set(d.id, samplePoints(decoded, 200));
          }
        }
      }

      setAllCourses(Array.from(map.values()));
      setLoading(false);
    }, (err) => {
      console.error(t("listener.error"), err);
      setLoading(false);
    });

    return unsub;
     
  }, []);

  const displayCourses = useMemo(() => {
    let filtered = allCourses;

    if (searchQuery) {
      const tokens = searchQuery.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter(Boolean);
      filtered = filtered.filter((c) => {
        const text = `${c.name} ${c.regions.join(" ")}`.toLowerCase();
        return tokens.every((t) => text.includes(t));
      });
    }
    // 노면/난이도 다축 필터(#489) — 클라이언트 사이드(코스 수 적음).
    if (surfaceFilter) filtered = filtered.filter((c) => c.surface === surfaceFilter);
    if (difficultyFilter != null) filtered = filtered.filter((c) => c.difficulty === difficultyFilter);
    // 위치+반경(#495) — 시작점이 내 위치 반경 내인 코스만.
    if (myLoc && radiusKm != null) {
      filtered = filtered.filter((c) =>
        c.startLat !== 0 && c.startLon !== 0 && distanceKm(myLoc.lat, myLoc.lng, c.startLat, c.startLon) <= radiusKm,
      );
    }

    const sorted = [...filtered];
    if (sortMode === "popular") {
      sorted.sort((a, b) => b.likeCount - a.likeCount);
    } else {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    }

    return sorted;
  }, [allCourses, searchQuery, sortMode, surfaceFilter, difficultyFilter, myLoc, radiusKm]);

  const visibleOnMap = useMemo(() => {
    if (!mapBounds) return displayCourses;
    return displayCourses.filter((c) => isInBounds(c, mapBounds, polylineCache.current));
  }, [displayCourses, mapBounds]);

  const [frozenList, setFrozenList] = useState<CourseData[] | null>(null);

  useEffect(() => {
    if (selectedId) {
      if (!frozenList) setFrozenList(visibleOnMap);
    } else {
      setFrozenList(null);
    }
  }, [selectedId, visibleOnMap, frozenList]);

  const listCourses = searchQuery ? displayCourses : (frozenList || visibleOnMap);

  const handleSelectCourse = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    setHoveredId(id);
  }, []);

  const handleSearch = () => setSearchQuery(inputValue.trim());
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const scrollToCard = useCallback((id: string) => {
    const el = cardRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setHoveredId(id);
    }
  }, []);

  const linesGeoJSON = useMemo(
    () => buildCourseLinesGeoJSON(visibleOnMap, polylineCache.current, hoveredId),
    [visibleOnMap, hoveredId],
  );

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["course-lines-hit"] });
    if (features && features.length > 0) {
      const id = features[0]!.properties?.id;
      if (id) scrollToCard(id);
    }
  }, [scrollToCard]);

  const handleMapDblClick = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["course-lines-hit"] });
    if (features && features.length > 0) {
      const id = features[0]!.properties?.id;
      if (id) {
        e.preventDefault();
        navigate(`/course/${id}`);
      }
    }
  }, [navigate]);

  const handleMapMouseMove = useCallback((e: MapMouseEvent) => {
    const map = e.target;
    const features = map.queryRenderedFeatures(e.point, { layers: ["course-lines-hit"] });
    if (features && features.length > 0) {
      const props = features[0]!.properties!;
      map.getCanvas().style.cursor = "pointer";
      setHoveredId(props.id);
      setTooltipInfo({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: props.name,
        distance: props.distance,
        elevGain: props.elevationGain,
      });
    } else {
      map.getCanvas().style.cursor = "";
      setHoveredId(null);
      setTooltipInfo(null);
    }
  }, []);

  const handleMapMouseLeave = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  if (!hasRendered) return null;

  return (
    <div className="flex flex-col -mx-4 -my-6" style={{ height: "calc(100vh - 56px)" }}>
      {/* 컨트롤 바 */}
      <div className="flex-shrink-0 px-4 pb-4 space-y-4" style={{ background: "var(--bg-0)", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="flex items-center justify-between pt-6">
          <div>
            <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{t("title")}</h1>
            <p className="text-[length:var(--fs-sm)] mt-1" style={{ color: "var(--ink-3)" }}>
              {t("subtitle")}
            </p>
          </div>
          {user && (
            <Link to="/course/create" className={`${buttonClass({ variant: 'primary', className: 'whitespace-nowrap' })}`}>
              {t("button.create")}
            </Link>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <button
              onClick={handleSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: "var(--ink-3)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <input
              type="text"
              placeholder={t("search.placeholder")}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-10 pr-4 py-2.5 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--ink-0)" }}
            />
          </div>
          <div className="flex gap-1">
            {([
              { id: "latest" as SortMode, label: t("sort.latest") },
              { id: "popular" as SortMode, label: t("sort.popular") },
            ]).map((s) => (
              <Button
                key={s.id}
                onClick={() => setSortMode(s.id)} variant="secondary" className="whitespace-nowrap"
                style={sortMode === s.id ? { background: "var(--lime)", color: "var(--primary-fg)", borderColor: "var(--lime)", fontWeight: 600 } : undefined}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 노면/난이도 다축 필터(#489) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("edit.surface")}</span>
            {([
              { v: "" as const, label: t("filter.all") },
              { v: "paved" as const, label: t("edit.surface.paved") },
              { v: "gravel" as const, label: t("edit.surface.gravel") },
              { v: "mixed" as const, label: t("edit.surface.mixed") },
            ]).map((o) => {
              const active = surfaceFilter === o.v;
              return (
                <button key={o.v || "all"} type="button" onClick={() => setSurfaceFilter(o.v)}
                  className="px-2 py-0.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
                  style={active ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("filter.nearMe")}</span>
            {([10, 20, 50] as const).map((km) => {
              const active = myLoc != null && radiusKm === km;
              return (
                <button key={km} type="button" disabled={locating}
                  onClick={() => {
                    if (active) { setRadiusKm(null); return; }
                    if (myLoc) { setRadiusKm(km); return; }
                    setLocating(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setRadiusKm(km); setLocating(false); },
                      (err) => { logClientError("CoursesPage.geolocation", err, {}); setLocating(false); },
                      { timeout: 8000, maximumAge: 300000 },
                    );
                  }}
                  className="px-2 py-0.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
                  style={active ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
                  {t("filter.radiusKm", { km })}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("difficulty")}</span>
            <button type="button" onClick={() => setDifficultyFilter(null)}
              className="px-2 py-0.5 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border transition-colors"
              style={difficultyFilter == null ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
              {t("filter.all")}
            </button>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = difficultyFilter === n;
              return (
                <button key={n} type="button" onClick={() => setDifficultyFilter(active ? null : n)}
                  className="w-7 h-7 text-[length:var(--fs-xs)] rounded-[var(--r-sm)] border font-semibold transition-colors"
                  style={active ? { background: "color-mix(in oklch, var(--lime) 12%, transparent)", borderColor: "var(--lime)", color: "var(--lime)" } : { borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 메인: 지도 + 목록 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-0)" }}>
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--lime) transparent var(--lime) var(--lime)" }} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0" style={{ background: "var(--bg-0)" }}>
          {/* 지도 */}
          <div className="h-64 lg:h-auto lg:flex-[2] relative">
            <MapGL
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={MAP_STYLE}
              initialViewState={DEFAULT_VIEW}
              onLoad={(e) => applyKoreaCyclingStyle(e.target)}
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
              <FitAllBounds courses={allCourses} polylineCache={polylineCache.current} />
              <FlyToCourse courseId={selectedId} polylineCache={polylineCache.current} />

              <Source id="course-lines" type="geojson" data={linesGeoJSON}>
                <Layer id="course-lines-glow" type="line" paint={{
                  "line-color": "#a3e635",
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
                  <div style={{ color: "var(--ink-0)", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{tooltipInfo.name}</div>
                    <div style={{ color: "var(--ink-3)" }}>{(tooltipInfo.distance / 1000).toFixed(1)} km · ▲{Math.round(tooltipInfo.elevGain)}m</div>
                  </div>
                </Popup>
              )}
            </MapGL>
          </div>

          {/* 목록 + 상세 */}
          <div className="flex-1 lg:flex-[1] lg:max-w-md overflow-y-auto" style={{ borderTop: "1px solid var(--line-soft)", background: "var(--bg-0)" }}>
            <div className="p-3">
              {/* 선택된 코스 상세 패널 */}
              {selectedId && (() => {
                const sel = allCourses.find((c) => c.id === selectedId);
                if (!sel) return null;
                const distKm = (sel.distance / 1000).toFixed(1);
                const elevM = Math.round(sel.elevationGain);
                const mpk = sel.distance > 0 ? (sel.elevationGain / (sel.distance / 1000)).toFixed(1) : "0";
                const maxCat = sel.climbs.length > 0 ? Math.max(...sel.climbs.map((c) => c.cat)) : 0;
                const catLabel = maxCat > 0 ? climbCatLabel(maxCat) : "-";
                return (
                  <Card padding="none" className="mb-3" style={{ padding: 0, overflow: "hidden", borderRadius: 8 }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {sel.regions.map((r) => (
                          <Chip key={r} variant="accent" style={{ fontSize: 9, padding: "2px 6px" }}>{r}</Chip>
                        ))}
                        {sel.climbs.length > 0 && [...sel.climbs].sort((a, b) => b.cat - a.cat).map((climb, i) => (
                          <span key={i} className="px-1.5 py-0.5 text-[10px] font-medium rounded-[var(--r-sm)]" style={climbBadgeStyle(climb.cat)}>
                            {climbCatLabel(climb.cat)}
                          </span>
                        ))}
                      </div>
                      <h2 className="text-[length:var(--fs-lg)] font-bold" style={{ color: "var(--ink-0)" }}>{sel.name}</h2>
                      <div className="text-[length:var(--fs-xs)] mt-1" style={{ color: "var(--ink-3)" }}>
                        {sel.likeCount > 0 && t("stats.likes", { count: sel.likeCount })}
                      </div>
                    </div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1,
                      background: "var(--line-soft)", borderBottom: "1px solid var(--line-soft)",
                    }}>
                      {([
                        [t("distance"), distKm, "km"],
                        [t("elevationGain"), String(elevM), "m"],
                        [t("mode.gradient"), mpk, "m/km"],
                        [t("difficulty"), catLabel, null],
                        [t("button.share"), String(sel.likeCount), null],
                      ] as [string, string, string | null][]).map(([k, v, u]) => (
                        <div key={k} style={{ padding: "10px 8px", background: "var(--bg-1)" }}>
                          <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)', fontSize: 9 }}>{k}</Text>
                          <div>
                            <Text variant="dataMedium" style={{ fontSize: 15 }}>{v}</Text>
                            {u && <Text variant="unit">{u}</Text>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "10px 16px", display: "flex", gap: 'var(--space-2)' }}>
                      <Button
                        onClick={() => navigate(`/course/${sel.id}`)} variant="primary" size="sm"
                        style={{ flex: 1, justifyContent: "center" }}
                      >
                        {t("button.detailView")}
                      </Button>
                    </div>
                  </Card>
                );
              })()}

              <Text as="div" variant="eyebrow" className="mb-2">
                {searchQuery
                  ? t("stats.resultCount", { count: listCourses.length })
                  : t("stats.areaCount", { count: listCourses.length })}
              </Text>
              {listCourses.length === 0 ? (
                <div className="text-center py-12 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
                  {searchQuery
                    ? t("empty.noResults")
                    : allCourses.length === 0
                      ? t("empty.noCourses")
                      : t("empty.noCoursesInArea")}
                </div>
              ) : (
                <div className="space-y-2">
                  {listCourses.map((course) => {
                    const highlighted = hoveredId === course.id || selectedId === course.id;
                    const distKm = (course.distance / 1000).toFixed(1);
                    const elevM = Math.round(course.elevationGain);
                    const mpk = course.distance > 0 ? (course.elevationGain / (course.distance / 1000)).toFixed(1) : "0";
                    return (
                      <div
                        key={course.id}
                        ref={(el) => {
                          if (el) cardRefs.current.set(course.id, el);
                          else cardRefs.current.delete(course.id);
                        }}
                        onMouseEnter={() => setHoveredId(course.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => handleSelectCourse(course.id)}
                        onDoubleClick={() => navigate(`/course/${course.id}`)}
                        className="cursor-pointer rounded-[var(--r-lg)] p-3 transition-colors"
                        style={{
                          background: highlighted ? "color-mix(in oklch, var(--lime) 6%, var(--bg-2))" : "var(--bg-1)",
                          border: highlighted ? "1px solid var(--lime)" : "1px solid var(--line-soft)",
                          borderLeft: highlighted ? "2px solid var(--lime)" : "2px solid transparent",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[length:var(--fs-sm)] truncate flex-1" style={{ color: "var(--ink-0)" }}>{course.name}</h3>
                          {course.surface && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-[var(--r-sm)]" style={surfaceChipStyle(course.surface)}>
                              {t(`edit.surface.${course.surface}`)}
                            </span>
                          )}
                          {course.climbs.length > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-[var(--r-sm)]" style={climbBadgeStyle(Math.max(...course.climbs.map((c) => c.cat)))}>
                              {climbCatLabel(Math.max(...course.climbs.map((c) => c.cat)))}
                            </span>
                          )}
                        </div>
                        {course.regions.length > 0 && (
                          <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-3)" }}>{course.regions.join(" · ")}</div>
                        )}
                        <div className="flex gap-3 mt-1.5 text-[length:var(--fs-xs)]" style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                          <span>{distKm} km</span>
                          <span>↑ {elevM}m</span>
                          <span style={{ color: Number(mpk) > 15 ? "var(--amber)" : Number(mpk) > 5 ? "var(--ink-2)" : "var(--lime)" }}>
                            {mpk} m/km
                          </span>
                          {course.likeCount > 0 && (
                            <span style={{ marginLeft: "auto", color: "var(--ink-3)" }}>♥ {course.likeCount}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
